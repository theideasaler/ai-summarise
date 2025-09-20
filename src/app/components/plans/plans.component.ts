import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Observable, Subject, combineLatest } from 'rxjs';
import { takeUntil, first } from 'rxjs/operators';
import { TokenService, TokenInfo } from '../../services/token.service';
import { AuthService, UserProfile } from '../../services/auth.service';
import { LoggerService } from '../../services/logger.service';
import { StripeService } from '../../services/stripe.service';
import { SubscriptionStatus } from '../../models/subscription.model';
import { environment } from '../../../environments/environment';
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
    {
      id: 'premium',
      name: 'Premium',
      price: 99.99,
      tokens: 5000000,
      maxRequests: 10,
      features: [
        { name: '5,000,000 tokens per month', included: true },
        { name: 'Max 10 requests at a time', included: true },
        { name: 'Private data - not used for training', included: true },
        { name: 'Fast-track generation', included: true },
        { name: 'Professional mode for videos', included: true },
        { name: 'Watermark removal', included: true },
        { name: 'Video extension', included: true },
        { name: 'Image upscaling', included: true },
        { name: 'Priority access to new features', included: true },
        { name: 'Advanced analytics', included: true },
        { name: 'Premium support', included: true },
      ],
      buttonText: 'Upgrade to Premium',
      buttonAction: 'subscribe',
      popular: false,
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

    // Load subscription status if user is authenticated
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (user) => {
        if (user) {
          await this._loadSubscriptionStatus();
        }
      });

    // Update current plan based on subscription status
    combineLatest([
      this.subscriptionStatus$,
      this.userProfile$,
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([status, profile]) => {
        if (status) {
          this._updateCurrentPlan(status.tier);
          this._updatePlanButtons(status);
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
    this.subscriptionPlans.forEach((plan) => {
      if (plan.id === status.tier && status.status === 'active') {
        plan.current = true;
        plan.buttonText = status.cancelAtPeriodEnd ? 'Reactivate' : 'Manage Subscription';
        plan.buttonAction = 'manage';
        plan.disabled = false;
      } else if (plan.id === 'free') {
        if (status.tier !== 'free') {
          plan.buttonText = 'Downgrade to Free';
          plan.buttonAction = 'disabled';
          plan.disabled = true;
        }
      } else {
        const tierHierarchy: Record<string, number> = { free: 0, pro: 1, premium: 2 };
        const planLevel = tierHierarchy[plan.id] ?? 0;
        const currentLevel = tierHierarchy[status.tier] ?? 0;
        const isUpgrade = planLevel > currentLevel;
        plan.buttonText = isUpgrade ? `Upgrade to ${plan.name}` : `Change to ${plan.name}`;
        plan.buttonAction = 'subscribe';
        plan.disabled = false;
        plan.current = false;
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

    if (!['pro', 'premium'].includes(plan.id)) {
      this.snackBar.open('This plan is not available for subscription', 'OK', {
        duration: 3000,
      });
      return;
    }

    this.isLoadingCheckout = true;
    try {
      const session = await this.stripeService.createCheckoutSession(
        plan.id as 'pro' | 'premium'
      );

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
    } finally {
      this.isLoadingCheckout = false;
    }
  }

  private async _handleManageSubscription(): Promise<void> {
    this.isLoadingCheckout = true;
    try {
      await this.stripeService.redirectToPortal();
    } catch (error: any) {
      this.logger.error('Portal redirect error:', error);
      this.snackBar.open(
        error.message || 'Failed to open billing portal',
        'OK',
        { duration: 5000 }
      );
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