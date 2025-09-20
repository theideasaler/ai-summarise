import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import {
  CONTENT_TYPE_ORDER,
  ContentTypeId,
  ContentTypeUIMetadata,
  getContentTypeMetadata,
} from '../../../models/content-type-ui.config';

@Component({
  selector: 'app-summarise-options',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatCardModule],
  templateUrl: './summarise-options.component.html',
  styleUrl: './summarise-options.component.scss',
})
export class SummariseOptionsComponent {
  readonly options: Array<
    ContentTypeUIMetadata & { type: ContentTypeId }
  > = CONTENT_TYPE_ORDER.map((type) => ({
    type,
    ...getContentTypeMetadata(type),
  }));

  constructor(private router: Router) {}

  navigateToOption(route: string) {
    this.router.navigate([route]);
  }
}
