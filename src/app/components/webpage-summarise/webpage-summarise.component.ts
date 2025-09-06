import { CommonModule, DecimalPipe } from '@angular/common';
import { animate, style, transition, trigger } from '@angular/animations';
import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, debounceTime, distinctUntilChanged, filter, startWith, map } from 'rxjs';
import { ElementRef, ViewChild, HostListener, AfterViewInit } from '@angular/core';
import { LoggerService } from '../../services/logger.service';
import { TokenService } from '../../services/token.service';
import {
  ApiService,
  WebpageSummariseRequest,
  SummariseResponse,
  RewriteRequest,
} from '../../services/api.service';
import { RewriteFineTuningComponent } from '../rewrite-fine-tuning/rewrite-fine-tuning.component';
import { RewrittenSummaryComponent } from '../rewritten-summary/rewritten-summary.component';
import { SummaryResultComponent } from '../summary-result/summary-result.component';

@Component({
  selector: 'app-webpage-summarise',
  standalone: true,
  imports: [
    CommonModule,
    DecimalPipe,
    ReactiveFormsModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatInputModule,
    MatFormFieldModule,
    SummaryResultComponent,
    RewriteFineTuningComponent,
    RewrittenSummaryComponent,
  ],
  templateUrl: './webpage-summarise.component.html',
  styleUrls: ['./webpage-summarise.component.scss'],
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
export class WebpageSummariseComponent implements OnInit, OnDestroy, AfterViewInit {
  private readonly destroy$ = new Subject<void>();

  // State Management
  readonly urlControl = new FormControl('', [
    Validators.required,
    Validators.pattern(
      /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/
    ),
  ]);
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

  // Fine-tuning
  readonly isFineTuningExpanded = signal(false);
  readonly customPrompt = signal<string>('');
  readonly showFineTuningInput = signal(false);

  // Rewrite
  readonly isRewriteFineTuningExpanded = signal(false);
  readonly customRewritePrompt = signal<string>('');
  private originalRewritePrompt: string | null = null;
  private originalUrl: string | null = null;
  private originalCustomPrompt: string | null = null;
  private readonly fineTuningChanges$ = new Subject<void>();
  readonly bottomSpaceHeight = signal(0);
  @ViewChild('inputCard') inputCardRef!: ElementRef<HTMLElement>;
  private resizeObserver?: ResizeObserver;

  readonly copyButtonText = signal('Copy');

  // ReactiveForms -> Signals bridge
  readonly urlValueSig = toSignal(
    this.urlControl.valueChanges.pipe(startWith(this.urlControl.value || '')),
    { initialValue: this.urlControl.value || '' }
  );
  readonly urlValidSig = toSignal(
    this.urlControl.statusChanges.pipe(
      map((status) => status === 'VALID'),
      startWith(this.urlControl.valid)
    ),
    { initialValue: this.urlControl.valid }
  );

  // Computed
  readonly canSubmit = computed(() => {
    const url = (this.urlValueSig() || '') as string;
    return this.urlValidSig() && !!url && !this.isSubmitting();
  });

  readonly hasCustomFineTuningConfig = computed(() => {
    return !!this.customPrompt();
  });

  constructor(
    private apiService: ApiService,
    private tokenService: TokenService,
    private logger: LoggerService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this._initializeFromQueryParams();
    this._setupUrlListener();
    // Debounce fine-tuning changes (1s) and retrigger token counting
    this.fineTuningChanges$
      .pipe(debounceTime(1000), takeUntil(this.destroy$))
      .subscribe(() => {
        this._countTokens();
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
      .subscribe((_params) => {
        // Handle any query params if needed
      });
  }

  private _setupUrlListener(): void {
    this.urlControl.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(500),
        distinctUntilChanged(),
        filter(() => this.isValidUrl())
      )
      .subscribe(() => {
        this._countTokens();
      });
  }

  private _countTokens(): void {
    if (!this.isValidUrl()) {
      this.tokenCount.set(null);
      return;
    }

    const url = this.urlControl.value;
    if (!url) return;

    this.isLoadingTokens.set(true);

    const request: WebpageSummariseRequest = {
      url: url,
      customPrompt: this.customPrompt() || undefined,
    };

    this.apiService
      .countWebpageTokens(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.tokenCount.set(response.totalTokens);
          this.isLoadingTokens.set(false);
        },
        error: (error) => {
          this.logger.error('Token counting failed:', error);
          // Fallback to a default estimate on error
          this.tokenCount.set(2000);
          this.isLoadingTokens.set(false);
        },
      });
  }

  isValidUrl(): boolean {
    return this.urlControl.valid && !!this.urlControl.value;
  }

  onSubmit(): void {
    if (!this.canSubmit()) return;

    const url = this.urlControl.value;
    if (!url) return;

    this._clearErrors();
    // Reset cards to processing state like YouTube
    this.summaryResult.set(null);
    this.rewrittenSummary.set(null);
    this.isRewriteLoading.set(false);
    this.isRegeneratingRewrite.set(false);
    this.isSubmitting.set(true);
    this.isLoadingSummary.set(true);

    // Store original values for regeneration
    this.originalUrl = url;
    this.originalCustomPrompt = this.customPrompt() || null;

    const request: WebpageSummariseRequest = {
      url: url,
      customPrompt: this.customPrompt() || undefined,
    };

    this.apiService
      .summariseWebpage(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => this._handleSummarySuccess(response),
        error: (error) => this._handleApiError(error, 'Webpage analysis'),
      });
  }

  onRegenerateSummary(): void {
    if (!this.originalUrl) return;

    this._clearErrors();
    this.isRegenerating.set(true);

    const request: WebpageSummariseRequest = {
      url: this.originalUrl,
      customPrompt: this.originalCustomPrompt || undefined,
    };

    this.apiService
      .summariseWebpage(request)
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
    this.originalUrl = null;
    this.originalCustomPrompt = null;
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

    this.apiService
      .rewriteSummary(request)
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

    this.apiService
      .rewriteSummary(request)
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

  onCustomPromptChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.customPrompt.set(target.value);
    this.isLoadingTokens.set(true);
    this.tokenCount.set(null);
    this.fineTuningChanges$.next();
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
    this.logger.log('Webpage analysis successful:', response);
    this.summaryResult.set(response);
    this.isSubmitting.set(false);
    this.isLoadingSummary.set(false);

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
      if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
        window.prompt('Copy to clipboard (Ctrl/Cmd+C), then press Enter:', text);
        this.logger.log('Copy to clipboard prompt shown (fallback)');
      } else {
        this.logger.warn('No clipboard API or prompt available for fallback');
      }
    } catch (fallbackErr) {
      this.logger.error('Fallback copy failed:', fallbackErr);
    }
  }
}
