import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { Observable, Subject, combineLatest } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService, UserProfile } from '../../services/auth.service';
import { StripeService } from '../../services/stripe.service';
import { TokenService, TokenInfo } from '../../services/token.service';
import { LoggerService } from '../../services/logger.service';
import { SubscriptionStatus } from '../../models/subscription.model';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatChipsModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss',
})
export class AccountComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  userProfile$: Observable<UserProfile | null>;
  subscriptionStatus$: Observable<SubscriptionStatus | null>;
  tokenInfo$: Observable<TokenInfo | null>;

  isLoadingPortal = false;
  isLoadingCancel = false;
  isLoadingStatus = false;

  constructor(
    private authService: AuthService,
    private stripeService: StripeService,
    private tokenService: TokenService,
    private logger: LoggerService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private router: Router
  ) {
    this.userProfile$ = this.authService.userProfile$;
    this.subscriptionStatus$ = this.stripeService.subscriptionStatus$;
    this.tokenInfo$ = this.tokenService.tokenInfo$;
  }

  async ngOnInit(): Promise<void> {
    // Initialize services
    this.tokenService.initialize();

    // Load subscription status if user is authenticated
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (user) => {
        if (user) {
          await this._loadSubscriptionStatus();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async openBillingPortal(): Promise<void> {
    this.isLoadingPortal = true;
    try {
      await this.stripeService.redirectToPortal();
    } catch (error: any) {
      this.logger.error('Failed to open billing portal:', error);
      this.snackBar.open(
        error.message || 'Failed to open billing portal',
        'OK',
        { duration: 5000 }
      );
    } finally {
      this.isLoadingPortal = false;
    }
  }

  async cancelSubscription(): Promise<void> {
    // Show confirmation dialog
    const confirmed = await this._showCancelConfirmation();
    if (!confirmed) {
      return;
    }

    this.isLoadingCancel = true;
    try {
      const result = await this.stripeService.cancelSubscription();

      if (result.success) {
        this.snackBar.open(
          'Your subscription will be cancelled at the end of the current billing period',
          'OK',
          { duration: 7000 }
        );

        // Refresh subscription status
        await this._loadSubscriptionStatus();
      } else {
        throw new Error(result.message || 'Failed to cancel subscription');
      }
    } catch (error: any) {
      this.logger.error('Failed to cancel subscription:', error);
      this.snackBar.open(
        error.message || 'Failed to cancel subscription',
        'OK',
        { duration: 5000 }
      );
    } finally {
      this.isLoadingCancel = false;
    }
  }

  async reactivateSubscription(): Promise<void> {
    this.isLoadingPortal = true;
    try {
      // Redirect to billing portal to reactivate
      await this.stripeService.redirectToPortal();
    } catch (error: any) {
      this.logger.error('Failed to reactivate subscription:', error);
      this.snackBar.open(
        'Please use the billing portal to reactivate your subscription',
        'Open Portal',
        { duration: 7000 }
      ).onAction().subscribe(() => {
        this.openBillingPortal();
      });
    } finally {
      this.isLoadingPortal = false;
    }
  }

  goToPlans(): void {
    this.router.navigate(['/plans']);
  }

  formatDate(dateString: string | undefined): string {
    if (!dateString) {
      return 'N/A';
    }
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  getTierColor(tier: string): string {
    switch (tier) {
      case 'pro':
        return 'primary';
      case 'premium':
        return 'accent';
      default:
        return '';
    }
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'active':
        return 'primary';
      case 'cancelled':
        return 'warn';
      case 'past_due':
        return 'warn';
      default:
        return '';
    }
  }

  private async _loadSubscriptionStatus(): Promise<void> {
    this.isLoadingStatus = true;
    try {
      await this.stripeService.getSubscriptionStatus();
      // Also refresh the user profile to get updated subscription info
      await this.authService.loadUserProfile();
    } catch (error: any) {
      this.logger.error('Failed to load subscription status:', error);
      // Don't show error to user, just log it
    } finally {
      this.isLoadingStatus = false;
    }
  }

  private async _showCancelConfirmation(): Promise<boolean> {
    return new Promise((resolve) => {
      const result = confirm(
        'Are you sure you want to cancel your subscription? You will continue to have access until the end of your current billing period.'
      );
      resolve(result);
    });
  }
}