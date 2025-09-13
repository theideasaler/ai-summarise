import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { LoggerService } from './logger.service';
import type { SSEConnectionState } from '../models/project.model';

export interface SSEErrorInfo {
  type: 'ticket_request_failed' | 'connection_failed' | 'connection_lost' | 'authentication_failed' | 'rate_limited' | 'unknown';
  message: string;
  userMessage: string;
  timestamp: string;
  retryable: boolean;
  action?: 'retry' | 'refresh_page' | 'contact_support';
}

export interface SSENotification {
  id: string;
  type: 'error' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: string;
  dismissible: boolean;
  action?: {
    label: string;
    handler: () => void;
  };
}

/**
 * Service for handling SSE errors and providing user-friendly notifications
 * Translates technical errors into actionable user messages
 */
@Injectable({
  providedIn: 'root',
})
export class SSEErrorHandlerService {
  private notifications$ = new BehaviorSubject<SSENotification[]>([]);
  private currentError$ = new BehaviorSubject<SSEErrorInfo | null>(null);

  constructor(private logger: LoggerService) {}

  /**
   * Get current notifications observable
   */
  getNotifications(): Observable<SSENotification[]> {
    return this.notifications$.asObservable();
  }

  /**
   * Get current error observable
   */
  getCurrentError(): Observable<SSEErrorInfo | null> {
    return this.currentError$.asObservable();
  }

  /**
   * Handle SSE connection state changes and generate appropriate notifications
   */
  handleConnectionStateChange(state: SSEConnectionState, previousState?: SSEConnectionState): void {
    const now = new Date().toISOString();

    // Clear previous error if connection is successful
    if (state.status === 'connected' && previousState?.status === 'error') {
      this.clearCurrentError();
      this._addNotification({
        id: `connection_restored_${Date.now()}`,
        type: 'success',
        title: 'Connection Restored',
        message: 'Real-time updates are now working properly.',
        timestamp: now,
        dismissible: true,
      });
      return;
    }

    // Handle error states
    if (state.status === 'error' && state.lastError) {
      this._handleError(state.lastError, state, now);
    }

    // Handle reconnection attempts
    if (state.status === 'reconnecting' && state.reconnectAttempts > 0) {
      const attempt = state.reconnectAttempts;
      if (attempt === 1) {
        this._addNotification({
          id: `reconnecting_${Date.now()}`,
          type: 'warning',
          title: 'Connection Lost',
          message: 'Attempting to reconnect for real-time updates...',
          timestamp: now,
          dismissible: false,
        });
      } else if (attempt >= 3) {
        this._addNotification({
          id: `reconnecting_multiple_${Date.now()}`,
          type: 'error',
          title: 'Connection Problems',
          message: `Having trouble connecting (attempt ${attempt}). Please check your internet connection.`,
          timestamp: now,
          dismissible: true,
          action: {
            label: 'Refresh Page',
            handler: () => window.location.reload(),
          },
        });
      }
    }
  }

  /**
   * Handle specific error types and create user notifications
   */
  private _handleError(error: string, state: SSEConnectionState, timestamp: string): void {
    const errorInfo = this._categoriseError(error);
    this.logger.error('SSE Error categorised:', errorInfo);

    // Update current error
    this.currentError$.next(errorInfo);

    // Create user notification
    this._addNotification({
      id: `error_${Date.now()}`,
      type: 'error',
      title: this._getErrorTitle(errorInfo.type),
      message: errorInfo.userMessage,
      timestamp,
      dismissible: true,
      action: errorInfo.action ? {
        label: this._getActionLabel(errorInfo.action),
        handler: () => this._executeAction(errorInfo.action!, state),
      } : undefined,
    });
  }

  /**
   * Categorise error by type and provide user-friendly messaging
   */
  private _categoriseError(error: string): SSEErrorInfo {
    const timestamp = new Date().toISOString();
    const lowerError = error.toLowerCase();

    // Ticket request failures
    if (lowerError.includes('ticket') || lowerError.includes('401')) {
      return {
        type: 'ticket_request_failed',
        message: error,
        userMessage: 'Unable to establish secure connection. Please try refreshing the page.',
        timestamp,
        retryable: true,
        action: 'refresh_page',
      };
    }

    // Rate limiting
    if (lowerError.includes('rate limit') || lowerError.includes('429')) {
      return {
        type: 'rate_limited',
        message: error,
        userMessage: 'Connection requests are being rate limited. Please wait a moment before trying again.',
        timestamp,
        retryable: true,
        action: 'retry',
      };
    }

    // Network connection issues
    if (lowerError.includes('network') || lowerError.includes('connection') || lowerError.includes('fetch')) {
      return {
        type: 'connection_failed',
        message: error,
        userMessage: 'Unable to connect to the server. Please check your internet connection.',
        timestamp,
        retryable: true,
        action: 'retry',
      };
    }

    // Authentication failures
    if (lowerError.includes('unauthorized') || lowerError.includes('forbidden')) {
      return {
        type: 'authentication_failed',
        message: error,
        userMessage: 'Authentication failed. Please sign in again.',
        timestamp,
        retryable: false,
        action: 'refresh_page',
      };
    }

    // Generic/unknown errors
    return {
      type: 'unknown',
      message: error,
      userMessage: 'An unexpected error occurred with real-time updates. Please try refreshing the page.',
      timestamp,
      retryable: true,
      action: 'refresh_page',
    };
  }

  /**
   * Get user-friendly title for error type
   */
  private _getErrorTitle(type: SSEErrorInfo['type']): string {
    switch (type) {
      case 'ticket_request_failed':
        return 'Connection Setup Failed';
      case 'connection_failed':
        return 'Connection Failed';
      case 'connection_lost':
        return 'Connection Lost';
      case 'authentication_failed':
        return 'Authentication Required';
      case 'rate_limited':
        return 'Too Many Requests';
      default:
        return 'Connection Error';
    }
  }

  /**
   * Get action label for user interface
   */
  private _getActionLabel(action: SSEErrorInfo['action']): string {
    switch (action) {
      case 'retry':
        return 'Try Again';
      case 'refresh_page':
        return 'Refresh Page';
      case 'contact_support':
        return 'Contact Support';
      default:
        return 'OK';
    }
  }

  /**
   * Execute the suggested action
   */
  private _executeAction(action: SSEErrorInfo['action'], state: SSEConnectionState): void {
    switch (action) {
      case 'retry':
        // Trigger retry logic (this would be handled by the caller)
        this.logger.log('User requested retry for SSE connection');
        break;
      case 'refresh_page':
        window.location.reload();
        break;
      case 'contact_support':
        // Could open a support modal or redirect to support page
        this.logger.log('User requested support contact');
        break;
    }
  }

  /**
   * Add a new notification
   */
  private _addNotification(notification: SSENotification): void {
    const currentNotifications = this.notifications$.value;
    
    // Remove any existing notification with the same ID pattern
    const filteredNotifications = currentNotifications.filter(n => 
      !n.id.startsWith(notification.id.split('_')[0])
    );
    
    this.notifications$.next([...filteredNotifications, notification]);

    // Auto-dismiss success notifications after 5 seconds
    if (notification.type === 'success' && notification.dismissible) {
      setTimeout(() => this.dismissNotification(notification.id), 5000);
    }

    // Auto-dismiss info notifications after 3 seconds
    if (notification.type === 'info' && notification.dismissible) {
      setTimeout(() => this.dismissNotification(notification.id), 3000);
    }
  }

  /**
   * Dismiss a notification by ID
   */
  dismissNotification(id: string): void {
    const currentNotifications = this.notifications$.value;
    this.notifications$.next(currentNotifications.filter(n => n.id !== id));
  }

  /**
   * Clear all notifications
   */
  clearAllNotifications(): void {
    this.notifications$.next([]);
  }

  /**
   * Clear current error
   */
  clearCurrentError(): void {
    this.currentError$.next(null);
  }

  /**
   * Check if there are any active error notifications
   */
  hasActiveErrors(): boolean {
    return this.notifications$.value.some(n => n.type === 'error');
  }

  /**
   * Get error statistics for monitoring
   */
  getErrorStats(): {
    totalNotifications: number;
    errorCount: number;
    warningCount: number;
    currentError: SSEErrorInfo | null;
  } {
    const notifications = this.notifications$.value;
    
    return {
      totalNotifications: notifications.length,
      errorCount: notifications.filter(n => n.type === 'error').length,
      warningCount: notifications.filter(n => n.type === 'warning').length,
      currentError: this.currentError$.value,
    };
  }
}