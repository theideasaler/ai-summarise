import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SummariseComponent } from './summarise.component';

describe('SummariseComponent', () => {
  let component: SummariseComponent;
  let fixture: ComponentFixture<SummariseComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SummariseComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SummariseComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
