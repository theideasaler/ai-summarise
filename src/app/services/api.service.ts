import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, from } from 'rxjs';
import { catchError, switchMap, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { LoggerService } from './logger.service';

export interface TextSummariseRequest {
  content: string;
  customPrompt?: string;
}

export interface ImageSummariseRequest {
  file: File;
  customPrompt?: string;
}

export interface AudioSummariseRequest {
  file: File;
  customPrompt?: string;
}

export interface VideoSummariseRequest {
  file: File;
  fps?: number;
  customPrompt?: string;
  startSeconds?: number;
  endSeconds?: number;
}

export interface WebpageSummariseRequest {
  url: string;
  customPrompt?: string;
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

export interface ProjectResponse {
  id: string;
  name: string;
  contentType: 'youtube' | 'text' | 'image' | 'audio' | 'video' | 'webpage';
  createdAt: string;
  updatedAt: string;
  summaryData?: {
    requestId: string;
    content: string;
    status: 'completed' | 'processing' | 'failed';
    createdAt: string;
  };
  rewriteData?: {
    requestId: string;
    content: string;
    status: 'completed' | 'processing' | 'failed';
    createdAt: string;
  };
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient, private authService: AuthService, private logger: LoggerService) {}

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
        if (request.customPrompt || request.fps !== undefined || request.startSeconds !== undefined || request.endSeconds !== undefined) {
          body.fineTuningConfig = {};
          if (request.customPrompt) body.fineTuningConfig.customPrompt = request.customPrompt;
          if (request.fps !== undefined) body.fineTuningConfig.fps = request.fps;
          if (request.startSeconds !== undefined) body.fineTuningConfig.startSeconds = request.startSeconds;
          if (request.endSeconds !== undefined) body.fineTuningConfig.endSeconds = request.endSeconds;
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
        if (request.customPrompt || request.fps !== undefined || request.startSeconds !== undefined || request.endSeconds !== undefined) {
          body.fineTuningConfig = {};
          if (request.customPrompt) body.fineTuningConfig.customPrompt = request.customPrompt;
          if (request.fps !== undefined) body.fineTuningConfig.fps = request.fps;
          if (request.startSeconds !== undefined) body.fineTuningConfig.startSeconds = request.startSeconds;
          if (request.endSeconds !== undefined) body.fineTuningConfig.endSeconds = request.endSeconds;
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
  countTextTokens(request: { content: string; customPrompt?: string }): Observable<TokenCountResponse> {
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
  summariseTextFile(file: File, customPrompt?: string): Observable<SummariseResponse> {
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
          'Authorization': headers.get('Authorization') || ''
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
  countTextFileTokens(file: File, customPrompt?: string): Observable<TokenCountResponse> {
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
          'Authorization': headers.get('Authorization') || ''
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
  summariseImage(request: ImageSummariseRequest): Observable<SummariseResponse> {
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
          'Authorization': headers.get('Authorization') || ''
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

  countImageTokens(request: ImageSummariseRequest): Observable<TokenCountResponse> {
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
          'Authorization': headers.get('Authorization') || ''
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
  summariseAudio(request: AudioSummariseRequest): Observable<SummariseResponse> {
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
          'Authorization': headers.get('Authorization') || ''
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

  countAudioTokens(request: AudioSummariseRequest): Observable<TokenCountResponse> {
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
          'Authorization': headers.get('Authorization') || ''
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
  summariseVideo(request: VideoSummariseRequest): Observable<SummariseResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        const formData = new FormData();
        formData.append('file', request.file);
        
        // Create fineTuningConfig object with all video parameters
        const fineTuningConfig: any = {};
        if (request.customPrompt) fineTuningConfig.customPrompt = request.customPrompt;
        if (request.fps !== undefined) fineTuningConfig.fps = request.fps;
        if (request.startSeconds !== undefined) fineTuningConfig.startSeconds = request.startSeconds;
        if (request.endSeconds !== undefined) fineTuningConfig.endSeconds = request.endSeconds;
        
        if (Object.keys(fineTuningConfig).length > 0) {
          formData.append('fineTuningConfig', JSON.stringify(fineTuningConfig));
        }
        
        // Remove Content-Type header to let browser set it with boundary for multipart/form-data
        const formHeaders = new HttpHeaders({
          'Authorization': headers.get('Authorization') || ''
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

  countVideoTokens(request: VideoSummariseRequest): Observable<TokenCountResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        const formData = new FormData();
        formData.append('file', request.file);
        
        // Create fineTuningConfig object with all video parameters
        const fineTuningConfig: any = {};
        if (request.customPrompt) fineTuningConfig.customPrompt = request.customPrompt;
        if (request.fps !== undefined) fineTuningConfig.fps = request.fps;
        if (request.startSeconds !== undefined) fineTuningConfig.startSeconds = request.startSeconds;
        if (request.endSeconds !== undefined) fineTuningConfig.endSeconds = request.endSeconds;
        
        if (Object.keys(fineTuningConfig).length > 0) {
          formData.append('fineTuningConfig', JSON.stringify(fineTuningConfig));
        }
        
        // Remove Content-Type header to let browser set it with boundary for multipart/form-data
        const formHeaders = new HttpHeaders({
          'Authorization': headers.get('Authorization') || ''
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
  summariseWebpage(request: WebpageSummariseRequest): Observable<SummariseResponse> {
    return from(this.getHeaders()).pipe(
      switchMap((headers) => {
        const body: any = { url: request.url };
        if (request.customPrompt) {
          body.fineTuningConfig = { customPrompt: request.customPrompt };
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

  countWebpageTokens(request: WebpageSummariseRequest): Observable<TokenCountResponse> {
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
}
