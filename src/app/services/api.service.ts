import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, from, Subject, combineLatest } from 'rxjs';
import {
  catchError,
  switchMap,
  map,
  retry,
  tap,
  share,
  take,
  filter,
} from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { LoggerService } from './logger.service';
import { SSETicketService } from './sse-ticket.service';
import { SSEErrorHandlerService } from './sse-error-handler.service';
import { SSEConfigService } from './sse-config.service';
import type {
  Project,
  ProjectListParams,
  ProjectListResponse,
  ProjectSSEEvent,
  SSEConnectionState,
} from '../models/project.model';

// Types are available directly from '../models/project.model'

export interface ClientContext {
  intent?: 'regenerate' | 'new';
  existingProjectId?: string;
}

export interface TextSummariseRequest {
  content: string;
  customPrompt?: string;
  clientContext?: ClientContext;
}

export interface ImageSummariseRequest {
  file: File;
  customPrompt?: string;
  clientContext?: ClientContext;
}

export interface AudioSummariseRequest {
  file: File;
  customPrompt?: string;
  clientContext?: ClientContext;
}

export interface VideoSummariseRequest {
  file: File;
  fps?: number;
  customPrompt?: string;
  startSeconds?: number;
  endSeconds?: number;
  clientContext?: ClientContext;
}

export interface WebpageSummariseRequest {
  url: string;
  customPrompt?: string;
  clientContext?: ClientContext;
}

export interface YouTubeSummariseRequest {
  url: string;
  fps?: number;
  customPrompt?: string;
  startSeconds?: number;
  endSeconds?: number;
  clientContext?: ClientContext;
}

export interface SummariseResponse {
  summary?: string;
  tokensUsed?: number;
  processingTime?: number;
  requestId?: string;
  projectId?: string;
}

export interface RewriteRequest {
  requestId: string;
  customPrompt: string;
}

export interface RewriteResponse {
  summary: string;
  tokensUsed: number;
  processingTime: number;
  requestId: string;
}

export interface TokenCountResponse {
  totalTokens: number;
}

export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  monthlyUsage: number;
  remainingQuota: number;
}

// Legacy type alias for backward compatibility
export type ProjectResponse = Project;

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private baseUrl = environment.apiUrl;
  private sseConnection: EventSource | null = null;
  private sseSubject = new Subject<ProjectSSEEvent>();
  private reconnectAttempts = 0;
  private previousConnectionState: SSEConnectionState | null = null;
  private reconnectTimeoutId: any = null;
  private isDestroyed = false;
  private isConnecting = false; // Connection mutex to prevent concurrent attempts
  private isReconnecting = false;
  private consumedTickets = new Set<string>(); // Track consumed tickets to prevent reuse

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private logger: LoggerService,
    private sseTicketService: SSETicketService,
    private sseErrorHandler: SSEErrorHandlerService,
    private sseConfig: SSEConfigService
  ) {
    // Monitor connection state changes for error handling
    this.sseTicketService.getConnectionState().subscribe((state) => {
      this.sseErrorHandler.handleConnectionStateChange(
        state,
        this.previousConnectionState || undefined
      );
      this.previousConnectionState = state;
    });
  }

  private async getHeaders(): Promise<HttpHeaders> {
    const headers: { [key: string]: string } = {
      'Content-Type': 'application/json',
    };

    // Add Authorization header if user is authenticated
    const token = await this.authService.getIdToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return new HttpHeaders(headers);
  }

  private handleError(error: any): Observable<never> {
    this.logger.error('API Error:', error);
    return throwError(() => error);
  }

  // Health check
  healthCheck(): Observable<any> {
    return this.http
      .get(`${this.baseUrl}/health`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  // Summarise plain text content
  summarise(request: TextSummariseRequest): Observable<SummariseResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        const body: any = { content: request.content };
        if (request.customPrompt) {
          body.fineTuningConfig = { customPrompt: request.customPrompt };
        }
        if (request.clientContext) {
          body.clientContext = request.clientContext;
        }

        return this.http.post<SummariseResponse>(
          `${this.baseUrl}/api/summarise/text`,
          body,
          { headers }
        );
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // Get usage statistics
  getUsageStats(): Observable<UsageStats> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) =>
        this.http.get<UsageStats>(`${this.baseUrl}/api/usage`, { headers })
      ),
      catchError(this.handleError.bind(this))
    );
  }

  // Summarise YouTube video
  summariseYouTube(
    request: YouTubeSummariseRequest
  ): Observable<SummariseResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        const body: any = { url: request.url };

        // Create fineTuningConfig object if any parameters are provided
        if (
          request.customPrompt ||
          request.fps !== undefined ||
          request.startSeconds !== undefined ||
          request.endSeconds !== undefined
        ) {
          body.fineTuningConfig = {};
          if (request.customPrompt)
            body.fineTuningConfig.customPrompt = request.customPrompt;
          if (request.fps !== undefined)
            body.fineTuningConfig.fps = request.fps;
          if (request.startSeconds !== undefined)
            body.fineTuningConfig.startSeconds = request.startSeconds;
          if (request.endSeconds !== undefined)
            body.fineTuningConfig.endSeconds = request.endSeconds;
        }

        // Add clientContext if provided
        if (request.clientContext) {
          body.clientContext = request.clientContext;
        }

        return this.http.post<SummariseResponse>(
          `${this.baseUrl}/api/summarise/youtube`,
          body,
          { headers }
        );
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // Rewrite summary
  rewriteSummary(request: RewriteRequest): Observable<RewriteResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        const body: any = { requestId: request.requestId };
        if (request.customPrompt) {
          body.fineTuningConfig = { customPrompt: request.customPrompt };
        }

        return this.http.post<RewriteResponse>(
          `${this.baseUrl}/api/summarise/rewrite`,
          body,
          { headers }
        );
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // Count YouTube tokens
  countYouTubeTokens(
    request: YouTubeSummariseRequest
  ): Observable<TokenCountResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        const body: any = { url: request.url };

        // Create fineTuningConfig object if any parameters are provided
        if (
          request.customPrompt ||
          request.fps !== undefined ||
          request.startSeconds !== undefined ||
          request.endSeconds !== undefined
        ) {
          body.fineTuningConfig = {};
          if (request.customPrompt)
            body.fineTuningConfig.customPrompt = request.customPrompt;
          if (request.fps !== undefined)
            body.fineTuningConfig.fps = request.fps;
          if (request.startSeconds !== undefined)
            body.fineTuningConfig.startSeconds = request.startSeconds;
          if (request.endSeconds !== undefined)
            body.fineTuningConfig.endSeconds = request.endSeconds;
        }

        return this.http.post<TokenCountResponse>(
          `${this.baseUrl}/api/summarise/youtube/tokens`,
          body,
          { headers }
        );
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // Count Text tokens
  countTextTokens(request: {
    content: string;
    customPrompt?: string;
  }): Observable<TokenCountResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        const body: any = { content: request.content };
        if (request.customPrompt) {
          body.fineTuningConfig = { customPrompt: request.customPrompt };
        }

        return this.http.post<TokenCountResponse>(
          `${this.baseUrl}/api/summarise/text/tokens`,
          body,
          { headers }
        );
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // Summarise text file
  summariseTextFile(
    file: File,
    customPrompt?: string,
    clientContext?: ClientContext
  ): Observable<SummariseResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        const formData = new FormData();
        formData.append('file', file);

        // Create fineTuningConfig object if customPrompt is provided
        if (customPrompt) {
          const fineTuningConfig = { customPrompt };
          formData.append('fineTuningConfig', JSON.stringify(fineTuningConfig));
        }

        // Add clientContext if provided
        if (clientContext) {
          formData.append('clientContext', JSON.stringify(clientContext));
        }

        // Remove Content-Type header to let browser set it with boundary for multipart/form-data
        const formHeaders = new HttpHeaders({
          Authorization: headers.get('Authorization') || '',
        });

        return this.http.post<SummariseResponse>(
          `${this.baseUrl}/api/summarise/text/file`,
          formData,
          { headers: formHeaders }
        );
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // Count tokens for text file
  countTextFileTokens(
    file: File,
    customPrompt?: string
  ): Observable<TokenCountResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        const formData = new FormData();
        formData.append('file', file);

        // Create fineTuningConfig object if customPrompt is provided
        if (customPrompt) {
          const fineTuningConfig = { customPrompt };
          formData.append('fineTuningConfig', JSON.stringify(fineTuningConfig));
        }

        // Remove Content-Type header to let browser set it with boundary for multipart/form-data
        const formHeaders = new HttpHeaders({
          Authorization: headers.get('Authorization') || '',
        });

        return this.http.post<TokenCountResponse>(
          `${this.baseUrl}/api/summarise/text/file/tokens`,
          formData,
          { headers: formHeaders }
        );
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // Image summarization
  summariseImage(
    request: ImageSummariseRequest
  ): Observable<SummariseResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        const formData = new FormData();
        formData.append('file', request.file);

        // Create fineTuningConfig object if customPrompt is provided
        if (request.customPrompt) {
          const fineTuningConfig = { customPrompt: request.customPrompt };
          formData.append('fineTuningConfig', JSON.stringify(fineTuningConfig));
        }

        // Add clientContext if provided
        if (request.clientContext) {
          formData.append(
            'clientContext',
            JSON.stringify(request.clientContext)
          );
        }

        // Remove Content-Type header to let browser set it with boundary for multipart/form-data
        const formHeaders = new HttpHeaders({
          Authorization: headers.get('Authorization') || '',
        });

        return this.http.post<SummariseResponse>(
          `${this.baseUrl}/api/summarise/image`,
          formData,
          { headers: formHeaders }
        );
      }),
      catchError(this.handleError.bind(this))
    );
  }

  countImageTokens(
    request: ImageSummariseRequest
  ): Observable<TokenCountResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        const formData = new FormData();
        formData.append('file', request.file);

        // Create fineTuningConfig object if customPrompt is provided
        if (request.customPrompt) {
          const fineTuningConfig = { customPrompt: request.customPrompt };
          formData.append('fineTuningConfig', JSON.stringify(fineTuningConfig));
        }

        // Remove Content-Type header to let browser set it with boundary for multipart/form-data
        const formHeaders = new HttpHeaders({
          Authorization: headers.get('Authorization') || '',
        });

        return this.http.post<TokenCountResponse>(
          `${this.baseUrl}/api/summarise/image/tokens`,
          formData,
          { headers: formHeaders }
        );
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // Audio summarization
  summariseAudio(
    request: AudioSummariseRequest
  ): Observable<SummariseResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        const formData = new FormData();
        formData.append('file', request.file);

        // Create fineTuningConfig object if customPrompt is provided
        if (request.customPrompt) {
          const fineTuningConfig = { customPrompt: request.customPrompt };
          formData.append('fineTuningConfig', JSON.stringify(fineTuningConfig));
        }

        // Add clientContext if provided
        if (request.clientContext) {
          formData.append(
            'clientContext',
            JSON.stringify(request.clientContext)
          );
        }

        // Remove Content-Type header to let browser set it with boundary for multipart/form-data
        const formHeaders = new HttpHeaders({
          Authorization: headers.get('Authorization') || '',
        });

        return this.http.post<SummariseResponse>(
          `${this.baseUrl}/api/summarise/audio`,
          formData,
          { headers: formHeaders }
        );
      }),
      catchError(this.handleError.bind(this))
    );
  }

  countAudioTokens(
    request: AudioSummariseRequest
  ): Observable<TokenCountResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        const formData = new FormData();
        formData.append('file', request.file);

        // Create fineTuningConfig object if customPrompt is provided
        if (request.customPrompt) {
          const fineTuningConfig = { customPrompt: request.customPrompt };
          formData.append('fineTuningConfig', JSON.stringify(fineTuningConfig));
        }

        // Remove Content-Type header to let browser set it with boundary for multipart/form-data
        const formHeaders = new HttpHeaders({
          Authorization: headers.get('Authorization') || '',
        });

        return this.http.post<TokenCountResponse>(
          `${this.baseUrl}/api/summarise/audio/tokens`,
          formData,
          { headers: formHeaders }
        );
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // Video summarization
  summariseVideo(
    request: VideoSummariseRequest
  ): Observable<SummariseResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        const formData = new FormData();
        formData.append('file', request.file);

        // Create fineTuningConfig object with all video parameters
        const fineTuningConfig: any = {};
        if (request.customPrompt)
          fineTuningConfig.customPrompt = request.customPrompt;
        if (request.fps !== undefined) fineTuningConfig.fps = request.fps;
        if (request.startSeconds !== undefined)
          fineTuningConfig.startSeconds = request.startSeconds;
        if (request.endSeconds !== undefined)
          fineTuningConfig.endSeconds = request.endSeconds;

        if (Object.keys(fineTuningConfig).length > 0) {
          formData.append('fineTuningConfig', JSON.stringify(fineTuningConfig));
        }

        // Add clientContext if provided
        if (request.clientContext) {
          formData.append(
            'clientContext',
            JSON.stringify(request.clientContext)
          );
        }

        // Remove Content-Type header to let browser set it with boundary for multipart/form-data
        const formHeaders = new HttpHeaders({
          Authorization: headers.get('Authorization') || '',
        });

        return this.http.post<SummariseResponse>(
          `${this.baseUrl}/api/summarise/video`,
          formData,
          { headers: formHeaders }
        );
      }),
      catchError(this.handleError.bind(this))
    );
  }

  countVideoTokens(
    request: VideoSummariseRequest
  ): Observable<TokenCountResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        const formData = new FormData();
        formData.append('file', request.file);

        // Create fineTuningConfig object with all video parameters
        const fineTuningConfig: any = {};
        if (request.customPrompt)
          fineTuningConfig.customPrompt = request.customPrompt;
        if (request.fps !== undefined) fineTuningConfig.fps = request.fps;
        if (request.startSeconds !== undefined)
          fineTuningConfig.startSeconds = request.startSeconds;
        if (request.endSeconds !== undefined)
          fineTuningConfig.endSeconds = request.endSeconds;

        if (Object.keys(fineTuningConfig).length > 0) {
          formData.append('fineTuningConfig', JSON.stringify(fineTuningConfig));
        }

        // Remove Content-Type header to let browser set it with boundary for multipart/form-data
        const formHeaders = new HttpHeaders({
          Authorization: headers.get('Authorization') || '',
        });

        return this.http.post<TokenCountResponse>(
          `${this.baseUrl}/api/summarise/video/tokens`,
          formData,
          { headers: formHeaders }
        );
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // Webpage summarization
  summariseWebpage(
    request: WebpageSummariseRequest
  ): Observable<SummariseResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        const body: any = { url: request.url };
        if (request.customPrompt) {
          body.fineTuningConfig = { customPrompt: request.customPrompt };
        }

        // Add clientContext if provided
        if (request.clientContext) {
          body.clientContext = request.clientContext;
        }

        return this.http.post<SummariseResponse>(
          `${this.baseUrl}/api/summarise/webpage`,
          body,
          { headers }
        );
      }),
      catchError(this.handleError.bind(this))
    );
  }

  countWebpageTokens(
    request: WebpageSummariseRequest
  ): Observable<TokenCountResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        const body: any = { url: request.url };
        if (request.customPrompt) {
          body.fineTuningConfig = { customPrompt: request.customPrompt };
        }

        return this.http.post<TokenCountResponse>(
          `${this.baseUrl}/api/summarise/webpage/tokens`,
          body,
          { headers }
        );
      }),
      catchError(this.handleError.bind(this))
    );
  }

  getProject(projectId: string): Observable<ProjectResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) =>
        this.http
          .get<{ success: boolean; data: ProjectResponse }>(
            `${this.baseUrl}/api/projects/${projectId}`,
            { headers }
          )
          .pipe(map((resp) => resp.data))
      ),
      catchError(this.handleError.bind(this))
    );
  }

  // Get projects list with pagination and filters
  getProjects(params?: ProjectListParams): Observable<ProjectListResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        // Build query params
        let queryParams = new URLSearchParams();
        if (params) {
          if (params.page !== undefined)
            queryParams.set('page', params.page.toString());
          if (params.limit !== undefined)
            queryParams.set('limit', params.limit.toString());
          if (params.contentType)
            queryParams.set('contentType', params.contentType);
          if (params.name) queryParams.set('name', params.name);
          if (params.sortBy) queryParams.set('sortBy', params.sortBy);
          if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);
        }

        const url = queryParams.toString()
          ? `${this.baseUrl}/api/projects?${queryParams.toString()}`
          : `${this.baseUrl}/api/projects`;

        return this.http
          .get<{ success: boolean; data: ProjectListResponse }>(url, {
            headers,
          })
          .pipe(map((resp) => resp.data));
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // Delete a project
  deleteProject(projectId: string): Observable<void> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) =>
        this.http.delete<void>(`${this.baseUrl}/api/projects/${projectId}`, {
          headers,
        })
      ),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Subscribe to Server-Sent Events for real-time project updates
   * Returns an Observable that emits project events
   * Handles reconnection logic automatically
   * Uses ticket-based authentication if enabled
   */
  subscribeToProjectsSSE(): Observable<ProjectSSEEvent> {
    if (this.isReconnecting) {
      this.logger.log(
        'SSE reconnection already in progress, skipping subscription'
      );
      return this.sseSubject.asObservable().pipe(share());
    }
    // Reset destroyed flag when subscribing
    this.isDestroyed = false;

    // If already connected or connecting, return the existing subject
    if (this.sseConnection) {
      const state = this.sseConnection.readyState;
      if (state === EventSource.OPEN || state === EventSource.CONNECTING) {
        this.logger.log('Reusing existing SSE connection');
        return this.sseSubject.asObservable().pipe(share());
      }
    }

    // Check if we're already in the process of creating a connection (mutex)
    if (this.isConnecting) {
      this.logger.log(
        'SSE connection already being established (mutex locked)'
      );
      return this.sseSubject.asObservable().pipe(share());
    }

    // Check if ticket service is already requesting a ticket
    const currentState = this.sseTicketService.getCurrentState();
    if (
      currentState.status === 'connecting' ||
      currentState.status === 'requesting_ticket'
    ) {
      this.logger.log('SSE connection already being established');
      return this.sseSubject.asObservable().pipe(share());
    }

    // Create new connection with appropriate authentication method
    this._createSSEConnection();
    return this.sseSubject.asObservable().pipe(share());
  }

  /**
   * Disconnect from SSE
   */
  disconnectSSE(): void {
    this.isDestroyed = true;
    this.isConnecting = false; // Reset connection mutex
    this.isReconnecting = false;

    // Clear any pending reconnection timeout
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    // Clear ticket service state (this also cancels ticket renewal)
    this.sseTicketService.clearTicket();

    // Clear consumed tickets tracking
    this.consumedTickets.clear();

    if (this.sseConnection) {
      this.logger.log('Disconnecting from SSE');
      this.sseConnection.close();
      this.sseConnection = null;
      this.reconnectAttempts = 0;

      // Clear any error notifications related to SSE
      this.sseErrorHandler.clearAllNotifications();
    }
  }

  /**
   * Create SSE connection with authentication (ticket-based or token-based)
   */
  private async _createSSEConnection(): Promise<void> {
    // Don't create connection if service is destroyed
    if (this.isDestroyed) {
      this.logger.log('SSE connection cancelled - service destroyed');
      return;
    }

    // Acquire connection mutex
    if (this.isConnecting) {
      this.logger.log(
        'SSE connection already in progress (mutex locked), skipping duplicate request'
      );
      return;
    }

    // Set mutex lock
    this.isConnecting = true;

    // Check if we're already connecting via ticket service
    const currentState = this.sseTicketService.getCurrentState();
    if (
      currentState.status === 'connecting' ||
      currentState.status === 'requesting_ticket'
    ) {
      this.logger.log(
        'SSE connection already in progress, skipping duplicate request'
      );
      this.isConnecting = false; // Release mutex
      return;
    }

    try {
      // Close existing connection if any
      if (this.sseConnection) {
        this.sseConnection.close();
        this.sseTicketService.setConnection(undefined);
      }

      // Check if ticket-based auth is enabled
      if (this.sseTicketService.isTicketAuthEnabled()) {
        await this._createTicketBasedConnection();
      } else {
        await this._createTokenBasedConnection();
      }
    } catch (error) {
      this.logger.error('Error creating SSE connection:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.sseTicketService.updateConnectionStatus('error', errorMessage);
      this._scheduleReconnect();
    } finally {
      // Always release mutex
      this.isConnecting = false;
    }
  }

  /**
   * Create SSE connection using ticket-based authentication
   */
  private async _createTicketBasedConnection(): Promise<void> {
    this.logger.log('Creating ticket-based SSE connection');

    // Check circuit breaker first
    if (this.sseTicketService.isCircuitBreakerOpen()) {
      const status = this.sseTicketService.getCircuitBreakerStatus();
      this.logger.error(
        'Circuit breaker is open, aborting connection attempt',
        status
      );
      throw new Error(
        `Circuit breaker open after ${status.consecutiveFailures} failures`
      );
    }

    let ticket: string | undefined;

    const currentState = this.sseTicketService.getCurrentState();
    if (
      currentState.ticket &&
      this.sseTicketService.isTicketValid() &&
      !this.consumedTickets.has(currentState.ticket)
    ) {
      ticket = currentState.ticket;
      this.logger.log('Reusing existing valid ticket');
    } else {
      // Request a new ticket
      this.logger.log('Requesting new SSE ticket');

      try {
        const ticketResponse = await this.sseTicketService
          .requestTicket('projects')
          .pipe(take(1))
          .toPromise();
        if (!ticketResponse || !ticketResponse.ticket) {
          throw new Error('Failed to obtain SSE ticket');
        }
        ticket = ticketResponse.ticket;
      } catch (error) {
        this.logger.error('Ticket request failed:', error);
        // Check if it's a rate limit or circuit breaker error
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        if (
          errorMessage.includes('Circuit breaker') ||
          errorMessage.includes('rate limit')
        ) {
          // Don't retry immediately for these errors
          this.isReconnecting = false;
        }
        throw error;
      }
    }

    if (!ticket) {
      throw new Error('No valid ticket available for SSE connection');
    }

    // Mark ticket as consumed immediately before using it
    this.consumedTickets.add(ticket);
    this.sseTicketService.markTicketAsConsumed(ticket);

    const sseUrl = `${
      this.baseUrl
    }/api/sse/projects?ticket=${encodeURIComponent(ticket)}`;
    this.logger.log(
      'Creating ticket-based SSE connection to:',
      sseUrl.replace(ticket, '[TICKET]')
    );

    this.sseConnection = new EventSource(sseUrl);
    this.sseTicketService.setConnection(this.sseConnection);
    this.sseTicketService.updateConnectionStatus('connecting');
    this._setupSSEEventHandlers();

    // Schedule automatic ticket renewal only after successful connection
    // Will be triggered in onopen handler
  }

  /**
   * Create SSE connection using legacy token-based authentication
   */
  private async _createTokenBasedConnection(): Promise<void> {
    this.logger.log('Creating token-based SSE connection (legacy mode)');

    const token = await this.authService.getIdToken();
    if (!token) {
      throw new Error('No authentication token available for SSE connection');
    }

    const sseUrl = `${this.baseUrl}/api/sse/projects?token=${encodeURIComponent(
      token
    )}`;
    this.logger.log(
      'Creating token-based SSE connection to:',
      sseUrl.replace(token, '[TOKEN]')
    );

    this.sseConnection = new EventSource(sseUrl);
    this.sseTicketService.setConnection(this.sseConnection);
    this.sseTicketService.updateConnectionStatus('connecting');
    this._setupSSEEventHandlers();
  }

  /**
   * Set up event handlers for SSE connection
   */
  private _setupSSEEventHandlers(): void {
    if (!this.sseConnection) return;

    this.sseConnection.onopen = () => {
      this.logger.log('SSE connection opened successfully');
      this.reconnectAttempts = 0;
      this.isReconnecting = false;

      // Update connection status
      this.sseTicketService.updateConnectionStatus('connected');
      this.sseTicketService.resetReconnectAttempts();

      // Now schedule ticket renewal since we have a successful connection
      if (this.sseTicketService.isTicketAuthEnabled()) {
        this.logger.log(
          '🎯 Scheduling initial ticket renewal after SSE connection opened'
        );
        this.sseTicketService.scheduleTicketRenewal();
      }
    };

    this.sseConnection.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.logger.log('SSE event received:', data);
        this.sseSubject.next(data);
      } catch (error) {
        this.logger.error('Error parsing SSE event data:', error);
      }
    };

    this.sseConnection.onerror = (event) => {
      this.logger.error('SSE connection error:', event);

      // Immediately close the connection to prevent browser auto-retry
      if (this.sseConnection) {
        this.logger.log('Closing SSE connection to prevent browser auto-retry');
        this.sseConnection.close();

        // Don't immediately clear the ticket - it might be recoverable
        const state = this.sseTicketService.getCurrentState();
        if (state.ticket) {
          this.logger.log(
            'Connection error with ticket:',
            state.ticket.substring(0, 8) + '...'
          );
          // Only clear if it's been consumed (prevents reuse)
          if (this.consumedTickets.has(state.ticket)) {
            this.logger.log('Clearing consumed ticket after error');
            this.sseTicketService.clearTicket({
              reason: 'Connection error with consumed ticket',
              preserveReconnectAttempts: true,
            });
          }
        }
      }

      // Update connection status
      this.sseTicketService.updateConnectionStatus(
        'error',
        'SSE connection error'
      );

      // Schedule our own controlled reconnection
      if (!this.isDestroyed && !this.isReconnecting) {
        this._scheduleReconnect();
      }
    };

    // Handle specific event types if the server sends them
    // Back-compat: listen to legacy "project_*" events if present
    this.sseConnection.addEventListener('project_status_update', (event) => {
      this._handleSSEEvent('project_status_update', event as MessageEvent);
    });

    this.sseConnection.addEventListener('project_progress_update', (event) => {
      this._handleSSEEvent('project_progress_update', event as MessageEvent);
    });

    this.sseConnection.addEventListener('project_completed', (event) => {
      this._handleSSEEvent('project_completed', event as MessageEvent);
    });

    this.sseConnection.addEventListener('project_failed', (event) => {
      this._handleSSEEvent('project_failed', event as MessageEvent);
    });

    // Primary: listen to backend core event names
    this.sseConnection.addEventListener('status_update', (event) => {
      this._handleSSEEvent('status_update', event as MessageEvent);
    });

    this.sseConnection.addEventListener('progress_update', (event) => {
      this._handleSSEEvent('progress_update', event as MessageEvent);
    });

    this.sseConnection.addEventListener('completion', (event) => {
      this._handleSSEEvent('completion', event as MessageEvent);
    });

    this.sseConnection.addEventListener('error', (event) => {
      this._handleSSEEvent('error', event as MessageEvent);
    });
  }

  /**
   * Handle specific SSE event types
   */
  private _handleSSEEvent(type: string, event: MessageEvent): void {
    try {
      const raw = JSON.parse(event.data);

      // Normalize event type names from backend (status_update/progress_update/completion/error)
      const normalizedType =
        type === 'status_update' || type === 'project_status_update'
          ? 'project_status_update'
          : type === 'progress_update' || type === 'project_progress_update'
          ? 'project_progress_update'
          : type === 'completion' || type === 'project_completed'
          ? 'project_completed'
          : type === 'error' || type === 'project_failed'
          ? 'project_failed'
          : (type as any);

      // Extract projectId from the various shapes used by the backend
      const projectId: string | undefined =
        raw.projectId || raw.metadata?.projectId || raw.result?.projectId;

      // Normalize payload so components can rely on consistent fields
      const normalizedData: any = { ...raw };
      if (normalizedType === 'project_progress_update') {
        // Backend sends `percentage`; UI expects `progress`
        if (
          normalizedData.progress === undefined &&
          normalizedData.percentage !== undefined
        ) {
          normalizedData.progress = normalizedData.percentage;
        }
      } else if (normalizedType === 'project_completed') {
        normalizedData.status = 'completed';
        if (normalizedData.progress === undefined)
          normalizedData.progress = 100;
      } else if (normalizedType === 'project_failed') {
        normalizedData.status = 'failed';
      }

      const sseEvent: ProjectSSEEvent = {
        type: normalizedType as any,
        projectId: projectId as any,
        timestamp: new Date().toISOString(),
        data: normalizedData,
      };

      this.logger.log(`SSE ${normalizedType} event:`, sseEvent);
      this.sseSubject.next(sseEvent);
    } catch (error) {
      this.logger.error(`Error parsing SSE ${type} event:`, error);
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private _scheduleReconnect(): void {
    // Don't schedule reconnection if service is destroyed
    if (this.isDestroyed) {
      this.logger.log('SSE reconnection cancelled - service destroyed');
      return;
    }

    // Check if circuit breaker is open
    if (this.sseTicketService.isCircuitBreakerOpen()) {
      const status = this.sseTicketService.getCircuitBreakerStatus();
      this.logger.error(
        'SSE reconnection cancelled - circuit breaker open',
        status
      );
      this.sseTicketService.updateConnectionStatus(
        'error',
        `Circuit breaker open (${status.consecutiveFailures} failures)`
      );
      this.isConnecting = false;
      this.isReconnecting = false;
      // Schedule a delayed retry after circuit breaker cooldown
      const cooldownDelay = 30000; // 30 seconds cooldown for circuit breaker
      this.logger.log(
        `Will attempt to reset circuit breaker in ${cooldownDelay}ms`
      );
      setTimeout(() => {
        if (!this.isDestroyed) {
          this.logger.log('Attempting to reset circuit breaker after cooldown');
          this.sseTicketService.resetCircuitBreaker();
          this._createSSEConnection();
        }
      }, cooldownDelay);
      return;
    }

    this.isReconnecting = true;
    // Clear any existing reconnection timeout
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    const newAttempts = this.sseTicketService.incrementReconnectAttempts();

    if (newAttempts >= this.sseConfig.maxReconnectAttempts) {
      this.logger.error('Max SSE reconnection attempts reached');
      this.sseTicketService.updateConnectionStatus(
        'error',
        'Max reconnection attempts reached'
      );
      this.isConnecting = false; // Release mutex on max attempts
      this.isReconnecting = false;
      return;
    }

    // Use exponential backoff with jitter to prevent thundering herd
    const baseDelay = this.sseConfig.calculateReconnectDelay(newAttempts);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    const delay = baseDelay + jitter;

    this.logger.log(
      `Scheduling SSE reconnection in ${Math.round(
        delay
      )}ms (attempt ${newAttempts})`
    );

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      // Check again if not destroyed before reconnecting
      if (!this.isDestroyed) {
        this._createSSEConnection();
      }
    }, delay);
  }

  /**
   * Get SSE connection state for monitoring
   */
  getSSEConnectionState(): Observable<SSEConnectionState> {
    return this.sseTicketService.getConnectionState();
  }

  /**
   * Get SSE error notifications for UI display
   */
  getSSENotifications() {
    return this.sseErrorHandler.getNotifications();
  }

  /**
   * Dismiss an SSE error notification
   */
  dismissSSENotification(id: string): void {
    this.sseErrorHandler.dismissNotification(id);
  }

  /**
   * Force refresh of SSE connection (useful for manual retry)
   */
  refreshSSEConnection(): void {
    this.logger.log('Manually refreshing SSE connection');
    this.disconnectSSE();
    // Reset destroyed flag to allow reconnection
    this.isDestroyed = false;
    // Clear consumed tickets to allow retry
    this.consumedTickets.clear();
    // Reset circuit breaker if needed
    this.sseTicketService.resetCircuitBreaker();
    // Reset reconnection attempts
    this.sseTicketService.resetReconnectAttempts();
    // Small delay to ensure clean state
    setTimeout(() => {
      this._createSSEConnection();
    }, 100);
  }

  /**
   * Get SSE debug information for troubleshooting
   */
  getSSEDebugInfo(): any {
    return {
      apiService: {
        hasConnection: !!this.sseConnection,
        isConnecting: this.isConnecting,
        isReconnecting: this.isReconnecting,
        isDestroyed: this.isDestroyed,
        reconnectAttempts: this.reconnectAttempts,
        consumedTickets: Array.from(this.consumedTickets).map(
          (t) => t.substring(0, 8) + '...'
        ),
        hasReconnectTimeout: !!this.reconnectTimeoutId,
      },
      ticketService: this.sseTicketService.getDebugInfo(),
      errorStats: this.sseErrorHandler.getErrorStats(),
      timestamp: new Date().toISOString(),
    };
  }
}
