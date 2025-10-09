import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Observable, Subject, combineLatest } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TokenService, TokenInfo } from '../../services/token.service';
import { AuthService, UserProfile } from '../../services/auth.service';
import { LoggerService } from '../../services/logger.service';
import { StripeService } from '../../services/stripe.service';
import { SubscriptionStatus } from '../../models/subscription.model';
import { Router } from '@angular/router';

interface PlanFeature {
  name: string;
  included: boolean;
  description?: string;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number; // Monthly price only
  tokens: number;
  maxRequests: number;
  features: PlanFeature[];
  popular?: boolean;
  current?: boolean;
  buttonText: string;
  buttonAction: string;
  disabled?: boolean;
  dataPrivacy?: string;
}

@Component({
  selector: 'app-plans',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './plans.component.html',
  styleUrl: './plans.component.scss',
})
export class PlansComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  tokenInfo$: Observable<TokenInfo | null>;
  userProfile$: Observable<UserProfile | null>;
  subscriptionStatus$: Observable<SubscriptionStatus | null>;
  isLoadingCheckout = false;
  isLoadingStatus = false;

  // Track recent purchases to prevent duplicates
  private recentPurchases = new Set<string>();
  private currentSubscriptionStatus: SubscriptionStatus | null = null;

  subscriptionPlans: SubscriptionPlan[] = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      tokens: 100000,
      maxRequests: 1,
      features: [
        { name: '100,000 tokens per month', included: true },
        { name: 'Max 1 request at a time', included: true },
        { name: 'Data used for product improvements', included: true },
      ],
      buttonText: 'Current Plan',
      buttonAction: 'current',
      popular: false,
      disabled: true,
      dataPrivacy: 'Data may be used for product improvements'
    },
    {
      id: 'pro',
      name: 'Pro',
      price: 29.99,
      tokens: 1000000,
      maxRequests: 3,
      features: [
        { name: '1,000,000 tokens per month', included: true },
        { name: 'Max 3 requests at a time', included: true },
        { name: 'Private data - not used for training', included: true },
        { name: 'Fast-track generation', included: true },
        { name: 'Professional mode for videos', included: true },
        { name: 'Watermark removal', included: true },
        { name: 'Video extension', included: true },
        { name: 'Image upscaling', included: true },
        { name: 'Priority access to new features', included: true },
      ],
      buttonText: 'Upgrade to Pro',
      buttonAction: 'subscribe',
      popular: true,
      disabled: false,
      dataPrivacy: 'Your data is private and won\'t be used for training'
    },
  ];

  constructor(
    private tokenService: TokenService,
    private authService: AuthService,
    private stripeService: StripeService,
    private logger: LoggerService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {
    this.tokenInfo$ = this.tokenService.tokenInfo$;
    this.userProfile$ = this.authService.userProfile$;
    this.subscriptionStatus$ = this.stripeService.subscriptionStatus$;
  }

  ngOnInit(): void {
    // Initialize token service
    this.tokenService.initialize();

    // Always load subscription status on component init
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (user) => {
        if (user) {
          await this._loadSubscriptionStatus();
        }
      });

    // Also load subscription status immediately if user is already authenticated
    if (this.authService.getCurrentUser()) {
      this._loadSubscriptionStatus();
    }

    // Update current plan based on subscription status
    combineLatest([
      this.subscriptionStatus$,
      this.userProfile$,
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([status, profile]) => {
        // Track current subscription status
        this.currentSubscriptionStatus = status;

        if (status) {
          this._updateCurrentPlan(status.tier);
          this._updatePlanButtons(status);

          // Clear recent purchases for current tier (purchase completed)
          if (status.status === 'active' && status.tier !== 'free') {
            this.recentPurchases.delete(status.tier);
          }
        } else if (profile) {
          this._updateCurrentPlan(profile.subscriptionTier);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async onPlanAction(plan: SubscriptionPlan): Promise<void> {
    // Check if user is authenticated
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.snackBar.open('Please sign in to subscribe', 'Sign In', {
        duration: 5000,
      }).onAction().subscribe(() => {
        this.router.navigate(['/auth/login']);
      });
      return;
    }

    switch (plan.buttonAction) {
      case 'subscribe':
        await this._handleSubscribe(plan);
        break;
      case 'manage':
        await this._handleManageSubscription();
        break;
      case 'current':
        this.logger.log('Current plan selected');
        break;
      case 'disabled':
        this.logger.log('Plan action disabled');
        break;
      default:
        this.logger.warn('Unknown plan action:', plan.buttonAction);
    }
  }

  getCurrentPrice(plan: SubscriptionPlan): number {
    return plan.price;
  }

  private _updateCurrentPlan(subscriptionTier: string): void {
    this.subscriptionPlans.forEach((plan) => {
      plan.current = plan.id === subscriptionTier;
    });
  }

  private _updatePlanButtons(status: SubscriptionStatus): void {
    const tierHierarchy: Record<string, number> = { free: 0, pro: 1 };
    const currentLevel = tierHierarchy[status.tier] ?? 0;

    this.subscriptionPlans.forEach((plan) => {
      const planLevel = tierHierarchy[plan.id] ?? 0;
      const isRecentlyPurchased = this.recentPurchases.has(plan.id);

      if (plan.id === status.tier && status.status === 'active') {
        // Current active plan
        plan.current = true;
        plan.buttonText = status.cancelAtPeriodEnd ? 'Reactivate' : 'Manage Subscription';
        plan.buttonAction = 'manage';
        plan.disabled = false;
      } else if (planLevel < currentLevel) {
        // Lower tier plans - disable them (downgrades)
        plan.current = false;
        plan.buttonText = `${plan.name} Plan`;
        plan.buttonAction = 'disabled';
        plan.disabled = true;
      } else if (planLevel > currentLevel) {
        // Higher tier plans - allow upgrades
        plan.current = false;
        plan.buttonText = isRecentlyPurchased ? 'Purchase in Progress...' : `Upgrade to ${plan.name}`;
        plan.buttonAction = 'subscribe';
        plan.disabled = isRecentlyPurchased;
      } else {
        // Same tier but inactive (shouldn't happen in normal flow)
        plan.current = false;
        plan.buttonText = isRecentlyPurchased ? 'Purchase in Progress...' : `Activate ${plan.name}`;
        plan.buttonAction = 'subscribe';
        plan.disabled = isRecentlyPurchased;
      }
    });
  }

  private async _handleSubscribe(plan: SubscriptionPlan): Promise<void> {
    if (plan.id === 'free') {
      this.snackBar.open('Free plan is already active', 'OK', {
        duration: 3000,
      });
      return;
    }

    if (plan.id !== 'pro') {
      this.snackBar.open('Only Pro plan is available for subscription', 'OK', {
        duration: 3000,
      });
      return;
    }

    // Check for recent purchase attempts
    if (this.recentPurchases.has(plan.id)) {
      this.snackBar.open('Purchase in progress. Please wait...', 'OK', {
        duration: 3000,
      });
      return;
    }

    // Check current subscription status to prevent duplicates
    if (this.currentSubscriptionStatus &&
        this.currentSubscriptionStatus.status === 'active' &&
        this.currentSubscriptionStatus.tier === plan.id) {
      this.snackBar.open(`${plan.name} plan is already active`, 'OK', {
        duration: 3000,
      });
      return;
    }

    // Mark this plan as recently attempted
    this.recentPurchases.add(plan.id);

    // Update button states to reflect the recent purchase
    if (this.currentSubscriptionStatus) {
      this._updatePlanButtons(this.currentSubscriptionStatus);
    }

    this.isLoadingCheckout = true;
    try {
      const session = await this.stripeService.createCheckoutSession('pro');

      if (session.session_id) {
        await this.stripeService.redirectToCheckout(session.session_id);
      } else {
        throw new Error('No session ID returned');
      }
    } catch (error: any) {
      this.logger.error('Checkout error:', error);
      this.snackBar.open(
        error.message || 'Failed to start checkout process',
        'OK',
        { duration: 5000 }
      );
      // Clear recent purchase on error
      this.recentPurchases.delete(plan.id);
    } finally {
      this.isLoadingCheckout = false;
    }

    // Clear recent purchase after 30 seconds as a safety measure
    setTimeout(() => {
      this.recentPurchases.delete(plan.id);
    }, 30000);
  }

  private async _handleManageSubscription(): Promise<void> {
    this.isLoadingCheckout = true;
    try {
      await this.stripeService.redirectToPortal();
    } catch (error: any) {
      this.logger.error('Portal redirect error:', error);
      const message = error?.message || 'Failed to open billing portal';
      const requiresConfig = message.toLowerCase().includes('configure');

      const snack = this.snackBar.open(
        message,
        requiresConfig ? 'Open Guide' : 'OK',
        {
          duration: 7000,
          politeness: 'assertive',
        }
      );

      if (requiresConfig) {
        snack.onAction().subscribe(() => {
          window.open('https://dashboard.stripe.com/test/settings/billing/portal', '_blank');
        });
      }
    } finally {
      this.isLoadingCheckout = false;
    }
  }

  private async _loadSubscriptionStatus(): Promise<void> {
    this.isLoadingStatus = true;
    try {
      await this.stripeService.getSubscriptionStatus();
    } catch (error: any) {
      this.logger.error('Failed to load subscription status:', error);
      // Don't show error to user, just log it
    } finally {
      this.isLoadingStatus = false;
    }
  }
}
