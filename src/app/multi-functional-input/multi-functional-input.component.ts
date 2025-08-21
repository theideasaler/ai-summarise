import { Component } from '@angular/core';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-multi-functional-input',
  imports: [
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    MatIconModule,
    ReactiveFormsModule,
    NgIf,
  ],
  templateUrl: './multi-functional-input.component.html',
  styleUrl: './multi-functional-input.component.scss',
})
export class MultiFunctionalInputComponent {
  // YouTube URL regex pattern
  private youtubePattern =
    /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11}(&.*)?$/;

  inputControl = new FormControl('', [
    Validators.required,
    Validators.pattern(this.youtubePattern),
  ]);

  onSubmit() {
    if (this.inputControl.valid) {
      console.log('Input value:', this.inputControl.value);
      // Add your submit logic here
    } else {
      console.log('Invalid YouTube URL');
    }
  }

  onFineTuned() {
    if (this.inputControl.valid) {
      console.log('Fine-tuned value:', this.inputControl.value);
      // Add your fine-tuned logic here
    } else {
      console.log('Invalid YouTube URL');
    }
  }

  getErrorMessage(): string {
    if (this.inputControl.hasError('required')) {
      return 'YouTube URL is required';
    }
    if (this.inputControl.hasError('pattern')) {
      return 'Please enter a valid YouTube URL';
    }
    return '';
  }
}
