import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { SummariseComponent } from './summarise/summarise.component';
import { YoutubeComponent } from './summarise/youtube/youtube.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  {
    path: 'summarise',
    component: SummariseComponent,
    children: [
      { path: 'youtube', component: YoutubeComponent },
      { path: '', redirectTo: 'youtube', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];
