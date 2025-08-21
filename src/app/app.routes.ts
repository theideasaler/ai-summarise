import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { SummariseComponent } from './summarise/summarise.component';
import { TextComponent } from './summarise/text/text.component';
import { AudioComponent } from './summarise/audio/audio.component';
import { VideoComponent } from './summarise/video/video.component';
import { WeblinkComponent } from './summarise/weblink/weblink.component';
import { ImageComponent } from './summarise/image/image.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  {
    path: 'summarise',
    component: SummariseComponent,
    children: [
      { path: 'text', component: TextComponent },
      { path: 'audio', component: AudioComponent },
      { path: 'video', component: VideoComponent },
      { path: 'weblink', component: WeblinkComponent },
      { path: 'image', component: ImageComponent },
      { path: '', redirectTo: 'text', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: '' },
];
