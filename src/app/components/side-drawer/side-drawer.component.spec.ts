import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { SideDrawerComponent } from './side-drawer.component';
import { AuthService, AuthUser, UserProfile } from '../../services/auth.service';
import { DrawerService } from '../../services/drawer.service';
import { TokenService } from '../../services/token.service';
import { StripeService } from '../../services/stripe.service';
import { SubscriptionStatus } from '../../models/subscription.model';
import { NavigationEnd, Router } from '@angular/router';

class MockAuthService {
  private currentUserSubject = new BehaviorSubject<AuthUser | null>(null);
  private userProfileSubject = new BehaviorSubject<UserProfile | null>(null);
  currentUser$ = this.currentUserSubject.asObservable();
  userProfile$ = this.userProfileSubject.asObservable();
  isLoading$ = of(false);

  setCurrentUser(user: AuthUser | null) {
    this.currentUserSubject.next(user);
  }

  setUserProfile(profile: UserProfile | null) {
    this.userProfileSubject.next(profile);
  }

  signOut(): void {}
}

class MockDrawerService {
  mobileDrawerOpen$ = of(false);
  desktopDrawerCollapsed$ = of(false);
  isOpen$ = of(true);
  isCollapsed$ = of(false);
  isMobileOpen = false;
  closeMobile(): void {}
  toggleMobile(): void {}
  toggleDesktopCollapse(): void {}
  close(): void {}
  toggleCollapse(): void {}
}

class MockTokenService {
  remainingTokens = signal<number | null>(null);

  setRemainingTokens(value: number | null): void {
    this.remainingTokens.set(value);
  }
}

class MockStripeService {
  private statusSubject = new BehaviorSubject<SubscriptionStatus | null>(null);
  subscriptionStatus$ = this.statusSubject.asObservable();

  emitStatus(status: SubscriptionStatus | null) {
    this.statusSubject.next(status);
  }
}

class MockRouter {
  url = '/';
  events = new BehaviorSubject<NavigationEnd>(new NavigationEnd(0, '/', '/'));
  navigate = jasmine.createSpy('navigate');
}

describe('SideDrawerComponent', () => {
  let component: SideDrawerComponent;
  let fixture: ComponentFixture<SideDrawerComponent>;
  let mockAuth: MockAuthService;
  let mockStripe: MockStripeService;
  let mockRouter: MockRouter;

  beforeEach(async () => {
    mockAuth = new MockAuthService();
    mockStripe = new MockStripeService();
    mockRouter = new MockRouter();

    await TestBed.configureTestingModule({
      imports: [SideDrawerComponent],
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: DrawerService, useClass: MockDrawerService },
        { provide: TokenService, useClass: MockTokenService },
        { provide: StripeService, useValue: mockStripe },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SideDrawerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should update plan label when subscription status changes', () => {
    const user: AuthUser = {
      uid: 'user-123',
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: null,
      emailVerified: true,
    };
    mockAuth.setCurrentUser(user);
    mockAuth.setUserProfile({
      id: 'user-123',
      email: 'test@example.com',
      subscriptionTier: 'free',
      tokenBalance: 0,
      dailyTokensUsed: 0,
      createdAt: '',
      updatedAt: '',
    } as UserProfile);

    fixture.detectChanges();
    let planLabel: HTMLElement | null = fixture.nativeElement.querySelector('.user-plan');
    expect(planLabel?.textContent?.trim()).toBe('Free Plan');

    mockStripe.emitStatus({
      tier: 'pro',
      status: 'active',
    } as SubscriptionStatus);

    fixture.detectChanges();
    planLabel = fixture.nativeElement.querySelector('.user-plan');
    expect(planLabel?.textContent?.trim()).toBe('Pro Plan');
  });
});
