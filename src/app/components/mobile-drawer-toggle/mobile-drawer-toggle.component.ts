import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { DrawerService } from '../../services/drawer.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-mobile-drawer-toggle',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './mobile-drawer-toggle.component.html',
  styleUrl: './mobile-drawer-toggle.component.scss'
})
export class MobileDrawerToggleComponent {
  isMobileDrawerOpen$: Observable<boolean>;
  // Legacy observable for backward compatibility
  isDrawerOpen$: Observable<boolean>;

  constructor(private drawerService: DrawerService) {
    this.isMobileDrawerOpen$ = this.drawerService.mobileDrawerOpen$;
    // Legacy observable for backward compatibility
    this.isDrawerOpen$ = this.drawerService.isOpen$;
  }

  toggleMobileDrawer(): void {
    this.drawerService.toggleMobile();
  }

  // Legacy method for backward compatibility
  toggleDrawer(): void {
    this.drawerService.toggle();
  }
}