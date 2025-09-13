import { Component, OnInit, HostListener } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService, AuthUser } from '../../services/auth.service';
import { DrawerService } from '../../services/drawer.service';
import { TokenService } from '../../services/token.service';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';
import { Observable, combineLatest, BehaviorSubject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { toObservable } from '@angular/core/rxjs-interop';
import { MatTooltipModule } from '@angular/material/tooltip';

interface NavigationItem {
  id: string;
  label: string;
  description: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-side-drawer',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    UserAvatarComponent,
    MatTooltipModule,
  ],
  templateUrl: './side-drawer.component.html',
  styleUrl: './side-drawer.component.scss',
})
export class SideDrawerComponent implements OnInit {
  currentUser$: Observable<AuthUser | null>;
  activeRoute: string = '';
  // Mobile drawer state (for overlay behavior)
  isMobileDrawerOpen$: Observable<boolean>;
  // Desktop drawer state (for collapse/expand behavior)
  isDesktopDrawerCollapsed$: Observable<boolean>;
  // Computed observable for showing text (shows on mobile regardless of desktop collapsed state)
  shouldShowText$: Observable<boolean>;
  // Screen size tracking
  isMobileScreen: boolean = false;
  private isMobileScreen$ = new BehaviorSubject<boolean>(false);
  // Token information
  remainingTokens$: Observable<number | null>;

  // Computed observables for proper class management
  shouldShowOpenClass$: Observable<boolean>;
  shouldShowCollapsedClass$: Observable<boolean>;

  // Legacy observables for backward compatibility
  isDrawerOpen$: Observable<boolean>;
  isDrawerCollapsed$: Observable<boolean>;

  navigationItems: NavigationItem[] = [
    {
      id: 'summarise',
      label: 'Summarise',
      description: 'Summarise various content types',
      icon: 'summarize',
      route: '/summarise',
    },
    {
      id: 'projects',
      label: 'Projects',
      description: 'Manage your summarisation projects',
      icon: 'folder',
      route: '/projects',
    },
  ];

  constructor(
    private router: Router,
    private authService: AuthService,
    private drawerService: DrawerService,
    private tokenService: TokenService
  ) {
    this.currentUser$ = this.authService.currentUser$;
    this.remainingTokens$ = toObservable(this.tokenService.remainingTokens);
    // New separate state observables
    this.isMobileDrawerOpen$ = this.drawerService.mobileDrawerOpen$;
    this.isDesktopDrawerCollapsed$ = this.drawerService.desktopDrawerCollapsed$;

    // Initialize screen size
    this.checkScreenSize();

    // Create computed observables for proper class management using combineLatest
    // 'open' class should only be applied on mobile when drawer is open
    this.shouldShowOpenClass$ = combineLatest([
      this.isMobileDrawerOpen$,
      this.isMobileScreen$,
    ]).pipe(map(([isOpen, isMobile]) => isMobile && isOpen));

    // 'collapsed' class should only be applied on desktop when drawer is collapsed
    this.shouldShowCollapsedClass$ = combineLatest([
      this.isDesktopDrawerCollapsed$,
      this.isMobileScreen$,
    ]).pipe(map(([isCollapsed, isMobile]) => !isMobile && isCollapsed));

    // Create computed observable for showing text using combineLatest
    // Show text on mobile OR when desktop is not collapsed
    this.shouldShowText$ = combineLatest([
      this.isDesktopDrawerCollapsed$,
      this.isMobileScreen$,
    ]).pipe(
      map(([isCollapsed, isMobile]) => {
        // Always show text on mobile screens
        if (isMobile) {
          return true;
        }
        // On desktop, only show text when not collapsed
        return !isCollapsed;
      })
    );

    // Legacy observables for backward compatibility
    this.isDrawerOpen$ = this.drawerService.isOpen$;
    this.isDrawerCollapsed$ = this.drawerService.isCollapsed$;
  }

  ngOnInit(): void {
    // Set initial active route
    this.activeRoute = this.router.url;

    // Listen to route changes
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.activeRoute = event.url;
        
        // Auto-close mobile drawer on navigation completion
        if (this.isMobileScreen && this.drawerService.isMobileOpen) {
          this.drawerService.closeMobile();
        }
      });

    // Token service will be initialized by components that need it
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any): void {
    this.checkScreenSize();
    // The computed observables will automatically update via combineLatest
  }

  private checkScreenSize(): void {
    this.isMobileScreen = window.innerWidth <= 768;
    this.isMobileScreen$.next(this.isMobileScreen);
  }

  // Mobile drawer methods
  closeMobileDrawer(): void {
    this.drawerService.closeMobile();
  }

  toggleMobileDrawer(): void {
    this.drawerService.toggleMobile();
  }

  // Desktop drawer methods
  toggleDesktopCollapse(): void {
    this.drawerService.toggleDesktopCollapse();
  }

  // Legacy methods for backward compatibility
  closeDrawer(): void {
    this.drawerService.close();
  }

  toggleCollapse(): void {
    this.drawerService.toggleCollapse();
  }

  isActive(route: string): boolean {
    return this.activeRoute === route;
  }

  navigateTo(route: string): void {
    this.router.navigate([route]);
  }

  signOut(): void {
    this.authService.signOut();
  }

  onSignOut(): void {
    this.authService.signOut();
    this.router.navigate(['/']);
  }
}
