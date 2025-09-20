/**
 * Project model interfaces for the frontend application
 * Includes processing status and progress tracking for real-time updates
 */

export type ProcessingStatus = 'processing' | 'completed' | 'failed';

export interface Project {
  id: string;
  name: string;
  contentType: 'youtube' | 'text' | 'image' | 'audio' | 'video' | 'webpage';
  createdAt: string;
  updatedAt: string;
  
  // Processing status fields for real-time updates
  status?: ProcessingStatus;
  progress?: number; // 0-100 percentage
  lastEventAt?: string; // ISO string timestamp of last event
  
  summaryData?: {
    requestId: string;
    content: string;
    status: 'completed' | 'processing' | 'failed';
    createdAt: string;
    tokensUsed?: number;
  };
  
  rewriteData?: {
    requestId: string;
    content: string;
    status: 'completed' | 'processing' | 'failed';
    createdAt: string;
    tokensUsed?: number;
  };
}

export interface ProjectSummary {
  id: string;
  name: string;
  contentType: 'youtube' | 'text' | 'image' | 'audio' | 'video' | 'webpage';
  createdAt: string;
  updatedAt: string;
  hasRewrite: boolean;
  
  // Processing status fields for real-time updates
  status?: ProcessingStatus;
  progress?: number; // 0-100 percentage
  lastEventAt?: string; // ISO string timestamp of last event
  
  // Summary request ID for SSE event matching
  summaryRequestId?: string;
  
  // Token tracking fields
  tokensUsed?: number; // Actual tokens consumed (for completed projects)
  tokensReserved?: number; // Reserved tokens (for processing projects)
}

export interface ProjectListParams {
  page?: number;
  limit?: number;
  contentType?: 'youtube' | 'text' | 'image' | 'audio' | 'video' | 'webpage';
  name?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface ProjectListResponse {
  projects: ProjectSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * SSE Event interfaces for real-time project updates
 */
export interface ProjectSSEEvent {
  type: 'project_status_update' | 'project_progress_update' | 'project_completed' | 'project_failed';
  projectId: string;
  timestamp: string;
  data: ProjectSSEData;
}

export interface ProjectSSEData {
  status?: ProcessingStatus;
  progress?: number;
  message?: string;
  error?: string;
  summary?: string;
  tokensUsed?: number;
  tokensReserved?: number; // Reserved tokens for processing projects
  processingTime?: number;
}

/**
 * SSE Ticket System interfaces
 */
export interface SSETicketRequest {
  purpose: 'projects' | 'other';
}

export interface SSETicketResponse {
  ticket: string;
  expiresAt: string; // ISO timestamp
  expiresIn: number; // seconds until expiry
}

export interface SSEConnectionState {
  status: 'disconnected' | 'requesting_ticket' | 'connecting' | 'connected' | 'error' | 'reconnecting';
  ticket?: string;
  ticketExpiresAt?: string;
  connection?: EventSource;
  reconnectAttempts: number;
  lastError?: string;
}

export interface SSEConnectionConfig {
  useTicketAuth: boolean; // Feature flag for gradual migration
  maxReconnectAttempts: number;
  baseReconnectDelay: number; // milliseconds
  ticketRefreshBuffer: number; // seconds before expiry to refresh
  maxRetryAttempts: number; // for ticket requests
  retryDelay: number; // milliseconds between ticket retry attempts
}