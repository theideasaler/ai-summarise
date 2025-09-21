import { Injectable } from '@angular/core';
import { MatDialogConfig } from '@angular/material/dialog';

/**
 * Service to provide consistent dialog configuration
 * with proper z-index layering for overlays
 */
@Injectable({
  providedIn: 'root',
})
export class DialogConfigService {
  /**
   * Get configuration for delete project dialog
   * Ensures dialog appears above side drawer (z-index > 1100)
   */
  getDeleteDialogConfig<T>(data?: T): MatDialogConfig<T> {
    return {
      data,
      width: '400px',
      maxWidth: '90vw',
      minHeight: 'auto',
      maxHeight: '90vh',
      hasBackdrop: true,
      backdropClass: 'delete-dialog-backdrop',
      panelClass: 'delete-dialog-panel',
      autoFocus: '[cdkFocusInitial]',
      restoreFocus: true,
      closeOnNavigation: true,
      disableClose: false, // Allow backdrop click to close
    };
  }

  /**
   * Get configuration for standard Material dialogs
   * Maintains existing behavior for other dialogs
   */
  getStandardDialogConfig<T>(
    data?: T,
    width: string = '400px'
  ): MatDialogConfig<T> {
    return {
      data,
      width,
      maxWidth: '90vw',
      hasBackdrop: true,
      autoFocus: true,
      restoreFocus: true,
      closeOnNavigation: true,
    };
  }
}
