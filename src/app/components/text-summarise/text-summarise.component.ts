import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal, ElementRef, ViewChild, HostListener, AfterViewInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { trigger, transition, style, animate } from '@angular/animations';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil, startWith, map } from 'rxjs';
import { LoggerService } from '../../services/logger.service';
import { TokenService } from '../../services/token.service';
import {
  ApiService,
  TextSummariseRequest,
  SummariseResponse,
  RewriteRequest,
} from '../../services/api.service';
import { RewrittenSummaryComponent } from '../rewritten-summary/rewritten-summary.component';
import { SummaryResultComponent } from '../summary-result/summary-result.component';
import { RewriteFineTuningComponent } from '../rewrite-fine-tuning/rewrite-fine-tuning.component';
import { FileInfo } from '../shared/file-upload/file-upload.component';

@Component({
  selector: 'app-text-summarise',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    SummaryResultComponent,
    RewriteFineTuningComponent,
    RewrittenSummaryComponent,
  ],
  templateUrl: './text-summarise.component.html',
  styleUrls: ['./text-summarise.component.scss'],
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
export class TextSummariseComponent implements OnInit, OnDestroy, AfterViewInit {
  private readonly destroy$ = new Subject<void>();
  private readonly fineTuningChanges$ = new Subject<void>();

  // State Management
  readonly textControl = new FormControl('', [
    Validators.required,
    Validators.minLength(10),
  ]);

  readonly selectedFile = signal<FileInfo | null>(null);
  readonly isProcessingFile = signal(false);
  readonly fileError = signal<string | null>(null);

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
  readonly tokenCountError = signal<string | null>(null);

  // Fine-tuning
  readonly isFineTuningExpanded = signal(false);
  readonly customPrompt = signal<string>('');
  readonly showFineTuningInput = signal(false);

  // Drag and drop
  readonly isDragging = signal(false);

  // Rewrite
  readonly isRewriteFineTuningExpanded = signal(false);
  readonly customRewritePrompt = signal<string>('');
  private originalRewritePrompt: string | null = null;

  readonly copyButtonText = signal('Copy');
  readonly bottomSpaceHeight = signal(0);
  @ViewChild('inputCard') inputCardRef!: ElementRef<HTMLElement>;
  private resizeObserver?: ResizeObserver;

  // ReactiveForms -> Signals bridge
  readonly textValueSig = toSignal(this.textControl.valueChanges.pipe(startWith(this.textControl.value)), { initialValue: this.textControl.value });
  readonly textValidSig = toSignal(
    this.textControl.statusChanges.pipe(
      map((status) => status === 'VALID'),
      startWith(this.textControl.valid)
    ),
    { initialValue: this.textControl.valid }
  );

  // Computed
  readonly canSubmit = computed(() => {
    const hasFile = this.selectedFile() !== null;
    const text = (this.textValueSig() || '') as string;
    const textOk = this.textValidSig() && text.length > 0;
    return (hasFile || textOk) && !this.isSubmitting() && !this.isProcessingFile();
  });

  readonly displayMode = computed(() => {
    if (this.selectedFile()) return 'file';
    return 'text';
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
    this._setupTokenCounting();
    this._initializeFromQueryParams();
    // Debounce fine-tuning changes and retrigger token counting (1s)
    this.fineTuningChanges$
      .pipe(debounceTime(1000), takeUntil(this.destroy$))
      .subscribe(() => {
        const file = this.selectedFile();
        if (file) {
          this._countFileTokens(file.file);
        } else {
          const text = (this.textValueSig() || '') as string;
          if (text && text.length > 10) {
            this._countTokens(text);
          }
        }
      });
  }

  ngAfterViewInit(): void {
    // Observe input card height to sync bottom-space height
    const el = this.inputCardRef?.nativeElement;
    if (el && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.bottomSpaceHeight.set(el.offsetHeight || 0);
      });
      this.resizeObserver.observe(el);
      // initial
      setTimeout(() => this.bottomSpaceHeight.set(el.offsetHeight || 0));
    }
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:resize')
  onWindowResize() {
    const el = this.inputCardRef?.nativeElement;
    if (el) this.bottomSpaceHeight.set(el.offsetHeight || 0);
  }

  private _initializeFromQueryParams(): void {
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        if (params['text']) {
          this.textControl.setValue(params['text']);
        }
      });
  }

  private _setupTokenCounting(): void {
    // Immediate visual feedback (three-dots) when typing starts
    this.textControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((val) => {
        if (val && val.length > 0) {
          this.isLoadingTokens.set(true);
          this.tokenCountError.set(null);
        } else {
          this.isLoadingTokens.set(false);
          this.tokenCount.set(null);
        }
      });

    // Debounced backend token counting (only for plain text, not files)
    this.textControl.valueChanges
      .pipe(debounceTime(600), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((text) => {
        // Only count tokens for plain text input, not for files
        if (text && text.length > 10 && !this.selectedFile()) {
          this._countTokens(text);
        } else {
          this.tokenCount.set(null);
          this.isLoadingTokens.set(false);
        }
      });
  }

  private async _countTokens(text: string): Promise<void> {
    this.isLoadingTokens.set(true);
    this.tokenCountError.set(null);

    try {
      const resp = await this.apiService
        .countTextTokens({
          content: text,
          customPrompt: this.customPrompt() || undefined,
        })
        .pipe(takeUntil(this.destroy$))
        .toPromise();

      if (resp && typeof resp.totalTokens === 'number') {
        this.tokenCount.set(resp.totalTokens);
      } else {
        this.tokenCount.set(null);
      }
    } catch (error) {
      this.logger.error('Error counting tokens:', error);
      this.tokenCountError.set('Failed to estimate tokens');
      this.tokenCount.set(null);
    } finally {
      this.isLoadingTokens.set(false);
    }
  }

  async onFilesSelected(files: FileInfo[]): Promise<void> {
    if (files.length === 0) return;

    const file = files[0];
    
    // Validate file type
    const supportedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    
    if (!supportedTypes.includes(file.type) && !file.name.endsWith('.txt')) {
      this.fileError.set(
        'Unsupported file type. Please upload PDF, Word, or text files.'
      );
      return;
    }
    
    this.selectedFile.set(file);
    this.fileError.set(null);
    
    // Count tokens for the file
    this._countFileTokens(file.file);
  }

  private async _countFileTokens(file: File): Promise<void> {
    this.isLoadingTokens.set(true);
    this.tokenCountError.set(null);

    try {
      const resp = await this.apiService
        .countTextFileTokens(file, this.customPrompt() || undefined)
        .pipe(takeUntil(this.destroy$))
        .toPromise();

      if (resp && typeof resp.totalTokens === 'number') {
        this.tokenCount.set(resp.totalTokens);
      } else {
        this.tokenCount.set(null);
      }
    } catch (error) {
      this.logger.error('Error counting file tokens:', error);
      this.tokenCountError.set('Failed to estimate tokens');
      this.tokenCount.set(null);
    } finally {
      this.isLoadingTokens.set(false);
    }
  }


  onFileRemoved(): void {
    this.selectedFile.set(null);
    this.fileError.set(null);
    this.tokenCount.set(null);
  }

  onSubmit(): void {
    if (!this.canSubmit()) return;

    this._clearErrors();
    // Reset cards to processing state like YouTube
    this.summaryResult.set(null);
    this.rewrittenSummary.set(null);
    this.isRewriteLoading.set(false);
    this.isRegeneratingRewrite.set(false);
    this.isSubmitting.set(true);
    this.isLoadingSummary.set(true);

    if (this.displayMode() === 'file') {
      // Handle file upload
      const file = this.selectedFile()!;
      this.apiService
        .summariseTextFile(file.file, this.customPrompt() || undefined)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => this._handleSummarySuccess(response),
          error: (error) => this._handleApiError(error, 'Text file summarisation'),
        });
    } else {
      // Handle plain text
      const request: TextSummariseRequest = {
        content: this.textControl.value!,
        customPrompt: this.customPrompt() || undefined,
      };

      this.apiService
        .summarise(request)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => this._handleSummarySuccess(response),
          error: (error) => this._handleApiError(error, 'Text summarisation'),
        });
    }
  }

  onRegenerateSummary(): void {
    if (!this.canSubmit()) return;

    this._clearErrors();
    this.isRegenerating.set(true);

    if (this.displayMode() === 'file') {
      // Handle file upload
      const file = this.selectedFile()!;
      this.apiService
        .summariseTextFile(file.file, this.customPrompt() || undefined)
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
    } else {
      // Handle plain text
      const request: TextSummariseRequest = {
        content: this.textControl.value!,
        customPrompt: this.customPrompt() || undefined,
      };

      this.apiService
        .summarise(request)
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

  onFineTuningInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.customPrompt.set(target.value);
    // Immediate loading feedback then debounce count
    this.isLoadingTokens.set(true);
    this.tokenCount.set(null);
    this.fineTuningChanges$.next();
  }

  onFineTuningSubmit(customPrompt: string): void {
    this.customPrompt.set(customPrompt);
    this.showFineTuningInput.set(false);
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

  // Drag and drop event handlers
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];

      // Check if file type is supported
      const supportedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
      ];

      if (supportedTypes.includes(file.type) || file.name.endsWith('.txt')) {
        const fileInfo: FileInfo = {
          name: file.name,
          size: this._formatFileSize(file.size),
          type: file.type || 'text/plain',
          file: file,
        };
        this.onFilesSelected([fileInfo]);
      } else {
        this.fileError.set(
          'Unsupported file type. Please drop PDF, Word, or text files.'
        );
      }
    }
  }

  private _formatFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
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
    this.logger.log('Text summarisation successful:', response);
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
    this.tokenCountError.set(null);
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
