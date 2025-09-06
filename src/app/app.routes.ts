import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { SummariseComponent } from './components/summarise/summarise.component';
import { YoutubeComponent } from './components/youtube/youtube.component';
import { LoginComponent } from './components/login/login.component';
import { SignupComponent } from './components/signup/signup.component';
import { AuthGuard } from './guards/auth.guard';
import { GuestGuard } from './guards/guest.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent, canActivate: [GuestGuard] },
  { path: 'signup', component: SignupComponent, canActivate: [GuestGuard] },
  {
    path: 'summarise',
    component: SummariseComponent,
    canActivate: [AuthGuard],
    children: [
      { path: 'youtube', component: YoutubeComponent },
    ],
  },
  { path: '**', redirectTo: '' },
];
