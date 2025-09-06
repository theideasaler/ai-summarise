import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService, AuthUser } from '../../services/auth.service';

@Component({
  selector: 'app-user-avatar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user-avatar.component.html',
  styleUrl: './user-avatar.component.scss'
})
export class UserAvatarComponent implements OnInit, OnDestroy {
  @Input() user: AuthUser | null = null;
  @Input() size: 'small' | 'medium' | 'large' = 'medium';
  @Input() showFallback: boolean = true;
  
  imageLoadError = false;
  imageRetryCount = 0;
  maxRetries = 2;
  private userSubscription?: Subscription;

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    // Reset image error and retry count when user changes
    this.userSubscription = this.authService.currentUser$.subscribe((user) => {
      if (user !== this.user) {
        this.imageLoadError = false;
        this.imageRetryCount = 0;
      }
    });
  }

  ngOnDestroy(): void {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }

  onImageError(): void {
    if (this.imageRetryCount < this.maxRetries) {
      this.imageRetryCount++;
      // Force image reload by updating src with timestamp
      const imgElement = document.querySelector(
        `.avatar-img-${this.getUniqueId()}`
      ) as HTMLImageElement;
      const photoURL = this.user?.photoURL;
      if (imgElement && photoURL) {
        const separator = photoURL.includes('?') ? '&' : '?';
        imgElement.src = `${photoURL}${separator}retry=${this.imageRetryCount}`;
      }
    } else {
      // After max retries, show fallback
      this.imageLoadError = true;
    }
  }

  onImageLoad(): void {
    this.imageLoadError = false;
  }

  getUserInitials(): string {
    if (!this.user) return 'U';
    return (this.user.displayName || this.user.email || 'U').charAt(0).toUpperCase();
  }

  getUniqueId(): string {
    return `${this.user?.uid || 'anonymous'}-${this.size}`;
  }

  getSizeClass(): string {
    return `avatar-${this.size}`;
  }
}