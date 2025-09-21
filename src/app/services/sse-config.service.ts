import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Centralized configuration service for SSE (Server-Sent Events)
 * Provides all SSE-related configuration in a single, testable service
 */
@Injectable({
  providedIn: 'root'
})
export class SSEConfigService {
  // Feature flags
  private readonly _useTicketAuth: boolean;
  
  // Connection settings
  private readonly _maxReconnectAttempts: number;
  private readonly _baseReconnectDelay: number;
  private readonly _maxReconnectDelay: number;
  
  // Ticket settings
  private readonly _ticketLifetime: number;
  private readonly _ticketRefreshBuffer: number;
  private readonly _maxTicketRetryAttempts: number;
  private readonly _ticketRetryDelay: number;
  
  // Timeouts
  private readonly _connectionTimeout: number;
  private readonly _heartbeatInterval: number;
  
  constructor() {
    // Initialize from environment with fallback defaults
    this._useTicketAuth = environment.features?.useSSETicketAuth ?? true;
    
    // Connection settings with defaults
    this._maxReconnectAttempts = environment.sse?.maxReconnectAttempts ?? 5;
    this._baseReconnectDelay = environment.sse?.baseReconnectDelay ?? 1000;
    this._maxReconnectDelay = environment.sse?.maxReconnectDelay ?? 30000;
    
    // Ticket settings with defaults
    this._ticketLifetime = environment.sse?.ticketLifetime ?? 30;
    this._ticketRefreshBuffer = environment.sse?.ticketRefreshBuffer ?? 5;
    this._maxTicketRetryAttempts = environment.sse?.maxTicketRetryAttempts ?? 3;
    this._ticketRetryDelay = environment.sse?.ticketRetryDelay ?? 500;
    
    // Timeout settings with defaults
    this._connectionTimeout = environment.sse?.connectionTimeout ?? 10000;
    this._heartbeatInterval = environment.sse?.heartbeatInterval ?? 30000;
  }
  
  /**
   * Check if ticket-based authentication is enabled
   */
  get useTicketAuth(): boolean {
    return this._useTicketAuth;
  }
  
  /**
   * Get maximum number of reconnection attempts
   */
  get maxReconnectAttempts(): number {
    return this._maxReconnectAttempts;
  }
  
  /**
   * Get base delay for reconnection (milliseconds)
   */
  get baseReconnectDelay(): number {
    return this._baseReconnectDelay;
  }
  
  /**
   * Get maximum delay for reconnection (milliseconds)
   */
  get maxReconnectDelay(): number {
    return this._maxReconnectDelay;
  }
  
  /**
   * Calculate reconnection delay with exponential backoff
   * @param attemptNumber Current attempt number (1-based)
   */
  calculateReconnectDelay(attemptNumber: number): number {
    const delay = this._baseReconnectDelay * Math.pow(2, attemptNumber - 1);
    return Math.min(delay, this._maxReconnectDelay);
  }
  
  /**
   * Get ticket lifetime in seconds
   */
  get ticketLifetime(): number {
    return this._ticketLifetime;
  }
  
  /**
   * Get buffer time before ticket expiry to refresh (seconds)
   */
  get ticketRefreshBuffer(): number {
    return this._ticketRefreshBuffer;
  }
  
  /**
   * Calculate when to refresh ticket (milliseconds from now)
   */
  calculateTicketRefreshTime(): number {
    return (this._ticketLifetime - this._ticketRefreshBuffer) * 1000;
  }
  
  /**
   * Get maximum ticket request retry attempts
   */
  get maxTicketRetryAttempts(): number {
    return this._maxTicketRetryAttempts;
  }
  
  /**
   * Get delay between ticket request retries (milliseconds)
   */
  get ticketRetryDelay(): number {
    return this._ticketRetryDelay;
  }
  
  /**
   * Get connection timeout (milliseconds)
   */
  get connectionTimeout(): number {
    return this._connectionTimeout;
  }
  
  /**
   * Get heartbeat interval (milliseconds)
   */
  get heartbeatInterval(): number {
    return this._heartbeatInterval;
  }
  
  /**
   * Get complete configuration object for debugging/logging
   */
  getFullConfig(): Record<string, any> {
    return {
      features: {
        useTicketAuth: this._useTicketAuth
      },
      connection: {
        maxReconnectAttempts: this._maxReconnectAttempts,
        baseReconnectDelay: this._baseReconnectDelay,
        maxReconnectDelay: this._maxReconnectDelay,
        connectionTimeout: this._connectionTimeout,
        heartbeatInterval: this._heartbeatInterval
      },
      ticket: {
        lifetime: this._ticketLifetime,
        refreshBuffer: this._ticketRefreshBuffer,
        maxRetryAttempts: this._maxTicketRetryAttempts,
        retryDelay: this._ticketRetryDelay
      }
    };
  }
  
  /**
   * Validate configuration and log warnings for unusual values
   */
  validateConfig(): void {
    const warnings: string[] = [];
    
    if (this._maxReconnectAttempts < 1) {
      warnings.push('maxReconnectAttempts should be at least 1');
    }
    
    if (this._baseReconnectDelay < 100) {
      warnings.push('baseReconnectDelay should be at least 100ms');
    }
    
    if (this._ticketLifetime < 10) {
      warnings.push('ticketLifetime should be at least 10 seconds');
    }
    
    if (this._ticketRefreshBuffer >= this._ticketLifetime) {
      warnings.push('ticketRefreshBuffer should be less than ticketLifetime');
    }
    
    if (warnings.length > 0) {
      console.warn('[SSEConfigService] Configuration warnings:', warnings);
    }
  }
}