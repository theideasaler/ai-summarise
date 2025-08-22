import {
  Component,
  computed,
  signal,
  OnInit,
  effect,
  ChangeDetectorRef,
} from '@angular/core';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { NgIf } from '@angular/common';
import { YoutubeVideoPreviewComponent } from '../youtube-video-preview/youtube-video-preview.component';
import { YoutubeFinetuningComponent } from '../youtube-fine-tuning/youtube-fine-tuning.component';
import { VideoFinetuningConfig } from '../shared/types';
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
    /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}(&.*)?$/;

  inputControl = new FormControl('', [
    Validators.required,
    Validators.pattern(this.youtubePattern),
  ]);

  videoDuration = signal<number | null>(null);
  errorMessage150 = signal<string | null>(null);
  isFinetuningExpanded = signal<boolean>(false);
  finetuningConfig = signal<VideoFinetuningConfig | null>({
    startSeconds: 0,
    endSeconds: 0,
    fps: 1,
    customPrompt: '',
  });

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    // Subscribe to input changes for proper signal updates
    this.inputControl.valueChanges.subscribe(() => {
      this.videoDuration.set(null);
      this.errorMessage150.set(null);
      this.finetuningConfig.set(null);
      this.isFinetuningExpanded.set(false);
      // Manually trigger change detection to update button states immediately
      this.cdr.detectChanges();
    });
  }

  onDuration(duration: number) {
    console.log('Received duration:', duration, 'seconds');
    this.videoDuration.set(duration);
    // Clear error message when video loads successfully
    this.errorMessage150.set(null);
  }

  onVideoError(errorCode: number) {
    console.log('YouTube player error:', errorCode);
    if (errorCode === 150) {
      this.errorMessage150.set(
        'YouTube Video access has been restricted on other websites'
      );
    } else {
      this.errorMessage150.set(null);
    }
  }

  onSubmit() {
    if (this.inputControl.valid) {
      console.log('Input value:', this.inputControl.value);
      console.log('Video duration:', this.videoDuration(), 'seconds');
      // Add your submit logic here
    } else {
      console.log('Invalid YouTube URL');
    }
  }

  onFineTuned() {
    if (this.inputControl.valid) {
      console.log('Input value:', this.inputControl.value);
      console.log('Video duration:', this.videoDuration(), 'seconds');
      console.log('Fine-tuning config:', this.finetuningConfig());
      // Add your fine-tuned logic here
    } else {
      console.log('Invalid YouTube URL');
    }
  }

  toggleFinetuning() {
    this.isFinetuningExpanded.set(!this.isFinetuningExpanded());
  }

  onFinetuningConfigChange(config: VideoFinetuningConfig) {
    this.finetuningConfig.set(config);
    console.log('Fine-tuning config updated:', config);
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
}
