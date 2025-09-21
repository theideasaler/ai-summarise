import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { map, take, switchMap, filter } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { ContentObserver } from '@angular/cdk/observers';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(): Observable<boolean | UrlTree> {
    return this.authService.isLoading$.pipe(
      filter((isLoading) => !isLoading), // Wait until loading is complete
      take(1),
      switchMap(() => {
        return this.authService.currentUser$.pipe(
          take(1),
          map((user) => {
            if (user) {
              return true;
            } else {
              // Return UrlTree instead of navigating for cleaner SSR/CSR behavior
              return this.router.createUrlTree(['/login']);
            }
          })
        );
      })
    );
  }
}