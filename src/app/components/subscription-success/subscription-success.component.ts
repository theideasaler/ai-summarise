import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { StripeService } from '../../services/stripe.service';
import { AuthService } from '../../services/auth.service';
import { LoggerService } from '../../services/logger.service';

@Component({
  selector: 'app-subscription-success',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './subscription-success.component.html',
  styleUrl: './subscription-success.component.scss',
})
export class SubscriptionSuccessComponent implements OnInit {
  isLoading = true;
  isSuccess = false;
  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private stripeService: StripeService,
    private authService: AuthService,
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

      // Handle the successful checkout
      await this.stripeService.handleCheckoutSuccess(sessionId);

      // Refresh user profile to get updated subscription
      const token = await this.authService.getIdToken();
      if (token) {
        // Wait a moment for the backend to process the webhook
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Refresh subscription status
        await this.stripeService.getSubscriptionStatus();
      }

      this.isSuccess = true;
    } catch (error: any) {
      this.logger.error('Error processing subscription success:', error);
      this.errorMessage =
        error.message || 'There was an error processing your subscription';
      this.isSuccess = false;
    } finally {
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
}
