import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { validateFile, formatFileSize } from '../../../utils/file-validation';

export interface FileInfo {
  file: File;
  name: string;
  size: string;
  type: string;
  duration?: number; // For audio/video files
  url?: string; // Object URL for preview
}

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './file-upload.component.html',
  styleUrls: ['./file-upload.component.scss'],
})
export class FileUploadComponent {
  @Input() acceptedTypes: string = '*/*';
  @Input() multiple: boolean = false;
  @Input() placeholder: string = 'Drag and drop files here or click to browse';
  @Input() fileType: 'image' | 'audio' | 'video' | 'document' = 'document';
  
  @Output() filesSelected = new EventEmitter<FileInfo[]>();
  @Output() fileRemoved = new EventEmitter<FileInfo>();
  @Output() error = new EventEmitter<string>();
  
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  
  selectedFiles = signal<FileInfo[]>([]);
  isDragging = signal(false);
  isProcessing = signal(false);
  
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }
  
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }
  
  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFiles(files);
    }
  }
  
  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFiles(input.files);
    }
  }
  
  private async handleFiles(fileList: FileList): Promise<void> {
    this.isProcessing.set(true);
    const files: FileInfo[] = [];
    
    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        
        // Validate file type
        if (!this.isValidFileType(file)) {
          this.error.emit(`Invalid file type: ${file.name}`);
          continue;
        }
        
        // Validate file size and type using the utility
        const contentType = this.getContentTypeForValidation();
        if (contentType) {
          const validation = validateFile(file, contentType);
          if (!validation.isValid) {
            this.error.emit(validation.error!);
            continue;
          }
        }
        
        const fileInfo: FileInfo = {
          file,
          name: file.name,
          size: formatFileSize(file.size),
          type: file.type,
        };
        
        // Get duration for audio/video files
        if (this.fileType === 'audio' || this.fileType === 'video') {
          try {
            fileInfo.duration = await this.getMediaDuration(file);
          } catch (err) {
            console.error('Error getting media duration:', err);
          }
        }
        
        // Create object URL for preview (if needed)
        if (this.fileType === 'image') {
          fileInfo.url = URL.createObjectURL(file);
        }
        
        files.push(fileInfo);
        
        if (!this.multiple) {
          break; // Only process first file if not multiple
        }
      }
      
      if (files.length > 0) {
        if (this.multiple) {
          this.selectedFiles.update(current => [...current, ...files]);
        } else {
          // Clean up previous URLs
          this.cleanupUrls();
          this.selectedFiles.set(files);
        }
        this.filesSelected.emit(files);
      }
    } finally {
      this.isProcessing.set(false);
    }
  }
  
  private isValidFileType(file: File): boolean {
    if (this.acceptedTypes === '*/*') return true;
    
    const acceptedTypes = this.acceptedTypes.split(',').map(t => t.trim());
    return acceptedTypes.some(type => {
      if (type.endsWith('/*')) {
        const category = type.split('/')[0];
        return file.type.startsWith(category + '/');
      }
      return file.type === type;
    });
  }
  
  private getContentTypeForValidation(): 'image' | 'audio' | 'video' | 'text' | null {
    switch (this.fileType) {
      case 'image':
        return 'image';
      case 'audio':
        return 'audio';
      case 'video':
        return 'video';
      case 'document':
        // If it's accepting text files, validate as text
        if (this.acceptedTypes.includes('application/pdf') || 
            this.acceptedTypes.includes('application/msword') ||
            this.acceptedTypes.includes('text/plain')) {
          return 'text';
        }
        return null;
      default:
        return null;
    }
  }
  
  private async getMediaDuration(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const media = document.createElement(this.fileType === 'audio' ? 'audio' : 'video');
      
      media.preload = 'metadata';
      media.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(Math.round(media.duration));
      };
      
      media.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load media'));
      };
      
      media.src = url;
    });
  }
  
  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
  
  removeFile(fileInfo: FileInfo): void {
    this.selectedFiles.update(files => files.filter(f => f !== fileInfo));
    
    // Clean up object URL if exists
    if (fileInfo.url) {
      URL.revokeObjectURL(fileInfo.url);
    }
    
    this.fileRemoved.emit(fileInfo);
  }
  
  clearAll(): void {
    this.cleanupUrls();
    this.selectedFiles.set([]);
  }
  
  private cleanupUrls(): void {
    this.selectedFiles().forEach(file => {
      if (file.url) {
        URL.revokeObjectURL(file.url);
      }
    });
  }
  
  openFileDialog(): void {
    this.fileInput.nativeElement.click();
  }
  
  ngOnDestroy(): void {
    this.cleanupUrls();
  }
}