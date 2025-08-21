import { Component, OnInit } from '@angular/core';
import { RouterOutlet, Router, ActivatedRoute } from '@angular/router';
import { MatChipsModule, MatChipListboxChange } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-summarise',
  imports: [RouterOutlet, MatChipsModule, MatIconModule],
  templateUrl: './summarise.component.html',
  styleUrl: './summarise.component.scss'
})
export class SummariseComponent implements OnInit {
  selectedToggle: string = 'text';

  constructor(private router: Router, private route: ActivatedRoute) {}

  ngOnInit() {
    // Get the current route to set the active toggle
    this.route.firstChild?.url.subscribe(urlSegments => {
      if (urlSegments && urlSegments.length > 0) {
        this.selectedToggle = urlSegments[0].path;
      }
    });
  }

  onChipChange(event: MatChipListboxChange) {
    this.router.navigate(['/summarise', event.value]);
  }
}
