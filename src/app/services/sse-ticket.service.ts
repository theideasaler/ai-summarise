import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject, timer, EMPTY, Subscription, of } from 'rxjs';
import { catchError, switchMap, retry, map, tap, retryWhen, delay, take, concatMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { LoggerService } from './logger.service';
import { SSEConfigService } from './sse-config.service';
import type { 
  SSETicketRequest, 
  SSETicketResponse, 
  SSEConnectionState,
  SSEConnectionConfig 
} from '../models/project.model';

/**
 * Service responsible for managing SSE ticket-based authentication
 * Handles ticket request, renewal, retry logic, and connection state management
 */
@Injectable({
  providedIn: 'root',
})
export class SSETicketService {
  private baseUrl = environment.apiUrl;
  private config: SSEConnectionConfig;
  private connectionState$ = new BehaviorSubject<SSEConnectionState>({
    status: 'disconnected',
    reconnectAttempts: 0,
  });
  private ticketRenewalSubscription: Subscription | null = null;
  private consumedTickets = new Set<string>(); // Track consumed tickets
  private lastTicketRequestTime = 0; // Rate limiting
  private consecutiveFailures = 0; // Circuit breaker counter
  private readonly maxConsecutiveFailures = 5; // Circuit breaker threshold
  private readonly minRequestInterval = 2000; // Minimum 2 seconds between requests
  private readonly minRenewalTime = 10; // Minimum 10 seconds for renewal

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private logger: LoggerService,
    private sseConfig: SSEConfigService
  ) {
    // Use the centralized configuration service
    this.config = {
      useTicketAuth: this.sseConfig.useTicketAuth,
      maxReconnectAttempts: this.sseConfig.maxReconnectAttempts,
      baseReconnectDelay: this.sseConfig.baseReconnectDelay,
      ticketRefreshBuffer: this.sseConfig.ticketRefreshBuffer,
      maxRetryAttempts: this.sseConfig.maxTicketRetryAttempts,
      retryDelay: this.sseConfig.ticketRetryDelay,
    };
    
    // Validate configuration on service initialization
    this.sseConfig.validateConfig();
  }

  /**
   * Get current connection state as observable
   */
  getConnectionState(): Observable<SSEConnectionState> {
    return this.connectionState$.asObservable();
  }

  /**
   * Get current connection state value
   */
  getCurrentState(): SSEConnectionState {
    return this.connectionState$.value;
  }

  /**
   * Check if ticket-based authentication is enabled
   */
  isTicketAuthEnabled(): boolean {
    return this.config.useTicketAuth;
  }

  /**
   * Request a new SSE ticket with retry logic and exponential backoff
   */
  requestTicket(purpose: 'projects' = 'projects'): Observable<SSETicketResponse> {
    if (!this.config.useTicketAuth) {
      return throwError(() => new Error('Ticket authentication is disabled'));
    }
    
    // Rate limiting check with exponential backoff for consecutive failures
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastTicketRequestTime;
    const requiredInterval = this.minRequestInterval * Math.pow(2, Math.min(this.consecutiveFailures, 3));
    
    if (timeSinceLastRequest < requiredInterval) {
      const waitTime = requiredInterval - timeSinceLastRequest;
      this.logger.warn(`Rate limiting ticket requests - waiting ${waitTime}ms (${this.consecutiveFailures} consecutive failures)`);
      // Return a delayed retry instead of immediate error
      return timer(waitTime).pipe(
        switchMap(() => this.requestTicket(purpose))
      );
    }
    this.lastTicketRequestTime = now;
    
    // Circuit breaker check
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      this.logger.error(`Circuit breaker open - ${this.consecutiveFailures} consecutive failures`);
      // Add exponential backoff before rejecting
      const backoffTime = Math.min(60000, 5000 * Math.pow(2, this.consecutiveFailures - this.maxConsecutiveFailures));
      return throwError(() => new Error(`Too many consecutive failures. Circuit breaker will reset in ${backoffTime / 1000}s`));
    }

    // Clear any existing ticket before requesting a new one
    const currentState = this.getCurrentState();
    if (currentState.ticket) {
      this.logger.log('Clearing existing ticket before requesting new one');
      this._updateState({ 
        ticket: undefined, 
        ticketExpiresAt: undefined,
        status: 'requesting_ticket' 
      });
    } else {
      this._updateState({ status: 'requesting_ticket' });
    }

    return this._getHeaders().pipe(
      switchMap((headers) => {
        const request: SSETicketRequest = { purpose };
        
        return this.http.post<SSETicketResponse>(
          `${this.baseUrl}/api/sse/tickets`,
          request,
          { headers }
        );
      }),
      retryWhen(errors => 
        errors.pipe(
          tap(error => {
            this.logger.error('Ticket request failed:', error);
            this._updateState({ 
              status: 'error', 
              lastError: `Ticket request failed: ${error.message || 'Unknown error'}` 
            });
          }),
          concatMap((error, index) => {
            if (index >= this.config.maxRetryAttempts) {
              this.logger.error('Max ticket retry attempts reached');
              return throwError(() => new Error('Max ticket retry attempts reached'));
            }
            
            const delayMs = this.config.retryDelay * Math.pow(2, index);
            this.logger.log(`Retrying ticket request in ${delayMs}ms (attempt ${index + 1})`);
            
            return timer(delayMs);
          })
        )
      ),
      tap(response => {
        this.logger.log('SSE ticket received:', { 
          ticketId: response.ticket.substring(0, 8) + '...',
          expiresIn: response.expiresIn,
          expiresAt: response.expiresAt 
        });
        
        // Reset circuit breaker on success
        this.consecutiveFailures = 0;
        
        this._updateState({
          status: 'connected',
          ticket: response.ticket,
          ticketExpiresAt: response.expiresAt,
          lastError: undefined,
        });
      }),
      catchError(error => {
        this.logger.error('Final ticket request failure:', error);
        this.consecutiveFailures++; // Increment circuit breaker counter
        
        // Don't immediately clear ticket on transient errors
        const isTransientError = error.status >= 500 || error.status === 429 || !error.status;
        if (!isTransientError) {
          // Only clear ticket on permanent errors (4xx except 429)
          this._updateState({ 
            status: 'error', 
            ticket: undefined,
            ticketExpiresAt: undefined,
            lastError: `Failed to obtain SSE ticket: ${error.message || 'Unknown error'}` 
          });
        } else {
          // Keep existing ticket for transient errors
          this._updateState({ 
            status: 'error', 
            lastError: `Transient error obtaining ticket: ${error.message || 'Unknown error'}` 
          });
        }
        
        return throwError(() => error);
      })
    );
  }

  /**
   * Check if current ticket is still valid (accounting for refresh buffer)
   */
  isTicketValid(): boolean {
    const state = this.getCurrentState();
    
    if (!state.ticket || !state.ticketExpiresAt) {
      return false;
    }
    
    // Check if ticket has been consumed
    if (this.consumedTickets.has(state.ticket)) {
      this.logger.log('Ticket has been consumed and cannot be reused');
      return false;
    }

    const expiryTime = new Date(state.ticketExpiresAt).getTime();
    const bufferTime = this.config.ticketRefreshBuffer * 1000; // Convert to milliseconds
    const currentTime = new Date().getTime();

    return (expiryTime - bufferTime) > currentTime;
  }
  
  /**
   * Mark a ticket as consumed (used for connection)
   */
  markTicketAsConsumed(ticket: string): void {
    this.consumedTickets.add(ticket);
    this.logger.log(`Marked ticket as consumed: ${ticket.substring(0, 8)}...`);
    
    // Clean up old consumed tickets (keep last 10)
    if (this.consumedTickets.size > 10) {
      const tickets = Array.from(this.consumedTickets);
      tickets.slice(0, tickets.length - 10).forEach(t => this.consumedTickets.delete(t));
    }
  }

  /**
   * Get time until ticket expires (in seconds)
   */
  getTicketTimeToExpiry(): number {
    const state = this.getCurrentState();
    
    if (!state.ticketExpiresAt) {
      return 0;
    }

    const expiryTime = new Date(state.ticketExpiresAt).getTime();
    const currentTime = new Date().getTime();
    const timeToExpiry = Math.max(0, expiryTime - currentTime);

    return Math.floor(timeToExpiry / 1000);
  }

  /**
   * Schedule automatic ticket renewal
   */
  scheduleTicketRenewal(): void {
    // Cancel any existing renewal subscription first
    this._cancelTicketRenewal();
    
    const state = this.getCurrentState();
    
    // Don't schedule renewal if we don't have a valid ticket or we're in an error state
    if (!state.ticket || !state.ticketExpiresAt || state.status === 'error') {
      this.logger.log('Not scheduling renewal - no valid ticket or in error state', {
        hasTicket: !!state.ticket,
        hasExpiry: !!state.ticketExpiresAt,
        status: state.status
      });
      return;
    }
    
    // NOTE: We do NOT check if the current ticket is consumed here
    // The consumed ticket check is only for preventing reuse of OLD tickets
    // The CURRENT active ticket should be renewed even if it's been used for connection
    
    const timeToExpiry = this.getTicketTimeToExpiry();
    
    // If ticket has already expired, don't schedule renewal
    if (timeToExpiry <= 0) {
      this.logger.log('Ticket already expired, not scheduling renewal');
      // Clear the expired ticket to prevent reuse
      this._updateState({ 
        ticket: undefined, 
        ticketExpiresAt: undefined,
        status: 'disconnected'
      });
      return;
    }
    
    // Calculate when to renew - we want to renew BEFORE the ticket expires
    // If we're already within the buffer window, renew immediately (minimum 1 second delay)
    const timeUntilBufferWindow = timeToExpiry - this.config.ticketRefreshBuffer;
    const renewalTime = timeUntilBufferWindow <= 0 
      ? 1 // Renew immediately if we're in the buffer window
      : Math.max(this.minRenewalTime, timeUntilBufferWindow); // Otherwise schedule for later
    
    this.logger.log('📅 Ticket renewal scheduling:', {
      timeToExpiry,
      refreshBuffer: this.config.ticketRefreshBuffer,
      timeUntilBufferWindow,
      renewalTime,
      renewImmediately: timeUntilBufferWindow <= 0
    });
    
    this.logger.log(`🔔 Scheduling ticket renewal in ${renewalTime} seconds (expires in ${timeToExpiry}s)`);

    this.ticketRenewalSubscription = timer(renewalTime * 1000).pipe(
      take(1),
      switchMap(() => {
        this.logger.log(`⏰ Ticket renewal timer fired after ${renewalTime} seconds`);
        
        // Check again if ticket is still present and not already expired.
        // IMPORTANT: Do NOT block renewal just because the ticket was consumed –
        // we want to renew the active (consumed) ticket before it expires.
        const state = this.getCurrentState();
        const currentTimeToExpiry = this.getTicketTimeToExpiry();
        this.logger.log('Pre-renewal check:', {
          currentTimeToExpiry,
          hasTicket: !!state.ticket,
          hasExpiry: !!state.ticketExpiresAt
        });
        if (!state.ticket || !state.ticketExpiresAt || currentTimeToExpiry <= 0) {
          this.logger.log('No active ticket or already expired at renewal time, skipping renewal');
          return EMPTY;
        }
        
        this.logger.log('🔄 Auto-renewing SSE ticket...');
        return this.requestTicket();
      })
    ).subscribe({
      next: (response) => {
        if (response) {
          this.logger.log('✅ Ticket auto-renewal successful', {
            newTicketId: response.ticket.substring(0, 8) + '...',
            expiresIn: response.expiresIn,
            expiresAt: response.expiresAt
          });
          // Schedule next renewal only if successful
          this.scheduleTicketRenewal();
        }
      },
      error: (error) => {
        this.logger.error('❌ Ticket auto-renewal failed:', error);
        
        // Increment failure counter for circuit breaker
        this.consecutiveFailures++;
        
        // Check if this is a permanent or transient error
        const isTransientError = error.status >= 500 || error.status === 429 || !error.status;
        
        if (isTransientError && this.consecutiveFailures < this.maxConsecutiveFailures) {
          // For transient errors, keep the existing ticket and let reconnection flow handle it
          this._updateState({ 
            status: 'error',
            lastError: `Auto-renewal failed (transient): ${error.message}`,
            // Keep existing ticket for potential retry
          });
        } else {
          // For permanent errors or after too many failures, clear the ticket
          this._updateState({ 
            status: 'error',
            ticket: undefined,
            ticketExpiresAt: undefined,
            lastError: `Auto-renewal failed (permanent): ${error.message}`,
          });
        }
        
        // Clear the subscription reference on error
        this.ticketRenewalSubscription = null;
        // Don't reschedule on error - let the reconnection flow handle it
      }
    });
  }
  
  /**
   * Cancel any active ticket renewal subscription
   */
  private _cancelTicketRenewal(): void {
    if (this.ticketRenewalSubscription) {
      this.logger.log('Cancelling existing ticket renewal subscription');
      this.ticketRenewalSubscription.unsubscribe();
      this.ticketRenewalSubscription = null;
    }
  }

  /**
   * Clear current ticket and connection state
   * @param options - Options for clearing ticket
   */
  clearTicket(options: { reason?: string; preserveReconnectAttempts?: boolean } = {}): void {
    // Cancel any active ticket renewal first
    this._cancelTicketRenewal();
    
    // Log ticket clearing for debugging
    const currentState = this.getCurrentState();
    if (currentState.ticket) {
      this.logger.log(
        `Clearing ticket (${currentState.ticket.substring(0, 8)}...) - Reason: ${options.reason || 'Manual clear'}`
      );
    }
    
    this._updateState({
      status: 'disconnected',
      ticket: undefined,
      ticketExpiresAt: undefined,
      connection: undefined,
      reconnectAttempts: options.preserveReconnectAttempts ? currentState.reconnectAttempts : 0,
      lastError: undefined,
    });
  }

  /**
   * Increment reconnection attempts
   */
  incrementReconnectAttempts(): number {
    const state = this.getCurrentState();
    const newAttempts = state.reconnectAttempts + 1;
    
    this._updateState({
      reconnectAttempts: newAttempts,
      status: 'reconnecting',
    });

    return newAttempts;
  }

  /**
   * Reset reconnection attempts
   */
  resetReconnectAttempts(): void {
    this._updateState({
      reconnectAttempts: 0,
    });
  }

  /**
   * Update connection status with proper state management
   */
  updateConnectionStatus(status: SSEConnectionState['status'], error?: string): void {
    const currentState = this.getCurrentState();
    
    // Prevent invalid state transitions
    if (this._isInvalidStateTransition(currentState.status, status)) {
      this.logger.warn(
        `Invalid state transition attempted: ${currentState.status} -> ${status}`
      );
      return;
    }
    
    this._updateState({
      status,
      lastError: error,
    });
    
    // If we're entering an error state, cancel ticket renewal but don't clear ticket yet
    if (status === 'error') {
      this._cancelTicketRenewal();
    }
    
    // If we successfully connected, ensure renewal is scheduled
    // Only schedule if we don't already have an active renewal subscription
    if (status === 'connected' && currentState.ticket && currentState.ticketExpiresAt) {
      if (!this.ticketRenewalSubscription) {
        this.logger.log('🎯 Connection successful - scheduling initial ticket renewal');
        this.scheduleTicketRenewal();
      } else {
        this.logger.log('Connection successful - renewal already scheduled');
      }
    }
  }
  
  /**
   * Check if state transition is valid
   */
  private _isInvalidStateTransition(
    from: SSEConnectionState['status'],
    to: SSEConnectionState['status']
  ): boolean {
    // Define invalid transitions
    const invalidTransitions: Record<string, string[]> = {
      'disconnected': ['reconnecting'], // Can't reconnect from disconnected
      'requesting_ticket': ['reconnecting'], // Can't reconnect while requesting ticket
    };
    
    return invalidTransitions[from]?.includes(to) || false;
  }

  /**
   * Set EventSource connection reference
   */
  setConnection(connection: EventSource | undefined): void {
    this._updateState({
      connection,
    });
  }

  /**
   * Get configuration
   */
  getConfig(): SSEConnectionConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (useful for testing or runtime changes)
   */
  updateConfig(partialConfig: Partial<SSEConnectionConfig>): void {
    this.config = { ...this.config, ...partialConfig };
  }

  /**
   * Private method to get HTTP headers with authentication
   */
  private _getHeaders(): Observable<HttpHeaders> {
    return new Observable(observer => {
      this.authService.getIdToken()
        .then(token => {
          const headers: { [key: string]: string } = {
            'Content-Type': 'application/json',
          };

          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }

          observer.next(new HttpHeaders(headers));
          observer.complete();
        })
        .catch(error => {
          observer.error(error);
        });
    });
  }

  /**
   * Private method to update connection state with enhanced logging
   */
  private _updateState(updates: Partial<SSEConnectionState>): void {
    const currentState = this.connectionState$.value;
    const newState = { ...currentState, ...updates };
    
    // Log significant state changes
    if (updates.status && updates.status !== currentState.status) {
      this.logger.log(
        `SSE State transition: ${currentState.status} → ${updates.status}`,
        {
          ticket: newState.ticket ? newState.ticket.substring(0, 8) + '...' : 'none',
          reconnectAttempts: newState.reconnectAttempts,
          hasError: !!newState.lastError,
          timestamp: new Date().toISOString()
        }
      );
    }
    
    this.connectionState$.next(newState);
  }
  
  /**
   * Get debug information about current state
   */
  getDebugInfo(): any {
    const state = this.getCurrentState();
    const now = Date.now();
    
    return {
      status: state.status,
      hasTicket: !!state.ticket,
      ticketValid: this.isTicketValid(),
      ticketExpiresIn: this.getTicketTimeToExpiry(),
      reconnectAttempts: state.reconnectAttempts,
      consecutiveFailures: this.consecutiveFailures,
      consumedTickets: this.consumedTickets.size,
      lastError: state.lastError,
      timeSinceLastRequest: now - this.lastTicketRequestTime,
      hasActiveRenewal: !!this.ticketRenewalSubscription,
      config: {
        useTicketAuth: this.config.useTicketAuth,
        maxReconnectAttempts: this.config.maxReconnectAttempts,
        ticketRefreshBuffer: this.config.ticketRefreshBuffer
      }
    };
  }
  
  /**
   * Reset circuit breaker (for manual intervention or testing)
   */
  resetCircuitBreaker(): void {
    this.consecutiveFailures = 0;
    this.lastTicketRequestTime = 0; // Also reset rate limiting
    this.logger.log('Circuit breaker and rate limiting reset manually');
  }
  
  /**
   * Check if circuit breaker is open
   */
  isCircuitBreakerOpen(): boolean {
    return this.consecutiveFailures >= this.maxConsecutiveFailures;
  }
  
  /**
   * Get circuit breaker status for debugging
   */
  getCircuitBreakerStatus(): { isOpen: boolean; consecutiveFailures: number; maxFailures: number } {
    return {
      isOpen: this.isCircuitBreakerOpen(),
      consecutiveFailures: this.consecutiveFailures,
      maxFailures: this.maxConsecutiveFailures
    };
  }
}
