import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, from } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface SummariseRequest {
  content: string;
  contentType: 'text' | 'url' | 'youtube' | 'document';
  style?: 'concise' | 'detailed' | 'bullet-points';
  model?: 'gemini-pro' | 'gemini-pro-vision';
}

export interface YouTubeSummariseRequest {
  url: string;
  fps?: number;
  customPrompt?: string;
  startSeconds?: number;
  endSeconds?: number;
}

export interface SummariseResponse {
  summary?: string;
  tokensUsed?: number;
  processingTime?: number;
  requestId?: string;
}

export interface RewriteRequest {
  requestId: string;
  prompt: string;
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

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient, private authService: AuthService) {}

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
    console.error('API Error:', error);
    return throwError(() => error);
  }

  // Health check
  healthCheck(): Observable<any> {
    return this.http
      .get(`${this.baseUrl}/health`)
      .pipe(catchError(this.handleError));
  }

  // Summarise content
  summarise(request: SummariseRequest): Observable<SummariseResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) =>
        this.http.post<SummariseResponse>(
          `${this.baseUrl}/api/summarise`,
          request,
          { headers }
        )
      ),
      catchError(this.handleError)
    );
  }

  // Get summarisation by ID
  getSummarisation(id: string): Observable<SummariseResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) =>
        this.http.get<SummariseResponse>(
          `${this.baseUrl}/api/summarise/${id}`,
          { headers }
        )
      ),
      catchError(this.handleError)
    );
  }

  // Get usage statistics
  getUsageStats(): Observable<UsageStats> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) =>
        this.http.get<UsageStats>(`${this.baseUrl}/api/usage`, { headers })
      ),
      catchError(this.handleError)
    );
  }

  // Summarise YouTube video
  summariseYouTube(
    request: YouTubeSummariseRequest
  ): Observable<SummariseResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) =>
        this.http.post<SummariseResponse>(
          `${this.baseUrl}/api/summarise/youtube`,
          request,
          { headers }
        )
      ),
      catchError(this.handleError)
    );
  }

  // Rewrite summary
  rewriteSummary(request: RewriteRequest): Observable<RewriteResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) =>
        this.http.post<RewriteResponse>(
          `${this.baseUrl}/api/summarise/rewrite`,
          request,
          { headers }
        )
      ),
      catchError(this.handleError)
    );
  }

  // Count YouTube tokens
  countYouTubeTokens(
    request: YouTubeSummariseRequest
  ): Observable<TokenCountResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) =>
        this.http.post<TokenCountResponse>(
          `${this.baseUrl}/api/summarise/youtube/tokens`,
          request,
          { headers }
        )
      ),
      catchError(this.handleError)
    );
  }

  // Record usage (for internal tracking)
  recordUsage(
    operation: string,
    tokensUsed: number,
    contentType: string
  ): Observable<any> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) =>
        this.http.post(
          `${this.baseUrl}/api/usage`,
          { operation, tokensUsed, contentType },
          { headers }
        )
      ),
      catchError(this.handleError)
    );
  }
}