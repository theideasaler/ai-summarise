import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, from, throwError, of, firstValueFrom } from 'rxjs';
import { catchError, map, switchMap, tap, retry } from 'rxjs/operators';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { environment } from '../../environments/environment';
import { LoggerService } from './logger.service';
import { AuthService } from './auth.service';
import {
  CheckoutSessionRequest,
  CheckoutSessionResponse,
  PortalSessionResponse,
  SubscriptionStatusResponse,
  CancelSubscriptionResponse,
  SubscriptionStatus,
  StripeError,
  StripeConfig,
} from '../models/subscription.model';

@Injectable({
  providedIn: 'root',
})
export class StripeService {
  private stripe: Stripe | null = null;
  private stripePromise: Promise<Stripe | null> | null = null;
  private stripeConfig: StripeConfig | null = null;
  private subscriptionStatusSubject = new BehaviorSubject<SubscriptionStatus | null>(null);
  public subscriptionStatus$ = this.subscriptionStatusSubject.asObservable();

  // Track initialization state
  private initializationPromise: Promise<void> | null = null;
  private isInitialized = false;
  private initializationError: Error | null = null;

  constructor(
    private http: HttpClient,
    private logger: LoggerService,
    private authService: AuthService
  ) {
    // Don't initialize in constructor - use lazy initialization
  }

  /**
   * Ensure Stripe is initialized before use
   */
  private async _ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationError) {
      throw this.initializationError;
    }

    if (!this.initializationPromise) {
      this.initializationPromise = this._initializeStripe();
    }

    try {
      await this.initializationPromise;
    } catch (error) {
      throw error;
    }
  }

  private async _initializeStripe(): Promise<void> {
    try {
      this.logger.log('Starting Stripe initialization...');

      // Fetch configuration
      const config = await this._fetchStripeConfig();

      if (!config) {
        throw new Error('Failed to fetch Stripe configuration');
      }

      if (!config.publishableKey) {
        throw new Error('Stripe publishable key is missing from configuration');
      }

      // Validate key format
      if (typeof config.publishableKey !== 'string' || config.publishableKey.length === 0) {
        throw new Error(`Invalid Stripe publishable key format: ${typeof config.publishableKey}`);
      }

      this.stripeConfig = config;
      this.logger.log('Stripe config loaded successfully');

      // Initialize Stripe SDK
      this.logger.log('Initializing Stripe SDK...');
      this.stripePromise = loadStripe(config.publishableKey);
      this.stripe = await this.stripePromise;

      if (!this.stripe) {
        throw new Error('Stripe SDK failed to initialize - loadStripe returned null');
      }

      this.isInitialized = true;
      this.logger.log('Stripe initialized successfully');

    } catch (error: any) {
      this.logger.error('Stripe initialization failed:', error);
      this.initializationError = error;
      this.initializationPromise = null; // Allow retry
      throw error;
    }
  }

  /**
   * Fetch Stripe configuration from backend
   */
  private async _fetchStripeConfig(): Promise<StripeConfig> {
    try {
      this.logger.log('Fetching Stripe configuration from backend...');

      // Use firstValueFrom instead of deprecated toPromise()
      const response = await firstValueFrom(
        this.http
          .get<StripeConfig>(`${environment.apiUrl}/api/stripe/config`)
          .pipe(
            retry(2),
            catchError((error) => {
              this.logger.error('HTTP error fetching Stripe config:', error);
              return throwError(() => new Error(`Failed to fetch Stripe config: ${error.message || error}`));
            })
          )
      );

      if (!response) {
        throw new Error('Empty response from Stripe configuration endpoint');
      }

      // Validate the response structure
      if (typeof response !== 'object') {
        throw new Error(`Invalid response type from config endpoint: ${typeof response}`);
      }

      this.logger.log('Stripe configuration fetched successfully');
      return response;

    } catch (error: any) {
      this.logger.error('Failed to fetch Stripe configuration:', error);
      throw new Error(`Stripe configuration fetch failed: ${error.message || error}`);
    }
  }

  /**
   * Get Stripe configuration (price IDs)
   */
  async getStripeConfig(): Promise<StripeConfig> {
    await this._ensureInitialized();

    if (!this.stripeConfig) {
      throw new Error('Stripe configuration not available');
    }

    return this.stripeConfig;
  }

  /**
   * Get authorization headers for API calls
   */
  private async _getAuthHeaders(): Promise<HttpHeaders> {
    const token = await this.authService.getIdToken();
    if (!token) {
      throw new Error('No authentication token available');
    }
    return new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    });
  }

  /**
   * Create a checkout session for subscription
   */
  async createCheckoutSession(
    tier: 'pro',
    successUrl?: string,
    cancelUrl?: string
  ): Promise<CheckoutSessionResponse> {
    try {
      const headers = await this._getAuthHeaders();
      const baseUrl = window.location.origin;

      const request: CheckoutSessionRequest = {
        tier,
        success_url: successUrl || `${baseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${baseUrl}/plans`,
      };

      const response = await firstValueFrom(
        this.http
          .post<CheckoutSessionResponse>(
            `${environment.apiUrl}/api/stripe/create-checkout-session`,
            request,
            { headers }
          )
          .pipe(
            retry(2),
            catchError(this._handleError.bind(this))
          )
      );

      if (!response) {
        throw new Error('No response from checkout session creation');
      }

      return response;
    } catch (error) {
      this.logger.error('Failed to create checkout session:', error);
      throw error;
    }
  }

  /**
   * Redirect to Stripe Checkout
   */
  async redirectToCheckout(sessionId: string): Promise<void> {
    try {
      // Ensure Stripe is initialized before attempting redirect
      await this._ensureInitialized();

      if (!this.stripe) {
        throw new Error('Stripe is not available after initialization');
      }

      this.logger.log('Redirecting to Stripe checkout with session:', sessionId);

      const { error } = await this.stripe.redirectToCheckout({ sessionId });

      if (error) {
        this.logger.error('Stripe redirect error:', error);
        throw new Error(`Stripe checkout redirect failed: ${error.message}`);
      }
    } catch (error: any) {
      this.logger.error('Failed to redirect to checkout:', error);

      // Provide user-friendly error message
      if (error.message?.includes('initialization')) {
        throw new Error('Payment system is still loading. Please try again in a moment.');
      }

      throw error;
    }
  }

  /**
   * Create checkout session and redirect
   */
  async createCheckoutAndRedirect(
    tier: 'pro',
    successUrl?: string,
    cancelUrl?: string
  ): Promise<void> {
    try {
      const session = await this.createCheckoutSession(tier, successUrl, cancelUrl);
      await this.redirectToCheckout(session.session_id);
    } catch (error) {
      this.logger.error('Failed to create checkout and redirect:', error);
      throw error;
    }
  }

  /**
   * Get current subscription status
   */
  async getSubscriptionStatus(): Promise<SubscriptionStatusResponse> {
    try {
      const headers = await this._getAuthHeaders();

      const response = await firstValueFrom(
        this.http
          .get<SubscriptionStatusResponse>(
            `${environment.apiUrl}/api/stripe/subscription-status`,
            { headers }
          )
          .pipe(
            retry(2),
            tap((status) => {
              // Update the subscription status subject
              this.subscriptionStatusSubject.next({
                tier: status.subscription_tier,
                status: status.subscription_status,
                currentPeriodEnd: status.subscription_details?.current_period_end,
                cancelAtPeriodEnd: status.subscription_details?.cancel_at_period_end,
                stripeCustomerId: status.stripe_customer_id,
                stripeSubscriptionId: status.stripe_subscription_id,
              });
            }),
            catchError(this._handleError.bind(this))
          )
      );

      if (!response) {
        throw new Error('No response from subscription status check');
      }

      return response;
    } catch (error) {
      this.logger.error('Failed to get subscription status:', error);
      throw error;
    }
  }

  /**
   * Create a billing portal session
   */
  async createPortalSession(returnUrl?: string): Promise<string> {
    try {
      const headers = await this._getAuthHeaders();
      const baseUrl = window.location.origin;

      const response = await firstValueFrom(
        this.http
          .post<PortalSessionResponse>(
            `${environment.apiUrl}/api/stripe/create-portal-session`,
            { return_url: returnUrl || `${baseUrl}/account` },
            { headers }
          )
          .pipe(
            retry(2),
            catchError(this._handleError.bind(this))
          )
      );

      if (!response || !response.portal_url) {
        throw new Error('No portal URL returned');
      }

      return response.portal_url;
    } catch (error) {
      this.logger.error('Failed to create portal session:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(): Promise<CancelSubscriptionResponse> {
    try {
      const headers = await this._getAuthHeaders();

      const response = await firstValueFrom(
        this.http
          .post<CancelSubscriptionResponse>(
            `${environment.apiUrl}/api/stripe/cancel-subscription`,
            {},
            { headers }
          )
          .pipe(
            retry(2),
            tap(() => {
              // Refresh subscription status after cancellation
              this.getSubscriptionStatus();
            }),
            catchError(this._handleError.bind(this))
          )
      );

      if (!response) {
        throw new Error('No response from subscription cancellation');
      }

      return response;
    } catch (error) {
      this.logger.error('Failed to cancel subscription:', error);
      throw error;
    }
  }

  /**
   * Redirect to billing portal
   */
  async redirectToPortal(returnUrl?: string): Promise<void> {
    try {
      const portalUrl = await this.createPortalSession(returnUrl);
      window.location.href = portalUrl;
    } catch (error) {
      this.logger.error('Failed to redirect to portal:', error);
      if ((error as any)?.code === 'portal_configuration_missing') {
        throw new Error('Billing portal is not configured yet. Please configure it in the Stripe dashboard or contact support.');
      }
      throw error;
    }
  }

  /**
   * Handle checkout success
   */
  async handleCheckoutSuccess(sessionId: string): Promise<void> {
    try {
      this.logger.log('Checkout successful, session ID:', sessionId);

      // Invalidate cached status so UI reflects latest data after refresh
      this.subscriptionStatusSubject.next(null);

      // Refresh subscription status
      await this.getSubscriptionStatus();

      // Refresh user profile to get updated subscription info
      const token = await this.authService.getIdToken();
      if (token) {
        await this.authService.loadUserProfile();
      }
    } catch (error) {
      this.logger.error('Error handling checkout success:', error);
    }
  }

  /**
   * Check if user has active subscription
   */
  hasActiveSubscription(): Observable<boolean> {
    return this.subscriptionStatus$.pipe(
      map((status) => {
        return status !== null &&
               status.tier !== 'free' &&
               status.status === 'active';
      })
    );
  }

  /**
   * Check if user has specific tier or higher
   */
  hasTier(requiredTier: 'free' | 'pro'): Observable<boolean> {
    const tierHierarchy = { free: 0, pro: 1 };

    return this.subscriptionStatus$.pipe(
      map((status) => {
        if (!status || status.status !== 'active') {
          return requiredTier === 'free';
        }
        return tierHierarchy[status.tier] >= tierHierarchy[requiredTier];
      })
    );
  }

  /**
   * Clear subscription status
   */
  clearSubscriptionStatus(): void {
    this.subscriptionStatusSubject.next(null);
  }

  /**
   * Handle API errors
   */
  private _handleError(error: any): Observable<never> {
    let errorMessage = 'An unknown error occurred';

    let errorCode: string | undefined;
    let portalEnabled: boolean | undefined;

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else if (error.error && typeof error.error === 'object') {
      // Server-side error
      const stripeError = error.error as StripeError;
      errorMessage = stripeError.message || stripeError.error || errorMessage;
      errorCode = stripeError.errorCode;
      portalEnabled = stripeError.portalEnabled;
    } else if (error.message) {
      errorMessage = error.message;
    }

    this.logger.error('Stripe API error:', errorMessage);
    const customError: any = new Error(errorMessage);
    if (errorCode) {
      customError.code = errorCode;
    }
    if (typeof portalEnabled === 'boolean') {
      customError.portalEnabled = portalEnabled;
    }
    return throwError(() => customError);
  }

  /**
   * Get Stripe instance
   */
  async getStripe(): Promise<Stripe | null> {
    await this._ensureInitialized();
    return this.stripe;
  }
}
