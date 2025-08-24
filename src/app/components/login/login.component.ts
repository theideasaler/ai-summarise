import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  email = '';
  password = '';
  isLoading = false;
  errorMessage = '';
  showPassword = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  async signInWithGoogle(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    
    try {
      await this.authService.signInWithGoogle();
      this.router.navigate(['/summarise']);
    } catch (error: any) {
      this.errorMessage = this.getErrorMessage(error);
    } finally {
      this.isLoading = false;
    }
  }

  async signInWithEmail(): Promise<void> {
    if (!this.email || !this.password) {
      this.errorMessage = 'Please enter both email and password';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    
    try {
      await this.authService.signInWithEmail(this.email, this.password);
      this.router.navigate(['/summarise']);
    } catch (error: any) {
      this.errorMessage = this.getErrorMessage(error);
    } finally {
      this.isLoading = false;
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  navigateToSignup(): void {
    this.router.navigate(['/signup']);
  }

  private getErrorMessage(error: any): string {
    if (error?.code) {
      switch (error.code) {
        case 'auth/user-not-found':
          return 'No account found with this email address';
        case 'auth/wrong-password':
          return 'Incorrect password';
        case 'auth/invalid-email':
          return 'Invalid email address';
        case 'auth/user-disabled':
          return 'This account has been disabled';
        case 'auth/too-many-requests':
          return 'Too many failed attempts. Please try again later';
        case 'auth/popup-closed-by-user':
          return 'Sign-in was cancelled';
        case 'auth/popup-blocked':
          return 'Pop-up was blocked. Please allow pop-ups and try again';
        case 'auth/operation-not-allowed':
          return 'Google sign-in is not enabled. Please contact support or try email sign-in';
        default:
          return error.message || 'An error occurred during sign-in';
      }
    }
    return error?.message || 'An unexpected error occurred';
  }
}
