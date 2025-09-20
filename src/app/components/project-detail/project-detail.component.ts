import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ProjectResponse } from '../../services/api.service';
import { LoggerService } from '../../services/logger.service';
import { ProjectService } from '../../services/project.service';
import { TokenBadgeComponent } from '../shared/token-badge/token-badge.component';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatMenuModule,
    MatSnackBarModule,
    TokenBadgeComponent,
  ],
  templateUrl: './project-detail.component.html',
  styleUrl: './project-detail.component.scss',
})
export class ProjectDetailComponent implements OnInit, OnDestroy {
  project: ProjectResponse | null = null;
  isLoading = true;
  error: string | null = null;

  // Copy button states
  copyButtonStates = {
    summary: signal<string>('Copy'),
    rewrite: signal<string>('Copy'),
    url: signal<string>('Copy')
  };

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private projectService: ProjectService,
    private logger: LoggerService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.route.params
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        const projectId = params['id'];
        if (projectId) {
          this._loadProject(projectId);
        } else {
          this.error = 'No project ID provided';
          this.isLoading = false;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.projectService.clearProject();
  }

  private _loadProject(projectId: string): void {
    this.isLoading = true;
    this.error = null;

    this.projectService.loadProject(projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (project) => {
          this.project = project;
          this.isLoading = false;
          this.logger.log('Project loaded successfully:', project);
        },
        error: (error) => {
          this.logger.error('Failed to load project:', error);
          this.error = error?.error?.message || 'Failed to load project details';
          this.isLoading = false;
          
          if (error?.status === 404) {
            this.error = 'Project not found';
          } else if (error?.status === 403) {
            this.error = 'You do not have permission to view this project';
          }
        },
      });
  }

  getContentTypeIcon(): string {
    if (!this.project) return 'description';
    
    switch (this.project.contentType) {
      case 'youtube':
        return 'smart_display';
      case 'text':
        return 'text_fields';
      case 'image':
        return 'image';
      case 'audio':
        return 'audiotrack';
      case 'video':
        return 'videocam';
      case 'webpage':
        return 'language';
      default:
        return 'description';
    }
  }

  getContentTypeLabel(): string {
    if (!this.project) return '';
    
    switch (this.project.contentType) {
      case 'youtube':
        return 'YouTube';
      case 'text':
        return 'Text';
      case 'image':
        return 'Image';
      case 'audio':
        return 'Audio';
      case 'video':
        return 'Video';
      case 'webpage':
        return 'Webpage';
      default:
        return this.project.contentType;
    }
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }



  getInputPreview(): string {
    if (!this.project) return '';
    
    // For now, return the project name as a preview
    // This will be enhanced when we have actual input data stored
    const name = this.project.name;
    
    // If it's a URL (YouTube or webpage), return it as is
    if (this.project.contentType === 'youtube' || this.project.contentType === 'webpage') {
      if (name.startsWith('http')) {
        return name;
      }
    }
    
    // For text, truncate to 100 characters
    if (this.project.contentType === 'text' && name.length > 100) {
      return name.substring(0, 100) + '...';
    }
    
    return name;
  }

  isUrl(): boolean {
    if (!this.project) return false;
    const contentType = this.project.contentType;
    return contentType === 'youtube' || contentType === 'webpage';
  }

  isTextContent(): boolean {
    if (!this.project) return false;
    return this.project.contentType === 'text';
  }

  isFileContent(): boolean {
    if (!this.project) return false;
    const contentType = this.project.contentType;
    return contentType === 'image' || contentType === 'audio' || contentType === 'video';
  }

  copyToClipboard(text: string, label: string = 'Content', buttonType?: 'summary' | 'rewrite' | 'url'): void {
    // Check for empty content
    if (!text) {
      this.snackBar.open('No content to copy', 'Close', {
        duration: 2000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
      });
      return;
    }

    // Strip HTML from the content
    const plainText = this._stripHtml(text);

    // Try modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(plainText).then(
        () => {
          this.logger.log(`${label} copied to clipboard`);
          this.snackBar.open(`${label} copied to clipboard`, 'Close', {
            duration: 2000,
            horizontalPosition: 'center',
            verticalPosition: 'bottom',
          });

          // Update button text if buttonType is provided
          if (buttonType && this.copyButtonStates[buttonType]) {
            this.copyButtonStates[buttonType].set('Copied');
            setTimeout(() => {
              this.copyButtonStates[buttonType].set('Copy');
            }, 2000);
          }
        },
        (err) => {
          this.logger.error('Failed to copy to clipboard:', err);
          this._fallbackCopy(plainText, label, buttonType);
        }
      );
    } else {
      // Fallback for older browsers
      this._fallbackCopy(plainText, label, buttonType);
    }
  }

  private _fallbackCopy(text: string, label: string, buttonType?: 'summary' | 'rewrite' | 'url'): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand('copy');
      if (successful) {
        this.snackBar.open(`${label} copied to clipboard`, 'Close', {
          duration: 2000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });

        // Update button text if buttonType is provided
        if (buttonType && this.copyButtonStates[buttonType]) {
          this.copyButtonStates[buttonType].set('Copied');
          setTimeout(() => {
            this.copyButtonStates[buttonType].set('Copy');
          }, 2000);
        }
      } else {
        throw new Error('Copy command failed');
      }
    } catch (err) {
      this.logger.error('Fallback copy failed:', err);
      this.snackBar.open('Failed to copy to clipboard', 'Close', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
      });
    }

    document.body.removeChild(textArea);
  }

  navigateToSummarisePage(): void {
    if (!this.project) return;
    
    // Map content type to the correct route
    let routeType = this.project.contentType;
    if (routeType === 'webpage') {
      routeType = 'webpage' as any;
    }
    
    this.router.navigate(['/summarise', routeType]);
  }

  goBack(): void {
    this.router.navigate(['/projects']);
  }
  
  // Export methods
  exportAsMarkdown(): void {
    if (!this.project) return;
    
    let markdown = `# ${this.project.name}\n\n`;
    markdown += `**Type:** ${this.getContentTypeLabel()}\n`;
    markdown += `**Created:** ${this.formatDate(this.project.createdAt)}\n`;
    markdown += `**Updated:** ${this.formatDate(this.project.updatedAt)}\n\n`;
    
    // Add input source section
    markdown += `## Input Source\n\n`;
    if (this.isUrl()) {
      markdown += `**URL:** ${this.getInputPreview()}\n\n`;
    } else if (this.isTextContent()) {
      markdown += `**Text Preview:**\n${this.getInputPreview()}\n\n`;
    } else if (this.isFileContent()) {
      markdown += `**File:** ${this.project.name}\n\n`;
    }
    
    // Add summary section
    if (this.project.summaryData) {
      markdown += `## Summary\n\n`;
      markdown += `${this._stripHtml(this.project.summaryData.content)}\n\n`;
      if (this.project.summaryData.tokensUsed) {
        markdown += `*Tokens used: ${this.project.summaryData.tokensUsed}*\n`;
      }
      markdown += `*Generated: ${this.formatDate(this.project.summaryData.createdAt)}*\n\n`;
    }
    
    // Add rewrite section if exists
    if (this.project.rewriteData) {
      markdown += `## Rewrite\n\n`;
      markdown += `${this._stripHtml(this.project.rewriteData.content)}\n\n`;
      if (this.project.rewriteData.tokensUsed) {
        markdown += `*Tokens used: ${this.project.rewriteData.tokensUsed}*\n`;
      }
      markdown += `*Generated: ${this.formatDate(this.project.rewriteData.createdAt)}*\n\n`;
    }
    
    this._downloadFile(markdown, `${this._sanitiseFilename(this.project.name)}.md`, 'text/markdown');
    this.logger.log('Project exported as Markdown');
  }
  
  exportAsJSON(): void {
    if (!this.project) return;
    
    const exportData = {
      id: this.project.id,
      name: this.project.name,
      contentType: this.project.contentType,
      createdAt: this.project.createdAt,
      updatedAt: this.project.updatedAt,
      input: {
        source: this.getInputPreview(),
        type: this.project.contentType,
      },
      summary: this.project.summaryData ? {
        content: this._stripHtml(this.project.summaryData.content),
        tokensUsed: this.project.summaryData.tokensUsed,
        createdAt: this.project.summaryData.createdAt,
        requestId: this.project.summaryData.requestId,
      } : null,
      rewrite: this.project.rewriteData ? {
        content: this._stripHtml(this.project.rewriteData.content),
        tokensUsed: this.project.rewriteData.tokensUsed,
        createdAt: this.project.rewriteData.createdAt,
        requestId: this.project.rewriteData.requestId,
      } : null,
    };
    
    const json = JSON.stringify(exportData, null, 2);
    this._downloadFile(json, `${this._sanitiseFilename(this.project.name)}.json`, 'application/json');
    this.logger.log('Project exported as JSON');
  }
  
  exportAsText(): void {
    if (!this.project) return;
    
    let text = `${this.project.name}\n`;
    text += `${'='.repeat(this.project.name.length)}\n\n`;
    text += `Type: ${this.getContentTypeLabel()}\n`;
    text += `Created: ${this.formatDate(this.project.createdAt)}\n`;
    text += `Updated: ${this.formatDate(this.project.updatedAt)}\n\n`;
    
    // Add input source
    text += `INPUT SOURCE\n`;
    text += `------------\n`;
    if (this.isUrl()) {
      text += `URL: ${this.getInputPreview()}\n\n`;
    } else if (this.isTextContent()) {
      text += `${this.getInputPreview()}\n\n`;
    } else if (this.isFileContent()) {
      text += `File: ${this.project.name}\n\n`;
    }
    
    // Add summary
    if (this.project.summaryData) {
      text += `SUMMARY\n`;
      text += `-------\n`;
      text += `${this._stripHtml(this.project.summaryData.content)}\n\n`;
      if (this.project.summaryData.tokensUsed) {
        text += `Tokens used: ${this.project.summaryData.tokensUsed}\n`;
      }
      text += `Generated: ${this.formatDate(this.project.summaryData.createdAt)}\n\n`;
    }
    
    // Add rewrite if exists
    if (this.project.rewriteData) {
      text += `REWRITE\n`;
      text += `-------\n`;
      text += `${this._stripHtml(this.project.rewriteData.content)}\n\n`;
      if (this.project.rewriteData.tokensUsed) {
        text += `Tokens used: ${this.project.rewriteData.tokensUsed}\n`;
      }
      text += `Generated: ${this.formatDate(this.project.rewriteData.createdAt)}\n\n`;
    }
    
    this._downloadFile(text, `${this._sanitiseFilename(this.project.name)}.txt`, 'text/plain');
    this.logger.log('Project exported as Text');
  }
  
  private _stripHtml(html: string): string {
    // Create a temporary element to parse HTML
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }
  
  private _sanitiseFilename(filename: string): string {
    // Remove or replace invalid filename characters
    return filename
      .replace(/[^a-z0-9\s\-_]/gi, '') // Keep only alphanumeric, spaces, hyphens, underscores
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .toLowerCase()
      .substring(0, 100); // Limit length
  }
  
  private _downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }
}
