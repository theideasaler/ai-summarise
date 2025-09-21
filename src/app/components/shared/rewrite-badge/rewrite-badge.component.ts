import { Component, ViewChild, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltip, MatTooltipModule } from '@angular/material/tooltip';
import { Platform } from '@angular/cdk/platform';

@Component({
  selector: 'app-rewrite-badge',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  templateUrl: './rewrite-badge.component.html',
  styleUrls: ['./rewrite-badge.component.scss'],
})
export class RewriteBadgeComponent implements OnInit {
  @ViewChild(MatTooltip) private tooltipRef?: MatTooltip;

  private readonly platform = inject(Platform);
  protected isTouchDevice = false;

  ngOnInit(): void {
    // Detect touch device using multiple methods for better compatibility
    this.isTouchDevice = this._isTouchDevice();
  }

  get badgeText(): string {
    return 'Has Rewrite';
  }

  get tooltipText(): string {
    return 'Summary has been rewritten';
  }

  onBadgeClick(event: Event): void {
    // Always stop propagation to prevent parent click
    event.stopPropagation();

    // Only toggle tooltip on touch devices
    // Desktop users will use hover instead
    if (this.isTouchDevice) {
      event.preventDefault();
      if (this.tooltipRef) {
        this.tooltipRef.toggle();
      }
    }
  }

  private _isTouchDevice(): boolean {
    // Check using Angular CDK Platform service
    if (this.platform.IOS || this.platform.ANDROID) {
      return true;
    }

    // Fallback to checking for touch support
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches
    );
  }
}
