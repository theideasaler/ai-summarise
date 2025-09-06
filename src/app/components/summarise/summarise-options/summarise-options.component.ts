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
      description: 'Summarise YouTube videos',
      icon: 'play_circle_filled',
      route: '/summarise/youtube',
      color: '#FF0000',
    },
    {
      title: 'Text Content',
      description: 'Analyze text documents',
      icon: 'description',
      route: '/summarise/text',
      color: '#4285F4',
    },
    {
      title: 'Image Analysis',
      description: 'Analyze and describe images',
      icon: 'image',
      route: '/summarise/image',
      color: '#9C27B0',
    },
    {
      title: 'Audio Content',
      description: 'Transcribe and summarise audio',
      icon: 'audiotrack',
      route: '/summarise/audio',
      color: '#FF9800',
    },
    {
      title: 'Web Page',
      description: 'Summarise web page content',
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