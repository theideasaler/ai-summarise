import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ElementRef, ViewChild, HostListener, AfterViewInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, debounceTime } from 'rxjs';
import { LoggerService } from '../../services/logger.service';
import { TokenService } from '../../services/token.service';
import {
  ApiService,
  ImageSummariseRequest,
  SummariseResponse,
  RewriteRequest,
  ClientContext,
} from '../../services/api.service';
import { RewriteFineTuningComponent } from '../rewrite-fine-tuning/rewrite-fine-tuning.component';
import { RewrittenSummaryComponent } from '../rewritten-summary/rewritten-summary.component';
import { SummaryResultComponent } from '../summary-result/summary-result.component';
import { FileInfo, FileUploadComponent } from '../shared/file-upload/file-upload.component';
import { TokenBadgeComponent } from '../shared/token-badge/token-badge.component';

@Component({
  selector: 'app-image-summarise',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    FileUploadComponent,
    TokenBadgeComponent,
    SummaryResultComponent,
    RewriteFineTuningComponent,
    RewrittenSummaryComponent,
  ],
  templateUrl: './image-summarise.component.html',
  styleUrls: ['./image-summarise.component.scss'],
  animations: [
    trigger('slideInOut', [
      transition(':enter', [
        style({ transform: 'translateY(50%)', opacity: 0 }),
        animate(
          '300ms ease-out',
          style({ transform: 'translateY(calc(-100% - 10px))', opacity: 1 })
        ),
      ]),
      transition(':leave', [
        animate(
          '300ms ease-in',
          style({ transform: 'translateY(50%)', opacity: 0 })
        ),
      ]),
    ]),
  ],
})
export class ImageSummariseComponent implements OnInit, OnDestroy, AfterViewInit {
  private readonly destroy$ = new Subject<void>();
  private readonly fineTuningChanges$ = new Subject<void>();

  // State Management
  readonly selectedFile = signal<FileInfo | null>(null);
  readonly summaryResult = signal<SummariseResponse | null>(null);
  readonly rewrittenSummary = signal<SummariseResponse | null>(null);
  readonly isSubmitting = signal(false);
  readonly isLoadingSummary = signal(false);
  readonly isRegenerating = signal(false);
  readonly isRewriteLoading = signal(false);
  readonly isRegeneratingRewrite = signal(false);
  
  readonly submitError = signal<string | null>(null);
  readonly tokenCount = signal<number | null>(null);
  readonly isLoadingTokens = signal(false);
  
  // Project tracking
  readonly currentProjectId = signal<string | null>(null);
  readonly existingProjectId = signal<string | null>(null);
  
  // Fine-tuning
  readonly isFineTuningExpanded = signal(false);
  readonly customPrompt = signal<string>('');
  readonly showFineTuningInput = signal(false);
  
  // Rewrite
  readonly isRewriteFineTuningExpanded = signal(false);
  readonly customRewritePrompt = signal<string>('');
  private originalRewritePrompt: string | null = null;
  
  readonly copyButtonText = signal('Copy');
  readonly bottomSpaceHeight = signal(0);
  @ViewChild('inputCard') inputCardRef!: ElementRef<HTMLElement>;
  private resizeObserver?: ResizeObserver;
  
  // Computed
  readonly canSubmit = computed(() => {
    return this.selectedFile() !== null && !this.isSubmitting();
  });

  readonly hasCustomFineTuningConfig = computed(() => {
    return !!this.customPrompt();
  });
  
  readonly acceptedTypes = 'image/png,image/jpeg,image/webp,image/heic,image/heif';
  
  constructor(
    private apiService: ApiService,
    private tokenService: TokenService,
    private logger: LoggerService,
    private route: ActivatedRoute
  ) {}
  
  ngOnInit(): void {
    this._initializeFromQueryParams();
    // Debounce fine-tuning changes (1s) and re-estimate tokens
    this.fineTuningChanges$
      .pipe(debounceTime(1000), takeUntil(this.destroy$))
      .subscribe(() => {
        const file = this.selectedFile();
        if (file) {
          this._fetchTokenCount(file);
        }
      });
  }
  
  ngOnDestroy(): void {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewInit(): void {
    const el = this.inputCardRef?.nativeElement;
    if (el && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.bottomSpaceHeight.set(el.offsetHeight || 0);
      });
      this.resizeObserver.observe(el);
      setTimeout(() => this.bottomSpaceHeight.set(el.offsetHeight || 0));
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    const el = this.inputCardRef?.nativeElement;
    if (el) this.bottomSpaceHeight.set(el.offsetHeight || 0);
  }
  
  private _initializeFromQueryParams(): void {
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(_params => {
        // Handle any query params if needed
      });
  }
  
  onFilesSelected(files: FileInfo[]): void {
    if (files.length === 0) return;
    
    const file = files[0];
    this.selectedFile.set(file);
    
    // Reset fine-tuning if not expanded
    if (!this.isFineTuningExpanded()) {
      this.customPrompt.set('');
    }
    
    // Call API to get accurate token count
    this._fetchTokenCount(file);
  }
  
  onFileRemoved(): void {
    this.selectedFile.set(null);
    this.tokenCount.set(null);
    
    // Reset custom prompt if fine-tuning is collapsed
    if (!this.isFineTuningExpanded()) {
      this.customPrompt.set('');
    }
  }
  
  onSubmit(): void {
    if (!this.canSubmit()) return;
    
    const file = this.selectedFile();
    if (!file) return;
    
    this._clearErrors();
    // Reset cards to processing state like YouTube
    this.summaryResult.set(null);
    this.rewrittenSummary.set(null);
    this.isRewriteLoading.set(false);
    this.isRegeneratingRewrite.set(false);
    this.isSubmitting.set(true);
    this.isLoadingSummary.set(true);
    
    const request: ImageSummariseRequest = {
      file: file.file,
      customPrompt: this.customPrompt() || undefined,
    };
    
    this.apiService.summariseImage(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => this._handleSummarySuccess(response),
        error: (error) => this._handleApiError(error, 'Image analysis'),
      });
  }
  
  onRegenerateSummary(): void {
    if (!this.canSubmit()) return;
    
    const file = this.selectedFile();
    if (!file) return;
    
    this._clearErrors();
    this.isRegenerating.set(true);
    
    // Store existing project ID for regeneration
    if (this.currentProjectId()) {
      this.existingProjectId.set(this.currentProjectId());
    }
    
    // Build clientContext for regeneration
    const clientContext: ClientContext | undefined = this.existingProjectId() ? {
      intent: 'regenerate',
      existingProjectId: this.existingProjectId()!
    } : undefined;
    
    const request: ImageSummariseRequest = {
      file: file.file,
      customPrompt: this.customPrompt() || undefined,
      clientContext: clientContext,
    };
    
    this.apiService.summariseImage(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this._handleSummarySuccess(response);
          this.isRegenerating.set(false);
        },
        error: (error) => {
          this._handleApiError(error, 'Summary regeneration');
          this.isRegenerating.set(false);
        },
      });
  }
  
  onClearSummary(): void {
    this.summaryResult.set(null);
    this.rewrittenSummary.set(null);
    this._clearErrors();
  }
  
  onRewriteFineTuningExpandedChange(expanded: boolean): void {
    this.isRewriteFineTuningExpanded.set(expanded);
  }
  
  onRewriteFineTuningSubmit(customPrompt: string): void {
    const summary = this.summaryResult();
    if (!summary || !summary.requestId) return;
    
    this._clearErrors();
    this.isRewriteLoading.set(true);
    this.rewrittenSummary.set(null);
    
    this.originalRewritePrompt = customPrompt || '';
    this.customRewritePrompt.set(customPrompt || '');
    
    const request: RewriteRequest = {
      requestId: summary.requestId,
      customPrompt: customPrompt || '',
    };
    
    this.apiService.rewriteSummary(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => this._handleRewriteSuccess(response),
        error: (error) => this._handleApiError(error, 'Content rewrite'),
      });
  }
  
  onRewriteAgain(): void {
    const summary = this.summaryResult();
    if (!summary || !summary.requestId) return;
    
    this._clearErrors();
    this.isRegeneratingRewrite.set(true);
    
    const promptToUse = this.originalRewritePrompt || '';
    
    const request: RewriteRequest = {
      requestId: summary.requestId,
      customPrompt: promptToUse,
    };
    
    this.apiService.rewriteSummary(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this._handleRewriteSuccess(response);
          this.isRegeneratingRewrite.set(false);
        },
        error: (error) => {
          this._handleApiError(error, 'Rewrite regeneration');
          this.isRegeneratingRewrite.set(false);
        },
      });
  }
  
  onClearRewrittenSummary(): void {
    this.rewrittenSummary.set(null);
    this.isRewriteFineTuningExpanded.set(false);
    this.originalRewritePrompt = null;
  }
  
  onCustomPromptSaved(prompt: string): void {
    this.customRewritePrompt.set(prompt);
  }
  
  toggleFineTuning(): void {
    this.isFineTuningExpanded.set(!this.isFineTuningExpanded());
  }

  onFineTuningInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.customPrompt.set(target.value);
    this.isLoadingTokens.set(true);
    this.tokenCount.set(null);
    this.fineTuningChanges$.next();
  }
  
  onFineTuningSubmit(customPrompt: string): void {
    this.customPrompt.set(customPrompt);
    this.showFineTuningInput.set(false);
    
    // Refetch token count with new custom prompt
    const file = this.selectedFile();
    if (file) {
      this._fetchTokenCount(file);
    }
  }
  
  onFineTuningCancel(): void {
    this.showFineTuningInput.set(false);
  }
  
  copySummary(): void {
    const summary = this.summaryResult()?.summary;
    if (summary) {
      this._copyToClipboard(summary);
    }
  }
  
  copyRewrittenSummary(): void {
    const rewritten = this.rewrittenSummary()?.summary;
    if (rewritten) {
      this._copyToClipboard(rewritten);
    }
  }
  
  getRewrittenSummaryData(): any {
    const rewritten = this.rewrittenSummary();
    if (!rewritten) return null;
    
    return {
      rewrittenSummary: rewritten.summary || '',
      originalRequestId: rewritten.requestId || '',
      tokensUsed: rewritten.tokensUsed,
      processingTime: rewritten.processingTime,
    };
  }
  
  private _handleSummarySuccess(response: SummariseResponse): void {
    this.logger.log('Image analysis successful:', response);
    this.summaryResult.set(response);
    this.isSubmitting.set(false);
    this.isLoadingSummary.set(false);
    
    // Store project ID if present
    if (response.projectId) {
      this.currentProjectId.set(response.projectId);
      this.existingProjectId.set(response.projectId);
    }
    
    // Refresh token info
    this.tokenService.fetchTokenInfo();
  }
  
  private _handleRewriteSuccess(response: any): void {
    this.logger.log('Content rewrite successful:', response);
    const summaryResponse: SummariseResponse = {
      summary: response.summary,
      tokensUsed: response.tokensUsed,
      processingTime: response.processingTime,
      requestId: response.requestId,
    };
    this.rewrittenSummary.set(summaryResponse);
    this.isRewriteLoading.set(false);
    
    // Refresh token info
    this.tokenService.fetchTokenInfo();
  }
  
  private _handleApiError(error: any, context: string): void {
    this.logger.error(`${context} failed:`, error);
    const errorMessage = this._extractErrorMessage(error);
    this.submitError.set(errorMessage);
    
    // Reset loading states
    this.isSubmitting.set(false);
    this.isLoadingSummary.set(false);
    this.isRegenerating.set(false);
    this.isRewriteLoading.set(false);
    this.isRegeneratingRewrite.set(false);
  }
  
  private _extractErrorMessage(error: any): string {
    if (error?.error?.error && typeof error.error.error === 'string') {
      return error.error.error;
    }
    if (error?.error?.message) {
      return error.error.message;
    }
    if (error?.message) {
      return error.message;
    }
    return 'An error occurred. Please try again.';
  }
  
  private _clearErrors(): void {
    this.submitError.set(null);
  }
  
  private _copyToClipboard(text: string): void {
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).clipboard?.writeText) {
        (navigator as any).clipboard.writeText(text)
          .then(() => {
            this.logger.log('Content copied to clipboard');
            this.copyButtonText.set('Copied!');
            setTimeout(() => this.copyButtonText.set('Copy'), 2000);
          })
          .catch((err: any) => {
            this.logger.warn('Clipboard API failed, falling back:', err);
            this._fallbackCopy(text);
          });
      } else {
        this._fallbackCopy(text);
      }
    } catch (err) {
      this.logger.error('Copy to clipboard error:', err);
      this._fallbackCopy(text);
    }
  }

  private _fallbackCopy(text: string): void {
    try {
      // Create a textarea element for copying
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      try {
        const successful = document.execCommand('copy');
        if (successful) {
          this.logger.log('Content copied using fallback method');
          this.copyButtonText.set('Copied!');
          setTimeout(() => this.copyButtonText.set('Copy'), 2000);
        } else {
          this.logger.warn('Fallback copy failed');
          // Silently fail - user can still use Ctrl/Cmd+C manually
        }
      } catch (err) {
        this.logger.error('execCommand copy failed:', err);
      }

      document.body.removeChild(textarea);
    } catch (fallbackErr) {
      this.logger.error('Fallback copy error:', fallbackErr);
    }
  }

  private _fetchTokenCount(file: FileInfo): void {
    this.isLoadingTokens.set(true);
    this.tokenCount.set(null);
    
    const request = {
      file: file.file,
      customPrompt: this.customPrompt() || undefined,
    };
    
    this.apiService.countImageTokens(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.tokenCount.set(response.totalTokens);
          this.isLoadingTokens.set(false);
        },
        error: (error) => {
          this.logger.error('Failed to fetch token count:', error);
          // Set a fallback estimate if API fails
          this.tokenCount.set(1500);
          this.isLoadingTokens.set(false);
        },
      });
  }
}
