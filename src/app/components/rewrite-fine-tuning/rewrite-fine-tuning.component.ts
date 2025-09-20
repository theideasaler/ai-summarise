import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TokenBadgeComponent } from '../shared/token-badge/token-badge.component';

@Component({
  selector: 'app-rewrite-fine-tuning',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
    TokenBadgeComponent,
  ],
  templateUrl: './rewrite-fine-tuning.component.html',
  styleUrl: './rewrite-fine-tuning.component.scss',
})
export class RewriteFineTuningComponent {
  @Input() isExpanded: boolean = false;
  @Input() tokenCount: number = 0;

  @Output() expandedChange = new EventEmitter<boolean>();
  @Output() rewriteSubmit = new EventEmitter<string>();
  @Output() customPromptSaved = new EventEmitter<string>();

  customPrompt = signal<string>('');
  savedCustomPrompt = signal<string>('');

  get isValidPrompt(): boolean {
    return true; // Make prompt optional - always valid
  }

  get hasSavedPrompt(): boolean {
    return this.savedCustomPrompt().length > 0;
  }

  toggleExpanded() {
    const newState = !this.isExpanded;
    
    // Load saved prompt when expanding
    if (newState && this.savedCustomPrompt()) {
      this.customPrompt.set(this.savedCustomPrompt());
    }
    
    this.expandedChange.emit(newState);
  }

  onPromptChange(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    const value = target.value;
    this.customPrompt.set(value);
    
    // Automatically sync the prompt
    this.savedCustomPrompt.set(value);
    this.customPromptSaved.emit(value);
  }

  onSubmit() {
    if (this.isValidPrompt) {
      this.rewriteSubmit.emit(this.customPrompt().trim());
      // Keep the prompt in the field after submission
    }
  }



  // Calculate tokens based on prompt length
  calculatePromptTokens(): number {
    const prompt = this.customPrompt();
    if (!prompt) return 0;
    return Math.round((prompt.length / 4) * 1.25);
  }

  // Get total estimated tokens (summary + prompt)
  getTotalTokens(): number {
    return this.tokenCount + this.calculatePromptTokens();
  }
}
