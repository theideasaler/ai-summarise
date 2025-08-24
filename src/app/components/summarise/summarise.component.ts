import { Component, OnInit } from '@angular/core';
import { RouterOutlet, Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { MatChipsModule, MatChipListboxChange } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { SideDrawerComponent } from '../side-drawer/side-drawer.component';
import { SummariseOptionsComponent } from './summarise-options/summarise-options.component';
import { MobileDrawerToggleComponent } from '../mobile-drawer-toggle/mobile-drawer-toggle.component';
import { DrawerService } from '../../services/drawer.service';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-summarise',
  imports: [RouterOutlet, MatChipsModule, MatIconModule, SideDrawerComponent, SummariseOptionsComponent, MobileDrawerToggleComponent, CommonModule],
  templateUrl: './summarise.component.html',
  styleUrl: './summarise.component.scss'
})
export class SummariseComponent implements OnInit {
  selectedToggle: string = 'text';
  showOptions: boolean = true;
  isMobileDrawerOpen$: Observable<boolean>;
  isDesktopDrawerCollapsed$: Observable<boolean>;
  // Legacy observable for backward compatibility
  isDrawerOpen$: Observable<boolean>;

  constructor(
    private router: Router, 
    private route: ActivatedRoute,
    private drawerService: DrawerService
  ) {
    this.isMobileDrawerOpen$ = this.drawerService.mobileDrawerOpen$;
    this.isDesktopDrawerCollapsed$ = this.drawerService.desktopDrawerCollapsed$;
    // Legacy observable for backward compatibility
    this.isDrawerOpen$ = this.drawerService.isOpen$;
  }

  ngOnInit() {
    // Check if we're on the base summarise route
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.showOptions = event.url === '/summarise';
    });

    // Set initial state
    this.showOptions = this.router.url === '/summarise';

    // Get the current route to set the active toggle
    this.route.firstChild?.url.subscribe(urlSegments => {
      if (urlSegments && urlSegments.length > 0) {
        this.selectedToggle = urlSegments[0].path;
      }
    });
  }

  onChipChange(event: MatChipListboxChange) {
    this.router.navigate(['/summarise', event.value]);
  }

  closeMobileDrawer(): void {
    this.drawerService.closeMobile();
  }

  // Legacy method for backward compatibility
  closeDrawer(): void {
    this.drawerService.close();
  }
}
