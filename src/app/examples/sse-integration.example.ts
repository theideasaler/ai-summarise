import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription, combineLatest } from 'rxjs';
import { ApiService } from '../services/api.service';
import { SSETicketService } from '../services/sse-ticket.service';
import { SSEErrorHandlerService, SSENotification } from '../services/sse-error-handler.service';
import type { ProjectSSEEvent, SSEConnectionState } from '../models/project.model';

/**
 * Example component demonstrating how to integrate the new ticket-based SSE system
 * This shows best practices for:
 * 1. Subscribing to SSE events
 * 2. Handling connection state changes
 * 3. Displaying user notifications
 * 4. Managing component lifecycle with subscriptions
 */
@Component({
  selector: 'app-sse-integration-example',
  template: `
    <div class="sse-status-container">
      <!-- Connection Status Indicator -->
      <div class="connection-status" [class]="connectionStatusClass">
        <span class="status-indicator"></span>
        <span class="status-text">{{ connectionStatusText }}</span>
        
        <!-- Manual retry button for failed connections -->
        <button 
          *ngIf="connectionState?.status === 'error'" 
          (click)="retryConnection()"
          class="retry-button">
          Try Again
        </button>
      </div>

      <!-- Error Notifications -->
      <div class="notifications" *ngIf="notifications.length > 0">
        <div 
          *ngFor="let notification of notifications"
          class="notification"
          [class]="'notification-' + notification.type">
          
          <div class="notification-content">
            <h4>{{ notification.title }}</h4>
            <p>{{ notification.message }}</p>
          </div>
          
          <div class="notification-actions">
            <!-- Custom action button -->
            <button 
              *ngIf="notification.action"
              (click)="notification.action.handler()"
              class="action-button">
              {{ notification.action.label }}
            </button>
            
            <!-- Dismiss button -->
            <button 
              *ngIf="notification.dismissible"
              (click)="dismissNotification(notification.id)"
              class="dismiss-button">
              ×
            </button>
          </div>
        </div>
      </div>

      <!-- SSE Events Display -->
      <div class="sse-events" *ngIf="recentEvents.length > 0">
        <h3>Recent Project Updates</h3>
        <div 
          *ngFor="let event of recentEvents"
          class="sse-event"
          [class]="'event-' + event.type">
          
          <div class="event-header">
            <span class="event-type">{{ event.type }}</span>
            <span class="event-time">{{ formatEventTime(event.timestamp) }}</span>
          </div>
          
          <div class="event-details">
            <p><strong>Project:</strong> {{ event.projectId }}</p>
            
            <!-- Status update -->
            <p *ngIf="event.data.status">
              <strong>Status:</strong> {{ event.data.status }}
            </p>
            
            <!-- Progress update -->
            <div *ngIf="event.data.progress !== undefined" class="progress-container">
              <strong>Progress:</strong> {{ event.data.progress }}%
              <div class="progress-bar">
                <div 
                  class="progress-fill" 
                  [style.width.%]="event.data.progress">
                </div>
              </div>
            </div>
            
            <!-- Completion details -->
            <p *ngIf="event.data.summary">
              <strong>Summary:</strong> {{ event.data.summary.substring(0, 100) }}...
            </p>
            
            <p *ngIf="event.data.tokensUsed">
              <strong>Tokens Used:</strong> {{ event.data.tokensUsed }}
            </p>
            
            <!-- Error details -->
            <p *ngIf="event.data.error" class="error-message">
              <strong>Error:</strong> {{ event.data.error }}
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .sse-status-container {
      padding: 20px;
      max-width: 800px;
      margin: 0 auto;
    }

    .connection-status {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-weight: 500;
    }

    .connection-status.connected {
      background-color: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }

    .connection-status.connecting {
      background-color: #fff3cd;
      color: #856404;
      border: 1px solid #ffeaa7;
    }

    .connection-status.error {
      background-color: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }

    .connection-status.disconnected {
      background-color: #f1f3f4;
      color: #5f6368;
      border: 1px solid #dadce0;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 8px;
    }

    .connected .status-indicator {
      background-color: #28a745;
    }

    .connecting .status-indicator {
      background-color: #ffc107;
      animation: pulse 2s infinite;
    }

    .error .status-indicator,
    .disconnected .status-indicator {
      background-color: #dc3545;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .retry-button {
      margin-left: auto;
      padding: 4px 12px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    .retry-button:hover {
      background: #0056b3;
    }

    .notifications {
      margin-bottom: 20px;
    }

    .notification {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 12px 16px;
      margin-bottom: 8px;
      border-radius: 8px;
      border-left: 4px solid;
    }

    .notification-error {
      background-color: #f8d7da;
      color: #721c24;
      border-left-color: #dc3545;
    }

    .notification-warning {
      background-color: #fff3cd;
      color: #856404;
      border-left-color: #ffc107;
    }

    .notification-success {
      background-color: #d4edda;
      color: #155724;
      border-left-color: #28a745;
    }

    .notification-info {
      background-color: #cce7ff;
      color: #004085;
      border-left-color: #007bff;
    }

    .notification-content h4 {
      margin: 0 0 4px 0;
      font-size: 14px;
      font-weight: 600;
    }

    .notification-content p {
      margin: 0;
      font-size: 13px;
    }

    .notification-actions {
      display: flex;
      gap: 8px;
      margin-left: 12px;
    }

    .action-button,
    .dismiss-button {
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .action-button {
      background: #007bff;
      color: white;
    }

    .dismiss-button {
      background: transparent;
      color: #6c757d;
      font-weight: bold;
    }

    .sse-events {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 16px;
    }

    .sse-events h3 {
      margin-top: 0;
      color: #495057;
    }

    .sse-event {
      background: white;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 12px;
      border-left: 3px solid;
    }

    .event-project_status_update,
    .event-project_progress_update {
      border-left-color: #007bff;
    }

    .event-project_completed {
      border-left-color: #28a745;
    }

    .event-project_failed {
      border-left-color: #dc3545;
    }

    .event-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .event-type {
      font-weight: 600;
      color: #495057;
    }

    .event-time {
      font-size: 12px;
      color: #6c757d;
    }

    .event-details p {
      margin: 4px 0;
      font-size: 14px;
    }

    .error-message {
      color: #dc3545;
    }

    .progress-container {
      margin: 8px 0;
    }

    .progress-bar {
      width: 200px;
      height: 8px;
      background: #e9ecef;
      border-radius: 4px;
      margin-top: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: #007bff;
      transition: width 0.3s ease;
    }
  `]
})
export class SSEIntegrationExampleComponent implements OnInit, OnDestroy {
  connectionState: SSEConnectionState | null = null;
  notifications: SSENotification[] = [];
  recentEvents: ProjectSSEEvent[] = [];

  private subscriptions: Subscription[] = [];

  constructor(
    private apiService: ApiService,
    private sseTicketService: SSETicketService,
    private sseErrorHandler: SSEErrorHandlerService
  ) {}

  ngOnInit() {
    // Subscribe to SSE connection state changes
    this.subscriptions.push(
      this.apiService.getSSEConnectionState().subscribe(state => {
        console.log('SSE Connection state changed:', state);
        this.connectionState = state;
      })
    );

    // Subscribe to error notifications
    this.subscriptions.push(
      this.apiService.getSSENotifications().subscribe(notifications => {
        console.log('SSE Notifications updated:', notifications);
        this.notifications = notifications;
      })
    );

    // Subscribe to SSE events
    this.subscriptions.push(
      this.apiService.subscribeToProjectsSSE().subscribe(event => {
        console.log('Received SSE event:', event);
        
        // Add to recent events (keep last 10)
        this.recentEvents = [event, ...this.recentEvents.slice(0, 9)];
        
        // Handle specific event types
        this.handleSSEEvent(event);
      })
    );
  }

  ngOnDestroy() {
    // Clean up subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    
    // Disconnect SSE
    this.apiService.disconnectSSE();
  }

  get connectionStatusClass(): string {
    if (!this.connectionState) return 'disconnected';
    return this.connectionState.status;
  }

  get connectionStatusText(): string {
    if (!this.connectionState) return 'Disconnected';
    
    switch (this.connectionState.status) {
      case 'connected':
        return 'Connected - Real-time updates active';
      case 'connecting':
        return 'Connecting...';
      case 'requesting_ticket':
        return 'Setting up secure connection...';
      case 'reconnecting':
        const attempts = this.connectionState.reconnectAttempts;
        return `Reconnecting... (attempt ${attempts})`;
      case 'error':
        return `Connection error: ${this.connectionState.lastError || 'Unknown error'}`;
      case 'disconnected':
      default:
        return 'Disconnected';
    }
  }

  retryConnection() {
    console.log('Manual SSE connection retry requested');
    this.apiService.refreshSSEConnection();
  }

  dismissNotification(id: string) {
    console.log('Dismissing notification:', id);
    this.apiService.dismissSSENotification(id);
  }

  formatEventTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  private handleSSEEvent(event: ProjectSSEEvent) {
    // Handle specific business logic based on event type
    switch (event.type) {
      case 'project_completed':
        // Could trigger UI updates, notifications, etc.
        console.log(`Project ${event.projectId} completed successfully`);
        break;
        
      case 'project_failed':
        // Handle failed project
        console.error(`Project ${event.projectId} failed:`, event.data.error);
        break;
        
      case 'project_progress_update':
        // Update progress bars, etc.
        console.log(`Project ${event.projectId} progress: ${event.data.progress}%`);
        break;
        
      case 'project_status_update':
        // Update status displays
        console.log(`Project ${event.projectId} status: ${event.data.status}`);
        break;
    }
  }

  // Example: Programmatic connection management
  connectSSE() {
    this.apiService.subscribeToProjectsSSE().subscribe();
  }

  disconnectSSE() {
    this.apiService.disconnectSSE();
  }

  // Example: Check connection health
  getConnectionInfo() {
    const state = this.sseTicketService.getCurrentState();
    const config = this.sseTicketService.getConfig();
    
    console.log('Connection info:', {
      state,
      config,
      isTicketValid: this.sseTicketService.isTicketValid(),
      timeToExpiry: this.sseTicketService.getTicketTimeToExpiry(),
      errorStats: this.sseErrorHandler.getErrorStats()
    });
  }
}