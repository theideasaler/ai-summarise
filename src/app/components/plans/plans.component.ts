import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TokenService, TokenInfo } from '../../services/token.service';
import { AuthService, UserProfile } from '../../services/auth.service';
import { LoggerService } from '../../services/logger.service';

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
  ],
  templateUrl: './plans.component.html',
  styleUrl: './plans.component.scss',
})
export class PlansComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  tokenInfo$: Observable<TokenInfo | null>;
  userProfile$: Observable<UserProfile | null>;

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
    private logger: LoggerService
  ) {
    this.tokenInfo$ = this.tokenService.tokenInfo$;
    this.userProfile$ = this.authService.userProfile$;
  }

  ngOnInit(): void {
    // Initialize token service
    this.tokenService.initialize();

    // Update current plan based on user profile
    this.userProfile$.pipe(takeUntil(this.destroy$)).subscribe((profile) => {
      if (profile) {
        this._updateCurrentPlan(profile.subscriptionTier);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onPlanAction(plan: SubscriptionPlan): void {
    switch (plan.buttonAction) {
      case 'upgrade':
        this._handleUpgrade(plan);
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
      if (plan.current) {
        plan.buttonText = 'Current Plan';
        plan.buttonAction = 'current';
      }
    });
  }

  private _handleUpgrade(plan: SubscriptionPlan): void {
    this.logger.log('Upgrade to plan:', plan.name);
    // TODO: Implement subscription upgrade logic
    // This would typically integrate with a payment processor like Stripe
  }
}