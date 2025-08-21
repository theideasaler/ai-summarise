import { Component } from '@angular/core';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-multi-functional-input',
  imports: [
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    MatIconModule,
    FormsModule,
  ],
  templateUrl: './multi-functional-input.component.html',
  styleUrl: './multi-functional-input.component.scss',
})
export class MultiFunctionalInputComponent {
  inputValue: string = '';

  onSubmit() {
    console.log('Input value:', this.inputValue);
    // Add your submit logic here
  }

  onFineTuned() {
    console.log('Fine-tuned value:', this.inputValue);
    // Add your fine-tuned logic here
  }
}
