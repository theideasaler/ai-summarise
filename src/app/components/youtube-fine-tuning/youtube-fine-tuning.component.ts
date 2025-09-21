import {
  Component,
  computed,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  signal,
  SimpleChanges,
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { VideoFineTuningConfig } from '../../models/types';

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
    MatTooltipModule,
    FormsModule,
  ],
  templateUrl: './youtube-fine-tuning.component.html',
  styleUrl: './youtube-fine-tuning.component.scss'
})
export class YoutubeFineTuningComponent
  implements OnInit, OnDestroy, OnChanges
{
  // Classic @Input()s with values
  @Input() videoDuration: number | null = null;
  @Input() isExpanded: boolean = false;
  @Input() initialConfig: VideoFineTuningConfig | null = null;

  @Output() configChange = new EventEmitter<VideoFineTuningConfig>();

  // Remove debouncing subjects - let parent handle all debouncing

  // Internal signals
  startSeconds = signal<number>(0);
  endSeconds = signal<number>(0);
  fps = signal<number>(1);
  customPrompt = signal<string>('');

  // Computed values
  config = computed<VideoFineTuningConfig>(() => ({
    startSeconds: this.startSeconds(),
    endSeconds: this.endSeconds(),
    fps: this.fps(),
    customPrompt: this.customPrompt(),
  }));

  startTimeFormatted = computed(() => this.formatTime(this.startSeconds()));
  endTimeFormatted = computed(() => this.formatTime(this.endSeconds()));

  ngOnChanges(changes: SimpleChanges): void {
    // Respond to changes from parent for duration or initial config
    const duration = this.videoDuration ?? 0;

    if (duration > 0) {
      if (this.initialConfig) {
        const cfg = { ...this.initialConfig };
        // Clamp to duration
        cfg.startSeconds = Math.max(0, Math.min(cfg.startSeconds, duration));
        cfg.endSeconds = Math.max(
          cfg.startSeconds,
          Math.min(cfg.endSeconds, duration)
        );
        this.startSeconds.set(cfg.startSeconds);
        this.endSeconds.set(cfg.endSeconds);
        this.fps.set(cfg.fps);
        this.customPrompt.set(cfg.customPrompt);
      } else {
        // Defaults
        this.startSeconds.set(0);
        this.endSeconds.set(duration);
        this.fps.set(1);
        this.customPrompt.set('');
      }
    }
  }

  ngOnInit() {
    // No debouncing needed - parent handles all debouncing
  }

  ngOnDestroy() {
    // No cleanup needed
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
    this.customPrompt.set(target.value);
    this.emitConfigChange();
  }

  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
        .toString()
        .padStart(2, '0')}`;
    }
  }

  // Function used by MatSlider [displayWith] - arrow function to preserve 'this' context
  formatLabel = (value: number | null): string => {
    return this.formatTime(value ?? 0);
  };

  private emitConfigChange() {
    this.configChange.emit(this.config());
  }

  // Resize handle functionality
  private isResizing = false;
  private startY = 0;
  private startHeight = 0;
  private textarea: HTMLTextAreaElement | null = null;

  onResizeStart(event: MouseEvent | TouchEvent) {
    event.preventDefault();
    this.isResizing = true;
    
    // Get the textarea element
    const container = (event.target as HTMLElement).closest('.textarea-container');
    this.textarea = container?.querySelector('textarea') as HTMLTextAreaElement;
    
    if (!this.textarea) return;
    
    // Get initial values
    this.startY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
    this.startHeight = this.textarea.offsetHeight;
    
    // Add global event listeners
    document.addEventListener('mousemove', this.onResize.bind(this));
    document.addEventListener('mouseup', this.onResizeEnd.bind(this));
    document.addEventListener('touchmove', this.onResize.bind(this));
    document.addEventListener('touchend', this.onResizeEnd.bind(this));
    
    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
  }

  private onResize(event: MouseEvent | TouchEvent) {
    if (!this.isResizing || !this.textarea) return;
    
    const currentY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
    const deltaY = currentY - this.startY;
    const newHeight = Math.max(72, this.startHeight + deltaY); // Minimum height of 72px
    
    this.textarea.style.height = `${newHeight}px`;
  }

  private onResizeEnd() {
    if (!this.isResizing) return;
    
    this.isResizing = false;
    this.textarea = null;
    
    // Remove global event listeners
    document.removeEventListener('mousemove', this.onResize.bind(this));
    document.removeEventListener('mouseup', this.onResizeEnd.bind(this));
    document.removeEventListener('touchmove', this.onResize.bind(this));
    document.removeEventListener('touchend', this.onResizeEnd.bind(this));
    
    // Restore text selection
    document.body.style.userSelect = '';
  }
}
