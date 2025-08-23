import {
  Component,
  computed,
  signal,
  OnInit,
  effect,
  ChangeDetectorRef,
} from '@angular/core';
import { LoggerService } from '../shared/logger.service';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { NgIf } from '@angular/common';
import { YoutubeVideoPreviewComponent } from '../youtube-video-preview/youtube-video-preview.component';
import { YoutubeFinetuningComponent } from '../youtube-fine-tuning/youtube-fine-tuning.component';
import { VideoFinetuningConfig } from '../shared/types';
import { distinctUntilChanged } from 'rxjs';
@Component({
  selector: 'app-youtube',
  imports: [
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    MatIconModule,
    ReactiveFormsModule,
    NgIf,
    YoutubeVideoPreviewComponent,
    YoutubeFinetuningComponent,
  ],
  templateUrl: './youtube.component.html',
  styleUrl: './youtube.component.scss',
})
export class YoutubeComponent implements OnInit {
  // YouTube URL regex pattern
  private youtubePattern =
    /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}([&?].*)?$/;

  inputControl = new FormControl('', [
    Validators.required,
    Validators.pattern(this.youtubePattern),
  ]);

  videoDuration = signal<number | null>(null);
  errorMessage150 = signal<string | null>(null);
  isFinetuningExpanded = signal<boolean>(false);
  isLoadingVideo = signal<boolean>(false);
  finetuningConfig = signal<VideoFinetuningConfig | null>({
    startSeconds: 0,
    endSeconds: 0,
    fps: 1,
    customPrompt: '',
  });

  // Signal to track input control state for reactive computed properties
  inputState = signal({ valid: false, value: '' });

  // Persistent fine-tuning state in memory
  private persistentFinetuningConfig: VideoFinetuningConfig | null = null;
  private persistentIsExpanded: boolean = false;
  private persistentVideoDuration: number | null = null; // Track the duration when config was saved

  constructor(private cdr: ChangeDetectorRef, private logger: LoggerService) {}

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

        // Don't reset fine-tuning state here - preserve it for valid URLs
        // Only reset if input becomes invalid
        if (this.inputControl.invalid) {
          this.finetuningConfig.set(null);
          this.isFinetuningExpanded.set(false);
          this.persistentFinetuningConfig = null;
          this.persistentIsExpanded = false;
          this.persistentVideoDuration = null;
          this.isLoadingVideo.set(false);
        }
        // Manually trigger change detection to update button states immediately
        this.cdr.detectChanges();
      });

    // Initialize input state
    this.inputState.set({
      valid: this.inputControl.valid,
      value: this.inputControl.value || '',
    });
  }

  onDuration(duration: number) {
    this.logger.log('Received duration:', duration, 'seconds');

    // Restore persistent fine-tuning state if available
    if (this.persistentFinetuningConfig && this.persistentVideoDuration) {
      const config = this.persistentFinetuningConfig;
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

      const adjustedConfig: VideoFinetuningConfig = {
        ...config,
        startSeconds,
        endSeconds,
      };

      this.finetuningConfig.set(adjustedConfig);
      this.isFinetuningExpanded.set(this.persistentIsExpanded);
    } else {
      // First time or no persistent config - set default
      this.finetuningConfig.set({
        startSeconds: 0,
        endSeconds: duration,
        fps: 1,
        customPrompt: '',
      });
    }

    this.videoDuration.set(duration);
    this.isLoadingVideo.set(false);
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
    this.isFinetuningExpanded.set(false);
    this.isLoadingVideo.set(false);
  }

  onSubmit() {
    if (this.inputControl.valid) {
      this.logger.log('Input value:', this.inputControl.value);
      this.logger.log('Video duration:', this.videoDuration(), 'seconds');
      // Add your submit logic here
    } else {
      this.logger.log('Invalid YouTube URL');
    }
  }

  toggleFinetuning() {
    const newExpandedState = !this.isFinetuningExpanded();
    this.isFinetuningExpanded.set(newExpandedState);
    // Save expanded state to persistent memory
    this.persistentIsExpanded = newExpandedState;
    // If collapsed, reset config
    if (!newExpandedState) {
      this.finetuningConfig.set(null);
      this.persistentFinetuningConfig = null;
      this.persistentVideoDuration = null;
    }
  }

  onFinetuningConfigChange(config: VideoFinetuningConfig) {
    this.finetuningConfig.set(config);
    // Save config to persistent memory
    this.persistentFinetuningConfig = { ...config };
    this.persistentVideoDuration = this.videoDuration();
    this.logger.log('Fine-tuning config updated:', config);
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
}
