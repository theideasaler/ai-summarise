import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, ActivatedRoute } from '@angular/router';
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  takeUntil,
  throttleTime,
} from 'rxjs';
import { ApiService } from '../../services/api.service';
import { SSESimpleService, ConnectionState } from '../../services/sse-simple.service';
import { AuthService } from '../../services/auth.service';
import type {
  ProjectSummary,
  ProjectListParams,
} from '../../models/project.model';
import { LoggerService } from '../../services/logger.service';
import { TokenService } from '../../services/token.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { DeleteProjectDialogComponent } from './delete-project-dialog/delete-project-dialog.component';
import { DialogConfigService } from '../../services/dialog-config.service';
import { TokenBadgeComponent } from '../shared/token-badge/token-badge.component';
import { RewriteBadgeComponent } from '../shared/rewrite-badge/rewrite-badge.component';
import {
  getContentTypeMetadata as resolveContentTypeMetadata,
  ContentTypeUIMetadata,
} from '../../models/content-type-ui.config';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatDialogModule,
    MatTooltipModule,
    TokenBadgeComponent,
    RewriteBadgeComponent,
  ],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss',
})
export class ProjectsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private searchSubject$ = new Subject<string>();
  private sseSubscription$ = new Subject<void>();
  private tokenRefreshSubject$ = new Subject<void>();

  // State signals
  projects = signal<ProjectSummary[]>([]);
  isLoading = signal<boolean>(false);
  isLoadingMore = signal<boolean>(false);
  error = signal<string | null>(null);
  hasMore = signal<boolean>(false);
  isSSEConnecting = signal<boolean>(false);
  isSSEConnected = signal<boolean>(false);
  connectionState = signal<ConnectionState>(ConnectionState.DISCONNECTED);

  // Pagination
  currentPage = 1;
  pageSize = 10;
  totalProjects = 0;

  // Filters
  contentTypeFilter: string = '';
  searchQuery: string = '';
  sortBy: 'createdAt' | 'updatedAt' | 'name' = 'createdAt';
  sortOrder: 'asc' | 'desc' = 'desc';

  // Content type options
  contentTypes = [
    { value: '', label: 'All Types' },
    { value: 'text', label: 'Text' },
    { value: 'image', label: 'Image' },
    { value: 'audio', label: 'Audio' },
    { value: 'video', label: 'Video' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'webpage', label: 'Webpage' },
  ];

  // Sort options
  sortOptions = [
    { value: 'createdAt', label: 'Created Date' },
    { value: 'updatedAt', label: 'Updated Date' },
    { value: 'name', label: 'Name' },
  ];

  // Track projects being deleted
  deletingProjects = new Set<string>();

  constructor(
    private apiService: ApiService,
    private router: Router,
    private route: ActivatedRoute,
    private dialog: MatDialog,
    private dialogConfig: DialogConfigService,
    private logger: LoggerService,
    private tokenService: TokenService,
    private sseService: SSESimpleService,
    private authService: AuthService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this._initialiseFiltersFromQueryParams();
    this._setupSearchDebounce();
    this._setupTokenRefreshDebounce();
    this._loadProjects();
    this._subscribeToSSE();
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    this.destroy$.next();
    this.destroy$.complete();

    // Clean up SSE subscription
    this.sseSubscription$.next();
    this.sseSubscription$.complete();

    // Clean up debounce subjects
    this.tokenRefreshSubject$.complete();

    // Disconnect SSE
    this.sseService.disconnect();
  }

  private _initialiseFiltersFromQueryParams(): void {
    const queryParams = this.route.snapshot.queryParams;
    if (queryParams['contentType']) {
      this.contentTypeFilter = queryParams['contentType'];
    }
    if (queryParams['search']) {
      this.searchQuery = queryParams['search'];
    }
    if (queryParams['sortBy']) {
      this.sortBy = queryParams['sortBy'];
    }
    if (queryParams['sortOrder']) {
      this.sortOrder = queryParams['sortOrder'];
    }
  }

  private _setupSearchDebounce(): void {
    this.searchSubject$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((searchTerm) => {
        this.searchQuery = searchTerm;
        this._resetAndLoad();
      });
  }

  private _setupTokenRefreshDebounce(): void {
    this.tokenRefreshSubject$
      .pipe(throttleTime(5000), takeUntil(this.destroy$)) // Throttle to max once every 5 seconds
      .subscribe(() => {
        this.tokenService.fetchTokenInfo().then(() => {
          this.logger.log('Token information refreshed after project completion');
        }).catch(error => {
          this.logger.error('Failed to refresh token information:', error);
        });
      });
  }


  private _loadProjects(append: boolean = false): void {
    if (append) {
      this.isLoadingMore.set(true);
    } else {
      this.isLoading.set(true);
    }
    this.error.set(null);

    const params: ProjectListParams = {
      page: this.currentPage,
      limit: this.pageSize,
      sortBy: this.sortBy,
      sortOrder: this.sortOrder,
    };

    if (this.contentTypeFilter) {
      params.contentType = this.contentTypeFilter as any;
    }

    if (this.searchQuery) {
      params.name = this.searchQuery;
    }

    this.apiService
      .getProjects(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (append) {
            const currentProjects = this.projects();
            this.projects.set([...currentProjects, ...response.projects]);
          } else {
            this.projects.set(response.projects);
          }

          this.totalProjects = response.pagination.total;
          this.hasMore.set(this.currentPage < response.pagination.totalPages);

          this.isLoading.set(false);
          this.isLoadingMore.set(false);

          this._updateQueryParams();
        },
        error: (error) => {
          this.logger.error('Error loading projects:', error);
          this.error.set('Failed to load projects. Please try again.');
          this.isLoading.set(false);
          this.isLoadingMore.set(false);
        },
      });
  }

  private _resetAndLoad(): void {
    this.currentPage = 1;
    this.projects.set([]);
    this._loadProjects();
  }

  private _updateQueryParams(): void {
    const queryParams: any = {};

    if (this.contentTypeFilter) {
      queryParams.contentType = this.contentTypeFilter;
    }
    if (this.searchQuery) {
      queryParams.search = this.searchQuery;
    }
    if (this.sortBy !== 'createdAt') {
      queryParams.sortBy = this.sortBy;
    }
    if (this.sortOrder !== 'desc') {
      queryParams.sortOrder = this.sortOrder;
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }

  // Public methods for template
  onContentTypeChange(): void {
    this._resetAndLoad();
  }

  onSearchChange(event: Event): void {
    const searchTerm = (event.target as HTMLInputElement).value;
    this.searchSubject$.next(searchTerm);
  }

  onSortChange(): void {
    this._resetAndLoad();
  }

  onSortOrderToggle(): void {
    this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    this._resetAndLoad();
  }

  loadMore(): void {
    if (this.hasMore() && !this.isLoadingMore()) {
      this.currentPage++;
      this._loadProjects(true);
    }
  }

  viewProject(project: ProjectSummary): void {
    this.router.navigate(['/projects', project.id]);
  }

  /**
   * Handle project click with interaction rules
   */
  onProjectClick(event: Event, project: ProjectSummary): void {
    if (!this.isProjectClickable(project)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    this.viewProject(project);
  }

  /**
   * Check if a project should be clickable
   * Processing and failed projects are not clickable per BRD
   */
  isProjectClickable(project: ProjectSummary): boolean {
    return project.status !== 'processing' && project.status !== 'failed';
  }

  /**
   * Check if a project can be deleted
   * Processing projects cannot be deleted
   */
  isProjectDeletable(project: ProjectSummary): boolean {
    return project.status !== 'processing';
  }

  /**
   * Check if project is currently being deleted
   */
  isProjectDeleting(project: ProjectSummary): boolean {
    return this.deletingProjects.has(project.id);
  }

  /**
   * Get tooltip text for delete button
   */
  getDeleteTooltip(project: ProjectSummary): string {
    if (project.status === 'processing') {
      return 'Cannot delete while processing';
    }
    return 'Delete project';
  }

  /**
   * Get aria-label for delete button
   */
  getDeleteAriaLabel(project: ProjectSummary): string {
    if (project.status === 'processing') {
      return `Cannot delete ${project.name} while processing`;
    }
    return `Delete project ${project.name}`;
  }

  /**
   * Get comprehensive aria-label for project item
   */
  getProjectAriaLabel(project: ProjectSummary): string {
    const contentTypeName = this._getContentTypeDisplayName(
      project.contentType
    );
    const createdDate = this.formatDate(project.createdAt);

    let label = `${project.name}, ${contentTypeName} project, created ${createdDate}`;

    if (project.status) {
      if (project.status === 'processing') {
        label += ', currently processing, not clickable while processing';
      } else if (project.status === 'completed') {
        label += ', processing completed';
      } else if (project.status === 'failed') {
        label += ', processing failed, not clickable';
      }
    }

    if (project.hasRewrite) {
      label += ', has rewrite version';
    }

    if (this.isProjectClickable(project)) {
      label += ', press enter or space to view details';
    }

    return label;
  }

  /**
   * Get display name for content type
   */
  private _getContentTypeDisplayName(contentType: string): string {
    const displayNames: Record<string, string> = {
      text: 'Text',
      image: 'Image',
      audio: 'Audio',
      video: 'Video',
      youtube: 'YouTube',
      webpage: 'Web page',
    };
    return displayNames[contentType] || contentType;
  }

  deleteProject(event: Event, project: ProjectSummary): void {
    event.stopPropagation();

    // Prevent deletion if project is not deletable (e.g., processing)
    if (!this.isProjectDeletable(project)) {
      this.snackBar.open(
        'Cannot delete project while it is being processed',
        'OK',
        { duration: 3000 }
      );
      return;
    }

    // Use new dialog with configuration
    const config = this.dialogConfig.getDeleteDialogConfig({
      projectName: project.name || 'Untitled Project',
      projectId: project.id,
      projectType: project.contentType,
      tokensUsed: project.tokensUsed,
      createdAt: new Date(project.createdAt)
    });

    const dialogRef = this.dialog.open(
      DeleteProjectDialogComponent,
      config
    );

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.confirmed) {
        this._deleteProject(project);
      }
    });
  }

  private _deleteProject(project: ProjectSummary): void {
    // Add to deleting set
    this.deletingProjects.add(project.id);

    this.apiService
      .deleteProject(project.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Remove from list
          const currentProjects = this.projects();
          const updatedProjects = currentProjects.filter(
            (p) => p.id !== project.id
          );
          this.projects.set(updatedProjects);
          this.totalProjects--;

          // Show success message
          this.snackBar.open(
            `Project "${project.name}" deleted successfully`,
            'OK',
            { duration: 3000 }
          );

          // Update token count
          this.tokenService.initialize();

          this.logger.log('Project deleted successfully:', project.id);
        },
        error: (error) => {
          this.logger.error('Error deleting project:', error);
          this.error.set('Failed to delete project. Please try again.');
          this.snackBar.open(
            'Failed to delete project. Please try again.',
            'OK',
            { duration: 5000 }
          );
        },
        complete: () => {
          // Remove from deleting set
          this.deletingProjects.delete(project.id);
        }
      });
  }

  getContentTypeMetadata(
    contentType: string | null | undefined
  ): ContentTypeUIMetadata {
    return resolveContentTypeMetadata(contentType);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  

  /**
   * Determine whether to show the token badge for a project.
   */
  shouldShowTokenBadge(project: ProjectSummary): boolean {
    return (
      (project.status === 'completed' && !!project.tokensUsed) ||
      (project.status === 'processing' && !!project.tokensReserved)
    );
  }

  /**
   * Format project creation date using locale-aware rules:
   * - < 24h: show exact local time (HH:MM respecting 12/24 hour setting)
   * - 1-7 days: show localized weekday name
   * - > 7 days: show localized short date (day, short month, year)
   */
  formatRelativeTime(dateString: string): string {
    const targetDate = new Date(dateString);
    if (Number.isNaN(targetDate.getTime())) {
      return '';
    }

    const now = new Date();
    const diffMs = now.getTime() - targetDate.getTime();

    if (diffMs < 0) {
      // Future timestamps should still render meaningfully using full date + time
      return new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(targetDate);
    }

    const oneDayMs = 24 * 60 * 60 * 1000;
    const oneWeekMs = 7 * oneDayMs;

    if (diffMs < oneDayMs) {
      return new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      }).format(targetDate);
    }

    if (diffMs <= oneWeekMs) {
      return new Intl.DateTimeFormat(undefined, {
        weekday: 'long'
      }).format(targetDate);
    }

    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(targetDate);
  }

  retryLoad(): void {
    this._loadProjects();
  }

  /**
   * Subscribe to Server-Sent Events for real-time project updates
   */
  private async _subscribeToSSE(): Promise<void> {
    try {
      // Get JWT token from auth service
      const token = await this.authService.getIdToken();
      if (!token) {
        this.logger.warn('No JWT token available for SSE connection');
        return;
      }

      this.isSSEConnecting.set(true);
      this.logger.log('Connecting to SSE with JWT token');

      // Subscribe to connection state
      this.sseService.getConnectionState()
        .pipe(takeUntil(this.destroy$))
        .subscribe(state => {
          this.connectionState.set(state);
          this.isSSEConnecting.set(state === ConnectionState.CONNECTING || state === ConnectionState.RECONNECTING);
          this.isSSEConnected.set(state === ConnectionState.CONNECTED);
          
          if (state === ConnectionState.FAILED) {
            this.logger.error('SSE connection failed after max retries');
            this._showErrorSnackBar('Connection failed after 3 attempts');
          } else if (state === ConnectionState.CONNECTED) {
            this.logger.log('SSE connected successfully');
          } else if (state === ConnectionState.RECONNECTING) {
            this.logger.log('SSE reconnecting...');
          }
        });

      // Subscribe to events
      this.sseService.getEvents()
        .pipe(takeUntil(this.destroy$))
        .subscribe(event => {
          this.logger.log('Received SSE event:', event);
          this._handleSSEEvent(event);
        });

      // Start connection
      this.sseService.connect(token);
    } catch (error) {
      this.logger.error('Failed to initialize SSE connection:', error);
      this._showErrorSnackBar('Failed to connect to real-time updates');
    }
  }

  /**
   * Handle SSE events and update project state accordingly
   */
  private _handleSSEEvent(event: any): void {
    // Handle heartbeat events
    if (event.type === 'heartbeat') {
      this.logger.log('Received heartbeat');
      return;
    }

    // Handle processing events
    if (event.type === 'processing' && event.data?.requestId) {
      this._handleProjectStatusEvent(event);
      return;
    }

    // Handle completed events  
    if (event.type === 'completed' && event.data?.requestId) {
      this._handleProjectCompletedEvent(event);
      return;
    }

    // Handle error events
    if (event.type === 'error' && event.data?.requestId) {
      this._handleProjectErrorEvent(event);
      return;
    }

    // Handle backend error events (distinct from transport errors)
    if (event.type === 'backend_error') {
      this._handleBackendErrorEvent(event);
      return;
    }

    this.logger.warn('Unknown SSE event type:', event.type, event);
  }

  /**
   * Handle project status update events
   */
  private _handleProjectStatusEvent(event: any): void {
    const projects = this.projects();
    // Access the requestId from event.data instead of event.requestId
    const requestId = event.data?.requestId;
    
    if (!requestId) {
      this.logger.warn('SSE processing event missing requestId:', event);
      return;
    }

    // Find project by matching the requestId with summaryRequestId
    const projectIndex = projects.findIndex((p) => p.summaryRequestId === requestId);

    if (projectIndex === -1) {
      this.logger.log('SSE status event for project not in current list:', requestId);
      return;
    }

    const updatedProjects = [...projects];
    const project = { ...updatedProjects[projectIndex] };

    // Update to processing status
    project.status = 'processing';
    project.lastEventAt = new Date().toISOString();
    
    // Set reserved tokens from SSE data if available
    if (event.data?.tokensReserved) {
      project.tokensReserved = event.data.tokensReserved;
      this.logger.log(`Project ${project.name} reserving ${event.data.tokensReserved} tokens`);
    }
    
    this.logger.log(`Project ${project.name} (requestId: ${requestId}) status: processing`);

    // Update the project in the array
    updatedProjects[projectIndex] = project;
    this.projects.set(updatedProjects);

    // Trigger throttled token refresh when processing starts (tokens are reserved here)
    this.tokenRefreshSubject$.next();
  }

  /**
   * Handle project completion events
   */
  private _handleProjectCompletedEvent(event: any): void {
    const projects = this.projects();
    // Access the requestId from event.data instead of event.requestId
    const requestId = event.data?.requestId;
    
    if (!requestId) {
      this.logger.warn('SSE completed event missing requestId:', event);
      return;
    }

    // Find project by matching the requestId with summaryRequestId
    const projectIndex = projects.findIndex((p) => p.summaryRequestId === requestId);

    if (projectIndex === -1) {
      this.logger.log('SSE completed event for project not in current list:', requestId);
      return;
    }

    const updatedProjects = [...projects];
    const project = { ...updatedProjects[projectIndex] };

    // Update to completed status
    project.status = 'completed';
    project.lastEventAt = new Date().toISOString();
    
    // Set actual tokens used and remove reserved tokens
    if (event.data?.tokensUsed) {
      project.tokensUsed = event.data.tokensUsed;
      delete project.tokensReserved; // Remove reserved tokens on completion
      this.logger.log(`Project ${project.name} consumed ${event.data.tokensUsed} tokens`);
    }
    
    this.logger.log(`Project ${project.name} (requestId: ${requestId}) completed`);

    // Update the project in the array
    updatedProjects[projectIndex] = project;
    this.projects.set(updatedProjects);

    // Trigger throttled token refresh to update remaining tokens after completion
    this.tokenRefreshSubject$.next();
  }

  /**
   * Handle project error events
   */
  private _handleProjectErrorEvent(event: any): void {
    const projects = this.projects();
    // Access the requestId from event.data
    const requestId = event.data?.requestId;
    
    if (!requestId) {
      this.logger.warn('SSE error event missing requestId:', event);
      return;
    }

    // Find project by matching the requestId with summaryRequestId
    const projectIndex = projects.findIndex((p) => p.summaryRequestId === requestId);

    if (projectIndex === -1) {
      this.logger.log('SSE error event for project not in current list:', requestId);
      return;
    }

    const updatedProjects = [...projects];
    const project = { ...updatedProjects[projectIndex] };

    // Update to failed status
    project.status = 'failed';
    project.lastEventAt = new Date().toISOString();
    
    this.logger.log(`Project ${project.name} (requestId: ${requestId}) failed:`, event.data.message);

    // Update the project in the array
    updatedProjects[projectIndex] = project;
    this.projects.set(updatedProjects);

    // Show error message
    if (event.data.message) {
      this._showErrorSnackBar(`Project ${project.name} failed: ${event.data.message}`);
    }
  }

  /**
   * Handle backend error events (server-side errors, not transport errors)
   */
  private _handleBackendErrorEvent(event: any): void {
    this.logger.warn('Backend error received:', event.data?.message || 'Unknown backend error');
    
    // Show soft notification - don't trigger reconnection for backend errors
    const message = event.data?.message || 'A backend error occurred';
    this._showSoftToast(`Server notice: ${message}`);
  }

  /**
   * Show error message using snackbar
   */
  private _showErrorSnackBar(message: string): void {
    this.snackBar.open(message, 'Dismiss', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    });
  }

  /**
   * Show soft toast notification (less intrusive than error snackbar)
   */
  private _showSoftToast(message: string): void {
    this.snackBar.open(message, undefined, {
      duration: 2000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: ['soft-toast']
    });
  }

  /**
   * Check if a project is currently processing
   */
  isProcessing(project: ProjectSummary): boolean {
    return project.status === 'processing';
  }


  /**
   * Get status display text
   */
  getStatusText(project: ProjectSummary): string {
    if (!project.status) return '';

    switch (project.status) {
      case 'processing':
        return 'Processing';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return '';
    }
  }

  /**
   * Get status badge text (simplified - no progress percentages)
   */
  getStatusBadgeText(project: ProjectSummary): string {
    if (!project.status) return '';

    switch (project.status) {
      case 'processing':
        return 'Processing';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return '';
    }
  }

  /**
   * Get status badge CSS class
   */
  getStatusBadgeClass(project: ProjectSummary): string {
    if (!project.status) return '';

    switch (project.status) {
      case 'processing':
        return 'status-badge-processing';
      case 'completed':
        return 'status-badge-completed';
      case 'failed':
        return 'status-badge-failed';
      default:
        return '';
    }
  }

  /**
   * Get accessibility aria-label for status badge
   */
  getStatusAriaLabel(project: ProjectSummary): string {
    if (!project.status) return '';

    switch (project.status) {
      case 'processing':
        return 'Processing';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return '';
    }
  }

  /**
   * Get status icon for badge display
   */
  getStatusIcon(project: ProjectSummary): string {
    if (!project.status) return '';

    switch (project.status) {
      case 'processing':
        return 'sync';
      case 'completed':
        return 'check_circle';
      case 'failed':
        return 'error';
      default:
        return '';
    }
  }

  /**
   * Get status color class (legacy - kept for backward compatibility)
   */
  getStatusColorClass(project: ProjectSummary): string {
    if (!project.status) return '';

    switch (project.status) {
      case 'processing':
        return 'status-processing';
      case 'completed':
        return 'status-completed';
      case 'failed':
        return 'status-failed';
      default:
        return '';
    }
  }
}
