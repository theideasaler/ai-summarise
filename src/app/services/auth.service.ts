import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { User, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from 'firebase/auth';
import { FirebaseService } from './firebase.service';
import { LoggerService } from './logger.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  subscriptionTier: 'free' | 'pro' | 'premium';
  subscriptionStatus?: 'active' | 'inactive' | 'cancelled' | 'past_due';
  tokenBalance: number;
  dailyTokensUsed: number;
  lastTokenReset?: string;
  createdAt: string;
  updatedAt: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<AuthUser | null>(null);
  private userProfileSubject = new BehaviorSubject<UserProfile | null>(null);
  private isLoadingSubject = new BehaviorSubject<boolean>(true);

  public currentUser$ = this.currentUserSubject.asObservable();
  public userProfile$ = this.userProfileSubject.asObservable();
  public isLoading$ = this.isLoadingSubject.asObservable();

  constructor(
    private firebaseService: FirebaseService,
    private router: Router,
    private logger: LoggerService,
    private http: HttpClient
  ) {
    // Initialize auth state asynchronously
    this.initializeAuthState().catch((error) => {
      this.logger.error('Error initializing auth state:', error);
      this.isLoadingSubject.next(false);
    });
  }

  private async initializeAuthState(): Promise<void> {
    const auth = this.firebaseService.getAuth();

    // Ensure we start in loading state
    this.isLoadingSubject.next(true);

    // First, check if we have a stored auth token
    const storedToken = this.getStoredAuthToken();
    if (storedToken) {
      try {
        // Try to validate the stored token by checking current Firebase user
        const currentUser = auth.currentUser;
        if (currentUser) {
          // We have both stored token and Firebase user, set up auth state immediately
          const authUser: AuthUser = {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
            emailVerified: currentUser.emailVerified,
          };

          this.currentUserSubject.next(authUser);
          await this.loadUserProfile();
          this.isLoadingSubject.next(false);
          return;
        }
      } catch (error) {
        this.logger.error('Error validating stored token:', error);
        // Clear invalid token and continue with Firebase auth
        this.clearAuthToken();
      }
    }

    // Fallback to Firebase auth state listener
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const authUser: AuthUser = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          emailVerified: user.emailVerified,
        };

        this.currentUserSubject.next(authUser);

        // Get user profile from backend
        try {
          const idToken = await user.getIdToken();
          this.setAuthToken(idToken);
          await this.loadUserProfile();
        } catch (error) {
          this.logger.error('Error loading user profile:', error);
        }
      } else {
        this.currentUserSubject.next(null);
        this.userProfileSubject.next(null);
        this.clearAuthToken();
      }

      this.isLoadingSubject.next(false);
    });
  }

  // Sign in with Google
  async signInWithGoogle(): Promise<AuthUser> {
    try {
      const auth = this.firebaseService.getAuth();
      const provider = new GoogleAuthProvider();

      // Add scopes for additional user info
      provider.addScope('profile');
      provider.addScope('email');

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      if (!user) {
        throw new Error('No user returned from Google sign-in');
      }

      const authUser: AuthUser = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        emailVerified: user.emailVerified,
      };

      return authUser;
    } catch (error) {
      this.logger.error('Google sign-in error:', error);
      throw error;
    }
  }

  // Sign in with email and password
  async signInWithEmail(email: string, password: string): Promise<AuthUser> {
    try {
      const user = await this.firebaseService.signInWithEmail(email, password);

      const authUser: AuthUser = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        emailVerified: user.emailVerified,
      };

      return authUser;
    } catch (error) {
      this.logger.error('Email sign-in error:', error);
      throw error;
    }
  }

  // Sign up with email and password
  async signUpWithEmail(email: string, password: string): Promise<AuthUser> {
    try {
      const user = await this.firebaseService.signUpWithEmail(email, password);

      const authUser: AuthUser = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        emailVerified: user.emailVerified,
      };

      return authUser;
    } catch (error) {
      this.logger.error('Email sign-up error:', error);
      throw error;
    }
  }

  // Sign out
  async signOut(): Promise<void> {
    try {
      await this.firebaseService.signOut();
      this.clearAuthToken();
      // Navigate to home page after successful logout
      await this.router.navigate(['/']);
    } catch (error) {
      this.logger.error('Sign out error:', error);
      throw error;
    }
  }

  // Get current user
  getCurrentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  // Get user profile
  getUserProfile(): UserProfile | null {
    return this.userProfileSubject.value;
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return this.currentUserSubject.value !== null;
  }

  // Get ID token for API calls
  async getIdToken(): Promise<string | null> {
    const auth = this.firebaseService.getAuth();
    const user = auth.currentUser;

    if (user) {
      return await user.getIdToken();
    }

    return null;
  }

  // Load user profile from backend
  async loadUserProfile(): Promise<void> {
    try {
      const token = await this.getIdToken();
      if (!token) {
        this.logger.warn('No auth token available to load user profile');
        return;
      }

      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      });

      // Try to fetch subscription status from backend
      try {
        const subscriptionData = await this.http
          .get<any>(`${environment.apiUrl}/api/stripe/subscription-status`, { headers })
          .toPromise();

        const currentUser = this.getCurrentUser();
        if (currentUser && subscriptionData) {
          const userProfile: UserProfile = {
            id: currentUser.uid,
            email: currentUser.email || '',
            displayName: currentUser.displayName || '',
            subscriptionTier: subscriptionData.subscriptionTier || 'free',
            subscriptionStatus: subscriptionData.subscriptionStatus || 'inactive',
            tokenBalance: subscriptionData.tokenBalance || 100000,
            dailyTokensUsed: subscriptionData.tokensUsed || 0,
            createdAt: subscriptionData.createdAt || new Date().toISOString(),
            updatedAt: subscriptionData.updatedAt || new Date().toISOString(),
            stripeCustomerId: subscriptionData.stripeCustomerId,
            stripeSubscriptionId: subscriptionData.stripeSubscriptionId,
            currentPeriodEnd: subscriptionData.currentPeriodEnd,
            cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd,
          };

          this.userProfileSubject.next(userProfile);
        }
      } catch (apiError) {
        // If API call fails, create a default profile
        this.logger.warn('Failed to fetch subscription status, using default profile:', apiError);

        const currentUser = this.getCurrentUser();
        if (currentUser) {
          const defaultProfile: UserProfile = {
            id: currentUser.uid,
            email: currentUser.email || '',
            displayName: currentUser.displayName || '',
            subscriptionTier: 'free',
            subscriptionStatus: 'active',
            tokenBalance: 100000,
            dailyTokensUsed: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          this.userProfileSubject.next(defaultProfile);
        }
      }
    } catch (error) {
      this.logger.error('Error loading user profile:', error);
    }
  }

  // Update subscription information
  updateSubscriptionInfo(subscriptionData: any): void {
    const currentProfile = this.userProfileSubject.value;
    if (currentProfile) {
      const updatedProfile: UserProfile = {
        ...currentProfile,
        subscriptionTier: subscriptionData.subscriptionTier || currentProfile.subscriptionTier,
        subscriptionStatus: subscriptionData.subscriptionStatus || currentProfile.subscriptionStatus,
        stripeCustomerId: subscriptionData.stripeCustomerId || currentProfile.stripeCustomerId,
        stripeSubscriptionId: subscriptionData.stripeSubscriptionId || currentProfile.stripeSubscriptionId,
        currentPeriodEnd: subscriptionData.currentPeriodEnd || currentProfile.currentPeriodEnd,
        cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd ?? currentProfile.cancelAtPeriodEnd,
      };
      this.userProfileSubject.next(updatedProfile);
    }
  }

  // Set auth token for API calls
  private setAuthToken(token: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  // Clear auth token
  private clearAuthToken(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  // Get stored auth token
  getStoredAuthToken(): string | null {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('auth_token');
    }
    return null;
  }
}