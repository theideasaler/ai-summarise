/**
 * File size limits in bytes (matching backend)
 */
export const FILE_SIZE_LIMITS = {
  image: 30 * 1024 * 1024, // 30MB
  audio: 100 * 1024 * 1024, // 100MB
  video: 500 * 1024 * 1024, // 500MB
  text: 12 * 1024 * 1024, // 12MB for text files
};

/**
 * Allowed MIME types for each content type (matching backend)
 */
export const ALLOWED_MIME_TYPES = {
  image: ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'],
  audio: ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac'],
  video: ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/x-flv', 'video/webm', 'video/x-ms-wmv', 'video/3gpp'],
  text: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
};

/**
 * File extension to MIME type mapping for text files
 */
export const TEXT_FILE_EXTENSIONS: { [key: string]: string } = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
};

/**
 * Validates file size based on content type
 */
export function validateFileSize(file: File, contentType: 'image' | 'audio' | 'video' | 'text'): { isValid: boolean; error?: string } {
  const limit = FILE_SIZE_LIMITS[contentType];
  if (file.size > limit) {
    return {
      isValid: false,
      error: `File size exceeds limit of ${formatFileSize(limit)}`,
    };
  }
  return { isValid: true };
}

/**
 * Validates MIME type based on content type
 */
export function validateMimeType(file: File, contentType: 'image' | 'audio' | 'video' | 'text'): { isValid: boolean; error?: string } {
  const allowedTypes = ALLOWED_MIME_TYPES[contentType];
  
  // For text files, check both MIME type and extension
  if (contentType === 'text') {
    const extension = getFileExtension(file.name).toLowerCase();
    const expectedMimeType = TEXT_FILE_EXTENSIONS[extension];
    
    if (!expectedMimeType) {
      return {
        isValid: false,
        error: `Unsupported file type. Allowed types: PDF, DOC, DOCX, TXT`,
      };
    }
    
    // Some browsers may not detect MIME type correctly for text files
    if (file.type && !allowedTypes.includes(file.type) && file.type !== 'application/octet-stream') {
      return {
        isValid: false,
        error: `Invalid file type. Expected ${expectedMimeType} but got ${file.type}`,
      };
    }
    
    return { isValid: true };
  }
  
  // For other file types, check MIME type directly
  if (!allowedTypes.includes(file.type)) {
    return {
      isValid: false,
      error: `Invalid file type. Allowed types: ${getReadableFileTypes(contentType)}`,
    };
  }
  
  return { isValid: true };
}

/**
 * Validates both file size and MIME type
 */
export function validateFile(file: File, contentType: 'image' | 'audio' | 'video' | 'text'): { isValid: boolean; error?: string } {
  const sizeValidation = validateFileSize(file, contentType);
  if (!sizeValidation.isValid) {
    return sizeValidation;
  }
  
  const typeValidation = validateMimeType(file, contentType);
  if (!typeValidation.isValid) {
    return typeValidation;
  }
  
  return { isValid: true };
}

/**
 * Formats file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Gets file extension from filename
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.substring(lastDot);
}

/**
 * Gets readable file types for error messages
 */
function getReadableFileTypes(contentType: 'image' | 'audio' | 'video' | 'text'): string {
  switch (contentType) {
    case 'image':
      return 'PNG, JPEG, WEBP, HEIC, HEIF';
    case 'audio':
      return 'WAV, MP3, AIFF, AAC, OGG, FLAC';
    case 'video':
      return 'MP4, MPEG, MOV, AVI, FLV, WEBM, WMV, 3GPP';
    case 'text':
      return 'PDF, DOC, DOCX, TXT';
    default:
      return 'Unknown';
  }
}