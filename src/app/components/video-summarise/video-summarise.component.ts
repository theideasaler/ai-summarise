import { CommonModule } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSliderModule } from '@angular/material/slider';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { ElementRef, ViewChild, HostListener, AfterViewInit } from '@angular/core';
import { LoggerService } from '../../services/logger.service';
import { TokenService } from '../../services/token.service';
import {
  ApiService,
  VideoSummariseRequest,
  SummariseResponse,
  RewriteRequest,
  ClientContext,
} from '../../services/api.service';
import { RewriteFineTuningComponent } from '../rewrite-fine-tuning/rewrite-fine-tuning.component';
import { RewrittenSummaryComponent } from '../rewritten-summary/rewritten-summary.component';
import { SummaryResultComponent } from '../summary-result/summary-result.component';
import { YoutubeFineTuningComponent } from '../youtube-fine-tuning/youtube-fine-tuning.component';
import { VideoFineTuningConfig } from '../../models/types';
import { FileInfo, FileUploadComponent } from '../shared/file-upload/file-upload.component';
import { TokenBadgeComponent } from '../shared/token-badge/token-badge.component';

@Component({
  selector: 'app-video-summarise',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSliderModule,
    MatInputModule,
    MatFormFieldModule,
    MatCheckboxModule,
    FileUploadComponent,
    TokenBadgeComponent,
    SummaryResultComponent,
    RewriteFineTuningComponent,
    RewrittenSummaryComponent,
    YoutubeFineTuningComponent,
  ],
  templateUrl: './video-summarise.component.html',
  styleUrls: ['./video-summarise.component.scss'],
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
export class VideoSummariseComponent implements OnInit, OnDestroy, AfterViewInit {
  private readonly destroy$ = new Subject<void>();
  private readonly configChanges$ = new Subject<void>();

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
  readonly fileError = signal<string | null>(null);
  readonly tokenCount = signal<number | null>(null);
  readonly isLoadingTokens = signal(false);
  
  // Project tracking
  readonly currentProjectId = signal<string | null>(null);
  readonly existingProjectId = signal<string | null>(null);
  
  // Fine-tuning
  readonly isFineTuningExpanded = signal(false);
  readonly customPrompt = signal<string>('');
  readonly showFineTuningInput = signal(false);
  
  // Video-specific controls
  readonly fpsControl = new FormControl(1, [Validators.min(1), Validators.max(10)]);
  readonly useTimeRange = signal(false);
  readonly startTime = signal<number>(0);
  readonly endTime = signal<number | null>(null);
  readonly startTimeControl = new FormControl('00:00');
  readonly endTimeControl = new FormControl('');
  
  // Rewrite
  readonly isRewriteFineTuningExpanded = signal(false);
  readonly customRewritePrompt = signal<string>('');
  private originalRewritePrompt: string | null = null;
  private originalConfig: any = null;
  
  readonly copyButtonText = signal('Copy');
  readonly bottomSpaceHeight = signal(0);
  @ViewChild('inputCard') inputCardRef!: ElementRef<HTMLElement>;
  private resizeObserver?: ResizeObserver;
  
  // Computed
  readonly canSubmit = computed(() => {
    return this.selectedFile() !== null && !this.isSubmitting();
  });

  readonly hasCustomFineTuningConfig = computed(() => {
    return !!(
      this.customPrompt() ||
      (this.fpsControl.value && this.fpsControl.value !== 1) ||
      this.useTimeRange()
    );
  });
  
  readonly acceptedTypes = 'video/mp4,video/webm,video/ogg,video/quicktime,video/x-msvideo';
  
  constructor(
    private apiService: ApiService,
    private tokenService: TokenService,
    private logger: LoggerService,
    private route: ActivatedRoute
  ) {
    // Effect removed - token counting is now handled via debounced configChanges$ Subject
  }
  
  ngOnInit(): void {
    this._initializeFromQueryParams();
    this._setupFormListeners();
    // Debounce overall fine-tuning config changes (1s)
    this.configChanges$
      .pipe(debounceTime(1000), takeUntil(this.destroy$))
      .subscribe(() => {
        this._estimateTokens();
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
  
  private _setupFormListeners(): void {
    // FPS changes
    this.fpsControl.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(1000),
        distinctUntilChanged()
      )
      .subscribe(() => {
        this.configChanges$.next();
      });
    
    // Time range changes
    this.startTimeControl.valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(1000), distinctUntilChanged())
      .subscribe(value => {
        const seconds = this._parseTimeString(value || '00:00');
        this.startTime.set(seconds);
        this.configChanges$.next();
      });
    
    this.endTimeControl.valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(1000), distinctUntilChanged())
      .subscribe(value => {
        if (value) {
          const seconds = this._parseTimeString(value);
          this.endTime.set(seconds);
        } else {
          this.endTime.set(null);
        }
        this.configChanges$.next();
      });
  }
  
  onFilesSelected(files: FileInfo[]): void {
    if (files.length === 0) return;

    const file = files[0];
    this.selectedFile.set(file);

    // Reset all fine-tuning if not expanded
    if (!this.isFineTuningExpanded()) {
      this.customPrompt.set('');
      this.fpsControl.setValue(1);
      this.useTimeRange.set(false);
      this.startTime.set(0);
      this.endTime.set(null);
    }

    // Set default end time to video duration
    if (file.duration) {
      this.endTime.set(file.duration);
      this.endTimeControl.setValue(this._formatDuration(file.duration), { emitEvent: false });
    }

    // Show loading indicator immediately (visual feedback)
    this.isLoadingTokens.set(true);
    this.tokenCount.set(null);

    // Trigger debounced token estimation
    this.configChanges$.next();
  }
  
  onFileRemoved(): void {
    this.selectedFile.set(null);
    this.tokenCount.set(null);
    this.startTime.set(0);
    this.endTime.set(null);
    this.startTimeControl.setValue('00:00');
    this.endTimeControl.setValue('');
    
    // Reset all fine-tuning if not expanded
    if (!this.isFineTuningExpanded()) {
      this.customPrompt.set('');
      this.fpsControl.setValue(1);
      this.useTimeRange.set(false);
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
    
    // Store original config for regeneration
    this.originalConfig = {
      fps: Math.max(1, Math.round(this.fpsControl.value || 1)),
      startSeconds: this.useTimeRange() ? this.startTime() : 0,
      endSeconds: this.useTimeRange() ? this.endTime() || undefined : undefined,
      customPrompt: this.customPrompt() || undefined,
    };
    
    const request: VideoSummariseRequest = {
      file: file.file,
      fps: Math.max(1, Math.round(this.fpsControl.value || 1)),
      customPrompt: this.customPrompt() || undefined,
      startSeconds: this.useTimeRange() ? this.startTime() : 0,
      endSeconds: this.useTimeRange() ? this.endTime() || undefined : undefined,
    };
    
    this.apiService.summariseVideo(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this._handleSummarySuccess(response);
          // Refresh token info after submission
          this.tokenService.fetchTokenInfo().then(() => {
            this.logger.log('Tokens refreshed after video submission');
          });
        },
        error: (error) => this._handleApiError(error, 'Video analysis'),
      });
  }
  
  onRegenerateSummary(): void {
    if (!this.canSubmit()) return;
    
    const file = this.selectedFile();
    if (!file) return;
    
    this._clearErrors();
    this.isRegenerating.set(true);
    
    // Use original config for regeneration
    const config = this.originalConfig || {
      fps: Math.max(1, Math.round(this.fpsControl.value || 1)),
      startSeconds: this.useTimeRange() ? this.startTime() : 0,
      endSeconds: this.useTimeRange() ? this.endTime() || undefined : undefined,
      customPrompt: this.customPrompt() || undefined,
    };
    
    // Build clientContext for regeneration
    const clientContext: ClientContext | undefined = this.existingProjectId() ? {
      intent: 'regenerate',
      existingProjectId: this.existingProjectId()!
    } : undefined;
    
    const request: VideoSummariseRequest = {
      file: file.file,
      ...config,
      clientContext: clientContext,
    };
    
    this.apiService.summariseVideo(request)
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
    this.originalConfig = null;
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
  
  toggleTimeRange(): void {
    this.useTimeRange.set(!this.useTimeRange());

    // Only trigger token estimation if we have a file selected
    if (this.selectedFile() && this.selectedFile()?.duration) {
      // Show loading indicator immediately (visual feedback)
      this.isLoadingTokens.set(true);
      this.tokenCount.set(null);

      // Trigger debounced token estimation
      this.configChanges$.next();
    }
  }
  
  onFineTuningSubmit(customPrompt: string): void {
    this.customPrompt.set(customPrompt);
    this.showFineTuningInput.set(false);

    // Refetch token count with new custom prompt
    if (this.selectedFile() && this.selectedFile()?.duration) {
      // Show loading indicator immediately (visual feedback)
      this.isLoadingTokens.set(true);
      this.tokenCount.set(null);

      // Trigger debounced token estimation
      this.configChanges$.next();
    }
  }
  
  getVideoFineTuningConfig(): VideoFineTuningConfig {
    const duration = this.selectedFile()?.duration || 0;
    
    return {
      fps: this.fpsControl.value || 1,
      startSeconds: this.useTimeRange() ? this.startTime() : 0,
      endSeconds: this.useTimeRange() && this.endTime() !== null ? this.endTime()! : duration,
      customPrompt: this.customPrompt(),
    };
  }
  
  onVideoConfigChange(config: VideoFineTuningConfig): void {
    // Guard on duration
    const file = this.selectedFile();
    if (!file?.duration) return;

    // Enable time range to ensure endSeconds is included in payload
    this.useTimeRange.set(true);

    // Update FPS without triggering valueChanges listener
    this.fpsControl.setValue(config.fps, { emitEvent: false });

    // Clamp and persist time values to signals
    const start = Math.max(0, Math.min(config.startSeconds, file.duration));
    const end = Math.max(start, Math.min(config.endSeconds, file.duration));

    this.startTime.set(start);
    this.endTime.set(end);

    // Update form controls with FORMATTED strings, prevent circular updates
    this.startTimeControl.setValue(this._formatDuration(start), { emitEvent: false });
    this.endTimeControl.setValue(this._formatDuration(end), { emitEvent: false });

    // Update custom prompt if present
    if (config.customPrompt !== undefined) {
      this.customPrompt.set(config.customPrompt);
    }

    // Show loading indicator immediately (visual feedback)
    this.isLoadingTokens.set(true);
    this.tokenCount.set(null);

    // Trigger debounced token re-estimation via configChanges$ Subject
    // This will be debounced by the subscription in ngOnInit
    this.configChanges$.next();
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
  
  formatDuration(seconds: number): string {
    return this._formatDuration(seconds);
  }
  
  private _formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
  
  private _parseTimeString(timeStr: string): number {
    const parts = timeStr.split(':').map(p => parseInt(p) || 0);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  }
  
  private _estimateTokens(): void {
    const file = this.selectedFile();
    if (!file || !file.duration) {
      this.tokenCount.set(null);
      return;
    }
    
    this.isLoadingTokens.set(true);
    this.tokenCount.set(null);
    
    const request: VideoSummariseRequest = {
      file: file.file,
      fps: Math.max(1, Math.round(this.fpsControl.value || 1)),
      customPrompt: this.customPrompt() || undefined,
      startSeconds: this.useTimeRange() ? this.startTime() : 0,
      endSeconds: this.useTimeRange() ? this.endTime() || undefined : undefined,
    };
    
    this.apiService.countVideoTokens(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.tokenCount.set(response.totalTokens);
          this.isLoadingTokens.set(false);
        },
        error: (error) => {
          this.logger.error('Failed to fetch token count:', error);
          // Set a fallback estimate if API fails
          const fps = Math.max(1, Math.round(this.fpsControl.value || 1));
          let duration = file.duration || 0;
          
          if (this.useTimeRange() && file.duration) {
            const start = this.startTime();
            const end = this.endTime() || file.duration;
            duration = Math.max(0, end - start);
          }
          
          const framesExtracted = duration * fps;
          const estimatedTokens = Math.round(framesExtracted * 150);
          this.tokenCount.set(estimatedTokens);
          this.isLoadingTokens.set(false);
        },
      });
  }
  
  private _handleSummarySuccess(response: SummariseResponse): void {
    this.logger.log('Video analysis successful:', response);
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
}
