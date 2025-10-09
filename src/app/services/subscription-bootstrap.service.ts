import { Injectable } from '@angular/core';
import { distinctUntilChanged, switchMap, of } from "rxjs";
import { AuthService, AuthUser } from './auth.service';
import { StripeService } from './stripe.service';
import { TokenService } from './token.service';
import { LoggerService } from './logger.service';

@Injectable({ providedIn: 'root' })
export class SubscriptionBootstrapService {
  constructor(
    private authService: AuthService,
    private stripeService: StripeService,
    private tokenService: TokenService,
    private logger: LoggerService
  ) {
    this._listenForAuthChanges();
  }

  private _listenForAuthChanges(): void {
    this.authService.currentUser$
      .pipe(
        distinctUntilChanged((prev, curr) => this._sameUser(prev, curr)),
        switchMap((user) => {
          if (!user) {
            this.logger.log('SubscriptionBootstrap: user signed out, clearing caches');
            this.stripeService.clearSubscriptionStatus();
            this.tokenService.clear();
            return of(null);
          }

          this.logger.log('SubscriptionBootstrap: refreshing subscription status for user', user.uid);
          this.tokenService.initialize();
          return of(user);
        })
      )
      .subscribe({
        next: async (user) => {
          if (!user) {
            return;
          }

          try {
            await this.stripeService.getSubscriptionStatus();
            await this.tokenService.fetchTokenInfo();
          } catch (error: any) {
            this.logger.warn('SubscriptionBootstrap: failed to refresh status', error?.message || error);
          }
        },
        error: (error) => {
          this.logger.error('SubscriptionBootstrap: listener error', error);
        },
      });
  }

  private _sameUser(a: AuthUser | null, b: AuthUser | null): boolean {
    if (!a && !b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.uid === b.uid;
  }
}
