import { Component, OnInit } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './components/header/header.component';
import { AuthService } from './services/auth.service';
import { Observable, combineLatest } from 'rxjs';
import { filter, map, startWith } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  isLoading$: Observable<boolean>;
  showHeader$: Observable<boolean>;
  shouldShowContent$: Observable<boolean>;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {
    this.isLoading$ = this.authService.isLoading$;
    this.showHeader$ = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map((event: NavigationEnd) => !event.url.startsWith('/summarise')),
      startWith(!this.router.url.startsWith('/summarise'))
    );
    
    // Only show content when auth state is fully initialized
    this.shouldShowContent$ = combineLatest([
      this.authService.isLoading$,
      this.router.events.pipe(
        filter(event => event instanceof NavigationEnd),
        map((event: NavigationEnd) => event.url),
        startWith(this.router.url)
      ),
      this.authService.currentUser$
    ]).pipe(
      map(([isLoading, currentUrl, user]) => {
        // Always show content when not loading
        if (!isLoading) {
          return true;
        }
        
        // During loading, only show content for non-auth routes if user is authenticated
        // This prevents the flash of login UI when refreshing protected pages
        if (isLoading && user && (currentUrl.startsWith('/summarise') || currentUrl === '/')) {
          return true;
        }
        
        // Show content for public routes during loading
        if (isLoading && !currentUrl.startsWith('/login') && !currentUrl.startsWith('/signup')) {
          return true;
        }
        
        return false;
      })
    );
  }

  ngOnInit(): void {
    // Component initialization
  }
}
