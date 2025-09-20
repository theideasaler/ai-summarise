import type { ProjectSummary } from './project.model';

export type ContentTypeId = ProjectSummary['contentType'];

export interface ContentTypeUIMetadata {
  /** Display label for UI badges / headings */
  label: string;
  /** Short description used across the summarise landing page */
  description: string;
  /** Material icon name */
  icon: string;
  /** Primary icon colour (hex) */
  iconColor: string;
  /** Background tint for icon container */
  iconBackground: string;
  /** Route path for summarise flow */
  summariseRoute: string;
}

export const CONTENT_TYPE_UI: Record<ContentTypeId, ContentTypeUIMetadata> = {
  youtube: {
    label: 'YouTube',
    description: 'Extract insights from YouTube videos with timestamps',
    icon: 'play_circle_filled',
    iconColor: '#FF0000',
    iconBackground: 'rgba(255, 0, 0, 0.12)',
    summariseRoute: '/summarise/youtube',
  },
  text: {
    label: 'Text Content',
    description: 'Analyse text, PDFs, Word documents and more',
    icon: 'description',
    iconColor: '#4285F4',
    iconBackground: 'rgba(66, 133, 244, 0.12)',
    summariseRoute: '/summarise/text',
  },
  image: {
    label: 'Image Analysis',
    description: 'Extract insights and describe visual content',
    icon: 'image',
    iconColor: '#9C27B0',
    iconBackground: 'rgba(156, 39, 176, 0.12)',
    summariseRoute: '/summarise/image',
  },
  audio: {
    label: 'Audio Content',
    description: 'Transcribe and summarise podcasts, meetings, and recordings',
    icon: 'audiotrack',
    iconColor: '#FF9800',
    iconBackground: 'rgba(255, 152, 0, 0.12)',
    summariseRoute: '/summarise/audio',
  },
  video: {
    label: 'Video Files',
    description: 'Analyse video content with frame extraction and time ranges',
    icon: 'video_library',
    iconColor: '#00BCD4',
    iconBackground: 'rgba(0, 188, 212, 0.12)',
    summariseRoute: '/summarise/video',
  },
  webpage: {
    label: 'Web Page',
    description: 'Extract and summarise content from any webpage',
    icon: 'language',
    iconColor: '#4CAF50',
    iconBackground: 'rgba(76, 175, 80, 0.12)',
    summariseRoute: '/summarise/webpage',
  },
};

export const CONTENT_TYPE_ORDER: ContentTypeId[] = [
  'youtube',
  'text',
  'image',
  'audio',
  'video',
  'webpage',
];

export const DEFAULT_CONTENT_TYPE_METADATA: ContentTypeUIMetadata = {
  label: 'Project',
  description: 'AI summarisation project',
  icon: 'folder',
  iconColor: '#1F2937',
  iconBackground: 'rgba(31, 41, 55, 0.12)',
  summariseRoute: '/summarise',
};

export function getContentTypeMetadata(
  type: string | null | undefined
): ContentTypeUIMetadata {
  if (!type) {
    return DEFAULT_CONTENT_TYPE_METADATA;
  }
  return CONTENT_TYPE_UI[type as ContentTypeId] || DEFAULT_CONTENT_TYPE_METADATA;
}
