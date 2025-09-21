import { TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SSETicketService } from './sse-ticket.service';
import { AuthService } from './auth.service';
import { LoggerService } from './logger.service';
import { SSEConfigService } from './sse-config.service';
import { of, throwError } from 'rxjs';

describe('SSETicketService - Critical Bug Fixes', () => {
  let service: SSETicketService;
  let httpMock: HttpTestingController;
  let authService: jasmine.SpyObj<AuthService>;
  let logger: jasmine.SpyObj<LoggerService>;
  let sseConfig: SSEConfigService;

  beforeEach(() => {
    const authSpy = jasmine.createSpyObj('AuthService', ['getIdToken']);
    const loggerSpy = jasmine.createSpyObj('LoggerService', ['log', 'error', 'warn']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        SSETicketService,
        SSEConfigService,
        { provide: AuthService, useValue: authSpy },
        { provide: LoggerService, useValue: loggerSpy }
      ]
    });

    service = TestBed.inject(SSETicketService);
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    logger = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
    sseConfig = TestBed.inject(SSEConfigService);

    authService.getIdToken.and.returnValue(Promise.resolve('test-token'));
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('1-Second Renewal Bug Fix', () => {
    it('should NOT schedule renewal for expired tickets', () => {
      // Set up expired ticket
      const expiredTicket = {
        ticket: 'expired-ticket',
        ticketExpiresAt: new Date(Date.now() - 10000).toISOString() // Expired 10 seconds ago
      };
      
      service['_updateState']({
        status: 'connected',
        ticket: expiredTicket.ticket,
        ticketExpiresAt: expiredTicket.ticketExpiresAt
      });

      // Try to schedule renewal
      service.scheduleTicketRenewal();

      // Verify no renewal was scheduled
      expect(service['ticketRenewalSubscription']).toBeNull();
      expect(logger.log).toHaveBeenCalledWith(
        jasmine.stringContaining('expired or about to expire')
      );
    });

    it('should enforce minimum 10-second renewal time', () => {
      // Set up ticket expiring in 12 seconds (buffer is 5 seconds)
      const futureTime = new Date(Date.now() + 12000).toISOString();
      
      service['_updateState']({
        status: 'connected',
        ticket: 'test-ticket',
        ticketExpiresAt: futureTime
      });

      service.scheduleTicketRenewal();

      // Renewal should be scheduled for 10 seconds (minimum), not 7 seconds (12 - 5)
      expect(service['ticketRenewalSubscription']).toBeTruthy();
      expect(logger.log).toHaveBeenCalledWith(
        jasmine.stringMatching(/Scheduling ticket renewal in \d+ seconds/)
      );
    });

    it('should not schedule renewal if ticket is consumed', () => {
      const ticket = 'consumed-ticket';
      service['consumedTickets'].add(ticket);
      
      service['_updateState']({
        status: 'connected',
        ticket: ticket,
        ticketExpiresAt: new Date(Date.now() + 30000).toISOString()
      });

      service.scheduleTicketRenewal();

      expect(service['ticketRenewalSubscription']).toBeNull();
      expect(logger.log).toHaveBeenCalledWith('Not scheduling renewal - ticket has been consumed');
    });
  });

  describe('Circuit Breaker Pattern', () => {
    it('should increment consecutive failures on error', fakeAsync(() => {
      authService.getIdToken.and.returnValue(Promise.resolve('test-token'));
      
      // Trigger multiple failures
      for (let i = 0; i < 3; i++) {
        service.requestTicket().subscribe({
          error: () => {}
        });
        
        const req = httpMock.expectOne(`${service['baseUrl']}/api/sse/tickets`);
        req.error(new ErrorEvent('Network error'), { status: 500 });
        tick(10000); // Skip past retry delays
      }
      
      flush();
      
      expect(service['consecutiveFailures']).toBe(3);
    }));

    it('should open circuit breaker after 5 consecutive failures', fakeAsync(() => {
      // Manually set consecutive failures to threshold
      service['consecutiveFailures'] = 5;
      
      service.requestTicket().subscribe({
        next: () => fail('Should not succeed'),
        error: (error) => {
          expect(error.message).toContain('Circuit breaker');
        }
      });
      
      tick();
    }));

    it('should reset consecutive failures on success', fakeAsync(() => {
      service['consecutiveFailures'] = 3;
      
      service.requestTicket().subscribe();
      
      const req = httpMock.expectOne(`${service['baseUrl']}/api/sse/tickets`);
      req.flush({
        ticket: 'new-ticket',
        expiresIn: 30,
        expiresAt: new Date(Date.now() + 30000).toISOString()
      });
      
      tick();
      
      expect(service['consecutiveFailures']).toBe(0);
    }));

    it('should check if circuit breaker is open', () => {
      service['consecutiveFailures'] = 4;
      expect(service.isCircuitBreakerOpen()).toBeFalse();
      
      service['consecutiveFailures'] = 5;
      expect(service.isCircuitBreakerOpen()).toBeTrue();
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce minimum 2-second interval between requests', fakeAsync(() => {
      // First request
      service.requestTicket().subscribe();
      const req1 = httpMock.expectOne(`${service['baseUrl']}/api/sse/tickets`);
      req1.flush({
        ticket: 'ticket-1',
        expiresIn: 30,
        expiresAt: new Date(Date.now() + 30000).toISOString()
      });
      tick();

      // Immediate second request should be delayed
      service.requestTicket().subscribe();
      
      // No immediate request
      httpMock.expectNone(`${service['baseUrl']}/api/sse/tickets`);
      
      // After delay, request should be made
      tick(2000);
      const req2 = httpMock.expectOne(`${service['baseUrl']}/api/sse/tickets`);
      req2.flush({
        ticket: 'ticket-2',
        expiresIn: 30,
        expiresAt: new Date(Date.now() + 30000).toISOString()
      });
    }));

    it('should use exponential backoff for rate limiting after failures', fakeAsync(() => {
      service['consecutiveFailures'] = 2;
      
      // With 2 failures, minimum interval should be 2000 * 2^2 = 8000ms
      service['lastTicketRequestTime'] = Date.now() - 5000; // 5 seconds ago
      
      service.requestTicket().subscribe();
      
      // Should wait 3 more seconds (8 - 5 = 3)
      httpMock.expectNone(`${service['baseUrl']}/api/sse/tickets`);
      
      tick(3000);
      const req = httpMock.expectOne(`${service['baseUrl']}/api/sse/tickets`);
      req.flush({
        ticket: 'ticket',
        expiresIn: 30,
        expiresAt: new Date(Date.now() + 30000).toISOString()
      });
    }));
  });

  describe('Error Handling', () => {
    it('should not clear ticket on transient errors (5xx, 429)', fakeAsync(() => {
      const existingTicket = 'existing-ticket';
      service['_updateState']({
        status: 'connected',
        ticket: existingTicket,
        ticketExpiresAt: new Date(Date.now() + 30000).toISOString()
      });
      
      service.requestTicket().subscribe({
        error: () => {}
      });
      
      const req = httpMock.expectOne(`${service['baseUrl']}/api/sse/tickets`);
      req.error(new ErrorEvent('Server error'), { status: 503 });
      
      tick(10000); // Skip past retries
      flush();
      
      // Ticket should be preserved for transient errors
      const state = service.getCurrentState();
      expect(state.ticket).toBe(existingTicket);
    }));

    it('should clear ticket on permanent errors (4xx except 429)', fakeAsync(() => {
      const existingTicket = 'existing-ticket';
      service['_updateState']({
        status: 'connected',
        ticket: existingTicket,
        ticketExpiresAt: new Date(Date.now() + 30000).toISOString()
      });
      
      service.requestTicket().subscribe({
        error: () => {}
      });
      
      const req = httpMock.expectOne(`${service['baseUrl']}/api/sse/tickets`);
      req.error(new ErrorEvent('Unauthorized'), { status: 401 });
      
      tick(10000); // Skip past retries
      flush();
      
      // Ticket should be cleared for permanent errors
      const state = service.getCurrentState();
      expect(state.ticket).toBeUndefined();
    }));
  });

  describe('Consumed Tickets Management', () => {
    it('should track consumed tickets', () => {
      const ticket = 'test-ticket';
      service.markTicketAsConsumed(ticket);
      
      expect(service['consumedTickets'].has(ticket)).toBeTrue();
    });

    it('should clean up old consumed tickets (keep last 10)', () => {
      // Add 15 tickets
      for (let i = 0; i < 15; i++) {
        service.markTicketAsConsumed(`ticket-${i}`);
      }
      
      // Should only keep last 10
      expect(service['consumedTickets'].size).toBe(10);
      expect(service['consumedTickets'].has('ticket-4')).toBeFalse();
      expect(service['consumedTickets'].has('ticket-14')).toBeTrue();
    });

    it('should not reuse consumed tickets', () => {
      const ticket = 'consumed-ticket';
      service.markTicketAsConsumed(ticket);
      
      service['_updateState']({
        status: 'connected',
        ticket: ticket,
        ticketExpiresAt: new Date(Date.now() + 30000).toISOString()
      });
      
      expect(service.isTicketValid()).toBeFalse();
    });
  });

  describe('Debug Information', () => {
    it('should provide comprehensive debug info', () => {
      service['consecutiveFailures'] = 2;
      service['lastTicketRequestTime'] = Date.now() - 5000;
      service['_updateState']({
        status: 'connected',
        ticket: 'debug-ticket',
        ticketExpiresAt: new Date(Date.now() + 20000).toISOString()
      });
      
      const debugInfo = service.getDebugInfo();
      
      expect(debugInfo).toEqual(jasmine.objectContaining({
        status: 'connected',
        hasTicket: true,
        consecutiveFailures: 2,
        config: jasmine.any(Object)
      }));
      expect(debugInfo.ticketExpiresIn).toBeGreaterThanOrEqual(19);
      expect(debugInfo.timeSinceLastRequest).toBeGreaterThanOrEqual(5000);
    });
  });
});