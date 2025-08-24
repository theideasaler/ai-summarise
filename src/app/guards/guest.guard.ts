import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { map, take, filter, switchMap } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class GuestGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(): Observable<boolean | UrlTree> {
    return this.authService.isLoading$.pipe(
      filter((isLoading) => !isLoading), // Wait until loading is complete
      take(1),
      switchMap(() => this.authService.currentUser$),
      take(1),
      map((user) => {
        if (user) {
          // Return UrlTree to redirect logged-in users without imperative navigation
          return this.router.createUrlTree(['/']);
        } else {
          // User is not logged in, allow access to login/signup pages
          return true;
        }
      })
    );
  }
}