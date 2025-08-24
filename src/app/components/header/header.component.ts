import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { AuthService, AuthUser } from '../../services/auth.service';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';

@Component({
  selector: 'app-header',
  imports: [CommonModule, RouterLink, UserAvatarComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnInit, OnDestroy {
  title = 'AI Summarise';
  currentUser$: Observable<AuthUser | null>;
  isLoading$: Observable<boolean>;

  constructor(private authService: AuthService, private router: Router) {
    this.currentUser$ = this.authService.currentUser$;
    this.isLoading$ = this.authService.isLoading$;
  }

  ngOnInit(): void {
    // Component initialization if needed
  }

  ngOnDestroy(): void {
    // Component cleanup if needed
  }

  async signOut(): Promise<void> {
    try {
      await this.authService.signOut();
      this.router.navigate(['/']);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }

  navigateToLogin(): void {
    this.router.navigate(['/login']);
  }

  navigateToSignup(): void {
    this.router.navigate(['/signup']);
  }
}
