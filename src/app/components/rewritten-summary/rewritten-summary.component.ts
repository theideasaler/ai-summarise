import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DecimalPipe, NgIf } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';
import { TokenBadgeComponent } from '../shared/token-badge/token-badge.component';

export interface RewrittenSummaryData {
  rewrittenSummary: string;
  tokensUsed: number;
  processingTime: number;
  requestId: string;
  originalRequestId: string;
}

@Component({
  selector: 'app-rewritten-summary',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    NgIf,
    DecimalPipe,
    TokenBadgeComponent,
  ],
  templateUrl: './rewritten-summary.component.html',
  styleUrl: './rewritten-summary.component.scss',
  animations: [
    trigger('slideInOut', [
      transition(':enter', [
        style({ transform: 'translateY(100%)', opacity: 0 }),
        animate(
          '300ms ease-out',
          style({ transform: 'translateY(0)', opacity: 1 })
        ),
      ]),
      transition(':leave', [
        animate(
          '300ms ease-in',
          style({ transform: 'translateY(100%)', opacity: 0 })
        ),
      ]),
    ]),
  ],
})
export class RewrittenSummaryComponent {
  @Input() rewrittenData: RewrittenSummaryData | null = null;
  @Input() isRewriting: boolean = false;
  @Input() isLoading: boolean = false;

  @Output() rewriteAgain = new EventEmitter<void>();
  @Output() clear = new EventEmitter<void>();
  @Output() copy = new EventEmitter<void>();

  copyButtonText = signal<string>('Copy');

  onRewriteAgain() {
    this.rewriteAgain.emit();
  }

  onClear() {
    this.clear.emit();
  }

  onCopy() {
    this.copy.emit();
    this.copyButtonText.set('Copied');
    // Reset button text after 2 seconds
    setTimeout(() => {
      this.copyButtonText.set('Copy');
    }, 2000);
  }
}
