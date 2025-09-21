import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { DeleteProjectDialogComponent } from './delete-project-dialog.component';
import { DeleteProjectDialogData } from './delete-project-dialog.model';

describe('DeleteProjectDialogComponent', () => {
  let component: DeleteProjectDialogComponent;
  let fixture: ComponentFixture<DeleteProjectDialogComponent>;
  let dialogRef: jasmine.SpyObj<MatDialogRef<DeleteProjectDialogComponent>>;

  const mockDialogData: DeleteProjectDialogData = {
    projectName: 'Test Project',
    projectId: '123',
    projectType: 'youtube',
    tokensUsed: 1000
  };

  beforeEach(async () => {
    dialogRef = jasmine.createSpyObj('MatDialogRef', ['close', 'keydownEvents']);
    dialogRef.keydownEvents.and.returnValue({
      subscribe: jasmine.createSpy()
    } as any);

    await TestBed.configureTestingModule({
      imports: [
        DeleteProjectDialogComponent,
        NoopAnimationsModule
      ],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
        { provide: MatDialogRef, useValue: dialogRef }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DeleteProjectDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display project name', () => {
    expect(component.displayProjectName).toBe('Test Project');
  });

  it('should close with false on cancel', () => {
    component.onCancel();
    expect(dialogRef.close).toHaveBeenCalledWith({
      confirmed: false,
      projectId: '123'
    });
  });

  it('should close with true and projectId on confirm', () => {
    component.onConfirm();
    expect(dialogRef.close).toHaveBeenCalledWith({
      confirmed: true,
      projectId: '123'
    });
  });

  it('should handle untitled projects', () => {
    component.data.projectName = '';
    expect(component.displayProjectName).toBe('Untitled Project');
  });

  it('should format creation date when available', () => {
    const testDate = new Date('2024-01-15');
    component.data.createdAt = testDate;
    expect(component.formattedDate).toBeTruthy();
  });

  it('should return null for missing creation date', () => {
    component.data.createdAt = undefined;
    expect(component.formattedDate).toBeNull();
  });

  it('should render warning icon', () => {
    const compiled = fixture.nativeElement;
    const icon = compiled.querySelector('.delete-dialog__icon');
    expect(icon.textContent).toContain('warning');
  });

  it('should render cancel and confirm buttons', () => {
    const compiled = fixture.nativeElement;
    const buttons = compiled.querySelectorAll('.btn');
    expect(buttons.length).toBe(2);
    expect(buttons[0].classList.contains('btn--cancel')).toBeTruthy();
    expect(buttons[1].classList.contains('btn--delete')).toBeTruthy();
  });
});