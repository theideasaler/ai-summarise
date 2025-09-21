export interface DeleteProjectDialogData {
  projectName: string;
  projectId: string;
  projectType?: string;
  tokensUsed?: number;
  createdAt?: Date;
}

export interface DeleteProjectDialogResult {
  confirmed: boolean;
  projectId: string;
}