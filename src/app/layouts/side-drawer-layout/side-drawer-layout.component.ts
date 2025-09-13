import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BehaviorSubject, combineLatest, Observable, Subject } from 'rxjs';
import { map, takeUntil, filter } from 'rxjs/operators';
import { MobileDrawerToggleComponent } from '../../components/mobile-drawer-toggle/mobile-drawer-toggle.component';
import { SideDrawerComponent } from '../../components/side-drawer/side-drawer.component';
import { DrawerService } from '../../services/drawer.service';
import { AuthService } from '../../services/auth.service';
import { TokenService } from '../../services/token.service';

@Component({
  selector: 'app-side-drawer-layout',
  imports: [
    CommonModule,
    RouterOutlet,
    SideDrawerComponent,
    MobileDrawerToggleComponent,
  ],
  templateUrl: './side-drawer-layout.component.html',
  styleUrl: './side-drawer-layout.component.scss',
})
export class SideDrawerLayoutComponent implements OnInit, OnDestroy {
  isDesktopDrawerCollapsed$: Observable<boolean>;
  isMobileDrawerOpen$: Observable<boolean>;
  isMobileScreen: boolean = false;
  private isMobileScreen$ = new BehaviorSubject<boolean>(false);
  private destroy$ = new Subject<void>();

  // Computed observable for main content CSS classes
  mainContentClasses$: Observable<string>;

  constructor(
    private drawerService: DrawerService,
    private authService: AuthService,
    private tokenService: TokenService
  ) {
    this.isDesktopDrawerCollapsed$ = this.drawerService.desktopDrawerCollapsed$;
    this.isMobileDrawerOpen$ = this.drawerService.mobileDrawerOpen$;

    // Initialize screen size
    this.checkScreenSize();

    // Create computed observable for CSS classes
    this.mainContentClasses$ = combineLatest([
      this.isDesktopDrawerCollapsed$,
      this.isMobileDrawerOpen$,
      this.isMobileScreen$,
    ]).pipe(
      map(([isCollapsed, isMobileOpen, isMobile]) => {
        const classes = [];
        if (!isMobile && isCollapsed) {
          classes.push('drawer-collapsed');
        }
        if (isMobile && isMobileOpen) {
          classes.push('drawer-mobile-open');
        }
        return classes.join(' ');
      })
    );
  }

  ngOnInit(): void {
    // Initialize tokens when a user is authenticated
    this.authService.currentUser$
      .pipe(
        filter(user => user !== null),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        // Initialize token service to fetch token info when user is authenticated
        this.tokenService.initialize();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:resize', ['$event'])
  onResize(): void {
    this.checkScreenSize();
  }

  private checkScreenSize(): void {
    const isMobile = window.innerWidth <= 768;
    if (this.isMobileScreen !== isMobile) {
      this.isMobileScreen = isMobile;
      this.isMobileScreen$.next(isMobile);
    }
  }
}
