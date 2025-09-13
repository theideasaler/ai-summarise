import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'confirm' | 'delete' | 'warning';
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <h2 mat-dialog-title>
      @if (data.type === 'delete') {
        <mat-icon color="warn">delete</mat-icon>
      } @else if (data.type === 'warning') {
        <mat-icon color="warn">warning</mat-icon>
      } @else {
        <mat-icon color="primary">help_outline</mat-icon>
      }
      {{ data.title }}
    </h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">
        {{ data.cancelText || 'Cancel' }}
      </button>
      <button 
        mat-raised-button 
        [color]="data.type === 'delete' ? 'warn' : 'primary'"
        (click)="onConfirm()">
        {{ data.confirmText || 'Confirm' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      
      mat-icon {
        font-size: 24px;
        width: 24px;
        height: 24px;
      }
    }
    
    mat-dialog-content {
      padding: 20px 24px;
      
      p {
        margin: 0;
        color: rgba(0, 0, 0, 0.87);
        font-size: 14px;
        line-height: 1.5;
      }
    }
    
    mat-dialog-actions {
      padding: 8px 24px 16px;
      gap: 8px;
    }
  `]
})
export class ConfirmDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData
  ) {}

  onConfirm(): void {
    this.dialogRef.close(true);
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}