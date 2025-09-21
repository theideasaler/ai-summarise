import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatChipListboxChange, MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs/operators';
import { SummariseOptionsComponent } from './summarise-options/summarise-options.component';

@Component({
  selector: 'app-summarise',
  imports: [
    RouterOutlet,
    MatChipsModule,
    MatIconModule,
    SummariseOptionsComponent,
    CommonModule,
  ],
  templateUrl: './summarise.component.html',
  styleUrl: './summarise.component.scss',
})
export class SummariseComponent implements OnInit {
  selectedToggle: string = 'text';
  showOptions: boolean = true;

  constructor(private router: Router, private route: ActivatedRoute) {}

  ngOnInit() {
    // Check if we're on the base summarise route
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.showOptions = event.url === '/summarise';
      });

    // Set initial state
    this.showOptions = this.router.url === '/summarise';

    // Get the current route to set the active toggle
    this.route.firstChild?.url.subscribe((urlSegments) => {
      if (urlSegments && urlSegments.length > 0) {
        this.selectedToggle = urlSegments[0].path;
      }
    });
  }

  onChipChange(event: MatChipListboxChange) {
    this.router.navigate(['/summarise', event.value]);
  }
}
