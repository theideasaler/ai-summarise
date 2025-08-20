import { Component } from '@angular/core';
import { MultiFunctionalInputComponent } from '../multi-functional-input/multi-functional-input.component';

@Component({
  selector: 'app-home',
  imports: [MultiFunctionalInputComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {

}