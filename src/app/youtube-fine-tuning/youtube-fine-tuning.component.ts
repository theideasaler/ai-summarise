import { Component, Input, Output, EventEmitter, signal, computed, OnInit, OnDestroy, effect, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSliderModule } from '@angular/material/slider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { debounceTime, Subject, takeUntil } from 'rxjs';
import { VideoFinetuningConfig } from '../shared/types';

@Component({
  selector: 'app-youtube-fine-tuning',
  standalone: true,
  imports: [
    CommonModule,
    MatSliderModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    FormsModule,
  ],
  templateUrl: './youtube-fine-tuning.component.html',
  styleUrl: './youtube-fine-tuning.component.scss',
})
export class YoutubeFinetuningComponent implements OnInit, OnDestroy {
  @Input() videoDuration!: Signal<number | null>;
  @Input() isExpanded!: Signal<boolean>;
  @Output() configChange = new EventEmitter<VideoFinetuningConfig>();

  private destroy$ = new Subject<void>();
  private promptSubject = new Subject<string>();

  constructor() {
    // Watch for video duration changes to update default values only
    effect(() => {
      const duration = this.videoDuration();
      if (duration && duration > 0) {
        this.startSeconds.set(0);
        this.endSeconds.set(duration);
        // No emission here - only emit when user interacts
      }
    });
  }

  // Internal signals
  startSeconds = signal<number>(0);
  endSeconds = signal<number>(0);
  fps = signal<number>(1);
  customPrompt = signal<string>('');

  // Computed values
  config = computed<VideoFinetuningConfig>(() => ({
    startSeconds: this.startSeconds(),
    endSeconds: this.endSeconds(),
    fps: this.fps(),
    customPrompt: this.customPrompt(),
  }));

  startTimeFormatted = computed(() => this.formatTime(this.startSeconds()));
  endTimeFormatted = computed(() => this.formatTime(this.endSeconds()));

  ngOnInit() {
    // Set up debounced prompt changes
    this.promptSubject
      .pipe(debounceTime(500), takeUntil(this.destroy$))
      .subscribe((prompt) => {
        this.customPrompt.set(prompt);
        this.emitConfigChange();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onRangeChange(value: number) {
    this.startSeconds.set(value);
    this.emitConfigChange();
  }

  onEndRangeChange(value: number) {
    this.endSeconds.set(value);
    this.emitConfigChange();
  }

  onFpsChange(delta: number) {
    const newFps = Math.max(1, Math.min(5, this.fps() + delta));
    this.fps.set(newFps);
    this.emitConfigChange();
  }

  onPromptChange(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    this.promptSubject.next(target.value);
  }

  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
      .toString()
      .padStart(2, '0')}`;
  }

  private emitConfigChange() {
    this.configChange.emit(this.config());
  }
}