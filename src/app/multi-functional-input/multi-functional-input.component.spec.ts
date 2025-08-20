import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MultiFunctionalInputComponent } from './multi-functional-input.component';

describe('MultiFunctionalInputComponent', () => {
  let component: MultiFunctionalInputComponent;
  let fixture: ComponentFixture<MultiFunctionalInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MultiFunctionalInputComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MultiFunctionalInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
