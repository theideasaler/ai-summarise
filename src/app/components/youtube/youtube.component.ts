import { animate, style, transition, trigger } from '@angular/animations';
import { NgIf } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import {
  Observable,
  Subject,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  merge,
  switchMap,
  takeUntil,
  of,
  catchError,
} from 'rxjs';
import { VideoFineTuningConfig } from '../../models/types';
import {
  ApiService,
  RewriteRequest,
  SummariseResponse,
  TokenCountResponse,
  YouTubeSummariseRequest,
} from '../../services/api.service';
import { LoggerService } from '../../services/logger.service';
import { MultilineInputComponent } from '../multiline-input/multiline-input.component';
import { RewriteFineTuningComponent } from '../rewrite-fine-tuning/rewrite-fine-tuning.component';
import { RewrittenSummaryComponent } from '../rewritten-summary/rewritten-summary.component';
import { SummaryResultComponent } from '../summary-result/summary-result.component';
import { YoutubeFineTuningComponent } from '../youtube-fine-tuning/youtube-fine-tuning.component';
import { YoutubeVideoPreviewComponent } from '../youtube-video-preview/youtube-video-preview.component';
import { TokenService } from '../../services/token.service';
import { TokenBadgeComponent } from '../shared/token-badge/token-badge.component';

// ============================================================================
// Constants and Configuration
// ============================================================================
const YOUTUBE_URL_REGEX =
  /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/|m\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})(?:\S+)?$/;
const TOKEN_COUNTING_DEBOUNCE_MS = 1000;
const CLIPBOARD_FEEDBACK_DURATION_MS = 2000;

const ERROR_MESSAGES = {
  INVALID_URL: 'Please enter a valid YouTube URL',
  VIDEO_NOT_FOUND: 'Video not found or has been removed',
  VIDEO_RESTRICTED: 'Video owner has restricted playback on other websites',
  VIDEO_ACCESS_RESTRICTED:
    'YouTube video access has been restricted on other websites',
  HTML5_ERROR: 'HTML5 player error occurred',
  GENERIC_PLAYER_ERROR: (code: number) =>
    `YouTube player error occurred (Error code: ${code})`,
  GENERIC_API_ERROR: 'An error occurred while processing your request',
};

// ============================================================================
// Component Definition
// ============================================================================
@Component({
  selector: 'app-youtube',
  standalone: true,
  imports: [
    NgIf,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    SummaryResultComponent,
    YoutubeVideoPreviewComponent,
    YoutubeFineTuningComponent,
    MultilineInputComponent,
    MatTooltipModule,
    TokenBadgeComponent,
    RewriteFineTuningComponent,
    RewrittenSummaryComponent,
  ],
  templateUrl: './youtube.component.html',
  styleUrl: './youtube.component.scss',
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
export class YoutubeComponent implements OnInit, OnDestroy, AfterViewInit {
  // ============================================================================
  // State Management - UI States
  // ============================================================================
  readonly isLoadingVideo = signal(false);
  readonly isLoadingSummary = signal(false);
  readonly isSubmitting = signal(false);
  readonly isRegenerating = signal(false);
  readonly isRewriteLoading = signal(false);
  readonly isRegeneratingRewrite = signal(false);
  readonly isLoadingTokens = signal(false);
  readonly showFineTuningInput = signal(false);
  readonly isFineTuningExpanded = signal(false);
  readonly isRewriteFineTuningExpanded = signal(false);
  readonly copyButtonText = signal('Copy');
  readonly bottomSpaceHeight = signal(0);

  // ============================================================================
  // State Management - Data States
  // ============================================================================
  readonly summaryResult = signal<SummariseResponse | null>(null);
  readonly rewrittenSummary = signal<SummariseResponse | null>(null);
  readonly videoDuration = signal<number | null>(null);
  readonly tokenCount = signal<number | null>(null);
  readonly fineTuningConfig = signal<VideoFineTuningConfig | null>(null);

  // Project tracking signals
  readonly currentProjectId = signal<string | null>(null);
  readonly existingProjectId = signal<string | null>(null);

  // Store the original configs used for generating summaries
  private originalSummaryConfig: VideoFineTuningConfig | null = null;
  private originalSummaryUrl: string | null = null;

  // Store the original custom prompt used for rewrite
  private originalRewritePrompt: string | null = null;
  readonly customPromptText = signal<string>('');

  // ============================================================================
  // State Management - Error States
  // ============================================================================
  readonly errorMessage150 = signal<string | null>(null);
  readonly submitError = signal<string | null>(null);
  readonly tokenCountError = signal<string | null>(null);

  // ============================================================================
  // Form Control
  // ============================================================================
  readonly inputControl = new FormControl('', [
    Validators.required,
    Validators.pattern(YOUTUBE_URL_REGEX),
  ]);

  // ============================================================================
  // Computed Properties
  // ============================================================================
  readonly isValidUrl = () => this.inputControl.valid;

  readonly errorMessage = computed(() => {
    if (this.inputControl.hasError('required')) {
      return 'YouTube URL is required';
    }
    if (this.inputControl.hasError('pattern')) {
      return ERROR_MESSAGES.INVALID_URL;
    }
    return null;
  });

  readonly hasCustomFineTuningConfig = computed(() => {
    const config = this.fineTuningConfig();
    if (!config) return false;
    return !!(
      config.customPrompt ||
      (config.startSeconds && config.startSeconds > 0) ||
      (config.endSeconds && config.endSeconds > 0) ||
      (config.fps && config.fps > 0)
    );
  });

  readonly calculateSummaryTokens = computed(() => {
    const summary = this.summaryResult();
    if (!summary) return 0;
    const text = summary.summary || '';
    return Math.ceil(text.length / 4);
  });

  // ============================================================================
  // Private Members
  // ============================================================================
  private readonly destroy$ = new Subject<void>();
  private readonly fineTuningConfigSubject =
    new Subject<VideoFineTuningConfig | null>();
  private readonly durationChangesSubject = new Subject<void>();
  private persistentFineTuningConfig: VideoFineTuningConfig | null = null;

  // ViewChild and ResizeObserver for dynamic bottom space
  @ViewChild('inputCard') inputCardRef!: ElementRef<HTMLElement>;
  private resizeObserver?: ResizeObserver;

  // ============================================================================
  // Constructor and Lifecycle
  // ============================================================================
  constructor(
    private apiService: ApiService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private tokenService: TokenService
  ) {
    this._initializeFromQueryParams();
  }

  ngOnInit(): void {
    this._setupTokenCounting();
    this._setupFineTuningPersistence();
  }

  ngAfterViewInit(): void {
    // Initialize ResizeObserver
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.bottomSpaceHeight.set(entry.target.clientHeight);
      }
    });

    // Start observing the input card
    if (this.inputCardRef?.nativeElement) {
      this.resizeObserver.observe(this.inputCardRef.nativeElement);

      // Set initial height after a tick to ensure rendered
      setTimeout(() => {
        this.bottomSpaceHeight.set(
          this.inputCardRef.nativeElement.offsetHeight
        );
      }, 0);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.resizeObserver?.disconnect();
  }

  // Optional: Handle window resize
  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.inputCardRef?.nativeElement) {
      this.bottomSpaceHeight.set(this.inputCardRef.nativeElement.offsetHeight);
    }
  }

  // ============================================================================
  // Initialization Methods
  // ============================================================================
  private _initializeFromQueryParams(): void {
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        if (params['url']) {
          this.inputControl.setValue(params['url']);
          this.cdr.detectChanges();
        }
      });
  }

  private _setupFineTuningPersistence(): void {
    this.fineTuningConfigSubject
      .pipe(distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((config) => {
        if (config && this.isFineTuningExpanded()) {
          this.persistentFineTuningConfig = { ...config };
        }
      });
  }

  // ============================================================================
  // Token Counting Logic
  // ============================================================================
  /**
   * Sets up the token counting system with proper loading states and error handling.
   *
   * Flow:
   * 1. User enters URL → Immediate loading indicator
   * 2. Video duration loads → Token counting starts
   * 3. Token count displayed → Loading indicator hidden
   *
   * Error scenarios handled:
   * - Invalid URL → Reset everything
   * - Video error → Stop loading, show error
   * - Token counting API error → Stop loading, allow retry
   */
  private _setupTokenCounting(): void {
    // Set up URL change listener for immediate loading state
    this._setupUrlChangeListener();

    // Set up token counting triggers
    this._setupTokenCountingTriggers();
  }

  /**
   * Handles URL changes and manages immediate loading feedback
   */
  private _setupUrlChangeListener(): void {
    let previousUrl: string | null = null;

    this.inputControl.valueChanges
      .pipe(
        // Use distinctUntilChanged with custom comparison to handle paste of same URL
        distinctUntilChanged((prev, curr) => {
          // Treat empty and null as same
          if (!prev && !curr) return true;
          // For valid URLs, always treat as different to retrigger loading
          if (this.inputControl.valid) return false;
          // For invalid URLs, use standard comparison
          return prev === curr;
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((currentUrl) => {
        // Check if URL actually changed (not just validation state)
        const urlChanged = currentUrl !== previousUrl;
        previousUrl = currentUrl;

        if (urlChanged) {
          // Reset fine-tuning config if collapsed
          if (!this.isFineTuningExpanded()) {
            this._resetFineTuningConfig();
          }
        }

        if (this.inputControl.valid) {
          // Valid URL entered - show loading immediately
          this._startTokenLoadingState();
        } else {
          // Invalid URL - hide loading and reset
          this._resetTokenCount();
        }
      });
  }

  /**
   * Starts the loading state for token counting
   * Called immediately when a valid URL is entered
   */
  private _startTokenLoadingState(): void {
    this.isLoadingTokens.set(true);
    this.tokenCount.set(null);

    // Clear any existing errors and duration for fresh start
    this.videoDuration.set(null);
    this.errorMessage150.set(null);
    this.tokenCountError.set(null);
  }

  /**
   * Sets up triggers that initiate actual token counting
   * Token counting only happens after duration is available
   */
  private _setupTokenCountingTriggers(): void {
    // Duration changes trigger token counting
    const durationChanges$ = this.durationChangesSubject.pipe(
      map(() => ({ source: 'duration' }))
    );

    // Config changes trigger token counting (only if we have duration)
    const configChanges$ = this.fineTuningConfigSubject.pipe(
      filter(() => this._shouldCountTokens()),
      map(() => ({ source: 'config' }))
    );

    // Combine all triggers
    const tokenCountTriggers$ = merge(durationChanges$, configChanges$);

    // Perform debounced token counting with error recovery
    tokenCountTriggers$
      .pipe(
        debounceTime(TOKEN_COUNTING_DEBOUNCE_MS),
        switchMap(() => this._performTokenCounting()),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => this._handleTokenCountResult(result),
        error: (error) => this._handleTokenCountError(error),
      });
  }

  private _shouldCountTokens(): boolean {
    return !!(
      this.inputControl.valid &&
      this.inputControl.value &&
      this.videoDuration() &&
      this.videoDuration()! > 0
    );
  }

  private _performTokenCounting(): Observable<any> {
    if (!this._shouldCountTokens()) {
      return of({ success: false, data: null });
    }

    return this._countTokens().pipe(
      map((response) => ({ success: true, data: response })),
      catchError((error) => {
        this.logger.error('Token counting failed:', error);
        return of({ success: false, error });
      })
    );
  }

  private _countTokens(): Observable<TokenCountResponse> {
    const request = this._buildYouTubeRequest();
    return this.apiService.countYouTubeTokens(request);
  }

  private _handleTokenCountResult(result: any): void {
    if (result.success && 'data' in result && result.data) {
      this.tokenCount.set(result.data.totalTokens);
      // Clear any token counting errors on success
      this.tokenCountError.set(null);
    } else if (result.error) {
      // Handle token counting API errors
      this._handleTokenCountingApiError(result.error);
    } else {
      this.tokenCount.set(null);
    }
    this.isLoadingTokens.set(false);
  }

  private _handleTokenCountError(error: any): void {
    this.logger.error('Unexpected error in token counting:', error);
    this._handleTokenCountingApiError(error);
  }

  private _handleTokenCountingApiError(error: any): void {
    // Extract error message from the API response
    let errorMessage = 'Unable to estimate token count';

    if (error?.error?.error) {
      errorMessage = error.error.error;
    } else if (error?.error?.message) {
      errorMessage = error.error.message;
    } else if (error?.message) {
      errorMessage = error.message;
    }

    // Set error message for display
    this.tokenCountError.set(errorMessage);
    this._resetTokenCount();
  }

  private _resetTokenCount(): void {
    this.tokenCount.set(null);
    this.isLoadingTokens.set(false);
  }

  // ============================================================================
  // Request Building
  // ============================================================================
  private _buildYouTubeRequest(): YouTubeSummariseRequest {
    const request: YouTubeSummariseRequest = {
      url: this.inputControl.value || '',
    };

    const config = this._getActiveFineTuningConfig();
    if (config) {
      this._applyFineTuningToRequest(request, config);
    }

    // Ensure startSeconds defaults to 0 if not set
    if (request.startSeconds === undefined) {
      request.startSeconds = 0;
    }

    return request;
  }

  private _buildYouTubeRequestWithConfig(
    config: VideoFineTuningConfig | null,
    url: string | null
  ): YouTubeSummariseRequest {
    const request: YouTubeSummariseRequest = {
      url: url || this.inputControl.value || '',
    };

    if (config) {
      this._applyFineTuningToRequest(request, config);
    }

    // Ensure startSeconds defaults to 0 if not set
    if (request.startSeconds === undefined) {
      request.startSeconds = 0;
    }

    return request;
  }

  private _getActiveFineTuningConfig(): VideoFineTuningConfig | null {
    let config = this.fineTuningConfig();

    // Use persistent config if fine-tuning is collapsed
    if (!this.isFineTuningExpanded() && this.persistentFineTuningConfig) {
      config = this.persistentFineTuningConfig;
    }

    return config;
  }

  private _applyFineTuningToRequest(
    request: YouTubeSummariseRequest,
    config: VideoFineTuningConfig
  ): void {
    if (config.customPrompt) {
      request.customPrompt = config.customPrompt;
    }
    // Always set startSeconds to a defined value (default 0)
    request.startSeconds = config.startSeconds ?? 0;
    if (config.endSeconds !== undefined && config.endSeconds > 0) {
      request.endSeconds = config.endSeconds;
    }
    if (config.fps !== undefined && config.fps > 0) {
      request.fps = config.fps;
    }
  }

  // ============================================================================
  // Error Handling
  // ============================================================================
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
    // Handle format: {"error": "message"} - most common from our backend
    if (error?.error?.error && typeof error.error.error === 'string') {
      return error.error.error;
    }

    // Handle format: {"error": {"message": "..."}}
    if (error?.error?.error?.message) {
      return error.error.error.message;
    }

    // Handle format: {"message": "..."}
    if (error?.error?.message) {
      return error.error.message;
    }

    // Handle direct message
    if (error?.message) {
      return error.message;
    }

    // Handle specific HTTP status codes with user-friendly messages
    if (error?.status) {
      switch (error.status) {
        case 401:
          return 'Authentication required. Please sign in and try again.';
        case 403:
          return 'Access denied. Please check your permissions.';
        case 404:
          return 'Service not found. Please try again later.';
        case 429:
          return 'Too many requests. Please wait a moment and try again.';
        case 500:
        case 502:
        case 503:
          return 'Server error. Please try again later.';
        default:
          return ERROR_MESSAGES.GENERIC_API_ERROR;
      }
    }

    return ERROR_MESSAGES.GENERIC_API_ERROR;
  }

  private _clearErrors(): void {
    this.submitError.set(null);
    this.errorMessage150.set(null);
  }

  private _clearAllResults(): void {
    // Clear all summary and rewrite results
    this.summaryResult.set(null);
    this.rewrittenSummary.set(null);
    this.isRewriteFineTuningExpanded.set(false);

    // Clear stored original config
    this.originalSummaryConfig = null;
    this.originalSummaryUrl = null;
    this.originalRewritePrompt = null;

    // Clear errors
    this._clearErrors();

    // Reset loading states
    this.isLoadingSummary.set(false);
    this.isRewriteLoading.set(false);
    this.isRegenerating.set(false);
    this.isRegeneratingRewrite.set(false);
  }

  private _resetFineTuningConfig(): void {
    // Reset fine-tuning configuration to defaults
    this.fineTuningConfig.set(null);
    this.persistentFineTuningConfig = null;

    // Clear any custom prompt
    this.customPromptText.set('');

    // Close fine-tuning input if open
    this.showFineTuningInput.set(false);
  }

  // ============================================================================
  // Public Event Handlers - Video Events
  // ============================================================================
  onDuration(duration: number): void {
    this.logger.log('Video duration detected:', duration);
    this.videoDuration.set(duration);
    this.isLoadingVideo.set(false);
    this._clearErrors();

    // Trigger token counting now that duration is available
    // Loading indicator is already showing from URL change
    if (this._shouldCountTokens()) {
      this.durationChangesSubject.next();
    }
  }

  onVideoError(errorCode: number): void {
    this.logger.log('YouTube player error:', errorCode);

    const errorMessage = this._getVideoErrorMessage(errorCode);
    this.errorMessage150.set(errorMessage);

    // Reset states on video error
    this.isFineTuningExpanded.set(false);
    this.isLoadingVideo.set(false);
    this.videoDuration.set(null);

    // Stop loading indicator since we won't get a duration
    this._resetTokenCount();
  }

  private _getVideoErrorMessage(errorCode: number): string {
    switch (errorCode) {
      case 2:
        return ERROR_MESSAGES.INVALID_URL;
      case 5:
        return ERROR_MESSAGES.HTML5_ERROR;
      case 100:
        return ERROR_MESSAGES.VIDEO_NOT_FOUND;
      case 101:
      case 150:
        return ERROR_MESSAGES.VIDEO_ACCESS_RESTRICTED;
      default:
        return ERROR_MESSAGES.GENERIC_PLAYER_ERROR(errorCode);
    }
  }

  // ============================================================================
  // Public Event Handlers - Summary Actions
  // ============================================================================
  onSubmit(): void {
    if (!this._canSubmit()) return;

    this._clearErrors();
    this._resetSummaryStates();

    // Store the current config and URL for this new summary
    this.originalSummaryConfig = this._getActiveFineTuningConfig();
    this.originalSummaryUrl = this.inputControl.value || '';

    const request = this._buildYouTubeRequest();

    this.apiService
      .summariseYouTube(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this._handleSummarySuccess(response);
          // Refresh token info after submission
          this.tokenService.fetchTokenInfo().then(() => {
            this.logger.log('Tokens refreshed after YouTube submission');
          });
        },
        error: (error) => this._handleApiError(error, 'YouTube summarisation'),
      });
  }

  onRegenerateSummary(): void {
    // For regeneration, we use the original URL and config, not the current input
    if (!this.originalSummaryUrl) return;

    this._clearErrors();
    this.isRegenerating.set(true);

    // Use the original config from when the summary was first generated
    const request = this._buildYouTubeRequestWithConfig(
      this.originalSummaryConfig,
      this.originalSummaryUrl
    );

    // Add regeneration context if we have an existing project
    const projectId = this.existingProjectId();
    if (projectId) {
      (request as any).clientContext = {
        intent: 'regenerate' as const,
        existingProjectId: projectId,
      };
    }

    this.apiService
      .summariseYouTube(request)
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
    // Clear stored original config
    this.originalSummaryConfig = null;
    this.originalSummaryUrl = null;
    // Clear project tracking
    this.currentProjectId.set(null);
    this.existingProjectId.set(null);
  }

  copySummary(): void {
    const summary = this.summaryResult()?.summary;
    if (summary) {
      this._copyToClipboard(summary);
    }
  }

  private _canSubmit(): boolean {
    return !!(
      this.inputControl.valid &&
      this.videoDuration() &&
      this.videoDuration()! > 0
    );
  }

  private _resetSummaryStates(): void {
    this.isSubmitting.set(true);
    this.submitError.set(null);
    this.summaryResult.set(null);
    this.isLoadingSummary.set(true);
    this.rewrittenSummary.set(null);
    this.isRewriteLoading.set(false);
    // Clear project tracking for new submission
    this.currentProjectId.set(null);
    this.existingProjectId.set(null);
  }

  private _handleSummarySuccess(response: SummariseResponse): void {
    this.logger.log('YouTube summarisation successful:', response);
    this.summaryResult.set(response);
    this.isSubmitting.set(false);
    this.isLoadingSummary.set(false);

    // Store project ID if present
    if (response.projectId) {
      this.currentProjectId.set(response.projectId);
      this.existingProjectId.set(response.projectId);
    }

    // Refresh token info after successful API call
    this.tokenService.fetchTokenInfo();
  }

  // ============================================================================
  // Public Event Handlers - Rewrite Actions
  // ============================================================================
  onRewriteFineTuningExpandedChange(expanded: boolean): void {
    this.isRewriteFineTuningExpanded.set(expanded);
  }

  onRewriteFineTuningSubmit(customPrompt: string): void {
    const summary = this.summaryResult();
    if (!summary || !summary.requestId) return;

    this._clearErrors();
    this.isRewriteLoading.set(true);
    this.rewrittenSummary.set(null);

    // Store the custom prompt for future regenerations (from Recreate button)
    this.originalRewritePrompt = customPrompt || '';
    this.customPromptText.set(customPrompt || '');

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

    // Always use the original prompt that was used for the last successful rewrite
    // Don't use the current text in the input field
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
    // Clear stored rewrite prompt
    this.originalRewritePrompt = null;
  }

  onCustomPromptSaved(prompt: string): void {
    this.customPromptText.set(prompt);
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

    // Return in the format expected by the RewrittenSummaryComponent
    return {
      rewrittenSummary: rewritten.summary || '',
      originalRequestId: rewritten.requestId || '',
      tokensUsed: rewritten.tokensUsed,
      processingTime: rewritten.processingTime,
    };
  }

  private _handleRewriteSuccess(response: any): void {
    this.logger.log('Content rewrite successful:', response);
    // Convert RewriteResponse to SummariseResponse format
    const summaryResponse: SummariseResponse = {
      summary: response.summary,
      tokensUsed: response.tokensUsed,
      processingTime: response.processingTime,
      requestId: response.requestId,
    };
    this.rewrittenSummary.set(summaryResponse);
    this.isRewriteLoading.set(false);

    // Don't collapse the rewrite fine-tuning panel if it's already expanded
    // User may want to continue adjusting the prompt
    // this.isRewriteFineTuningExpanded.set(false); // Removed to keep panel persistent

    // Refresh token info after successful API call
    this.tokenService.fetchTokenInfo();
  }

  // ============================================================================
  // Public Event Handlers - Fine-Tuning Actions
  // ============================================================================
  toggleFineTuning(): void {
    const newExpandedState = !this.isFineTuningExpanded();
    this.isFineTuningExpanded.set(newExpandedState);

    if (newExpandedState) {
      const currentConfig = this.fineTuningConfig();
      if (currentConfig) {
        this.persistentFineTuningConfig = { ...currentConfig };
      }
    }
  }

  onFineTuningConfigChange(config: VideoFineTuningConfig): void {
    this.fineTuningConfig.set(config);
    this.persistentFineTuningConfig = { ...config };
    this.logger.log('Fine-tuning config updated:', config);

    // Show loading indicator immediately when config changes
    if (this._shouldCountTokens()) {
      this.isLoadingTokens.set(true);
      this.tokenCount.set(null);
      this.tokenCountError.set(null);
    }

    // Notify subscribers of config change (will trigger debounced token counting)
    this.fineTuningConfigSubject.next(config);
  }

  onFineTuningSubmit(customPrompt: string): void {
    this.logger.log('Fine-tuning custom prompt submitted:', customPrompt);
    const currentConfig = this.fineTuningConfig() || {
      startSeconds: 0,
      endSeconds: 0,
      fps: 0,
    };
    const updatedConfig: VideoFineTuningConfig = {
      ...currentConfig,
      customPrompt,
    };
    this.fineTuningConfig.set(updatedConfig);
    this.showFineTuningInput.set(false);

    // Show loading indicator immediately when config changes
    if (this._shouldCountTokens()) {
      this.isLoadingTokens.set(true);
      this.tokenCount.set(null);
      this.tokenCountError.set(null);
    }

    // Notify subscribers of config change (will trigger debounced token counting)
    this.fineTuningConfigSubject.next(updatedConfig);
  }

  onFineTuningCancel(): void {
    this.showFineTuningInput.set(false);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================
  private _copyToClipboard(text: string): void {
    try {
      if (
        typeof navigator !== 'undefined' &&
        (navigator as any).clipboard?.writeText
      ) {
        (navigator as any).clipboard
          .writeText(text)
          .then(() => {
            this.logger.log('Content copied to clipboard');
            this.copyButtonText.set('Copied!');
            setTimeout(
              () => this.copyButtonText.set('Copy'),
              CLIPBOARD_FEEDBACK_DURATION_MS
            );
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
