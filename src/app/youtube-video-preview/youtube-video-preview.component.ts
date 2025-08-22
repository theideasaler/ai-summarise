import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { YouTubePlayerModule } from '@angular/youtube-player';

@Component({
  selector: 'app-youtube-video-preview',
  standalone: true,
  imports: [CommonModule, YouTubePlayerModule],
  templateUrl: './youtube-video-preview.component.html',
  styleUrl: './youtube-video-preview.component.scss',
})
export class YoutubeVideoPreviewComponent
  implements OnInit, OnChanges, AfterViewInit, OnDestroy
{
  @Input() url: string = '';
  @Output() duration = new EventEmitter<number>();
  @Output() error = new EventEmitter<number>();
  @ViewChild('youtubePlayer', { static: false }) playerElement!: ElementRef;

  videoId: string | null = null;
  player: any = null;
  private apiReady = false;

  ngOnInit() {
    this.loadYouTubeAPI();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['url'] && changes['url'].currentValue) {
      const newVideoId = this.extractVideoId(changes['url'].currentValue);
      if (newVideoId !== this.videoId) {
        this.videoId = newVideoId;
        console.log('Video ID extracted:', this.videoId);
        if (this.apiReady && this.videoId && this.playerElement) {
          this.initializePlayerWithElement();
        }
      }
    }
  }

  ngAfterViewInit() {
    if (this.apiReady && this.videoId && this.playerElement) {
      this.initializePlayerWithElement();
    }
  }

  ngOnDestroy() {
    if (this.player) {
      this.player.destroy();
    }
  }

  private loadYouTubeAPI() {
    if (window.YT && window.YT.Player) {
      this.apiReady = true;
      console.log('YouTube API already loaded');
      return;
    }

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      console.log('Loading YouTube API script');
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }

    const originalCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      console.log('YouTube API ready');
      this.apiReady = true;
      if (this.videoId && this.playerElement) {
        this.initializePlayerWithElement();
      }
      if (originalCallback) {
        originalCallback();
      }
    };
  }

  private extractVideoId(url: string): string | null {
    if (!url) return null;

    const patterns = [
      /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  private initializePlayerWithElement() {
    if (!this.videoId || !this.apiReady || !this.playerElement) {
      console.log('Cannot initialize player:', {
        videoId: this.videoId,
        apiReady: this.apiReady,
        playerElement: !!this.playerElement,
      });
      return;
    }

    if (this.player) {
      this.player.destroy();
    }

    console.log('Initializing YouTube player with video ID:', this.videoId);

    try {
      this.player = new window.YT.Player(this.playerElement.nativeElement, {
        videoId: this.videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          fs: 0,
          disablekb: 1,
        },
        events: {
          onReady: (event: any) => this.onPlayerReady(event),
          onError: (event: any) => this.onPlayerError(event),
        },
      });
    } catch (error) {
      console.error('Error initializing YouTube player:', error);
    }
  }

  private onPlayerReady(event: any) {
    const duration = event.target.getDuration();
    console.log('Video duration:', duration);
    this.duration.emit(duration);
  }

  private onPlayerError(event: any) {
    this.error.emit(event.data);
  }
}
