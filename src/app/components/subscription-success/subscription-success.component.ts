import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { StripeService } from '../../services/stripe.service';
import { AuthService } from '../../services/auth.service';
import { LoggerService } from '../../services/logger.service';
import { TokenService } from '../../services/token.service';
import { Subject, interval, throwError } from 'rxjs';
import {
  takeUntil,
  switchMap,
  retry,
  catchError,
  tap,
  take,
} from 'rxjs/operators';
import { SubscriptionStatusResponse } from '../../models/subscription.model';

@Component({
  selector: 'app-subscription-success',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
  ],
  templateUrl: './subscription-success.component.html',
  styleUrl: './subscription-success.component.scss',
})
export class SubscriptionSuccessComponent implements OnInit, OnDestroy {
  isLoading = true;
  isSuccess = false;
  errorMessage = '';

  // Polling state management
  pollingMessage = 'Processing your subscription...';
  currentRetry = 0;
  maxRetries = 10; // 10 retries * 2 seconds = 20 seconds max
  pollingInterval = 2000; // 2 seconds
  isPolling = false;
  initialSubscriptionTier: string | null = null;
  detectedSubscriptionTier: string | null = null;

  // RxJS cleanup
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private stripeService: StripeService,
    private authService: AuthService,
    private tokenService: TokenService,
    private logger: LoggerService
  ) {}

  async ngOnInit(): Promise<void> {
    this.isLoading = true;

    try {
      // Get session ID from query params
      const sessionId = this.route.snapshot.queryParamMap.get('session_id');

      if (!sessionId) {
        throw new Error('No session ID found in URL');
      }

      // Handle the successful checkout (this logs the session ID)
      await this.stripeService.handleCheckoutSuccess(sessionId);

      // Get initial subscription status to compare against
      const token = await this.authService.getIdToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      // Get initial status before polling
      try {
        const initialStatus = await this.stripeService.getSubscriptionStatus();
        this.initialSubscriptionTier = initialStatus.subscription_tier;
        this.logger.log(
          'Initial subscription tier:',
          this.initialSubscriptionTier
        );

        // If already upgraded, no need to poll
        if (
          this.initialSubscriptionTier &&
          this.initialSubscriptionTier !== 'free'
        ) {
          this.logger.log(
            'Subscription already upgraded to:',
            this.initialSubscriptionTier
          );
          this.detectedSubscriptionTier = this.initialSubscriptionTier;
          this.isSuccess = true;
          this.isLoading = false;
          return;
        }
      } catch (error) {
        this.logger.warn(
          'Could not get initial subscription status, will start polling:',
          error
        );
        this.initialSubscriptionTier = 'free'; // Assume free if we can't get status
      }

      // Start polling for subscription status update
      await this._startPollingSubscriptionStatus();
    } catch (error: any) {
      this.logger.error('Error processing subscription success:', error);
      this.errorMessage =
        error.message || 'There was an error processing your subscription';
      this.isSuccess = false;
      this.isLoading = false;
    }
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  goToPlans(): void {
    this.router.navigate(['/plans']);
  }

  goToAccount(): void {
    this.router.navigate(['/account']);
  }

  /**
   * Poll the subscription status endpoint until the subscription changes from 'free'
   * or until max retries is reached
   */
  private async _startPollingSubscriptionStatus(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.isPolling = true;
      this.currentRetry = 0;

      // Create an observable that polls every 2 seconds
      interval(this.pollingInterval)
        .pipe(
          takeUntil(this.destroy$),
          take(this.maxRetries), // Automatically stop after max retries
          tap(() => {
            this.currentRetry++;
            this._updatePollingMessage();
            this.logger.log(
              `Polling attempt ${this.currentRetry}/${this.maxRetries}`
            );
          }),
          switchMap(
            () =>
              // Convert promise to observable and handle errors gracefully
              new Promise<SubscriptionStatusResponse>((res, rej) => {
                this.stripeService
                  .getSubscriptionStatus()
                  .then((status) => res(status))
                  .catch((err) => {
                    this.logger.warn(
                      `Polling attempt ${this.currentRetry} failed:`,
                      err
                    );
                    // Don't reject on API errors, just return null to continue polling
                    res(null as any);
                  });
              })
          ),
          catchError((error) => {
            this.logger.error('Polling error:', error);
            // Continue polling on errors
            return throwError(() => error);
          })
        )
        .subscribe({
          next: (status) => {
            if (!status) {
              // API error occurred, continue polling
              if (this.currentRetry >= this.maxRetries) {
                this._handlePollingTimeout();
                resolve();
              }
              return;
            }

            this.logger.log(
              `Poll ${this.currentRetry}: tier = ${status.subscription_tier}, status = ${status.subscription_status}`
            );

            // Check if subscription has been upgraded from free
            if (
              status.subscription_tier &&
              status.subscription_tier !== 'free'
            ) {
              this.logger.log(
                'Subscription upgraded detected:',
                status.subscription_tier
              );
              this.detectedSubscriptionTier = status.subscription_tier;
              this._handlePollingSuccess(status);
              resolve();
            } else if (this.currentRetry >= this.maxRetries) {
              // Max retries reached without detecting upgrade
              this._handlePollingTimeout();
              resolve();
            }
          },
          error: (error) => {
            this.logger.error('Polling subscription failed:', error);
            this._handlePollingError(error);
            reject(error);
          },
          complete: () => {
            // This is called when take(maxRetries) completes
            if (!this.isSuccess && !this.errorMessage) {
              this._handlePollingTimeout();
            }
            this.isPolling = false;
            resolve();
          },
        });
    });
  }

  /**
   * Update the polling message based on current retry count
   */
  private _updatePollingMessage(): void {
    const messages = [
      'Processing your subscription...',
      'Confirming payment with Stripe...',
      'Updating your account...',
      'Almost there, activating Pro features...',
      'Finalising subscription upgrade...',
    ];

    const messageIndex = Math.min(
      Math.floor((this.currentRetry - 1) / 2),
      messages.length - 1
    );

    this.pollingMessage = messages[messageIndex];
  }

  /**
   * Handle successful subscription upgrade detection
   */
  private _handlePollingSuccess(status: SubscriptionStatusResponse): void {
    this.logger.log(
      'Subscription successfully upgraded to:',
      status.subscription_tier
    );
    this.isSuccess = true;
    this.isLoading = false;
    this.isPolling = false;
    this.errorMessage = '';

    // Stop polling
    this.destroy$.next();

    // Refresh subscription status and token balances in background
    this.stripeService.getSubscriptionStatus().catch((error) => {
      this.logger.warn('Failed to refresh subscription status after success', error);
    });

    this.tokenService.fetchTokenInfo().catch((error) => {
      this.logger.warn('Failed to refresh token info after success', error);
    });
  }

  /**
   * Handle polling timeout (max retries reached)
   */
  private _handlePollingTimeout(): void {
    this.logger.warn(
      'Polling timeout - subscription status not updated after max retries'
    );

    // Show a soft error - payment likely succeeded but webhook is delayed
    this.isSuccess = false;
    this.isLoading = false;
    this.isPolling = false;
    this.errorMessage = `Your payment was successful, but the subscription activation is taking longer than expected.
                         Please check your account in a few moments or contact support if the issue persists.`;
  }

  /**
   * Handle polling error
   */
  private _handlePollingError(error: any): void {
    this.logger.error('Polling error:', error);
    this.isSuccess = false;
    this.isLoading = false;
    this.isPolling = false;
    this.errorMessage =
      error.message ||
      'Unable to verify subscription status. Please check your account.';
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    this.destroy$.next();
    this.destroy$.complete();
  }
}
