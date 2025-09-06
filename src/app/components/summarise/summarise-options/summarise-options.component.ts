import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-summarise-options',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatCardModule],
  templateUrl: './summarise-options.component.html',
  styleUrl: './summarise-options.component.scss',
})
export class SummariseOptionsComponent {
  options = [
    {
      title: 'YouTube Video',
      description: 'Extract insights from YouTube videos with timestamps',
      icon: 'play_circle_filled',
      route: '/summarise/youtube',
      color: '#FF0000',
    },
    {
      title: 'Text Content',
      description: 'Analyse text, PDFs, Word documents and more',
      icon: 'description',
      route: '/summarise/text',
      color: '#4285F4',
    },
    {
      title: 'Image Analysis',
      description: 'Extract insights and describe visual content',
      icon: 'image',
      route: '/summarise/image',
      color: '#9C27B0',
    },
    {
      title: 'Audio Content',
      description: 'Transcribe and summarise podcasts, meetings, and recordings',
      icon: 'audiotrack',
      route: '/summarise/audio',
      color: '#FF9800',
    },
    {
      title: 'Video Files',
      description: 'Analyse video content with frame extraction and time ranges',
      icon: 'video_library',
      route: '/summarise/video',
      color: '#00BCD4',
    },
    {
      title: 'Web Page',
      description: 'Extract and summarise content from any webpage',
      icon: 'language',
      route: '/summarise/webpage',
      color: '#4CAF50',
    },
  ];

  constructor(private router: Router) {}

  navigateToOption(route: string) {
    this.router.navigate([route]);
  }
}