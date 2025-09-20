import { Component, Input, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltip, MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-token-badge',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  templateUrl: './token-badge.component.html',
  styleUrls: ['./token-badge.component.scss'],
})
export class TokenBadgeComponent {
  @Input() tokensCount: number | null | undefined = null;
  @Input() isEstimation = false;
  @Input() tooltip?: string;

  @ViewChild(MatTooltip) private tooltipRef?: MatTooltip;

  private readonly defaultTooltipText =
    'This is an estimated token count. Actual token usage may vary depending on content complexity and processing requirements.';

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
    return this.tooltip && this.tooltip.trim().length > 0
      ? this.tooltip
      : this.defaultTooltipText;
  }

  onBadgeClick(): void {
    this.tooltipRef?.toggle();
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
