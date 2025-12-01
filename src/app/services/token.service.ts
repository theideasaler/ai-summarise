import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { LoggerService } from './logger.service';
import { StripeService } from './stripe.service';

export interface TokenInfo {
  monthlyLimit: number;
  tokensUsed: number;
  tokensReserved: number;
  remainingTokens: number;
  subscriptionTier: 'free' | 'pro';
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
  private _isInitialized = false;
  private _initializationPromise: Promise<void> | null = null;
  private _lastFetchTime = 0;
  private _currentFetchPromise: Promise<TokenInfo | null> | null = null;

  // Public observables
  tokenInfo$ = this._tokenInfo.asObservable();
  isLoading = this._isLoading.asReadonly();
  error = this._error.asReadonly();

  // Computed signals for easy access
  remainingTokens = signal<number | null>(null);
  subscriptionTier = signal<'free' | 'pro'>('free');

  private lastKnownTier: 'free' | 'pro' | null = null;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private logger: LoggerService,
    private stripeService: StripeService
  ) {
    // Subscribe to token info changes and update signals
    this.tokenInfo$.subscribe((tokenInfo) => {
      if (tokenInfo) {
        this.remainingTokens.set(tokenInfo.remainingTokens);
        this.subscriptionTier.set(tokenInfo.subscriptionTier);
        this.lastKnownTier = tokenInfo.subscriptionTier;
      }
    });

    this.stripeService.subscriptionStatus$.subscribe((status) => {
      if (!status) {
        return;
      }

      if (!this.lastKnownTier) {
        this.lastKnownTier = status.tier;
        return;
      }

      if (status.tier !== this.lastKnownTier) {
        this.lastKnownTier = status.tier;
        this.logger.log('TokenService: detected subscription tier change to', status.tier);
        void this.fetchTokenInfo();
      }
    });
  }

  /**
   * Fetch current token information from the backend
   * Includes debouncing to prevent duplicate rapid calls
   */
  async fetchTokenInfo(): Promise<TokenInfo | null> {
    const now = Date.now();
    const DEBOUNCE_TIME = 2000; // 2 seconds debounce

    // Return existing promise if a fetch is already in progress
    if (this._currentFetchPromise) {
      this.logger.log('TokenService: Returning existing fetch promise');
      return this._currentFetchPromise;
    }

    // If called within debounce time, return cached data
    if (now - this._lastFetchTime < DEBOUNCE_TIME) {
      this.logger.log(
        'TokenService: Fetch called too soon, returning cached data'
      );
      return this._tokenInfo.value;
    }

    // Perform actual fetch
    this._currentFetchPromise = this._performTokenFetch();

    try {
      const result = await this._currentFetchPromise;
      this._lastFetchTime = now;
      return result;
    } finally {
      this._currentFetchPromise = null;
    }
  }

  /**
   * Internal method to perform the actual token fetch
   */
  private async _performTokenFetch(): Promise<TokenInfo | null> {
    try {
      this._isLoading.set(true);
      this._error.set(null);

      const idToken = await this.authService.getIdToken();
      if (!idToken) {
        throw new Error('No authentication token available');
      }

      const headers = {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      };

      const response = await firstValueFrom(
        this.http.get<{ success: boolean; data: TokenInfo }>(
          `${this.baseUrl}/api/tokens/remaining`,
          { headers }
        )
      );

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
  updateTokensAfterConsumption(
    tokensUsed: number,
    remainingTokens?: number
  ): void {
    const currentInfo = this._tokenInfo.value;
    if (currentInfo) {
      const updatedInfo: TokenInfo = {
        ...currentInfo,
        remainingTokens:
          remainingTokens ??
          Math.max(0, currentInfo.remainingTokens - tokensUsed),
        tokensUsed: currentInfo.tokensUsed + tokensUsed,
      };

      this._tokenInfo.next(updatedInfo);
      this.logger.log(
        `Tokens updated: -${tokensUsed}, remaining: ${updatedInfo.remainingTokens}`
      );
    } else {
      // If no current info, fetch fresh data
      void this.fetchTokenInfo();
    }
  }

  clear(): void {
    this._tokenInfo.next(null);
    this.remainingTokens.set(null);
    this.subscriptionTier.set('free');
    this.lastKnownTier = null;
    this._isInitialized = false;
    this._initializationPromise = null;
    this._lastFetchTime = 0;
    this._currentFetchPromise = null;
    this._error.set(null);
    this._isLoading.set(false);
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
   * Prevents duplicate initialization calls
   */
  async initialize(): Promise<void> {
    // Return existing initialization promise if already initializing
    if (this._initializationPromise) {
      return this._initializationPromise;
    }

    // Return immediately if already initialized
    if (this._isInitialized) {
      return;
    }

    // Create and store the initialization promise
    this._initializationPromise = this._performInitialization();

    try {
      await this._initializationPromise;
    } finally {
      // Clear the promise after completion (success or failure)
      this._initializationPromise = null;
    }
  }

  /**
   * Internal method to perform the actual initialization
   */
  private async _performInitialization(): Promise<void> {
    if (this.authService.isAuthenticated()) {
      await this.fetchTokenInfo();
      this._isInitialized = true;
      this.logger.log('TokenService initialized successfully');
    }
  }
}
