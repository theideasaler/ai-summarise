import { animate, style, transition, trigger } from '@angular/animations';
import { Component, EventEmitter, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-multiline-input',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    FormsModule,
  ],
  templateUrl: './multiline-input.component.html',
  styleUrl: './multiline-input.component.scss',
  animations: [
    trigger('slideInOut', [
      transition(':enter', [
        style({ transform: 'translateY(-100%)', opacity: 0 }),
        animate(
          '300ms ease-out',
          style({ transform: 'translateY(0)', opacity: 1 })
        ),
      ]),
      transition(':leave', [
        animate(
          '300ms ease-in',
          style({ transform: 'translateY(-100%)', opacity: 0 })
        ),
      ]),
    ]),
  ],
})
export class MultilineInputComponent {
  @Output() inputSubmit = new EventEmitter<string>();
  @Output() inputCancel = new EventEmitter<void>();

  inputValue = signal<string>('');

  onSubmit() {
    const value = this.inputValue().trim();
    if (value) {
      this.inputSubmit.emit(value);
      this.inputValue.set('');
    }
  }

  onCancel() {
    this.inputValue.set('');
    this.inputCancel.emit();
  }

  onInputChange(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    this.inputValue.set(target.value);
  }
}
