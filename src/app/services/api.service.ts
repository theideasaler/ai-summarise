import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface SummarizeRequest {
  content: string;
  contentType: 'text' | 'url' | 'youtube' | 'document';
  style?: 'concise' | 'detailed' | 'bullet-points';
  model?: 'gemini-pro' | 'gemini-pro-vision';
}

export interface SummarizeResponse {
  id: string;
  summary: string;
  tokensUsed: number;
  processingTime: number;
  status: 'completed' | 'failed';
}

export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  monthlyUsage: number;
  remainingQuota: number;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json'
    });
  }

  private handleError(error: any): Observable<never> {
    console.error('API Error:', error);
    return throwError(() => error);
  }

  // Health check
  healthCheck(): Observable<any> {
    return this.http.get(`${this.baseUrl}/health`)
      .pipe(catchError(this.handleError));
  }

  // Summarize content
  summarize(request: SummarizeRequest): Observable<SummarizeResponse> {
    return this.http.post<SummarizeResponse>(
      `${this.baseUrl}/api/summarize`,
      request,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  // Get summarization by ID
  getSummarization(id: string): Observable<SummarizeResponse> {
    return this.http.get<SummarizeResponse>(
      `${this.baseUrl}/api/summarize/${id}`,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  // Get usage statistics
  getUsageStats(): Observable<UsageStats> {
    return this.http.get<UsageStats>(
      `${this.baseUrl}/api/usage`,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  // Record usage (for internal tracking)
  recordUsage(operation: string, tokensUsed: number, contentType: string): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/api/usage`,
      { operation, tokensUsed, contentType },
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }
}