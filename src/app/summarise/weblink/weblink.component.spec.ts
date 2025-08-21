import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WeblinkComponent } from './weblink.component';

describe('WeblinkComponent', () => {
  let component: WeblinkComponent;
  let fixture: ComponentFixture<WeblinkComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WeblinkComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WeblinkComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
