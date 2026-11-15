import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
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
    date: '2026-11-13',
    event_type: 'event_view',
    target_type: 'event',
    referrer: 'vamo_app',
    count: 1,
    event: null,
    provider: null,
    ...partial,
  };
}

describe('InsightsComponent (Phase 3 Business Performance & Engagement)', () => {
  let fixture: ComponentFixture<InsightsComponent>;
  let component: InsightsComponent;
  let userSubject: BehaviorSubject<any>;
  let authServiceSpy: any;
  let businessServiceSpy: any;
  let insightsServiceSpy: any;
  let i18n: I18nService;

  const events: VamoEvent[] = [
    { id: 'ev-1', name: 'Sunset Catamaran', status: 'published', images: [{ directus_files_id: 'file-1' }] } as any,
    { id: 'ev-2', name: 'Zip Line', status: 'published' } as any,
    { id: 'ev-3', name: '', status: 'draft', images: [{ directus_files_id: 'file-3' }] } as any,
    { id: 'ev-4', name: 'Summer DJ Night', status: 'archived' } as any,
  ];

  const currentRows: AnalyticsDailyRow[] = [
    row({ date: '2026-11-13', event: 'ev-1', event_type: 'event_view', referrer: 'vamo_website', count: 10 }),
    row({ date: '2026-11-14', event: 'ev-2', event_type: 'event_view', referrer: 'vamo_app', count: 20 }),
    row({ date: '2026-11-14', event: 'ev-3', event_type: 'event_view', referrer: 'vamo_app', count: 5 }),
    row({ date: '2026-11-14', event: 'ev-4', event_type: 'event_view', referrer: 'vamo_app', count: 2 }),
    row({ date: '2026-11-14', provider: 'prov-101', target_type: 'provider', event_type: 'provider_view', referrer: 'vamo_website', count: 8 }),
    row({ date: '2026-11-13', event: 'ev-1', event_type: 'event_share', referrer: 'vamo_website', count: 3 }),
    row({ date: '2026-11-13', provider: 'prov-101', target_type: 'provider', event_type: 'provider_share', referrer: 'vamo_app', count: 1 }),
    row({ date: '2026-11-14', event: 'ev-1', event_type: 'event_add_to_calendar', referrer: 'vamo_app', count: 2 }),
    row({ date: '2026-11-14', provider: 'prov-101', target_type: 'provider', event_type: 'provider_whatsapp_click', referrer: 'vamo_app', count: 4 }),
    row({ date: '2026-11-14', event: 'ev-1', event_type: 'event_whatsapp_click', referrer: 'vamo_website', count: 6 }),
    row({ date: '2026-11-14', event: 'ev-1', event_type: 'promo_reveal', referrer: 'vamo_website', count: 9 }),
    row({ date: '2026-11-14', provider: 'prov-101', target_type: 'provider', event_type: 'provider_phone_click', referrer: 'vamo_website', count: 3 }),
    row({ date: '2026-11-14', event: 'ev-2', event_type: 'event_reserve_request', referrer: 'vamo_app', count: 5 }),
  ];

  const previousRows: AnalyticsDailyRow[] = [
    row({ date: '2026-10-10', provider: 'prov-101', target_type: 'provider', event_type: 'provider_view', count: 4 }),
    row({ date: '2026-10-10', event: 'ev-1', event_type: 'event_view', count: 37 }),
    row({ date: '2026-10-10', event: 'ev-1', event_type: 'event_share', count: 8 }),
    row({ date: '2026-10-10', provider: 'prov-101', target_type: 'provider', event_type: 'provider_whatsapp_click', count: 2 }),
    row({ date: '2026-10-10', event: 'ev-1', event_type: 'event_whatsapp_click', count: 3 }),
    row({ date: '2026-10-10', event: 'ev-1', event_type: 'promo_reveal', count: 3 }),
  ];

  async function create(opts: {
    current?: AnalyticsDailyRow[];
    previous?: AnalyticsDailyRow[];
    bookmarks?: number | Error;
    analyticsError?: Error;
    providerId?: string | null;
    events?: VamoEvent[];
  } = {}) {
    TestBed.resetTestingModule();
    const providerId = opts.providerId === undefined ? 'prov-101' : opts.providerId;
    const initialUser = providerId ? { id: 'usr-1', provider_link: { id: providerId } } : { id: 'usr-1' };
    userSubject = new BehaviorSubject<any>(initialUser);
    authServiceSpy = {
      get currentUser() {
        return userSubject.value;
      },
      user$: userSubject.asObservable(),
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

  it('scopes every request to the authenticated provider and its own events (including draft and archived posts)', async () => {
    await create();
    expect(businessServiceSpy.getEventsForProvider).toHaveBeenCalledWith('prov-101');
    expect(insightsServiceSpy.getBookmarksCount).toHaveBeenCalledWith('prov-101');
    for (const call of insightsServiceSpy.getAnalyticsInRange.mock.calls) {
      expect(call[0]).toBe('prov-101');
      expect(call[1]).toEqual(['ev-1', 'ev-2', 'ev-3', 'ev-4']);
    }
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

  it('renders all non-duplicative Business Performance KPIs including combined provider + event WhatsApp clicks', async () => {
    await create();
    // Ensure no duplicate combined "views" card alongside Profile Views + Event Views
    expect(el().querySelector('[data-kpi="views"]')).toBeNull();
    expect(kpiValue('profile-views')).toBe('8');
    expect(kpiValue('event-views')).toBe('37'); // 10 + 20 + 5 + 2
    expect(kpiValue('whatsapp')).toBe('10'); // 4 provider_whatsapp_click + 6 event_whatsapp_click
    expect(kpiValue('promo-reveals')).toBe('9');
    expect(kpiValue('phone-clicks')).toBe('3');
    expect(kpiValue('shares')).toBe('4'); // 3 event_share + 1 provider_share
    expect(kpiValue('reservations')).toBe('5');
    expect(kpiValue('bookmarks')).toBe('7');
    expect(kpiValue('calendar')).toBe('2');
  });

  it('shows prior-period % trends across both provider and event WhatsApp clicks and hides trend when previous period is zero', async () => {
    await create();
    // profile-views: 8 vs 4 → +100%
    expect(kpiTrend('profile-views')?.textContent).toContain('100%');
    expect(kpiTrend('profile-views')?.classList.contains('up')).toBe(true);
    expect(kpiTrend('profile-views')?.getAttribute('aria-label')).toBe('Up 100% vs previous period');
    // event-views: 37 vs 37 → 0%
    expect(kpiTrend('event-views')?.textContent).toContain('0%');
    // whatsapp: 10 (4+6) vs 5 (2+3) → +100%
    expect(kpiTrend('whatsapp')?.textContent).toContain('100%');
    expect(kpiTrend('whatsapp')?.classList.contains('up')).toBe(true);
    // promo-reveals: 9 vs 3 → +200%
    expect(kpiTrend('promo-reveals')?.textContent).toContain('200%');
    // shares: 4 vs 8 → -50%
    expect(kpiTrend('shares')?.classList.contains('down')).toBe(true);
    expect(kpiTrend('shares')?.textContent).toContain('50%');
    // phone-clicks, reservations, calendar previous 0 → no trend
    expect(kpiTrend('phone-clicks')).toBeNull();
    expect(kpiTrend('reservations')).toBeNull();
    expect(kpiTrend('calendar')).toBeNull();
    // bookmarks never has a trend
    expect(kpiTrend('bookmarks')).toBeNull();
  });

  it('displays the verified Website vs Mobile App engagement breakdown and handles unattributed or missing splits honestly', async () => {
    await create({
      current: [
        row({ event: 'ev-1', event_type: 'event_view', referrer: 'vamo_website', count: 15 }),
        row({ event: 'ev-1', event_type: 'promo_reveal', referrer: 'vamo_website', count: 5 }),
        row({ provider: 'prov-101', target_type: 'provider', event_type: 'provider_view', referrer: 'vamo_app', count: 25 }),
        row({ event: 'ev-2', event_type: 'event_share', referrer: null, count: 5 }),
      ],
      previous: [],
    });

    const section = el().querySelector('[data-section="platform-breakdown"]');
    expect(section).toBeTruthy();
    expect(section?.querySelector('[data-platform="website"]')?.textContent).toContain('20');
    expect(section?.querySelector('[data-platform="website"]')?.textContent).toContain('40%');
    expect(section?.querySelector('[data-platform="mobile-app"]')?.textContent).toContain('25');
    expect(section?.querySelector('[data-platform="mobile-app"]')?.textContent).toContain('50%');
    expect(section?.querySelector('[data-platform="unattributed"]')?.textContent).toContain('5');
    expect(section?.querySelector('[data-platform="unattributed"]')?.textContent).toContain('10%');
  });

  it('does not render a fabricated Website vs App breakdown when all rows lack verified platform attribution', async () => {
    await create({
      current: [row({ event: 'ev-1', event_type: 'event_view', referrer: null, count: 12 })],
      previous: [],
    });
    expect(el().querySelector('[data-section="platform-breakdown"]')).toBeNull();
    // Main KPIs still include all eligible interactions
    expect(kpiValue('event-views')).toBe('12');
  });

  it('displays an accurate daily reporting freshness indicator in EN and ES without implying real-time reporting', async () => {
    await create();
    component.referenceNow.set(new Date('2026-11-15T16:30:00Z'));
    fixture.detectChanges();

    const freshnessEl = el().querySelector('[data-freshness="daily"]');
    expect(freshnessEl?.textContent?.trim()).toBe('Updated daily · Data through Nov 14');
    expect(freshnessEl?.textContent?.toLowerCase()).not.toContain('real-time');
    expect(freshnessEl?.textContent?.toLowerCase()).not.toContain('live');

    i18n.setLang('es');
    fixture.detectChanges();
    expect(freshnessEl?.textContent).toContain('Actualización diaria');
    expect(freshnessEl?.textContent?.toLowerCase()).toContain('14');
    expect(freshnessEl?.textContent?.toLowerCase()).toContain('nov');
  });

  it('clears prior business analytics immediately and reloads authorized data on user/business switch', async () => {
    await create();
    expect(kpiValue('profile-views')).toBe('8');
    expect(kpiValue('whatsapp')).toBe('10');

    // Configure mocks for second authorized business ('prov-202')
    businessServiceSpy.getEventsForProvider.mockImplementation(async (pid: string) =>
      pid === 'prov-202' ? ([{ id: 'ev-b1', name: 'Cabarete Kite Clinic', status: 'published' }] as any) : events
    );
    insightsServiceSpy.getAnalyticsInRange.mockImplementation(async (pid: string, ids: string[], from: string) => {
      if (from === insightsServiceSpy._prevFrom) return [];
      if (pid === 'prov-202') {
        expect(ids).toEqual(['ev-b1']);
        return [
          row({ provider: 'prov-202', target_type: 'provider', event_type: 'provider_view', count: 3 }),
          row({ event: 'ev-b1', event_type: 'event_whatsapp_click', referrer: 'vamo_website', count: 2 }),
        ];
      }
      return currentRows;
    });
    insightsServiceSpy.getBookmarksCount.mockImplementation(async (pid: string) => (pid === 'prov-202' ? 1 : 7));

    userSubject.next({ id: 'usr-2', provider_link: { id: 'prov-202' } });
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(kpiValue('profile-views')).toBe('3');
    expect(kpiValue('whatsapp')).toBe('2');
    expect(kpiValue('promo-reveals')).toBe('0');
    expect(kpiValue('bookmarks')).toBe('1');
    const names = Array.from(el().querySelectorAll('.ins-top-name')).map((n) => n.textContent?.trim());
    expect(names).toEqual(['Cabarete Kite Clinic']);
    expect(names).not.toContain('Sunset Catamaran');
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
    expect(el().querySelectorAll('.kpi-trend').length).toBe(0);
  });

  it('renders a daily chart and switches metrics (views/whatsapp/promotions/shares/calendar) without refetching', async () => {
    await create();
    insightsServiceSpy.getAnalyticsInRange.mockClear();

    expect(component.series()).toEqual([
      { date: '2026-11-13', count: 10 },
      { date: '2026-11-14', count: 35 }, // 20 + 5 + 2 + 8
    ]);
    expect(el().querySelector('svg.ins-chart-svg')?.getAttribute('role')).toBe('img');
    expect(el().querySelector('svg.ins-chart-svg')?.getAttribute('aria-label')).toContain('Views per day');

    (el().querySelector('[data-metric="whatsapp"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.metric()).toBe('whatsapp');
    expect(component.series()).toEqual([{ date: '2026-11-14', count: 10 }]);

    (el().querySelector('[data-metric="promotions"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.metric()).toBe('promotions');
    expect(component.series()).toEqual([{ date: '2026-11-14', count: 9 }]);

    (el().querySelector('[data-metric="shares"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.series()).toEqual([{ date: '2026-11-13', count: 4 }]);

    (el().querySelector('button[data-metric="calendar"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.series()).toEqual([{ date: '2026-11-14', count: 2 }]);
    expect(insightsServiceSpy.getAnalyticsInRange).not.toHaveBeenCalled();
  });

  it('formats chart dates in UTC so a calendar date never shifts a day', async () => {
    await create();
    expect(component.formatDate('2026-10-01')).toBe('Oct 1');
    i18n.setLang('es');
    expect(component.formatDate('2026-10-01').toLowerCase()).toContain('1');
    expect(component.formatDate('2026-10-01').toLowerCase()).toContain('oct');
  });

  it('lists top listings sorted by views with per-event WhatsApp and promotion reveals (no raw IDs)', async () => {
    await create();
    const rows = Array.from(el().querySelectorAll('.ins-top-row'));
    expect(rows.length).toBe(4);
    const names = rows.map((r) => r.querySelector('.ins-top-name')?.textContent?.trim());
    expect(names).toEqual(['Zip Line', 'Sunset Catamaran', 'Untitled post', 'Summer DJ Night']);
    const sunsetRow = rows[1];
    expect(sunsetRow.querySelector('[data-stat="views"] strong')?.textContent?.trim()).toBe('10');
    expect(sunsetRow.querySelector('[data-stat="whatsapp"] strong')?.textContent?.trim()).toBe('6');
    expect(sunsetRow.querySelector('[data-stat="promo-reveals"] strong')?.textContent?.trim()).toBe('9');
    expect(sunsetRow.querySelector('[data-stat="shares"] strong')?.textContent?.trim()).toBe('3');
    expect(sunsetRow.querySelector('[data-stat="calendar"] strong')?.textContent?.trim()).toBe('2');
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

  it('shows empty state with zero values when there is no engagement, and hides empty state when promo reveals or phone clicks exist', async () => {
    await create({ current: [], previous: [], bookmarks: 0, events: [] });
    expect(el().querySelector('.ins-empty')).toBeTruthy();
    expect(el().querySelector('.ins-error')).toBeNull();
    expect(kpiValue('profile-views')).toBe('0');
    expect(kpiValue('event-views')).toBe('0');
    expect(kpiValue('whatsapp')).toBe('0');
    expect(kpiValue('bookmarks')).toBe('0');
    expect(el().querySelector('[data-section="platform-breakdown"]')).toBeNull();

    await create({
      current: [row({ provider: 'prov-101', target_type: 'provider', event_type: 'provider_phone_click', count: 2 })],
      previous: [],
      bookmarks: 0,
      events: [],
    });
    expect(el().querySelector('.ins-empty')).toBeNull();
    expect(kpiValue('phone-clicks')).toBe('2');
  });

  it('shows "unavailable" for bookmarks on bookmark failure without failing the page', async () => {
    await create({ bookmarks: new Error('403 forbidden bookmarks') });
    expect(el().querySelector('.ins-error')).toBeNull();
    expect(kpiValue('profile-views')).toBe('8');
    expect(el().querySelector('[data-kpi="bookmarks"] .kpi-unavailable')?.textContent?.trim()).toBe('Unavailable right now');
  });

  it('shows a customer-safe error with retry on analytics API failure', async () => {
    await create({ analyticsError: new Error('Directus 403: You don\'t have permission to access collection "analytics_event_daily"') });
    const err = el().querySelector('.ins-error');
    expect(err).toBeTruthy();
    const text = err?.textContent ?? '';
    expect(text).not.toMatch(/directus|analytics_event_daily|403|permission to access/i);
    expect(text).toContain("We couldn't load your Insights right now. Please try again.");
    expect(text).not.toContain('business profile');
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

  it('switches all copy between EN and ES accurately', async () => {
    await create();
    expect(el().querySelector('.ins-title')?.textContent?.trim()).toBe('Insights');
    expect(el().querySelector('[data-kpi="profile-views"] .kpi-label')?.textContent?.trim()).toBe('Profile Views');
    expect(el().querySelector('[data-kpi="whatsapp"] .kpi-label')?.textContent?.trim()).toBe('WhatsApp Clicks');
    expect(el().querySelector('[data-kpi="promo-reveals"] .kpi-label')?.textContent?.trim()).toBe('Promotion Reveals');
    expect(el().querySelector('[data-kpi="phone-clicks"] .kpi-label')?.textContent?.trim()).toBe('Phone Clicks');
    expect(el().querySelector('[data-kpi="reservations"] .kpi-label')?.textContent?.trim()).toBe('Reservation Requests');
    expect(el().querySelector('[data-range="all"]')?.textContent?.trim()).toBe('All');

    i18n.setLang('es');
    fixture.detectChanges();
    expect(el().querySelector('.ins-title')?.textContent?.trim()).toBe('Estadísticas');
    expect(el().querySelector('[data-kpi="profile-views"] .kpi-label')?.textContent?.trim()).toBe('Vistas del perfil');
    expect(el().querySelector('[data-kpi="event-views"] .kpi-label')?.textContent?.trim()).toBe('Vistas de eventos');
    expect(el().querySelector('[data-kpi="whatsapp"] .kpi-label')?.textContent?.trim()).toBe('Clics de WhatsApp');
    expect(el().querySelector('[data-kpi="promo-reveals"] .kpi-label')?.textContent?.trim()).toBe('Promociones reveladas');
    expect(el().querySelector('[data-kpi="phone-clicks"] .kpi-label')?.textContent?.trim()).toBe('Clics en teléfono');
    expect(el().querySelector('[data-kpi="reservations"] .kpi-label')?.textContent?.trim()).toBe('Solicitudes de reserva');
    expect(el().querySelector('[data-kpi="bookmarks"] .kpi-label')?.textContent?.trim()).toBe('Guardados');
    expect(el().querySelector('[data-range="all"]')?.textContent?.trim()).toBe('Todo');
    expect(kpiTrend('profile-views')?.getAttribute('aria-label')).toBe('Subió 100% vs el período anterior');
    const names = Array.from(el().querySelectorAll('.ins-top-name')).map((n) => n.textContent?.trim());
    expect(names).toContain('Publicación sin título');
  });

  it('never renders untracked metrics or misleading completion claims', async () => {
    await create();
    for (const lang of ['en', 'es'] as const) {
      i18n.setLang(lang);
      fixture.detectChanges();
      const text = el().textContent ?? '';
      expect(text).not.toMatch(/impression|impresion|unique|reach|alcance|geograph|geográf|retention|retención|\bROI\b/i);
      expect(text).not.toMatch(/completed booking|confirmed message|completed call|redemption|mensaje confirmado|reserva completada/i);
    }
  });
});
