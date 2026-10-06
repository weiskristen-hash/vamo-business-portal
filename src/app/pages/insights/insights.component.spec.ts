import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { InsightsComponent } from './insights.component';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { CustomerErrorService } from '../../core/services/customer-error.service';
import { AnalyticsDailyRow, InsightsService, getRangeDates } from '../../core/services/insights.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { VamoEvent } from '../../core/models/event.model';

function row(partial: Partial<AnalyticsDailyRow>): AnalyticsDailyRow {
  return {
    id: null,
    date: '2026-10-01',
    event_type: 'event_view',
    target_type: 'event',
    count: 1,
    event: null,
    provider: null,
    ...partial,
  };
}

describe('InsightsComponent (Phase 1D.1)', () => {
  let fixture: ComponentFixture<InsightsComponent>;
  let component: InsightsComponent;
  let authServiceSpy: any;
  let businessServiceSpy: any;
  let insightsServiceSpy: any;
  let i18n: I18nService;

  const events: VamoEvent[] = [
    { id: 'ev-1', name: 'Sunset Catamaran', status: 'published', images: [{ directus_files_id: 'file-1' }] } as any,
    { id: 'ev-2', name: 'Zip Line', status: 'published' } as any,
    { id: 'ev-3', name: '', status: 'draft', images: [{ directus_files_id: 'file-3' }] } as any,
  ];

  const currentRows: AnalyticsDailyRow[] = [
    row({ date: '2026-10-01', event: 'ev-1', event_type: 'event_view', count: 10 }),
    row({ date: '2026-10-02', event: 'ev-2', event_type: 'event_view', count: 20 }),
    row({ date: '2026-10-02', event: 'ev-3', event_type: 'event_view', count: 5 }),
    row({ date: '2026-10-02', provider: 'prov-101', target_type: 'provider', event_type: 'provider_view', count: 5 }),
    row({ date: '2026-10-01', event: 'ev-1', event_type: 'event_share', count: 3 }),
    row({ date: '2026-10-01', provider: 'prov-101', target_type: 'provider', event_type: 'provider_share', count: 1 }),
    row({ date: '2026-10-02', event: 'ev-1', event_type: 'event_add_to_calendar', count: 2 }),
    row({ date: '2026-10-02', provider: 'prov-101', target_type: 'provider', event_type: 'provider_whatsapp_click', count: 4 }),
    row({ date: '2026-10-02', event: 'ev-1', event_type: 'event_whatsapp_click', count: 50 }),
  ];

  const previousRows: AnalyticsDailyRow[] = [
    row({ date: '2026-09-01', event: 'ev-1', event_type: 'event_view', count: 20 }),
    row({ date: '2026-09-01', event: 'ev-1', event_type: 'event_share', count: 8 }),
    // previous calendar = 0 → trend null
    row({ date: '2026-09-01', provider: 'prov-101', target_type: 'provider', event_type: 'provider_whatsapp_click', count: 2 }),
  ];

  async function create(opts: {
    current?: AnalyticsDailyRow[];
    previous?: AnalyticsDailyRow[];
    bookmarks?: number | Error;
    analyticsError?: Error;
    providerId?: string | null;
    events?: VamoEvent[];
  } = {}) {
    const providerId = opts.providerId === undefined ? 'prov-101' : opts.providerId;
    authServiceSpy = {
      currentUser: providerId ? { id: 'usr-1', provider_link: { id: providerId } } : { id: 'usr-1' },
    };
    businessServiceSpy = {
      getEventsForProvider: vi.fn().mockResolvedValue(JSON.parse(JSON.stringify(opts.events ?? events))),
      getAssetUrl: vi.fn((id: any, t?: string) => `https://api.vamo-app.com/assets/${id}${t ? '?' + t : ''}`),
    };
    const cur = opts.current ?? currentRows;
    const prev = opts.previous ?? previousRows;
    insightsServiceSpy = {
      getAnalyticsInRange: vi.fn((_p: string, _ids: string[], from: string) => {
        if (opts.analyticsError) return Promise.reject(opts.analyticsError);
        // The "current" query is the one whose `from` is the latest.
        return Promise.resolve(from === insightsServiceSpy._prevFrom ? prev : cur);
      }),
      getBookmarksCount: vi.fn(() =>
        opts.bookmarks instanceof Error ? Promise.reject(opts.bookmarks) : Promise.resolve(opts.bookmarks ?? 7)
      ),
      _prevFrom: getRangeDates('30d').prevFrom,
    };

    await TestBed.configureTestingModule({
      imports: [InsightsComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceSpy },
        { provide: BusinessService, useValue: businessServiceSpy },
        { provide: InsightsService, useValue: insightsServiceSpy },
        CustomerErrorService,
        I18nService,
      ],
    }).compileComponents();

    i18n = TestBed.inject(I18nService);
    i18n.setLang('en');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    fixture = TestBed.createComponent(InsightsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await component.loadAll();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const kpiValue = (id: string) => el().querySelector(`[data-kpi="${id}"] .kpi-value`)?.textContent?.trim();
  const kpiTrend = (id: string) => el().querySelector(`[data-kpi="${id}"] .kpi-trend`);

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('scopes every request to the authenticated provider and its own events', async () => {
    await create();
    expect(businessServiceSpy.getEventsForProvider).toHaveBeenCalledWith('prov-101');
    expect(insightsServiceSpy.getBookmarksCount).toHaveBeenCalledWith('prov-101');
    for (const call of insightsServiceSpy.getAnalyticsInRange.mock.calls) {
      expect(call[0]).toBe('prov-101');
      expect(call[1]).toEqual(['ev-1', 'ev-2', 'ev-3']);
    }
    // current + previous for the default 30d range
    const d = getRangeDates('30d');
    expect(insightsServiceSpy.getAnalyticsInRange).toHaveBeenCalledWith('prov-101', expect.any(Array), d.from, d.to);
    expect(insightsServiceSpy.getAnalyticsInRange).toHaveBeenCalledWith('prov-101', expect.any(Array), d.prevFrom, d.prevTo);
  });

  it('defaults to 30d / views like canonical', async () => {
    await create();
    expect(component.range()).toBe('30d');
    expect(component.metric()).toBe('views');
    expect(el().querySelector('[data-range="30d"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('calculates KPIs (views/shares/calendar/whatsapp) and bookmark total', async () => {
    await create();
    expect(kpiValue('views')).toBe('40'); // 10+20+5 event_view + 5 provider_view
    expect(kpiValue('shares')).toBe('4'); // 3 event_share + 1 provider_share
    expect(kpiValue('calendar')).toBe('2');
    expect(kpiValue('whatsapp')).toBe('4'); // provider_whatsapp_click only
    expect(kpiValue('bookmarks')).toBe('7');
  });

  it('excludes event_whatsapp_click from the WhatsApp KPI', async () => {
    await create({ current: [row({ event: 'ev-1', event_type: 'event_whatsapp_click', count: 50 })], previous: [] });
    expect(kpiValue('whatsapp')).toBe('0');
  });

  it('shows prior-period % trends and hides trend when previous period is zero', async () => {
    await create();
    // views 40 vs 20 → +100%
    expect(kpiTrend('views')?.textContent).toContain('100%');
    expect(kpiTrend('views')?.classList.contains('up')).toBe(true);
    expect(kpiTrend('views')?.getAttribute('aria-label')).toBe('Up 100% vs previous period');
    // shares 4 vs 8 → -50%
    expect(kpiTrend('shares')?.classList.contains('down')).toBe(true);
    expect(kpiTrend('shares')?.textContent).toContain('50%');
    // calendar previous 0 → no trend
    expect(kpiTrend('calendar')).toBeNull();
    // bookmarks never has a trend
    expect(kpiTrend('bookmarks')).toBeNull();
    // whatsapp 4 vs 2 → +100%
    expect(kpiTrend('whatsapp')?.textContent).toContain('100%');
  });

  it('refetches analytics (not bookmarks) on range change; "all" skips the previous period', async () => {
    await create();
    insightsServiceSpy.getAnalyticsInRange.mockClear();
    insightsServiceSpy.getBookmarksCount.mockClear();

    await component.onRangeChange('7d');
    fixture.detectChanges();
    const d7 = getRangeDates('7d');
    expect(insightsServiceSpy.getAnalyticsInRange).toHaveBeenCalledTimes(2);
    expect(insightsServiceSpy.getAnalyticsInRange).toHaveBeenCalledWith('prov-101', expect.any(Array), d7.from, d7.to);
    expect(insightsServiceSpy.getAnalyticsInRange).toHaveBeenCalledWith('prov-101', expect.any(Array), d7.prevFrom, d7.prevTo);
    expect(insightsServiceSpy.getBookmarksCount).not.toHaveBeenCalled();
    expect(el().querySelector('[data-range="7d"]')?.getAttribute('aria-pressed')).toBe('true');

    insightsServiceSpy.getAnalyticsInRange.mockClear();
    await component.onRangeChange('all');
    fixture.detectChanges();
    expect(insightsServiceSpy.getAnalyticsInRange).toHaveBeenCalledTimes(1);
    expect(insightsServiceSpy.getAnalyticsInRange.mock.calls[0][2]).toBe('2000-01-01');
    // No previous period → no trends at all
    expect(el().querySelectorAll('.kpi-trend').length).toBe(0);
  });

  it('renders a daily chart and switches metric without refetching', async () => {
    await create();
    insightsServiceSpy.getAnalyticsInRange.mockClear();

    expect(component.series()).toEqual([
      { date: '2026-10-01', count: 10 },
      { date: '2026-10-02', count: 30 },
    ]);
    expect(el().querySelector('svg.ins-chart-svg')?.getAttribute('role')).toBe('img');
    expect(el().querySelector('svg.ins-chart-svg')?.getAttribute('aria-label')).toContain('Views per day');
    expect(el().querySelectorAll('.ins-chart table tbody tr').length).toBe(2);

    (el().querySelector('[data-metric="shares"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.metric()).toBe('shares');
    expect(component.series()).toEqual([{ date: '2026-10-01', count: 4 }]);

    (el().querySelector('button[data-metric="calendar"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.series()).toEqual([{ date: '2026-10-02', count: 2 }]);
    expect(insightsServiceSpy.getAnalyticsInRange).not.toHaveBeenCalled();
  });

  it('formats chart dates in UTC so a calendar date never shifts a day', async () => {
    await create();
    expect(component.formatDate('2026-10-01')).toBe('Oct 1');
    i18n.setLang('es');
    expect(component.formatDate('2026-10-01').toLowerCase()).toContain('1');
    expect(component.formatDate('2026-10-01').toLowerCase()).toContain('oct');
  });

  it('lists top listings sorted by views with names from owned events (no raw IDs)', async () => {
    await create();
    const rows = Array.from(el().querySelectorAll('.ins-top-row'));
    expect(rows.length).toBe(3);
    const names = rows.map((r) => r.querySelector('.ins-top-name')?.textContent?.trim());
    expect(names).toEqual(['Zip Line', 'Sunset Catamaran', 'Untitled listing']);
    const first = rows[1];
    expect(first.querySelector('[data-stat="views"] strong')?.textContent?.trim()).toBe('10');
    expect(first.querySelector('[data-stat="shares"] strong')?.textContent?.trim()).toBe('3');
    expect(first.querySelector('[data-stat="calendar"] strong')?.textContent?.trim()).toBe('2');
    const text = el().textContent ?? '';
    expect(text).not.toContain('ev-1');
    expect(text).not.toContain('prov-101');
    expect(text).not.toContain('file-1');
  });

  it('caps top listings at 5', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, name: `Listing ${i}`, status: 'published' }) as any);
    const rows = many.map((e, i) => row({ event: e.id, event_type: 'event_view', count: i + 1 }));
    await create({ events: many, current: rows, previous: [] });
    const names = Array.from(el().querySelectorAll('.ins-top-name')).map((n) => n.textContent?.trim());
    expect(names).toEqual(['Listing 7', 'Listing 6', 'Listing 5', 'Listing 4', 'Listing 3']);
  });

  it('uses getAssetUrl thumbnails and falls back when an image fails', async () => {
    await create();
    const img = el().querySelector('.ins-top-row img.ins-thumb') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(businessServiceSpy.getAssetUrl).toHaveBeenCalledWith('file-1', expect.stringContaining('width='));
    expect(img.getAttribute('alt')).toBe('Image for Sunset Catamaran');

    img.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    const ev1Row = Array.from(el().querySelectorAll('.ins-top-row')).find(
      (r) => r.querySelector('.ins-top-name')?.textContent?.trim() === 'Sunset Catamaran'
    )!;
    expect(ev1Row.querySelector('img')).toBeNull();
    expect(ev1Row.querySelector('.ins-thumb--fallback')?.textContent?.trim()).toBe('S');
  });

  it('shows empty state with zero values (not an error) when there is no analytics data', async () => {
    await create({ current: [], previous: [], bookmarks: 0, events: [] });
    expect(el().querySelector('.ins-empty')).toBeTruthy();
    expect(el().querySelector('.ins-error')).toBeNull();
    expect(kpiValue('views')).toBe('0');
    expect(kpiValue('bookmarks')).toBe('0');
    expect(el().querySelector('.ins-no-data')?.textContent?.trim()).toBe('No data for this period');
    expect(el().querySelector('.ins-top-empty')).toBeTruthy();
    expect(insightsServiceSpy.getAnalyticsInRange.mock.calls[0][1]).toEqual([]);
  });

  it('shows "unavailable" for bookmarks on bookmark failure without failing the page', async () => {
    await create({ bookmarks: new Error('403 forbidden bookmarks') });
    expect(el().querySelector('.ins-error')).toBeNull();
    expect(kpiValue('views')).toBe('40');
    expect(el().querySelector('[data-kpi="bookmarks"] .kpi-unavailable')?.textContent?.trim()).toBe('Unavailable right now');
  });

  it('shows a customer-safe error with retry on analytics API failure', async () => {
    await create({ analyticsError: new Error('Directus 403: You don\'t have permission to access collection "analytics_event_daily"') });
    const err = el().querySelector('.ins-error');
    expect(err).toBeTruthy();
    const text = err?.textContent ?? '';
    expect(text).not.toMatch(/directus|analytics_event_daily|403|permission to access/i);
    expect(el().querySelector('.kpi-card')).toBeNull();

    insightsServiceSpy.getAnalyticsInRange.mockImplementation(() => Promise.resolve([]));
    (el().querySelector('.ins-retry') as HTMLButtonElement).click();
    await fixture.whenStable();
    await component.loadAll();
    fixture.detectChanges();
    expect(el().querySelector('.ins-error')).toBeNull();
    expect(el().querySelector('.kpi-card')).toBeTruthy();
  });

  it('fails safely without a provider (no analytics query is made)', async () => {
    await create({ providerId: null });
    expect(insightsServiceSpy.getAnalyticsInRange).not.toHaveBeenCalled();
    expect(insightsServiceSpy.getBookmarksCount).not.toHaveBeenCalled();
    expect(el().querySelector('.ins-error')).toBeTruthy();
  });

  it('switches all copy between EN and ES', async () => {
    await create();
    expect(el().querySelector('.ins-title')?.textContent?.trim()).toBe('Insights');
    expect(el().querySelector('[data-kpi="views"] .kpi-label')?.textContent?.trim()).toBe('Views');
    expect(el().querySelector('[data-range="all"]')?.textContent?.trim()).toBe('All');

    i18n.setLang('es');
    fixture.detectChanges();
    expect(el().querySelector('.ins-title')?.textContent?.trim()).toBe('Estadísticas');
    expect(el().querySelector('[data-kpi="views"] .kpi-label')?.textContent?.trim()).toBe('Vistas');
    expect(el().querySelector('[data-kpi="bookmarks"] .kpi-label')?.textContent?.trim()).toBe('Guardados');
    expect(el().querySelector('[data-range="all"]')?.textContent?.trim()).toBe('Todo');
    expect(el().querySelector('.ins-section-title')?.textContent?.trim()).toBe('Rendimiento en el tiempo');
    expect(kpiTrend('views')?.getAttribute('aria-label')).toBe('Subió 100% vs el período anterior');
    const names = Array.from(el().querySelectorAll('.ins-top-name')).map((n) => n.textContent?.trim());
    expect(names).toContain('Publicación sin título');
  });

  it('never renders untracked metrics', async () => {
    await create();
    for (const lang of ['en', 'es'] as const) {
      i18n.setLang(lang);
      fixture.detectChanges();
      const text = el().textContent ?? '';
      expect(text).not.toMatch(/impression|impresion|unique|reach|alcance|geograph|geográf|retention|retención|\bROI\b/);
    }
  });
});
