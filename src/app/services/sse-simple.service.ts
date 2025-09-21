import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Simplified SSE Event Types
 */
export enum SimplifiedSSEEventType {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  ERROR = 'error',
  BACKEND_ERROR = 'backend_error',
  HEARTBEAT = 'heartbeat',
  CONNECTION_CLOSE = 'connection_close'
}

/**
 * Simplified SSE Event Interface
 */
export interface SimplifiedSSEEvent {
  id?: string;
  type: SimplifiedSSEEventType;
  data: {
    requestId?: string;
    projectId?: string;
    status?: string;
    message?: string;
    timestamp: string;
  };
}

/**
 * Connection State
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed',
  RATE_LIMITED = 'rate_limited'
}

/**
 * Simplified SSE Service
 * Binary status model: Processing → Completed (no progress percentages)
 * Direct JWT authentication (no tickets)
 * Single connection with automatic retry and smart backoff
 */
@Injectable({
  providedIn: 'root'
})
export class SSESimpleService implements OnDestroy {
  private eventSource?: EventSource;
  private events$ = new Subject<SimplifiedSSEEvent>();
  private userMessages$ = new Subject<string>(); // Separate subject for user messages that can be terminated
  private connectionState$ = new BehaviorSubject<ConnectionState>(ConnectionState.DISCONNECTED);
  private retryCount = 0;
  private readonly MAX_RETRIES = 5;
  private readonly BASE_RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]; // 1s, 2s, 4s, 8s, 16s
  private retryTimeout?: any;
  private currentToken?: string;
  private lastHeartbeat: Date = new Date();
  private heartbeatCheckInterval?: any;
  private readonly HEARTBEAT_TIMEOUT = 60000; // 60 seconds
  
  // Smart backoff properties
  private connectionAttempts: Array<Date> = [];
  private readonly RATE_LIMIT_WINDOW = 30000; // 30 seconds
  private readonly MAX_ATTEMPTS_IN_WINDOW = 4;
  private readonly COOLDOWN_DURATION = 60000; // 60 seconds
  private cooldownUntil?: Date;
  private connectionStartTime?: Date;

  constructor() {
    console.log('[SSESimpleService] Service initialized');
  }

  /**
   * Get observable for SSE events
   */
  getEvents(): Observable<SimplifiedSSEEvent> {
    return this.events$.asObservable();
  }

  /**
   * Get observable for user error messages
   */
  getUserMessages(): Observable<string> {
    return this.userMessages$.asObservable();
  }

  /**
   * Get observable for connection state
   */
  getConnectionState(): Observable<ConnectionState> {
    return this.connectionState$.asObservable();
  }

  /**
   * Get current connection state
   */
  getCurrentState(): ConnectionState {
    return this.connectionState$.value;
  }

  /**
   * Connect to SSE endpoint with JWT token
   */
  connect(token: string): Observable<SimplifiedSSEEvent> {
    console.log('[SSESimpleService] Connecting to SSE endpoint');
    
    // Check if we're in cooldown
    if (this._isInCooldown()) {
      const remainingMs = this.cooldownUntil!.getTime() - Date.now();
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      console.warn(`[SSESimpleService] In cooldown for ${remainingSeconds} more seconds`);
      this.connectionState$.next(ConnectionState.RATE_LIMITED);
      this.userMessages$.next(`Rate limited. Please wait ${remainingSeconds} seconds before reconnecting.`);
      return this.events$.asObservable();
    }
    
    // Disconnect existing connection
    this.disconnect();
    
    // Store token for reconnection
    this.currentToken = token;
    
    // Reset retry count
    this.retryCount = 0;
    
    // Attempt connection
    this._attemptConnection(token);
    
    return this.events$.asObservable();
  }

  /**
   * Disconnect from SSE endpoint
   */
  disconnect(): void {
    console.log('[SSESimpleService] Disconnecting');
    
    // Clear retry timeout
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = undefined;
    }
    
    // Clear heartbeat check
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = undefined;
    }
    
    // Close EventSource
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
    
    // Update state
    this.connectionState$.next(ConnectionState.DISCONNECTED);
    
    // Clear token
    this.currentToken = undefined;
  }

  /**
   * Attempt to establish SSE connection
   */
  private _attemptConnection(token: string): void {
    // Check rate limiting before attempting connection
    if (this._shouldEnterCooldown()) {
      this._enterCooldown();
      return;
    }
    
    // Track connection attempt
    this._trackConnectionAttempt();
    
    // Update state
    const isRetry = this.retryCount > 0;
    this.connectionState$.next(isRetry ? ConnectionState.RECONNECTING : ConnectionState.CONNECTING);
    
    // Build URL with token as query parameter
    const baseUrl = environment.apiUrl || 'http://localhost:8787';
    const url = `${baseUrl}/api/sse/projects-simplified?token=${encodeURIComponent(token)}`;
    
    console.log(`[SSESimpleService] ${isRetry ? 'Reconnecting' : 'Connecting'} (attempt ${this.retryCount + 1}/${this.MAX_RETRIES + 1})`);
    
    // Track connection start time
    this.connectionStartTime = new Date();
    
    // Create EventSource
    this.eventSource = new EventSource(url);
    
    // Handle connection opened - TRANSPORT LEVEL SUCCESS ONLY
    this.eventSource.onopen = () => {
      console.log('[SSESimpleService] Connection established');
      this.connectionState$.next(ConnectionState.CONNECTED);
      this.retryCount = 0; // Reset retry count on successful connection
      this.lastHeartbeat = new Date();
      this._startHeartbeatCheck();
    };
    
    // Handle transport-level errors ONLY (no data parsing)
    this.eventSource.onerror = (error) => {
      console.error('[SSESimpleService] Transport error:', error);
      
      // Check if this was a rapid failure (within 5 seconds)
      const connectionDuration = this.connectionStartTime 
        ? Date.now() - this.connectionStartTime.getTime()
        : 0;
      
      // Close the connection
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = undefined;
      }
      
      // Stop heartbeat check
      if (this.heartbeatCheckInterval) {
        clearInterval(this.heartbeatCheckInterval);
        this.heartbeatCheckInterval = undefined;
      }
      
      // Handle retry logic
      if (this.retryCount < this.MAX_RETRIES && !this._isInCooldown()) {
        const baseDelay = this.BASE_RETRY_DELAYS[this.retryCount] || 16000;
        const jitter = Math.random() * 1000; // Add jitter up to 1 second
        const delay = baseDelay + jitter;
        
        console.log(`[SSESimpleService] Will retry in ${Math.round(delay)}ms (connection lasted ${connectionDuration}ms)`);
        
        this.connectionState$.next(ConnectionState.RECONNECTING);
        this.retryCount++;
        
        this.retryTimeout = setTimeout(() => {
          if (this.currentToken && !this._isInCooldown()) {
            this._attemptConnection(this.currentToken);
          }
        }, delay);
      } else {
        if (this._isInCooldown()) {
          console.error('[SSESimpleService] Entering cooldown due to too many rapid failures');
          this._enterCooldown();
        } else {
          console.error('[SSESimpleService] Max retries exceeded, giving up');
          this.connectionState$.next(ConnectionState.FAILED);
          this.userMessages$.next(`SSE connection failed after ${this.MAX_RETRIES + 1} attempts`);
        }
      }
    };
    
    // Listen for specific events
    this._setupEventListeners();
  }

  /**
   * Setup event listeners for SSE events
   */
  private _setupEventListeners(): void {
    if (!this.eventSource) return;
    
    // Processing event
    this.eventSource.addEventListener('processing', (event: MessageEvent) => {
      console.log('[SSESimpleService] Processing event received');
      this._handleEvent(SimplifiedSSEEventType.PROCESSING, event);
    });
    
    // Completed event
    this.eventSource.addEventListener('completed', (event: MessageEvent) => {
      console.log('[SSESimpleService] Completed event received');
      this._handleEvent(SimplifiedSSEEventType.COMPLETED, event);
    });
    
    // Generic error event (kept for backward compatibility)
    this.eventSource.addEventListener('error', (event: MessageEvent) => {
      console.log('[SSESimpleService] Error event received');
      this._handleEvent(SimplifiedSSEEventType.ERROR, event);
    });
    
    // Backend error event (distinct from transport errors)
    this.eventSource.addEventListener('backend_error', (event: MessageEvent) => {
      console.log('[SSESimpleService] Backend error event received');
      this._handleEvent(SimplifiedSSEEventType.BACKEND_ERROR, event);
    });
    
    // Heartbeat event
    this.eventSource.addEventListener('heartbeat', (event: MessageEvent) => {
      console.log('[SSESimpleService] Heartbeat received');
      this.lastHeartbeat = new Date();
      this._handleEvent(SimplifiedSSEEventType.HEARTBEAT, event);
    });
    
    // Connection close event (server forcing disconnect)
    this.eventSource.addEventListener('connection_close', (event: MessageEvent) => {
      console.log('[SSESimpleService] Connection close requested by server');
      this._handleEvent(SimplifiedSSEEventType.CONNECTION_CLOSE, event);
      // Disconnect without retry
      this.disconnect();
    });
  }

  /**
   * Handle SSE event
   */
  private _handleEvent(type: SimplifiedSSEEventType, event: MessageEvent): void {
    try {
      // Type guard: ensure this is a MessageEvent with valid string data
      if (!event.data || typeof event.data !== 'string') {
        console.warn('[SSESimpleService] Event received without valid string data:', type, 'data:', event.data);
        return;
      }

      const data = JSON.parse(event.data);
      const sseEvent: SimplifiedSSEEvent = {
        id: event.lastEventId || undefined,
        type,
        data
      };
      
      // Emit event
      this.events$.next(sseEvent);
      
      // Log non-heartbeat events
      if (type !== SimplifiedSSEEventType.HEARTBEAT) {
        console.log('[SSESimpleService] Event emitted:', sseEvent);
      }
    } catch (error) {
      console.error('[SSESimpleService] Failed to parse event data:', error, 'event.data:', event.data, 'typeof:', typeof event.data);
    }
  }

  /**
   * Start checking for heartbeat timeout
   */
  private _startHeartbeatCheck(): void {
    // Clear existing interval
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
    }
    
    // Check every 10 seconds
    this.heartbeatCheckInterval = setInterval(() => {
      const now = new Date().getTime();
      const lastBeat = this.lastHeartbeat.getTime();
      
      if (now - lastBeat > this.HEARTBEAT_TIMEOUT) {
        console.warn('[SSESimpleService] Heartbeat timeout, reconnecting...');
        
        // Close current connection
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = undefined;
        }
        
        // Clear interval
        if (this.heartbeatCheckInterval) {
          clearInterval(this.heartbeatCheckInterval);
          this.heartbeatCheckInterval = undefined;
        }
        
        // Attempt reconnection
        if (this.currentToken && this.retryCount < this.MAX_RETRIES) {
          this._attemptConnection(this.currentToken);
        }
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Manually trigger reconnection (useful for testing)
   */
  reconnect(): void {
    if (this.currentToken) {
      console.log('[SSESimpleService] Manual reconnection triggered');
      this.retryCount = 0; // Reset retry count
      this.disconnect();
      this._attemptConnection(this.currentToken);
    } else {
      console.warn('[SSESimpleService] Cannot reconnect without token');
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionState$.value === ConnectionState.CONNECTED;
  }

  /**
   * Track connection attempt for rate limiting
   */
  private _trackConnectionAttempt(): void {
    const now = new Date();
    this.connectionAttempts.push(now);
    
    // Clean old attempts outside the window
    const windowStart = now.getTime() - this.RATE_LIMIT_WINDOW;
    this.connectionAttempts = this.connectionAttempts.filter(
      attempt => attempt.getTime() > windowStart
    );
  }

  /**
   * Check if we should enter cooldown due to too many rapid failures
   */
  private _shouldEnterCooldown(): boolean {
    return this.connectionAttempts.length >= this.MAX_ATTEMPTS_IN_WINDOW;
  }

  /**
   * Enter cooldown period
   */
  private _enterCooldown(): void {
    this.cooldownUntil = new Date(Date.now() + this.COOLDOWN_DURATION);
    const cooldownSeconds = Math.ceil(this.COOLDOWN_DURATION / 1000);
    
    console.warn(`[SSESimpleService] Entering ${cooldownSeconds}s cooldown due to rapid connection failures`);
    this.connectionState$.next(ConnectionState.RATE_LIMITED);
    
    this.userMessages$.next(
      `Too many connection failures. Please wait ${cooldownSeconds} seconds before trying again.`
    );
  }

  /**
   * Check if currently in cooldown
   */
  private _isInCooldown(): boolean {
    if (!this.cooldownUntil) return false;
    
    const now = new Date();
    if (now < this.cooldownUntil) {
      return true;
    }
    
    // Cooldown expired, clear it
    this.cooldownUntil = undefined;
    return false;
  }

  /**
   * Get remaining cooldown time in seconds
   */
  getRemainingCooldownSeconds(): number {
    if (!this._isInCooldown() || !this.cooldownUntil) return 0;
    
    const remainingMs = this.cooldownUntil.getTime() - Date.now();
    return Math.ceil(remainingMs / 1000);
  }

  /**
   * Reset rate limiting (for testing or manual recovery)
   */
  resetRateLimiting(): void {
    console.log('[SSESimpleService] Resetting rate limiting');
    this.connectionAttempts = [];
    this.cooldownUntil = undefined;
    this.retryCount = 0;
    
    if (this.connectionState$.value === ConnectionState.RATE_LIMITED) {
      this.connectionState$.next(ConnectionState.DISCONNECTED);
    }
  }

  /**
   * Cleanup on service destroy
   */
  ngOnDestroy(): void {
    console.log('[SSESimpleService] Service destroyed, cleaning up');
    this.disconnect();
    this.events$.complete();
    this.userMessages$.complete();
    this.connectionState$.complete();
  }
}