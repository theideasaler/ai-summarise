import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ApiService, ProjectResponse } from './api.service';
import { LoggerService } from './logger.service';

@Injectable({
  providedIn: 'root',
})
export class ProjectService {
  // Current project state
  currentProject = signal<ProjectResponse | null>(null);
  isLoadingProject = signal<boolean>(false);
  projectError = signal<string | null>(null);

  constructor(
    private apiService: ApiService,
    private router: Router,
    private logger: LoggerService
  ) {}

  /**
   * Load project data by ID
   */
  loadProject(projectId: string): Observable<ProjectResponse> {
    this.logger.log('Loading project:', projectId);
    this.isLoadingProject.set(true);
    this.projectError.set(null);

    return this.apiService.getProject(projectId).pipe(
      tap({
        next: (project) => {
          this.logger.log('Project loaded successfully:', project);
          this.currentProject.set(project);
          this.isLoadingProject.set(false);
        },
        error: (error) => {
          this.logger.error('Error loading project:', error);
          this.projectError.set('Failed to load project data');
          this.isLoadingProject.set(false);
        }
      })
    );
  }

  /**
   * Navigate to project URL
   */
  navigateToProject(projectId: string, contentType: 'youtube' | 'text' | 'url' | 'document' = 'youtube'): void {
    this.logger.log('Navigating to project:', projectId, 'type:', contentType);
    this.router.navigate(['/summarise', contentType, projectId]);
  }

  /**
   * Clear current project state
   */
  clearProject(): void {
    this.logger.log('Clearing project state');
    this.currentProject.set(null);
    this.projectError.set(null);
    this.isLoadingProject.set(false);
  }

  /**
   * Update current project with new data
   */
  updateCurrentProject(project: ProjectResponse): void {
    this.logger.log('Updating current project:', project);
    this.currentProject.set(project);
  }

  /**
   * Get current project ID
   */
  getCurrentProjectId(): string | null {
    const project = this.currentProject();
    return project ? project.id : null;
  }

  /**
   * Check if project has summary data
   */
  hasProjectSummary(): boolean {
    const project = this.currentProject();
    return !!(project?.summaryData?.content);
  }

  /**
   * Check if project has rewrite data
   */
  hasProjectRewrite(): boolean {
    const project = this.currentProject();
    return !!(project?.rewriteData?.content);
  }
}
