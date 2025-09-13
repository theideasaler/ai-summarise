# SSE Ticket Authentication System - Comprehensive Documentation

## Overview

The SSE (Server-Sent Events) ticket authentication system provides a secure, single-use ticket mechanism for establishing real-time connections without exposing JWT tokens in URLs. This document provides detailed ASCII flow diagrams and explanations of the entire system.

## 1. Main Authentication Flow

```ascii
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          SSE TICKET AUTHENTICATION FLOW                              │
└─────────────────────────────────────────────────────────────────────────────────────┘

    Frontend (Angular)                  Backend (Cloudflare)              Database (D1)
         │                                    │                                │
         │  1. User Login (Firebase)          │                                │
         ├──────────────────────────>         │                                │
         │     JWT Token Received             │                                │
         │                                    │                                │
         │  2. POST /api/sse/tickets          │                                │
         │     Headers: Bearer JWT            │                                │
         ├────────────────────────────────────>                                │
         │                                    │                                │
         │                              3. Validate JWT                        │
         │                                    ├───────>                        │
         │                                    │  Verify User                   │
         │                                    │<───────                        │
         │                                    │                                │
         │                              4. Generate Ticket                     │
         │                                    │  - UUID generation             │
         │                                    │  - 30 sec expiry              │
         │                                    │  - Store IP/UA                │
         │                                    ├──────────────────────────────>│
         │                                    │   INSERT INTO sse_tickets     │
         │                                    │   (ticket, user_id,          │
         │                                    │    expires_at, ip_address)   │
         │                                    │<──────────────────────────────│
         │                                    │                                │
         │  5. Return Ticket Response         │                                │
         │<────────────────────────────────────                                │
         │     {                              │                                │
         │       ticket: "uuid-xxxx",         │                                │
         │       expiresIn: 30,               │                                │
         │       expiresAt: "2025-01-30..."   │                                │
         │     }                              │                                │
         │                                    │                                │
         │  6. Establish SSE Connection       │                                │
         │     GET /api/events/projects       │                                │
         │     ?ticket=uuid-xxxx              │                                │
         ├────────────────────────────────────>                                │
         │                                    │                                │
         │                              7. Validate & Consume Ticket           │
         │                                    │  - Check expiry               │
         │                                    │  - Verify unused              │
         │                                    │  - Mark as used (atomic)      │
         │                                    ├──────────────────────────────>│
         │                                    │   UPDATE sse_tickets          │
         │                                    │   SET used = 1                │
         │                                    │   WHERE ticket = ?            │
         │                                    │   AND used = 0                │
         │                                    │   AND expires_at > now        │
         │                                    │   RETURNING user_id...        │
         │                                    │<──────────────────────────────│
         │                                    │                                │
         │  8. SSE Stream Established         │                                │
         │<────────────────────────────────────                                │
         │     EventSource Connected          │                                │
         │                                    │                                │
         │  9. Data Events                    │                                │
         │<═══════════════════════════════════                                │
         │     Real-time updates              │                                │
         │                                    │                                │

Legend:
  ───> Regular HTTP Request/Response
  ═══> SSE Stream (persistent connection)
```

## 2. Ticket Lifecycle Diagram

```ascii
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              TICKET LIFECYCLE (30 SECONDS)                           │
└─────────────────────────────────────────────────────────────────────────────────────┘

      0s                  5s                 25s               30s
      │                   │                   │                 │
      ▼                   ▼                   ▼                 ▼
   ┌──────┐         ┌──────────┐       ┌──────────┐      ┌─────────┐
   │CREATE│────────>│  ACTIVE  │──────>│ RENEWAL  │─────>│ EXPIRED │
   └──────┘         └──────────┘       │  WINDOW  │      └─────────┘
      │                   │             └──────────┘            │
      │                   │                  │                  │
      │                   │                  │                  │
   Generate           Can be used         Client should      Cannot use
   - UUID             for connection      request new        - Auto cleanup
   - Store DB         - Single use        ticket             - Deleted from DB
   - Set expiry       - IP validation     (5 sec buffer)     

Database State Timeline:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

T+0s:  ┌────────────────────────────────────────────┐
       │ id: abc123                                  │
       │ ticket: uuid-xxxx-yyyy-zzzz                 │
       │ user_id: user123                            │
       │ expires_at: 2025-01-30 10:00:30             │
       │ used: 0  ◄── Available for use              │
       │ ip_address: 192.168.1.1                     │
       └────────────────────────────────────────────┘

T+10s: ┌────────────────────────────────────────────┐
       │ Same record...                              │
       │ used: 1  ◄── Consumed (atomic update)      │
       │ used_at: 2025-01-30 10:00:10               │
       └────────────────────────────────────────────┘

T+30s: ┌────────────────────────────────────────────┐
       │ Record deleted by cleanup worker           │
       │ (expires_at < now OR used = 1)            │
       └────────────────────────────────────────────┘

State Transitions:
  CREATED ──> UNUSED ──> USED ──> DELETED
     │                     │
     └─────> EXPIRED ──────┘
```

## 3. Ticket Renewal Cycle

```ascii
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           AUTOMATIC TICKET RENEWAL CYCLE                             │
└─────────────────────────────────────────────────────────────────────────────────────┘

   Connection Timeline (with 25-second renewal interval):
   ═══════════════════════════════════════════════════════════════════════════════════

   0s          25s         30s         50s         55s         75s         80s
   │           │           │           │           │           │           │
   ▼           ▼           ▼           ▼           ▼           ▼           ▼
   ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐
   │Ticket1│   │Renew  │   │Expire │   │Ticket2│   │Expire │   │Renew  │   │Expire │
   │Active │──>│Request│──>│Ticket1│──>│Active │──>│Ticket1│──>│Request│──>│Ticket2│
   └───────┘   └───────┘   └───────┘   └───────┘   └───────┘   └───────┘   └───────┘
       │           │                       │                       │
       │           │                       │                       │
   SSE Stream  Generate                SSE Stream             Generate
   Established Ticket2                 Continues              Ticket3
                                       with Ticket2

   Client State Machine:
   ──────────────────────────────────────────────────────────────────────────────────

                          ┌─────────────┐
                          │   INITIAL   │
                          └──────┬──────┘
                                 │ Request Ticket
                                 ▼
                    ┌────────────────────────┐
                    │   TICKET_REQUESTED     │
                    └────────────┬───────────┘
                                 │ Ticket Received
                                 ▼
                    ┌────────────────────────┐
              ┌─────│      CONNECTED         │◄────┐
              │     └────────────┬───────────┘     │
              │                  │                  │
              │            Timer(25s)               │
              │                  │                  │ Renewal Success
              │                  ▼                  │
              │     ┌────────────────────────┐     │
              │     │   RENEWING_TICKET      │─────┘
              │     └────────────┬───────────┘
              │                  │
              │           Renewal Failed
              │                  │
              │                  ▼
              │     ┌────────────────────────┐
              └────>│    RECONNECTING        │
                    └────────────────────────┘

   Renewal Process Detail:
   ─────────────────────────────────────────────────────────────────────────────────

   T+0s:   [Ticket1 Created] ──> SSE Connection Established
           │
   T+25s:  ├──> [Renewal Timer Fires]
           │    │
           │    ├──> POST /api/sse/tickets (with JWT)
           │    │
           │    ├──> [Ticket2 Created]
           │    │
           │    └──> Schedule next renewal for T+50s
           │
   T+30s:  └──> [Ticket1 Expires] (but connection continues with Ticket2)
```

## 4. Security Features

```ascii
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              SECURITY FEATURES                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘

1. SINGLE-USE MECHANISM
   ────────────────────────────────────────────────────────────────────────
   
   Concurrent Request Protection:
   
   Client A ──> UPDATE SET used=1 WHERE ticket=X AND used=0 ──> SUCCESS ✓
                                    │
                                    ├── ATOMIC OPERATION
                                    │
   Client B ──> UPDATE SET used=1 WHERE ticket=X AND used=0 ──> FAIL ✗
   
   Database guarantees only ONE client can consume the ticket

2. SHORT EXPIRY WINDOW (30 seconds)
   ────────────────────────────────────────────────────────────────────────
   
   ┌──────────────────────────────────────┐
   │         Attack Window Timeline        │
   ├──────────────────────────────────────┤
   │ 0s:   Ticket generated               │
   │ 1s:   Ticket potentially intercepted │
   │ 2-29s: Narrow window for misuse      │
   │ 30s:  Ticket auto-expires            │
   └──────────────────────────────────────┘
   
   Risk Mitigation:
   - 30-second window limits exposure
   - Single-use prevents replay attacks
   - IP validation adds extra layer

3. IP ADDRESS VALIDATION
   ────────────────────────────────────────────────────────────────────────
   
   Request Flow:
   
   ┌────────┐     ┌────────┐     ┌──────────┐
   │Client  │────>│Ticket  │────>│SSE       │
   │IP: 1.1 │     │IP: 1.1 │     │Connect   │
   └────────┘     └────────┘     └──────────┘
                        │              │
                        └──────────────┘
                         IP Match Check
                         
   If IPs don't match:
   - Warning logged (not blocking due to proxies/VPNs)
   - Security event recorded for monitoring

4. NO JWT IN URL
   ────────────────────────────────────────────────────────────────────────
   
   Traditional (Insecure):
   GET /api/events?token=eyJhbGciOiJSUzI1NiIs... ← JWT exposed in logs/history
   
   Ticket System (Secure):
   GET /api/events?ticket=uuid-xxxx-yyyy-zzzz    ← Single-use, short-lived
   
   Benefits:
   ✓ JWTs never appear in server logs
   ✓ Browser history doesn't contain auth tokens
   ✓ Proxy/CDN logs don't expose credentials
   ✓ Tickets become useless after single use

5. AUTOMATIC CLEANUP
   ────────────────────────────────────────────────────────────────────────
   
   Cleanup Worker Process:
   
   ┌────────────┐     Every 60s      ┌──────────┐
   │  Worker    │──────────────────>│ Database │
   │  Process   │                    │          │
   └────────────┘                    └──────────┘
         │                                 │
         └─── DELETE FROM sse_tickets ────┘
              WHERE expires_at < now
              OR used = 1
```

## 5. Component Interaction Diagram

```ascii
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           COMPONENT INTERACTION MAP                                  │
└─────────────────────────────────────────────────────────────────────────────────────┘

Frontend (Angular)                          Backend (Cloudflare Workers)
┌─────────────────────────────┐            ┌─────────────────────────────────────┐
│                             │            │                                     │
│  ┌──────────────────────┐  │            │  ┌──────────────────────────────┐  │
│  │  AuthService         │  │            │  │  /api/sse/tickets Handler   │  │
│  │  - getIdToken()      │  │            │  │  - handleGenerateSSETicket()│  │
│  └──────────┬───────────┘  │            │  └────────────┬─────────────────┘  │
│             │               │            │               │                     │
│  ┌──────────▼───────────┐  │            │  ┌────────────▼─────────────────┐  │
│  │  SSETicketService    │  │  HTTP      │  │  SSETicketService           │  │
│  │  - requestTicket()   │──┼────────────┼─>│  - generateTicket()         │  │
│  │  - scheduleRenewal() │  │  POST      │  │  - validateAndConsumeTicket()│ │
│  │  - isTicketValid()   │  │            │  │  - cleanupExpiredTickets()  │  │
│  └──────────┬───────────┘  │            │  └────────────┬─────────────────┘  │
│             │               │            │               │                     │
│  ┌──────────▼───────────┐  │            │               │                     │
│  │  SSEConfigService    │  │            │               ▼                     │
│  │  - Configuration     │  │            │  ┌──────────────────────────────┐  │
│  │  - Validation        │  │            │  │  D1 Database                │  │
│  └──────────────────────┘  │            │  │  ┌───────────────────────┐  │  │
│                             │            │  │  │  sse_tickets table   │  │  │
│  ┌──────────────────────┐  │            │  │  │  - id (primary key)  │  │  │
│  │  ProjectService      │  │  SSE       │  │  │  - ticket (unique)   │  │  │
│  │  - connectSSE()      │──┼────────────┼─>│  │  - user_id           │  │  │
│  │  - handleEvents()    │  │  Stream    │  │  │  - expires_at        │  │  │
│  └──────────────────────┘  │            │  │  │  - used (0/1)        │  │  │
│                             │            │  │  │  - ip_address        │  │  │
└─────────────────────────────┘            │  │  └───────────────────────┘  │  │
                                           │  └──────────────────────────────┘  │
                                           │                                     │
                                           │  ┌──────────────────────────────┐  │
                                           │  │  /api/events/projects        │  │
                                           │  │  - authenticateSSEConnection│  │
                                           │  │  - Stream real-time data     │  │
                                           │  └──────────────────────────────┘  │
                                           └─────────────────────────────────────┘

Data Flow Sequence:
───────────────────────────────────────────────────────────────────────────────

1. User Authentication:
   AuthService ──> Firebase ──> JWT Token

2. Ticket Generation:
   SSETicketService ──> HTTP POST ──> Backend Handler ──> SSETicketService ──> D1 Database

3. SSE Connection:
   ProjectService ──> EventSource(?ticket=xxx) ──> Backend SSE Handler ──> Validate Ticket ──> Stream

4. Ticket Renewal:
   Timer(25s) ──> SSETicketService.requestTicket() ──> Repeat Step 2

5. Cleanup:
   Worker/Cron ──> SSETicketService.cleanupExpiredTickets() ──> DELETE from D1
```

## 6. Failure Scenarios and Recovery

```ascii
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          FAILURE SCENARIOS & RECOVERY                                │
└─────────────────────────────────────────────────────────────────────────────────────┘

SCENARIO 1: Ticket Expires Before Use
────────────────────────────────────────────────────────────────────────────────

Client                              Server
  │                                   │
  ├─── Request Ticket ──────────────> │
  │<── Ticket (30s expiry) ────────── │
  │                                   │
  │    [31 seconds pass]              │
  │                                   │
  ├─── Connect with Expired Ticket ──>│
  │                                   ├── Check: expires_at < now
  │<── Error: Ticket Expired ──────── │── FAIL ✗
  │                                   │
  ├─── Request New Ticket ──────────> │
  │<── Fresh Ticket ────────────────  │
  │                                   │
  └─── Connect with Fresh Ticket ───> │── SUCCESS ✓

SCENARIO 2: Ticket Already Used
────────────────────────────────────────────────────────────────────────────────

Attacker                Client                     Server
   │                      │                          │
   ├── Steal Ticket ──────┤                          │
   │                      │                          │
   ├── Use Stolen Ticket ─────────────────────────> │
   │                                                 ├── UPDATE SET used=1
   │<── Connection Established ───────────────────── │── SUCCESS ✓
   │                      │                          │
   │                      ├── Try Original Ticket ──>│
   │                      │                          ├── Check: used=1
   │                      │<── Error: Already Used ──│── FAIL ✗
   │                      │                          │
   │                      ├── Request New Ticket ───>│
   │                      │<── Fresh Ticket ──────── │
   │                      │                          │
   │                      └── Connect ──────────────>│── SUCCESS ✓

SCENARIO 3: Renewal Failure During Active Connection
────────────────────────────────────────────────────────────────────────────────

Time    Client State                    Action
────    ─────────────                   ──────────────────────────────
0s      Connected (Ticket1)             SSE Stream Active
25s     Renewal Timer Fires             POST /api/sse/tickets
26s     Network Error                   Renewal Failed
27s     Retry 1                         POST /api/sse/tickets
28s     Retry 2                         POST /api/sse/tickets  
29s     Retry 3 Success                 New Ticket Received
30s     Ticket1 Expires                 Connection Maintained
55s     Next Renewal                    Continue Normal Cycle

Recovery Strategy:
  ┌───────────┐
  │  Renewal  │
  │  Failed   │
  └─────┬─────┘
        │
        ▼
  ┌─────────────┐     Success      ┌──────────┐
  │ Retry with  ├──────────────────>│ Continue │
  │ Exponential │                   │  Normal  │
  │  Backoff    │                   │  Cycle   │
  └──────┬──────┘                   └──────────┘
         │
         │ Max Retries Exceeded
         ▼
  ┌─────────────┐
  │ Disconnect  │
  │ & Reconnect │
  │ Full Cycle  │
  └─────────────┘

SCENARIO 4: Connection Lost Mid-Stream
────────────────────────────────────────────────────────────────────────────────

  SSE Connection State Machine:
  
         CONNECTED ──────> CONNECTION_LOST
             │                    │
             │                    ▼
             │              Check Ticket
             │              Still Valid?
             │                    │
             │         ┌──────────┴──────────┐
             │         │                     │
             │        Yes                   No
             │         │                     │
             │         ▼                     ▼
             │    Reconnect           Request New
             │    Immediately          Ticket First
             │         │                     │
             └─────────┴─────────────────────┘
                              │
                              ▼
                         RECONNECTED
```

## Key Benefits of This Architecture

### 1. **Security Benefits**
- **No JWT exposure in URLs**: JWTs remain in headers only
- **Single-use tickets**: Prevents replay attacks
- **Short expiry**: Limits attack window to 30 seconds
- **IP validation**: Additional layer of security
- **Automatic cleanup**: No stale credentials in database

### 2. **Performance Benefits**
- **Lightweight tickets**: UUIDs vs large JWT strings
- **Indexed lookups**: Fast O(1) ticket validation
- **Automatic renewal**: No manual intervention needed
- **Connection persistence**: Survives ticket expiry

### 3. **Operational Benefits**
- **Clean logs**: No sensitive data in access logs
- **Audit trail**: Complete ticket usage history
- **User revocation**: Can invalidate all user tickets
- **Resource cleanup**: Automatic expired ticket removal

### 4. **Developer Experience**
- **Simple API**: Request ticket, use ticket
- **Automatic management**: Renewal handled by service
- **Clear error states**: Explicit failure reasons
- **Retry logic**: Built-in resilience

## Implementation Best Practices

1. **Always use HTTPS** for ticket transmission
2. **Configure appropriate expiry** based on use case (30s default)
3. **Implement renewal buffer** (5s before expiry)
4. **Log security events** without exposing tickets
5. **Monitor ticket usage patterns** for anomalies
6. **Implement rate limiting** on ticket generation
7. **Use database transactions** for atomic operations
8. **Clean up expired tickets** regularly

## Conclusion

The SSE ticket authentication system provides a robust, secure mechanism for establishing real-time connections without exposing long-lived credentials. The single-use, short-lived nature of tickets combined with automatic renewal creates a system that is both secure and user-friendly, maintaining persistent connections while minimizing security risks.