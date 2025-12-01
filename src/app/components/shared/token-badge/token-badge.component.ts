import { Component, Input, ViewChild, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltip, MatTooltipModule } from '@angular/material/tooltip';
import { Platform } from '@angular/cdk/platform';

@Component({
  selector: 'app-token-badge',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  templateUrl: './token-badge.component.html',
  styleUrls: ['./token-badge.component.scss'],
})
export class TokenBadgeComponent implements OnInit {
  @Input() tokensCount: number | null | undefined = null;
  @Input() isEstimation = false;
  @Input() tooltip?: string;

  @ViewChild(MatTooltip) private tooltipRef?: MatTooltip;

  private readonly platform = inject(Platform);
  protected isTouchDevice = false;

  private readonly estimatedTooltipText =
    'This is an estimated token count. Actual token usage may vary depending on content complexity and processing requirements.';

  ngOnInit(): void {
    // Detect touch device using multiple methods for better compatibility
    this.isTouchDevice = this._isTouchDevice();
  }

  get shouldDisplay(): boolean {
    return !!this.tokensCount && this.tokensCount > 0;
  }

  get tokenText(): string {
    if (!this.shouldDisplay) {
      return '';
    }
    return `${this.formatTokens(this.tokensCount!)} tokens`;
  }

  get ariaLabel(): string {
    if (!this.shouldDisplay) {
      return '';
    }

    return this.isEstimation ? `${this.tokenText} (estimated)` : this.tokenText;
  }

  get tooltipText(): string {
    if (this.tooltip && this.tooltip.trim().length > 0) {
      return this.tooltip;
    }

    return this.isEstimation ? this.estimatedTooltipText : '';
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
    return 'ontouchstart' in window ||
           navigator.maxTouchPoints > 0 ||
           window.matchMedia('(pointer: coarse)').matches;
  }

  private formatTokens(tokens: number): string {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`;
    }

    if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(1)}K`;
    }

    return tokens.toString();
  }
}
