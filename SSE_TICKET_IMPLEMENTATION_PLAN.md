# Ticket-Based SSE Authentication - Frontend Implementation Plan

## Overview

This document outlines the complete frontend implementation for integrating the ticket-based SSE authentication system in the Angular application. The new system replaces direct JWT tokens in SSE query parameters with short-lived, single-use tickets for enhanced security.

## Implementation Summary

### ✅ Completed Components

#### 1. Type Definitions and Interfaces
**File:** `/src/app/models/project.model.ts`

- `SSETicketRequest` - Request structure for ticket generation
- `SSETicketResponse` - Response structure containing ticket and expiry info
- `SSEConnectionState` - Complete connection state management
- `SSEConnectionConfig` - Configuration options for SSE behavior

#### 2. Feature Flag System
**Files:** 
- `/src/environments/environment.ts`
- `/src/environments/environment.prod.ts`

**Key Features:**
- `features.useSSETicketAuth` - Toggle ticket-based authentication
- `sse.maxReconnectAttempts` - Configurable retry limits
- `sse.ticketRefreshBuffer` - Automatic renewal timing
- Production starts with ticket auth **disabled** for safe rollout

#### 3. SSE Ticket Service
**File:** `/src/app/services/sse-ticket.service.ts`

**Core Capabilities:**
- Ticket request with exponential backoff retry logic
- Automatic ticket validation and renewal
- Connection state management with BehaviorSubject
- Configurable retry attempts and delays
- Thread-safe state updates

**Key Methods:**
```typescript
requestTicket(purpose: 'projects'): Observable<SSETicketResponse>
isTicketValid(): boolean
scheduleTicketRenewal(): void
getConnectionState(): Observable<SSEConnectionState>
```

#### 4. Error Handling Service  
**File:** `/src/app/services/sse-error-handler.service.ts`

**Features:**
- Intelligent error categorisation
- User-friendly notification system
- Actionable error messages with retry options
- Automatic notification management
- Error statistics for monitoring

**Error Categories:**
- Ticket request failures
- Network connection issues
- Authentication problems
- Rate limiting
- Generic fallback errors

#### 5. Updated API Service
**File:** `/src/app/services/api.service.ts`

**Key Enhancements:**
- Dual-mode SSE connection (ticket-based + legacy token-based)
- Automatic fallback to legacy mode when tickets disabled
- Integration with ticket service for state management
- Enhanced error handling and user feedback
- Connection monitoring and manual retry capabilities

**New Methods:**
```typescript
getSSEConnectionState(): Observable<SSEConnectionState>
getSSENotifications(): Observable<SSENotification[]>
dismissSSENotification(id: string): void
refreshSSEConnection(): void
```

#### 6. Integration Example Component
**File:** `/src/app/examples/sse-integration.example.ts`

Complete working example showing:
- SSE event subscription patterns
- Connection state monitoring
- Error notification handling
- User interface integration
- Component lifecycle management

## Architecture Overview

### Connection Flow Diagram

```
User Request → Check Feature Flag → Ticket Enabled?
                                      ↓
                           Yes → Request Ticket → Ticket Valid?
                                      ↓                ↓
                                   Success          Retry Logic
                                      ↓                ↓
                           Create SSE Connection → Success
                                      ↓
                          Monitor Connection State
                                      ↓
                           Handle Events & Errors
```

### State Management

The system uses reactive patterns with RxJS:

```typescript
// Connection state flow
SSETicketService.connectionState$ 
  → ApiService (SSE management)
  → SSEErrorHandlerService (error handling)
  → UI Components (user feedback)
```

## Security Benefits

1. **Short-lived tickets** (30 seconds) vs long-lived JWT tokens (1 hour)
2. **Single-use tickets** prevent replay attacks
3. **Rate limiting** on ticket generation (10/minute)
4. **Automatic cleanup** of expired tickets
5. **No sensitive data** in URL query parameters

## Migration Strategy

### Phase 1: Development Environment
- ✅ Feature flag enabled in development
- ✅ Full ticket-based implementation
- ✅ Comprehensive error handling
- ✅ Backward compatibility maintained

### Phase 2: Staging Validation  
```typescript
// environment.prod.ts
features: {
  useSSETicketAuth: true  // Enable in staging first
}
```

### Phase 3: Production Rollout
```typescript
// Gradual rollout approach
features: {
  useSSETicketAuth: false  // Start disabled
}
// → Monitor → Enable for subset → Full rollout
```

### Phase 4: Legacy Removal
Once ticket system is stable:
- Remove token-based SSE support
- Simplify connection logic
- Clean up feature flags

## Error Handling Strategy

### User Experience Priority
1. **Silent recovery** - Automatic reconnection without user disruption
2. **Informative feedback** - Clear error messages with suggested actions
3. **Actionable options** - Retry buttons, refresh suggestions
4. **Graceful degradation** - Fallback to polling if SSE fails completely

### Error Categories & Actions

| Error Type | User Message | Action | Auto-Retry |
|------------|--------------|--------|------------|
| Ticket Request Failed | "Connection setup failed" | Refresh page | Yes (3x) |
| Rate Limited | "Too many requests" | Wait & retry | Yes |
| Network Error | "Connection lost" | Check internet | Yes (5x) |
| Auth Failed | "Sign in required" | Refresh page | No |

## Testing Strategy

### Unit Tests
```typescript
// SSETicketService tests
- Ticket request success/failure
- Exponential backoff logic  
- State management accuracy
- Configuration handling

// SSEErrorHandlerService tests
- Error categorisation accuracy
- Notification management
- User action handling

// ApiService tests  
- Dual-mode connection logic
- Fallback mechanisms
- Event handling
```

### Integration Tests
```typescript
// End-to-end SSE flow
- Complete ticket exchange process
- Connection state transitions
- Error recovery scenarios
- User interaction flows
```

### Load Testing
```typescript
// Ticket system performance
- Concurrent ticket requests
- Connection stability under load
- Error handling at scale
- Memory leak detection
```

## Monitoring & Debugging

### Development Tools
```typescript
// Console debugging
console.log('SSE Connection state:', this.apiService.getSSEConnectionState());
console.log('Error stats:', this.sseErrorHandler.getErrorStats());

// Component example method
getConnectionInfo() {
  const state = this.sseTicketService.getCurrentState();
  const config = this.sseTicketService.getConfig();
  console.log('Debug info:', { state, config });
}
```

### Production Monitoring
```typescript
// Error statistics
interface ErrorStats {
  totalNotifications: number;
  errorCount: number;
  warningCount: number;
  currentError: SSEErrorInfo | null;
}

// Connection metrics  
interface ConnectionMetrics {
  status: SSEConnectionState['status'];
  reconnectAttempts: number;
  lastError?: string;
  ticketExpiresAt?: string;
}
```

## Performance Considerations

### Optimization Features
1. **Automatic ticket renewal** - Prevents connection interruptions
2. **Connection pooling** - Reuse existing connections when possible  
3. **Smart retry logic** - Exponential backoff prevents server overload
4. **State caching** - Minimize unnecessary API calls
5. **Memory management** - Proper subscription cleanup

### Memory Management
```typescript
// Component cleanup pattern
ngOnDestroy() {
  this.subscriptions.forEach(sub => sub.unsubscribe());
  this.apiService.disconnectSSE();
}
```

## Usage Examples

### Basic SSE Integration
```typescript
export class ProjectComponent implements OnInit, OnDestroy {
  private subscriptions: Subscription[] = [];

  ngOnInit() {
    // Subscribe to SSE events
    this.subscriptions.push(
      this.apiService.subscribeToProjectsSSE().subscribe(event => {
        this.handleProjectEvent(event);
      })
    );

    // Monitor connection state
    this.subscriptions.push(
      this.apiService.getSSEConnectionState().subscribe(state => {
        this.updateConnectionStatus(state);
      })
    );
  }
}
```

### Error Notification Display
```typescript
export class NotificationComponent {
  notifications$ = this.apiService.getSSENotifications();

  dismissNotification(id: string) {
    this.apiService.dismissSSENotification(id);
  }
}
```

### Manual Connection Management
```typescript
export class AdminComponent {
  retryConnection() {
    this.apiService.refreshSSEConnection();
  }

  getConnectionDebugInfo() {
    return {
      state: this.sseTicketService.getCurrentState(),
      config: this.sseTicketService.getConfig(),
      isValid: this.sseTicketService.isTicketValid(),
      timeToExpiry: this.sseTicketService.getTicketTimeToExpiry()
    };
  }
}
```

## Configuration Options

### Environment Configuration
```typescript
// environment.ts
export const environment = {
  features: {
    useSSETicketAuth: boolean;  // Enable/disable ticket auth
  },
  sse: {
    maxReconnectAttempts: number;      // Maximum retry attempts
    baseReconnectDelay: number;        // Base delay in milliseconds
    ticketRefreshBuffer: number;       // Seconds before expiry to refresh
    maxTicketRetryAttempts: number;    // Ticket request retries
    ticketRetryDelay: number;          // Delay between ticket retries
  }
};
```

### Runtime Configuration Updates
```typescript
// Update config during runtime for testing
this.sseTicketService.updateConfig({
  maxReconnectAttempts: 10,
  ticketRefreshBuffer: 3
});
```

## Security Considerations

### Best Practices Implemented
1. **No sensitive data in URLs** - Tickets are opaque, short-lived tokens
2. **Automatic cleanup** - Expired tickets are invalidated server-side
3. **Rate limiting** - Prevents ticket request abuse
4. **Error handling** - No sensitive information leaked in error messages
5. **State validation** - Ticket validity checked before each use

### Additional Security Measures
- Ticket entropy ensures unpredictability
- Server-side ticket validation with user context
- Audit logging for ticket generation and usage
- HTTPS enforcement for all ticket exchanges

## Deployment Checklist

### Pre-Deployment
- [ ] Unit tests passing
- [ ] Integration tests validated
- [ ] Error scenarios tested
- [ ] Performance benchmarks met
- [ ] Security review completed

### Deployment Steps
1. **Deploy with feature flag disabled**
2. **Monitor baseline metrics**
3. **Enable for internal users**
4. **Gradual rollout to user segments**
5. **Full rollout after validation**
6. **Legacy cleanup after stable period**

### Post-Deployment Monitoring
- Connection success rates
- Error frequency and types
- Ticket request performance
- User experience metrics
- Security incident monitoring

## Troubleshooting Guide

### Common Issues

**Issue: Connection fails immediately**
```typescript
// Check feature flag
console.log('Ticket auth enabled:', environment.features.useSSETicketAuth);

// Check authentication
const token = await this.authService.getIdToken();
console.log('Has auth token:', !!token);
```

**Issue: Frequent reconnections**
```typescript
// Check network stability
const state = this.sseTicketService.getCurrentState();
console.log('Reconnect attempts:', state.reconnectAttempts);
console.log('Last error:', state.lastError);
```

**Issue: Tickets expiring too quickly**
```typescript
// Check timing configuration
const config = this.sseTicketService.getConfig();
console.log('Refresh buffer:', config.ticketRefreshBuffer);
console.log('Time to expiry:', this.sseTicketService.getTicketTimeToExpiry());
```

## Conclusion

The ticket-based SSE authentication system provides a robust, secure, and user-friendly solution for real-time communication. The implementation includes:

- ✅ Complete backward compatibility
- ✅ Comprehensive error handling
- ✅ Flexible configuration options
- ✅ Production-ready monitoring
- ✅ Gradual migration strategy
- ✅ Excellent developer experience

The system is ready for staging validation and production rollout with confidence in security, reliability, and maintainability.

## Files Modified/Created

### New Files
- `/src/app/services/sse-ticket.service.ts`
- `/src/app/services/sse-error-handler.service.ts`
- `/src/app/examples/sse-integration.example.ts`
- `/SSE_TICKET_IMPLEMENTATION_PLAN.md` (this document)

### Modified Files
- `/src/app/models/project.model.ts` - Added SSE ticket interfaces
- `/src/environments/environment.ts` - Added feature flags and SSE config
- `/src/environments/environment.prod.ts` - Added production configuration
- `/src/app/services/api.service.ts` - Integrated ticket-based SSE system

All implementations follow the project's coding standards and maintain full backward compatibility during the migration period.