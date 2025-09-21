import { ProjectsComponent } from './projects.component';

// Minimal stubs for constructor dependencies. Only formatRelativeTime is exercised in these tests.
const apiServiceStub: any = {};
const routerStub: any = {};
const routeStub: any = { snapshot: { queryParams: {} } };
const dialogStub: any = {};
const loggerStub: any = { log: () => {}, warn: () => {}, error: () => {} };
const tokenServiceStub: any = { fetchTokenInfo: () => Promise.resolve() };
const sseServiceStub: any = {
  disconnect: () => {},
  getConnectionState: () => ({ pipe: () => ({ subscribe: () => ({}) }) }),
  subscribeToProjectUpdates: () => ({ subscribe: () => ({}) })
};
const authServiceStub: any = { getIdToken: () => Promise.resolve('') };
const snackBarStub: any = { open: () => {} };
const dialogConfigServiceStub: any = {
  getDeleteDialogConfig: () => ({
    data: {},
    width: '400px',
    maxWidth: '90vw',
    hasBackdrop: true,
    backdropClass: 'delete-dialog-backdrop',
    panelClass: 'delete-dialog-panel'
  })
};

describe('ProjectsComponent - formatRelativeTime', () => {
  let component: ProjectsComponent;
  const baseDate = new Date('2024-09-30T12:00:00Z');
  const oneDayMs = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(baseDate);

    component = new ProjectsComponent(
      apiServiceStub,
      routerStub,
      routeStub,
      dialogStub,
      loggerStub,
      tokenServiceStub,
      sseServiceStub,
      authServiceStub,
      snackBarStub,
      dialogConfigServiceStub
    );
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  const formatWithOptions = (date: Date, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(undefined, options).format(date);

  it('returns empty string when date is invalid', () => {
    expect(component.formatRelativeTime('not-a-date')).toBe('');
  });

  it('displays local time for timestamps within 24 hours', () => {
    const timestamp = new Date(baseDate.getTime() - 3 * 60 * 60 * 1000);
    const expected = formatWithOptions(timestamp, { hour: '2-digit', minute: '2-digit' });
    expect(component.formatRelativeTime(timestamp.toISOString())).toBe(expected);
  });

  it('displays localized weekday for timestamps within seven days', () => {
    const timestamp = new Date(baseDate.getTime() - 3 * oneDayMs);
    const expected = formatWithOptions(timestamp, { weekday: 'long' });
    expect(component.formatRelativeTime(timestamp.toISOString())).toBe(expected);
  });

  it('displays locale-formatted calendar date for timestamps older than seven days', () => {
    const timestamp = new Date(baseDate.getTime() - 8 * oneDayMs);
    const expected = formatWithOptions(timestamp, { day: 'numeric', month: 'short', year: 'numeric' });
    expect(component.formatRelativeTime(timestamp.toISOString())).toBe(expected);
  });

  it('displays full date and time when timestamp is in the future', () => {
    const timestamp = new Date(baseDate.getTime() + 2 * 60 * 60 * 1000);
    const expected = formatWithOptions(timestamp, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    expect(component.formatRelativeTime(timestamp.toISOString())).toBe(expected);
  });
});
