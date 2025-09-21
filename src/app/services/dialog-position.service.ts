import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { LoggerService } from './logger.service';

const CSS_OFFSET_VARIABLE = '--app-drawer-offset';

@Injectable({
  providedIn: 'root'
})
export class DialogPositionService {
  constructor(
    @Inject(DOCUMENT) private document: Document,
    private logger: LoggerService
  ) {}

  /**
   * Reads the current drawer offset from the root CSS variable.
   * Returns 0 when the value is missing or cannot be parsed.
   */
  getDrawerOffset(): number {
    try {
      const root = this.document?.documentElement;
      if (!root) {
        this.logger.warn('DialogPositionService: document root missing');
        return 0;
      }

      const computed = getComputedStyle(root).getPropertyValue(CSS_OFFSET_VARIABLE);
      if (!computed) {
        this.logger.warn('DialogPositionService: CSS variable not found', CSS_OFFSET_VARIABLE);
        return 0;
      }

      const parsed = Number.parseFloat(computed.trim().replace('px', ''));
      if (Number.isNaN(parsed)) {
        this.logger.warn('DialogPositionService: unable to parse drawer offset', computed);
        return 0;
      }

      return parsed;
    } catch (error) {
      this.logger.warn('DialogPositionService: failed to read drawer offset', error);
      return 0;
    }
  }

  /**
   * Helper to calculate half the drawer offset used to re-centre dialogs within the main content area.
   */
  getDrawerCenterShift(): number {
    return this.getDrawerOffset() / 2;
  }
}
