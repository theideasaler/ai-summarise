import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, from, throwError, of } from 'rxjs';
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

  constructor(
    private http: HttpClient,
    private logger: LoggerService,
    private authService: AuthService
  ) {
    this._initializeStripe();
  }

  private async _initializeStripe(): Promise<void> {
    try {
      // First, fetch the Stripe configuration from the backend
      await this._fetchStripeConfig();

      if (!this.stripeConfig) {
        throw new Error('Failed to fetch Stripe configuration');
      }

      // Initialize Stripe with the publishable key from the backend
      this.stripePromise = loadStripe(this.stripeConfig.publishableKey);
      this.stripe = await this.stripePromise;

      if (!this.stripe) {
        throw new Error('Stripe failed to initialize');
      }

      this.logger.log('Stripe initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Stripe:', error);
    }
  }

  /**
   * Fetch Stripe configuration from backend
   */
  private async _fetchStripeConfig(): Promise<void> {
    try {
      const response = await this.http
        .get<StripeConfig>(`${environment.apiUrl}/api/stripe/config`)
        .pipe(
          retry(2),
          catchError((error) => {
            this.logger.error('Failed to fetch Stripe config:', error);
            return throwError(() => error);
          })
        )
        .toPromise();

      if (!response) {
        throw new Error('No response from Stripe configuration endpoint');
      }

      this.stripeConfig = response;
      this.logger.log('Stripe configuration fetched successfully');
    } catch (error) {
      this.logger.error('Failed to fetch Stripe configuration:', error);
      throw error;
    }
  }

  /**
   * Get Stripe configuration (price IDs)
   */
  async getStripeConfig(): Promise<StripeConfig> {
    if (!this.stripeConfig) {
      await this._fetchStripeConfig();
      if (!this.stripeConfig) {
        throw new Error('Failed to load Stripe configuration');
      }
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
    tier: 'pro' | 'premium',
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

      const response = await this.http
        .post<CheckoutSessionResponse>(
          `${environment.apiUrl}/api/stripe/create-checkout-session`,
          request,
          { headers }
        )
        .pipe(
          retry(2),
          catchError(this._handleError.bind(this))
        )
        .toPromise();

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
    if (!this.stripe) {
      if (!this.stripePromise) {
        throw new Error('Stripe is not initialized');
      }
      this.stripe = await this.stripePromise;
      if (!this.stripe) {
        throw new Error('Stripe is not initialized');
      }
    }

    const { error } = await this.stripe.redirectToCheckout({ sessionId });

    if (error) {
      this.logger.error('Stripe redirect error:', error);
      throw error;
    }
  }

  /**
   * Create checkout session and redirect
   */
  async createCheckoutAndRedirect(
    tier: 'pro' | 'premium',
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

      const response = await this.http
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
        .toPromise();

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

      const response = await this.http
        .post<PortalSessionResponse>(
          `${environment.apiUrl}/api/stripe/create-portal-session`,
          { return_url: returnUrl || `${baseUrl}/account` },
          { headers }
        )
        .pipe(
          retry(2),
          catchError(this._handleError.bind(this))
        )
        .toPromise();

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

      const response = await this.http
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
        .toPromise();

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
      throw error;
    }
  }

  /**
   * Handle checkout success
   */
  async handleCheckoutSuccess(sessionId: string): Promise<void> {
    try {
      this.logger.log('Checkout successful, session ID:', sessionId);

      // Refresh subscription status
      await this.getSubscriptionStatus();

      // Refresh user profile to get updated subscription info
      const token = await this.authService.getIdToken();
      if (token) {
        // This will trigger the auth service to reload user profile
        await this.authService.getIdToken();
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
  hasTier(requiredTier: 'free' | 'pro' | 'premium'): Observable<boolean> {
    const tierHierarchy = { free: 0, pro: 1, premium: 2 };

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

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else if (error.error && typeof error.error === 'object') {
      // Server-side error
      const stripeError = error.error as StripeError;
      errorMessage = stripeError.message || stripeError.error || errorMessage;
    } else if (error.message) {
      errorMessage = error.message;
    }

    this.logger.error('Stripe API error:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }

  /**
   * Get Stripe instance
   */
  async getStripe(): Promise<Stripe | null> {
    if (!this.stripe) {
      this.stripe = await this.stripePromise;
    }
    return this.stripe;
  }
}