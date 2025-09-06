import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { LoggerService } from './logger.service';

export interface TokenInfo {
  monthlyLimit: number;
  tokensUsed: number;
  tokensReserved: number;
  remainingTokens: number;
  subscriptionTier: 'free' | 'pro' | 'premium';
  monthYear: string;
  nextResetDate: string;
}

export interface TokenUsageResponse {
  tokensUsed: number;
  remainingTokens: number;
}

@Injectable({
  providedIn: 'root',
})
export class TokenService {
  private readonly baseUrl = environment.apiUrl;
  private _tokenInfo = new BehaviorSubject<TokenInfo | null>(null);
  private _isLoading = signal<boolean>(false);
  private _error = signal<string | null>(null);

  // Public observables
  tokenInfo$ = this._tokenInfo.asObservable();
  isLoading = this._isLoading.asReadonly();
  error = this._error.asReadonly();

  // Computed signals for easy access
  remainingTokens = signal<number>(0);
  subscriptionTier = signal<'free' | 'pro' | 'premium'>('free');

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private logger: LoggerService
  ) {
    // Subscribe to token info changes and update signals
    this.tokenInfo$.subscribe(tokenInfo => {
      if (tokenInfo) {
        this.remainingTokens.set(tokenInfo.remainingTokens);
        this.subscriptionTier.set(tokenInfo.subscriptionTier);
      }
    });
  }

  /**
   * Fetch current token information from the backend
   */
  async fetchTokenInfo(): Promise<TokenInfo | null> {
    try {
      this._isLoading.set(true);
      this._error.set(null);

      const idToken = await this.authService.getIdToken();
      if (!idToken) {
        throw new Error('No authentication token available');
      }

      const headers = {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      };

      const response = await this.http.get<{success: boolean, data: TokenInfo}>(
        `${this.baseUrl}/api/tokens/remaining`,
        { headers }
      ).toPromise();

      if (response && response.success && response.data) {
        this._tokenInfo.next(response.data);
        this.logger.log('Token info fetched successfully:', response.data);
        return response.data;
      }

      return null;
    } catch (error) {
      this.logger.error('Error fetching token info:', error);
      this._error.set('Failed to fetch token information');
      return null;
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Update token count after consumption (called after successful API responses)
   */
  updateTokensAfterConsumption(tokensUsed: number, remainingTokens?: number): void {
    const currentInfo = this._tokenInfo.value;
    if (currentInfo) {
      const updatedInfo: TokenInfo = {
        ...currentInfo,
        remainingTokens: remainingTokens ?? Math.max(0, currentInfo.remainingTokens - tokensUsed),
        tokensUsed: currentInfo.tokensUsed + tokensUsed
      };
      
      this._tokenInfo.next(updatedInfo);
      this.logger.log(`Tokens updated: -${tokensUsed}, remaining: ${updatedInfo.remainingTokens}`);
    } else {
      // If no current info, fetch fresh data
      this.fetchTokenInfo();
    }
  }

  /**
   * Get current token info synchronously
   */
  getCurrentTokenInfo(): TokenInfo | null {
    return this._tokenInfo.value;
  }

  /**
   * Check if user has sufficient tokens for an operation
   */
  hasSufficientTokens(requiredTokens: number): boolean {
    const currentInfo = this._tokenInfo.value;
    return currentInfo ? currentInfo.remainingTokens >= requiredTokens : false;
  }

  /**
   * Initialize token service (call this when user logs in)
   */
  async initialize(): Promise<void> {
    if (this.authService.isAuthenticated()) {
      await this.fetchTokenInfo();
    }
  }

  /**
   * Clear token data (call this when user logs out)
   */
  clear(): void {
    this._tokenInfo.next(null);
    this.remainingTokens.set(0);
    this.subscriptionTier.set('free');
    this._error.set(null);
  }
}