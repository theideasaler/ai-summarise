import { Component, Inject, OnInit, OnDestroy, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { FocusTrapFactory, FocusMonitor, A11yModule } from '@angular/cdk/a11y';
import { trigger, transition, style, animate } from '@angular/animations';
import { DeleteProjectDialogData, DeleteProjectDialogResult } from './delete-project-dialog.model';

/**
 * Delete confirmation dialog with modern UI design
 * Displays a warning icon and confirmation message for project deletion
 */
@Component({
  selector: 'app-delete-project-dialog',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatDialogModule, A11yModule],
  templateUrl: './delete-project-dialog.component.html',
  styleUrl: './delete-project-dialog.component.scss',
  animations: [
    trigger('dialogAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.95)' }),
        animate('200ms ease-out',
          style({ opacity: 1, transform: 'scale(1)' })
        )
      ]),
      transition(':leave', [
        animate('150ms ease-in',
          style({ opacity: 0, transform: 'scale(0.95)' })
        )
      ])
    ])
  ]
})
export class DeleteProjectDialogComponent implements OnInit, OnDestroy {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: DeleteProjectDialogData,
    private dialogRef: MatDialogRef<DeleteProjectDialogComponent>,
    private focusTrapFactory: FocusTrapFactory,
    private focusMonitor: FocusMonitor,
    private elementRef: ElementRef
  ) {}

  ngOnInit(): void {
    // Disable backdrop click to close
    this.dialogRef.disableClose = false;

    // Set up keyboard navigation
    this.dialogRef.keydownEvents().subscribe(event => {
      if (event.key === 'Escape') {
        this.onCancel();
      }
    });
  }

  ngOnDestroy(): void {
    // Clean up focus monitoring
    this.focusMonitor.stopMonitoring(this.elementRef.nativeElement);
  }

  /**
   * Handle cancel action - closes dialog without deletion
   */
  onCancel(): void {
    const result: DeleteProjectDialogResult = {
      confirmed: false,
      projectId: this.data.projectId
    };
    this.dialogRef.close(result);
  }

  /**
   * Handle confirm action - closes dialog and triggers deletion
   */
  onConfirm(): void {
    const result: DeleteProjectDialogResult = {
      confirmed: true,
      projectId: this.data.projectId
    };
    this.dialogRef.close(result);
  }

  /**
   * Get formatted project name for display
   */
  get displayProjectName(): string {
    return this.data.projectName || 'Untitled Project';
  }

  /**
   * Get formatted creation date if available
   */
  get formattedDate(): string | null {
    if (!this.data.createdAt) return null;
    return new Date(this.data.createdAt).toLocaleDateString();
  }
}