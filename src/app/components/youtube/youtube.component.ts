import { animate, style, transition, trigger } from '@angular/animations';
import { AsyncPipe, NgIf, DecimalPipe } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  OnInit,
  OnDestroy,
  computed,
  signal
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Observable, distinctUntilChanged, debounceTime, switchMap, of, EMPTY } from 'rxjs';
import { VideoFineTuningConfig } from '../../models/types';
import {
  ApiService,
  RewriteRequest,
  RewriteResponse,
  SummariseResponse,
  YouTubeSummariseRequest,
  TokenCountResponse,
} from '../../services/api.service';
import { DrawerService } from '../../services/drawer.service';
import { LoggerService } from '../../services/logger.service';
import { SummaryResultComponent } from '../summary-result/summary-result.component';
import { YoutubeFineTuningComponent } from '../youtube-fine-tuning/youtube-fine-tuning.component';
import { YoutubeVideoPreviewComponent } from '../youtube-video-preview/youtube-video-preview.component';
import { MultilineInputComponent } from '../multiline-input/multiline-input.component';
@Component({
  selector: 'app-youtube',
  imports: [
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    MatIconModule,
    ReactiveFormsModule,
    NgIf,
    AsyncPipe,
    DecimalPipe,
    YoutubeVideoPreviewComponent,
    YoutubeFineTuningComponent,
    MatTooltipModule,
    SummaryResultComponent,
    MultilineInputComponent,
  ],
  templateUrl: './youtube.component.html',
  styleUrl: './youtube.component.scss',
  animations: [
    trigger('slideInOut', [
      transition(':enter', [
        style({ transform: 'translateY(100%)', opacity: 0 }),
        animate(
          '200ms ease-out',
          style({ transform: 'translateY(0)', opacity: 1 })
        ),
      ]),
      transition(':leave', [
        animate(
          '200ms ease-in',
          style({ transform: 'translateY(100%)', opacity: 0 })
        ),
      ]),
    ]),
  ],
})
export class YoutubeComponent implements OnInit, OnDestroy {
  // YouTube URL regex pattern
  private youtubePattern =
    /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}([&?].*)?$/;

  inputControl = new FormControl('', [
    Validators.required,
    Validators.pattern(this.youtubePattern),
  ]);

  videoDuration = signal<number | null>(null);
  errorMessage150 = signal<string | null>(null);
  isFineTuningExpanded = signal<boolean>(false);
  isLoadingVideo = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);
  summaryResult = signal<SummariseResponse | null>(null);
  submitError = signal<string | null>(null);
  isRegenerating = signal<boolean>(false);
  isLoadingSummary = signal<boolean>(false);
  copyButtonText = signal<string>('Copy');
  fineTuningConfig = signal<VideoFineTuningConfig | null>({
    startSeconds: 0,
    endSeconds: 0,
    fps: 1,
    customPrompt: '',
  });

  // Token counting signals
  tokenCount = signal<number | null>(null);
  isLoadingTokens = signal<boolean>(false);
  private tokenCountingTimeout: any = null;

  // Signal to track input control state for reactive computed properties
  inputState = signal({ valid: false, value: '' });

  // Persistent fine-tuning state in memory
  private persistentFineTuningConfig: VideoFineTuningConfig | null = null;
  private persistentIsExpanded: boolean = false;
  private persistentVideoDuration: number | null = null; // Track the duration when config was saved

  // Drawer state observables
  isDesktopDrawerCollapsed$: Observable<boolean>;

  // Fine-tuning input state
  showFineTuningInput = signal<boolean>(false);

  // Computed signal to detect if user has custom fine tuning config
  hasCustomFineTuningConfig = computed(() => {
    const config = this.fineTuningConfig();
    if (!config) return false;

    const duration = this.videoDuration();
    if (!duration) return false;

    // Check if any value differs from defaults
    const hasCustomStart = config.startSeconds > 0;
    const hasCustomEnd = config.endSeconds < duration;
    const hasCustomFps = config.fps !== 1;
    const hasCustomPrompt = config.customPrompt.trim() !== '';

    return hasCustomStart || hasCustomEnd || hasCustomFps || hasCustomPrompt;
  });

  constructor(
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private drawerService: DrawerService,
    private apiService: ApiService
  ) {
    this.isDesktopDrawerCollapsed$ = this.drawerService.desktopDrawerCollapsed$;
  }

  ngOnInit() {
    // Subscribe to input changes for proper signal updates
    this.inputControl.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe(() => {
        // Update input state signal for reactive computed properties
        this.inputState.set({
          valid: this.inputControl.valid,
          value: this.inputControl.value || '',
        });

        this.videoDuration.set(null);
        this.errorMessage150.set(null);
        this.summaryResult.set(null);
        this.isSubmitting.set(false);
        this.tokenCount.set(null);

        // Set loading state for valid URLs only
        if (
          this.inputControl.valid &&
          this.inputControl.value &&
          this.inputControl.value.trim() !== ''
        ) {
          this.isLoadingVideo.set(true);
        } else {
          this.isLoadingVideo.set(false);
        }

        // Handle fine-tuning state based on input validity and expansion state
        if (this.inputControl.invalid) {
          // Reset everything if input becomes invalid
          this.fineTuningConfig.set(null);
          this.isFineTuningExpanded.set(false);
          this.persistentFineTuningConfig = null;
          this.persistentIsExpanded = false;
          this.persistentVideoDuration = null;
          this.isLoadingVideo.set(false);
        } else if (this.inputControl.valid && !this.isFineTuningExpanded()) {
          // If fine tuning is collapsed and URL changed, reset config
          this.fineTuningConfig.set(null);
          this.persistentFineTuningConfig = null;
          this.persistentVideoDuration = null;
        }
        // If expanded, preserve current config (existing behavior)
        // Manually trigger change detection to update button states immediately
        this.cdr.detectChanges();
      });

    // Initialize input state
    this.inputState.set({
      valid: this.inputControl.valid,
      value: this.inputControl.value || '',
    });

    // Setup debounced token counting for URL and fine-tuning changes
    this.setupTokenCounting();
  }

  ngOnDestroy() {
    // Clean up timeout to prevent memory leaks
    if (this.tokenCountingTimeout) {
      clearTimeout(this.tokenCountingTimeout);
    }
  }

  private setupTokenCounting() {
    // Create a combined observable for URL and fine-tuning changes
    const urlChanges$ = this.inputControl.valueChanges.pipe(
      distinctUntilChanged()
    );

    // Subscribe to URL changes with debouncing for token counting
    urlChanges$
      .pipe(
        debounceTime(1500),
        switchMap(() => {
          if (
            this.inputControl.valid &&
            this.inputControl.value &&
            this.videoDuration()
          ) {
            this.isLoadingTokens.set(true);
            return this.countTokens();
          } else {
            this.tokenCount.set(null);
            this.isLoadingTokens.set(false);
            return EMPTY;
          }
        })
      )
      .subscribe({
        next: (response) => {
          this.tokenCount.set(response.totalTokens);
          this.isLoadingTokens.set(false);
        },
        error: (error) => {
          this.logger.error('Token counting failed:', error);
          this.tokenCount.set(null);
          this.isLoadingTokens.set(false);
        },
      });
  }

  private countTokens(): Observable<TokenCountResponse> {
    const request: YouTubeSummariseRequest = {
      url: this.inputControl.value || '',
    };

    // Add fine-tuning configuration if available
    const config = this.fineTuningConfig();
    if (config && this.isFineTuningExpanded()) {
      if (config.customPrompt) {
        request.customPrompt = config.customPrompt;
      }
      if (config.startSeconds !== undefined && config.startSeconds > 0) {
        request.startSeconds = config.startSeconds;
      }
      if (config.endSeconds !== undefined && config.endSeconds > 0) {
        request.endSeconds = config.endSeconds;
      }
      if (config.fps !== undefined && config.fps > 0) {
        request.fps = config.fps;
      }
    }

    return this.apiService.countYouTubeTokens(request);
  }

  onDuration(duration: number) {
    this.logger.log('Received duration:', duration, 'seconds');

    // Restore persistent fine-tuning state if available
    if (this.persistentFineTuningConfig && this.persistentVideoDuration) {
      const config = this.persistentFineTuningConfig;
      const oldDuration = this.persistentVideoDuration;

      // Smart restoration logic - don't persist default values
      let startSeconds = 0;
      let endSeconds = duration;

      // Only restore startSeconds if it wasn't at default (0) in the previous video
      if (config.startSeconds > 0) {
        startSeconds = Math.min(config.startSeconds, duration);
      }

      // Only restore endSeconds if it wasn't at default (full duration) in the previous video
      if (config.endSeconds < oldDuration) {
        endSeconds = Math.min(config.endSeconds, duration);
      }

      // Ensure start is not greater than end after adjustment
      if (startSeconds >= endSeconds) {
        startSeconds = 0;
        endSeconds = duration;
      }

      const adjustedConfig: VideoFineTuningConfig = {
        ...config,
        startSeconds,
        endSeconds,
      };

      this.fineTuningConfig.set(adjustedConfig);
      this.isFineTuningExpanded.set(this.persistentIsExpanded);
    } else {
      // First time or no persistent config - set default
      this.fineTuningConfig.set({
        startSeconds: 0,
        endSeconds: duration,
        fps: 1,
        customPrompt: '',
      });
    }

    this.videoDuration.set(duration);
    this.isLoadingVideo.set(false);

    // Trigger token counting when video duration is available
    if (this.inputControl.valid && this.inputControl.value) {
      this.isLoadingTokens.set(true);
      this.countTokens().subscribe({
        next: (response) => {
          this.tokenCount.set(response.totalTokens);
          this.isLoadingTokens.set(false);
        },
        error: (error) => {
          this.logger.error('Token counting failed:', error);
          this.tokenCount.set(null);
          this.isLoadingTokens.set(false);
        },
      });
    }
  }

  onVideoError(errorCode: number) {
    this.logger.log('=== YouTube component onVideoError called ===');
    this.logger.log('YouTube player error:', errorCode);

    let errorMessage: string;

    switch (errorCode) {
      case 2:
        errorMessage = 'Invalid video ID or video not found';
        break;
      case 5:
        errorMessage = 'HTML5 player error occurred';
        break;
      case 100:
        errorMessage = 'Video not found or has been removed';
        break;
      case 101:
        errorMessage = 'Video owner has restricted playback on other websites';
        break;
      case 150:
        errorMessage =
          'YouTube video access has been restricted on other websites';
        break;
      default:
        errorMessage = `YouTube player error occurred (Error code: ${errorCode})`;
        break;
    }

    this.logger.log('Setting error message:', errorMessage);
    this.errorMessage150.set(errorMessage);

    // Collapse fine-tuning when video has errors
    this.isFineTuningExpanded.set(false);
    this.isLoadingVideo.set(false);
  }

  onSubmit() {
    if (
      this.inputControl.valid &&
      this.videoDuration() &&
      this.videoDuration()! > 0
    ) {
      this.logger.log(
        'Submitting YouTube URL:',
        this.inputControl.value,
        'Duration:',
        this.videoDuration()
      );

      this.isSubmitting.set(true);
      this.submitError.set(null);
      this.summaryResult.set(null);
      this.isLoadingSummary.set(true);

      const request: YouTubeSummariseRequest = {
        url: this.inputControl.value || '',
      };

      // Add fine-tuning configuration if available
      const config = this.fineTuningConfig();
      if (config && this.isFineTuningExpanded()) {
        if (config.customPrompt) {
          request.customPrompt = config.customPrompt;
        }
        if (config.startSeconds !== undefined && config.startSeconds > 0) {
          request.startSeconds = config.startSeconds;
        }
        if (config.endSeconds !== undefined && config.endSeconds > 0) {
          request.endSeconds = config.endSeconds;
        }
        if (config.fps !== undefined && config.fps > 0) {
          request.fps = config.fps;
        }
      }

      this.apiService.summariseYouTube(request).subscribe({
        next: (response) => {
          this.logger.log('YouTube summarisation successful:', response);
          this.summaryResult.set(response);
          this.isSubmitting.set(false);
          this.isLoadingSummary.set(false);
        },
        error: (error) => {
          this.logger.error('YouTube summarisation failed:', error);
          this.submitError.set(
            error.error?.message ||
              error.message ||
              'Failed to summarise YouTube video'
          );
          this.isSubmitting.set(false);
          this.isLoadingSummary.set(false);
        },
      });
    }
  }

  toggleFineTuning() {
    const newExpandedState = !this.isFineTuningExpanded();
    this.isFineTuningExpanded.set(newExpandedState);
    // Save expanded state to persistent memory
    this.persistentIsExpanded = newExpandedState;

    // When collapsing, preserve the config instead of resetting
    if (!newExpandedState) {
      // Save current config to persistent memory if it exists
      const currentConfig = this.fineTuningConfig();
      if (currentConfig) {
        this.persistentFineTuningConfig = { ...currentConfig };
        this.persistentVideoDuration = this.videoDuration();
      }
    }
  }

  onFineTuningConfigChange(config: VideoFineTuningConfig) {
    this.fineTuningConfig.set(config);
    // Save config to persistent memory
    this.persistentFineTuningConfig = { ...config };
    this.persistentVideoDuration = this.videoDuration();
    this.logger.log('Fine-tuning config updated:', config);

    // Trigger debounced token counting when fine-tuning config changes
    if (
      this.inputControl.valid &&
      this.inputControl.value &&
      this.videoDuration()
    ) {
      // Cancel any existing debounced token counting
      if (this.tokenCountingTimeout) {
        clearTimeout(this.tokenCountingTimeout);
      }

      this.isLoadingTokens.set(true);

      // Debounce token counting for 1500ms
      this.tokenCountingTimeout = setTimeout(() => {
        this.countTokens().subscribe({
          next: (response) => {
            this.tokenCount.set(response.totalTokens);
            this.isLoadingTokens.set(false);
          },
          error: (error) => {
            this.logger.error('Token counting failed:', error);
            this.tokenCount.set(null);
            this.isLoadingTokens.set(false);
          },
        });
      }, 1500);
    }
  }

  copySummary() {
    const summary = this.summaryResult()?.summary;
    if (summary) {
      navigator.clipboard
        .writeText(summary)
        .then(() => {
          this.logger.log('Summary copied to clipboard');
          this.copyButtonText.set('Copied!');
          // Reset button text after 2 seconds
          setTimeout(() => {
            this.copyButtonText.set('Copy');
          }, 2000);
        })
        .catch((err) => {
          this.logger.error('Failed to copy summary:', err);
        });
    }
  }

  onRegenerateSummary() {
    if (
      this.inputControl.valid &&
      this.videoDuration() &&
      this.videoDuration()! > 0
    ) {
      this.logger.log('Regenerating summary with current fine-tuning config');

      this.isRegenerating.set(true);
      this.submitError.set(null);

      const request: YouTubeSummariseRequest = {
        url: this.inputControl.value || '',
      };

      // Add fine-tuning configuration if available
      const config = this.fineTuningConfig();
      if (config && this.isFineTuningExpanded()) {
        if (config.customPrompt) {
          request.customPrompt = config.customPrompt;
        }
        if (config.startSeconds !== undefined && config.startSeconds > 0) {
          request.startSeconds = config.startSeconds;
        }
        if (config.endSeconds !== undefined && config.endSeconds > 0) {
          request.endSeconds = config.endSeconds;
        }
        if (config.fps !== undefined && config.fps > 0) {
          request.fps = config.fps;
        }
      }

      this.apiService.summariseYouTube(request).subscribe({
        next: (response) => {
          this.logger.log('YouTube regeneration successful:', response);
          this.summaryResult.set(response);
          this.isRegenerating.set(false);
        },
        error: (error) => {
          this.logger.error('YouTube regeneration failed:', error);
          this.submitError.set(
            error.error?.message ||
              error.message ||
              'Failed to regenerate YouTube summary'
          );
          this.isRegenerating.set(false);
        },
      });
    }
  }

  onRewriteSummary() {
    const currentSummary = this.summaryResult();
    if (!currentSummary?.requestId) {
      this.logger.error('No summary available to rewrite');
      return;
    }

    const rewritePrompt = prompt(
      'How would you like to rewrite the summary?',
      'Make it more concise and focus on key points'
    );

    if (!rewritePrompt || rewritePrompt.trim() === '') {
      this.logger.log('Rewrite cancelled by user');
      return;
    }

    this.logger.log('Rewriting summary with prompt:', rewritePrompt);
    this.isRegenerating.set(true);
    this.submitError.set(null);

    const request: RewriteRequest = {
      requestId: currentSummary.requestId,
      prompt: rewritePrompt.trim(),
    };

    this.apiService.rewriteSummary(request).subscribe({
      next: (response: RewriteResponse) => {
        this.logger.log('Summary rewrite successful:', response);
        this.summaryResult.set(response);
        this.isRegenerating.set(false);
      },
      error: (error) => {
        this.logger.error('Summary rewrite failed:', error);
        this.submitError.set(
          error.error?.message || error.message || 'Failed to rewrite summary'
        );
        this.isRegenerating.set(false);
      },
    });
  }

  onFineTuningSummary() {
    const currentSummary = this.summaryResult();
    if (!currentSummary?.requestId) {
      this.logger.error('No summary available for fine-tuning');
      return;
    }

    this.logger.log('Opening fine-tuning input dialog');
    this.showFineTuningInput.set(true);
  }

  onClearSummary() {
    this.summaryResult.set(null);
    this.isLoadingSummary.set(false);
  }

  errorMessage = computed(() => {
    if (this.inputControl.hasError('required')) {
      return 'YouTube URL is required';
    }
    if (this.inputControl.hasError('pattern')) {
      return 'Please enter a valid YouTube URL';
    }
    return '';
  });

  isValidUrl = computed(() => {
    const inputState = this.inputState();
    const isValid =
      inputState.valid &&
      inputState.value &&
      inputState.value.trim() !== '' &&
      !!this.videoDuration() &&
      !this.errorMessage150();
    this.logger.log('isValidUrl check:', {
      controlValid: inputState.valid,
      hasValue: !!inputState.value,
      valueNotEmpty: inputState.value ? inputState.value.trim() !== '' : false,
      noError150: !this.errorMessage150(),
      finalResult: isValid,
    });
    return isValid;
  });

  // Calculate tokens based on summary length
  calculateSummaryTokens(): number {
    const summary = this.summaryResult()?.summary;
    if (!summary) return 0;
    return Math.round((summary.length / 4) * 1.25);
  }

  // Handle fine-tuning input submission
  onFineTuningSubmit(input: string) {
    const currentSummary = this.summaryResult();
    if (!currentSummary?.requestId) {
      this.logger.error('No summary available for fine-tuning');
      return;
    }

    this.logger.log('Fine-tuning summary with input:', input);
    this.isRegenerating.set(true);
    this.submitError.set(null);
    this.showFineTuningInput.set(false);

    const request: RewriteRequest = {
      requestId: currentSummary.requestId,
      prompt: input,
    };

    this.apiService.rewriteSummary(request).subscribe({
      next: (response: RewriteResponse) => {
        this.logger.log('Fine-tuning rewrite successful:', response);
        this.summaryResult.set(response);
        this.isRegenerating.set(false);
      },
      error: (error) => {
        this.logger.error('Fine-tuning rewrite failed:', error);
        this.submitError.set(
          error.error?.message ||
            error.message ||
            'Failed to apply fine-tuning to summary'
        );
        this.isRegenerating.set(false);
      },
    });
  }

  // Handle fine-tuning input cancellation
  onFineTuningCancel() {
    this.showFineTuningInput.set(false);
  }
}
