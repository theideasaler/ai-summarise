export interface VideoFinetuningConfig {
  startSeconds: number; // Range slider start value
  endSeconds: number; // Range slider end value
  fps: number; // Frame sampling rate (1-5)
  customPrompt: string; // User's summarisation instructions
}