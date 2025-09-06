import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DrawerService {
  // Mobile drawer state (open/close for mobile overlay)
  private mobileDrawerOpenSubject = new BehaviorSubject<boolean>(false);
  public mobileDrawerOpen$ = this.mobileDrawerOpenSubject.asObservable();
  
  // Desktop drawer state (collapse/expand for desktop sidebar)
  private desktopDrawerCollapsedSubject = new BehaviorSubject<boolean>(false);
  public desktopDrawerCollapsed$ = this.desktopDrawerCollapsedSubject.asObservable();

  constructor() {}

  // Mobile drawer methods
  toggleMobile(): void {
    this.mobileDrawerOpenSubject.next(!this.mobileDrawerOpenSubject.value);
  }

  openMobile(): void {
    this.mobileDrawerOpenSubject.next(true);
  }

  closeMobile(): void {
    this.mobileDrawerOpenSubject.next(false);
  }

  // Desktop drawer methods
  toggleDesktopCollapse(): void {
    this.desktopDrawerCollapsedSubject.next(!this.desktopDrawerCollapsedSubject.value);
  }

  collapseDesktop(): void {
    this.desktopDrawerCollapsedSubject.next(true);
  }

  expandDesktop(): void {
    this.desktopDrawerCollapsedSubject.next(false);
  }

  // Getters
  get isMobileOpen(): boolean {
    return this.mobileDrawerOpenSubject.value;
  }

  get isDesktopCollapsed(): boolean {
    return this.desktopDrawerCollapsedSubject.value;
  }

  // Legacy methods for backward compatibility (will be deprecated)
  toggle(): void {
    this.toggleMobile();
  }

  open(): void {
    this.openMobile();
  }

  close(): void {
    this.closeMobile();
  }

  toggleCollapse(): void {
    this.toggleDesktopCollapse();
  }

  collapse(): void {
    this.collapseDesktop();
  }

  expand(): void {
    this.expandDesktop();
  }

  get isOpen(): boolean {
    return this.isMobileOpen;
  }

  get isCollapsed(): boolean {
    return this.isDesktopCollapsed;
  }

  // Legacy observables for backward compatibility (will be deprecated)
  public isOpen$ = this.mobileDrawerOpen$;
  public isCollapsed$ = this.desktopDrawerCollapsed$;
}