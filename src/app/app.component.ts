import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from './services/auth.service';
import { SubscriptionBootstrapService } from './services/subscription-bootstrap.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  isLoading$: Observable<boolean>;
  showHeader?: boolean;

  constructor(
    private authService: AuthService,
    private subscriptionBootstrap: SubscriptionBootstrapService
  ) {
    this.isLoading$ = this.authService.isLoading$;
  }
}
