import { TestBed } from '@angular/core/testing';
import { directusClient } from '../directus/directus-client';
import { AuthService } from './auth.service';
import {
  AnalyticsDailyRow,
  CALENDAR_TYPES,
  EVENT_VIEW_TYPES,
  InsightsService,
  METRIC_TYPES,
  PHONE_CLICK_TYPES,
  PROFILE_VIEW_TYPES,
  PROMO_REVEAL_TYPES,
  RESERVATION_REQUEST_TYPES,
  SHARE_TYPES,
  WHATSAPP_TYPES,
  aggregateByDate,
  calcTrend,
  computePlatformBreakdown,
  getRangeDates,
  getReportingFreshnessDate,
  getTopEvents,
  sumTypes,
} from './insights.service';

/** Extracts the REST query object from an SDK readItems() command. */
function queryOf(command: any): any {
  const resolved = typeof command === 'function' ? command() : command;
  return resolved;
}

function row(partial: Partial<AnalyticsDailyRow>): AnalyticsDailyRow {
  return {
    id: null,
    date: '2026-10-01',
    event_type: 'event_view',
    target_type: 'event',
    referrer: 'vamo_app',
    count: 1,
    event: null,
    provider: null,
    ...partial,
  };
}

describe('InsightsService (Phase 3 Business Engagement Reporting)', () => {
  let service: InsightsService;
  let authServiceSpy: any;
  let requestMock: any;

  beforeEach(() => {
    authServiceSpy = { safeRequest: vi.fn((fn) => fn()) };
    requestMock = vi.spyOn(directusClient, 'request').mockImplementation(vi.fn() as any);

    TestBed.configureTestingModule({
      providers: [InsightsService, { provide: AuthService, useValue: authServiceSpy }],
    });
    service = TestBed.inject(InsightsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  describe('canonical analytics read & strict client-side ownership defense', () => {
    it('uses the canonical date-only server filter and canonical field projection', async () => {
      requestMock.mockResolvedValueOnce([]);
      await service.getAnalyticsInRange('prov-1', ['ev-1', 'ev-2'], '2026-09-01', '2026-10-01');

      expect(authServiceSpy.safeRequest).toHaveBeenCalledTimes(1);
      expect(requestMock).toHaveBeenCalledTimes(1);
      const cmd = queryOf(requestMock.mock.calls[0][0]);
      const url = decodeURIComponent(String(cmd.path ?? '')) + ' ' + decodeURIComponent(JSON.stringify(cmd.params ?? {}));
      expect(url).toContain('analytics_event_daily');
      expect(url).toContain('_between');
      expect(url).not.toContain('prov-1');
      expect(url).not.toContain('ev-1');
      expect(url).not.toContain('ev-2');
      expect(url).toContain('*');
      expect(url).toContain('event.id');
      expect(url).toContain('event.name');
      expect(url).toContain('event.images.directus_files_id');
    });

    it('builds exactly the canonical date-range filter', async () => {
      requestMock.mockImplementation(async (cmd: any) => {
        const q = queryOf(cmd);
        const params = q.params ?? {};
        const filter = typeof params.filter === 'string' ? JSON.parse(params.filter) : params.filter;
        expect(filter).toEqual({ date: { _between: ['2026-09-01', '2026-10-01'] } });
        expect(String(params.fields)).toBe('*,event.id,event.name,event.images.directus_files_id');
        return [];
      });
      await service.getAnalyticsInRange('prov-1', ['ev-1'], '2026-09-01', '2026-10-01');
    });

    it('uses one analytics request even when the provider owns many events', async () => {
      const ids = Array.from({ length: 205 }, (_, i) => `ev-${i}`);
      requestMock.mockResolvedValueOnce([]);
      await service.getAnalyticsInRange('prov-1', ids, '2026-09-01', '2026-10-01');
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    it('preserves authorized provider/event rows (including expired/draft events) and rejects foreign, orphaned, or mismatched ownership rows', async () => {
      requestMock.mockResolvedValueOnce([
        // 1. Owned active event row (provider null, as written by Directus daily rollup)
        { id: 1, date: '2026-11-14', event_type: 'event_view', target_type: 'event', referrer: 'vamo_website', count: 4, event: { id: 'ev-1' }, provider: null },
        // 2. Owned expired/draft event historical row
        { id: 2, date: '2026-11-10', event_type: 'event_whatsapp_click', target_type: 'event', referrer: 'vamo_website', count: 3, event: 'ev-expired', provider: null },
        // 3. Owned provider row
        { id: 3, date: '2026-11-14', event_type: 'provider_view', target_type: 'provider', referrer: 'vamo_app', count: 5, provider: { id: 'prov-1' }, event: null },
        // 4. Foreign event (unowned / orphaned) -> MUST reject
        { id: 4, date: '2026-11-14', event_type: 'event_view', target_type: 'event', referrer: 'vamo_app', count: 99, event: 'someone-elses-event', provider: null },
        // 5. Foreign provider -> MUST reject
        { id: 5, date: '2026-11-14', event_type: 'provider_whatsapp_click', target_type: 'provider', referrer: 'vamo_app', count: 77, provider: 'prov-2', event: null },
        // 6. Mismatched ownership: foreign provider + owned event -> MUST reject
        { id: 6, date: '2026-11-14', event_type: 'event_whatsapp_click', target_type: 'event', referrer: 'vamo_website', count: 50, provider: 'prov-2', event: 'ev-1' },
        // 7. Mismatched ownership: owned provider + foreign event -> MUST reject
        { id: 7, date: '2026-11-14', event_type: 'event_view', target_type: 'event', referrer: 'vamo_website', count: 40, provider: 'prov-1', event: 'foreign-ev' },
        // 8. Missing both provider and event -> MUST reject
        { id: 8, date: '2026-11-14', event_type: 'provider_view', target_type: 'provider', referrer: 'vamo_app', count: 12, provider: null, event: null },
        // 9. Malformed row (invalid date) -> MUST reject
        { id: 9, date: 'invalid-date', event_type: 'provider_view', target_type: 'provider', count: 10, provider: 'prov-1' },
      ]);

      const rows = await service.getAnalyticsInRange('prov-1', ['ev-1', 'ev-expired'], '2026-11-01', '2026-11-15');
      expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
      expect(rows[0].event).toBe('ev-1');
      expect(rows[0].referrer).toBe('vamo_website');
      expect(rows[1].event).toBe('ev-expired');
      expect(rows[2].provider).toBe('prov-1');
    });

    it('de-duplicates repeated rows by id while preserving distinct Customer rows where id is omitted by Directus RBAC', async () => {
      requestMock.mockResolvedValueOnce([
        { id: 1, date: '2026-11-14', event_type: 'event_whatsapp_click', target_type: 'event', referrer: 'vamo_website', count: 2, event: 'ev-1' },
        { id: 1, date: '2026-11-14', event_type: 'event_whatsapp_click', target_type: 'event', referrer: 'vamo_website', count: 2, event: 'ev-1' },
        // Customer role in Directus omits `id` (`PERM 79`); distinct website + app rows on same day must both survive
        { date: '2026-11-14', event_type: 'provider_whatsapp_click', target_type: 'provider', referrer: 'vamo_website', count: 3, provider: 'prov-1' },
        { date: '2026-11-14', event_type: 'provider_whatsapp_click', target_type: 'provider', referrer: 'vamo_app', count: 4, provider: 'prov-1' },
      ]);
      const rows = await service.getAnalyticsInRange('prov-1', ['ev-1'], '2026-11-01', '2026-11-15');
      expect(rows).toHaveLength(3);
      expect(sumTypes(rows, WHATSAPP_TYPES)).toBe(9);
    });

    it('refuses to query without a valid provider id', async () => {
      await expect(service.getAnalyticsInRange('', ['ev-1'], 'a', 'b')).rejects.toThrow();
      await expect(service.getAnalyticsInRange('   ', ['ev-1'], 'a', 'b')).rejects.toThrow();
      await expect(service.getBookmarksCount('')).rejects.toThrow();
      expect(requestMock).not.toHaveBeenCalled();
    });

    it('propagates API failures (no silent zeros)', async () => {
      requestMock.mockRejectedValueOnce(new Error('403 Forbidden'));
      await expect(service.getAnalyticsInRange('prov-1', [], 'a', 'b')).rejects.toThrow('403 Forbidden');
    });
  });

  describe('bookmark total', () => {
    it('counts bookmarks filtered by provider (canonical aggregate shape)', async () => {
      requestMock.mockImplementationOnce(async (cmd: any) => {
        const q = queryOf(cmd);
        expect(String(q.path)).toContain('bookmarks');
        const params = q.params ?? {};
        const filter = typeof params.filter === 'string' ? JSON.parse(params.filter) : params.filter;
        expect(filter).toEqual({ provider: { _eq: 'prov-1' } });
        return [{ count: { '*': '12' } }];
      });
      await expect(service.getBookmarksCount('prov-1')).resolves.toBe(12);
    });

    it('handles flat count and zero', async () => {
      requestMock.mockResolvedValueOnce([{ count: 3 }]);
      await expect(service.getBookmarksCount('prov-1')).resolves.toBe(3);
      requestMock.mockResolvedValueOnce([]);
      await expect(service.getBookmarksCount('prov-1')).resolves.toBe(0);
    });

    it('propagates bookmark errors so the UI can show "unavailable"', async () => {
      requestMock.mockRejectedValueOnce(new Error('boom'));
      await expect(service.getBookmarksCount('prov-1')).rejects.toThrow('boom');
    });
  });

  describe('engagement metric mappings & pure helpers', () => {
    it('getRangeDates mirrors canonical math for 7d/30d/90d and all', () => {
      const now = new Date(2026, 9, 6, 10, 0, 0); // local Oct 6 2026
      const d7 = getRangeDates('7d', now);
      const today = new Date(now);
      today.setHours(23, 59, 59, 999);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const from = new Date(today);
      from.setDate(from.getDate() - 7);
      const prevTo = new Date(from);
      prevTo.setDate(prevTo.getDate() - 1);
      const prevFrom = new Date(prevTo);
      prevFrom.setDate(prevFrom.getDate() - 7);
      expect(d7).toEqual({ from: iso(from), to: iso(today), prevFrom: iso(prevFrom), prevTo: iso(prevTo) });

      const d30 = getRangeDates('30d', now);
      const d90 = getRangeDates('90d', now);
      expect(d30.to).toBe(d7.to);
      expect(d30.from < d7.from).toBe(true);
      expect(d90.from < d30.from).toBe(true);
      expect(d90.prevTo < d90.from).toBe(true);

      const all = getRangeDates('all', now);
      expect(all.from).toBe('2000-01-01');
      expect(all.prevFrom).toBe('2000-01-01');
      expect(all.prevTo).toBe('2000-01-01');
    });

    it('calcTrend: prior-period %, rounding, and zero previous → null', () => {
      expect(calcTrend(150, 100)).toBe(50);
      expect(calcTrend(50, 100)).toBe(-50);
      expect(calcTrend(1, 3)).toBe(-67);
      expect(calcTrend(10, 0)).toBeNull();
      expect(calcTrend(0, 0)).toBeNull();
      expect(calcTrend(0, 5)).toBe(-100);
    });

    it('counts both provider_whatsapp_click and event_whatsapp_click in WHATSAPP_TYPES without overlapping reservation requests', () => {
      const rows = [
        row({ event_type: 'provider_view', target_type: 'provider', count: 11 }),
        row({ event_type: 'event_view', count: 29 }),
        row({ event_type: 'provider_whatsapp_click', target_type: 'provider', referrer: 'vamo_app', count: 5 }),
        row({ event_type: 'event_whatsapp_click', referrer: 'vamo_website', count: 8 }),
        row({ event_type: 'promo_reveal', referrer: 'vamo_website', count: 6 }),
        row({ event_type: 'provider_phone_click', target_type: 'provider', referrer: 'vamo_website', count: 4 }),
        row({ event_type: 'event_share', count: 3 }),
        row({ event_type: 'provider_share', target_type: 'provider', count: 2 }),
        row({ event_type: 'event_reserve_request', count: 9 }),
        row({ event_type: 'event_add_to_calendar', count: 7 }),
        row({ event_type: 'event_report_click', count: 99 }), // non-engagement internal action
      ];

      expect(sumTypes(rows, PROFILE_VIEW_TYPES)).toBe(11);
      expect(sumTypes(rows, EVENT_VIEW_TYPES)).toBe(29);
      expect(sumTypes(rows, METRIC_TYPES.views)).toBe(40);
      expect(sumTypes(rows, WHATSAPP_TYPES)).toBe(13); // 5 provider + 8 event
      expect(sumTypes(rows, PROMO_REVEAL_TYPES)).toBe(6);
      expect(sumTypes(rows, PHONE_CLICK_TYPES)).toBe(4);
      expect(sumTypes(rows, SHARE_TYPES)).toBe(5);
      expect(sumTypes(rows, RESERVATION_REQUEST_TYPES)).toBe(9);
      expect(sumTypes(rows, CALENDAR_TYPES)).toBe(7);
    });

    it('groups daily totals by date, sorted, without zero-fill across chart metrics', () => {
      const rows = [
        row({ date: '2026-10-03', event_type: 'event_whatsapp_click', count: 4 }),
        row({ date: '2026-10-01', event_type: 'provider_whatsapp_click', count: 2 }),
        row({ date: '2026-10-01', event_type: 'event_whatsapp_click', count: 3 }),
        row({ date: '2026-10-02', event_type: 'promo_reveal', count: 9 }),
      ];
      expect(aggregateByDate(rows, METRIC_TYPES.whatsapp)).toEqual([
        { date: '2026-10-01', count: 5 },
        { date: '2026-10-03', count: 4 },
      ]);
      expect(aggregateByDate(rows, METRIC_TYPES.promotions)).toEqual([
        { date: '2026-10-02', count: 9 },
      ]);
      expect(aggregateByDate([], METRIC_TYPES.views)).toEqual([]);
    });

    it('top events: event-target rows only, sorted by views desc, max 5, including whatsapp and promo reveals', () => {
      const rows: AnalyticsDailyRow[] = [];
      for (let i = 1; i <= 7; i++) {
        rows.push(row({ event: `ev-${i}`, event_type: 'event_view', count: i }));
      }
      rows.push(row({ event: 'ev-1', event_type: 'event_whatsapp_click', count: 6 }));
      rows.push(row({ event: 'ev-1', event_type: 'promo_reveal', count: 3 }));
      rows.push(row({ event: 'ev-1', event_type: 'event_share', count: 4 }));
      rows.push(row({ event: 'ev-1', event_type: 'event_add_to_calendar', count: 2 }));
      rows.push(row({ event: 'ev-1', event_type: 'event_reserve_request', count: 5 }));
      rows.push(row({ event: null, target_type: 'provider', event_type: 'provider_view', count: 1000 }));

      const top = getTopEvents(rows);
      expect(top.map((t) => t.eventId)).toEqual(['ev-7', 'ev-6', 'ev-5', 'ev-4', 'ev-3']);

      const all = getTopEvents(rows, 10);
      const ev1 = all.find((t) => t.eventId === 'ev-1')!;
      expect(ev1).toEqual({
        eventId: 'ev-1',
        views: 1,
        whatsapp: 6,
        promoReveals: 3,
        shares: 4,
        calendar: 2,
        reservationRequests: 5,
      });
    });
  });

  describe('website vs mobile-app platform attribution', () => {
    it('breaks down vamo_website, vamo_app, missing/legacy null, and unknown platform values while ignoring non-eligible report clicks', () => {
      const rows = [
        row({ event_type: 'provider_view', referrer: 'vamo_website', count: 12 }),
        row({ event_type: 'event_whatsapp_click', referrer: 'vamo_website', count: 3 }),
        row({ event_type: 'event_view', referrer: 'vamo_app', count: 25 }),
        row({ event_type: 'promo_reveal', referrer: null, count: 4 }),
        row({ event_type: 'provider_phone_click', referrer: '', count: 2 }),
        row({ event_type: 'event_share', referrer: 'unknown_partner', count: 1 }),
        row({ event_type: 'event_report_click', referrer: 'vamo_website', count: 50 }), // excluded
      ];

      expect(computePlatformBreakdown(rows)).toEqual({
        website: 15,
        mobileApp: 25,
        unattributed: 7,
        total: 47,
        hasVerifiedSplit: true,
      });
    });

    it('never fabricates a platform split when rows are empty or lack verified platform referrers', () => {
      expect(computePlatformBreakdown([])).toEqual({
        website: 0,
        mobileApp: 0,
        unattributed: 0,
        total: 0,
        hasVerifiedSplit: false,
      });

      const unattributedOnly = [
        row({ event_type: 'event_view', referrer: null, count: 10 }),
        row({ event_type: 'promo_reveal', referrer: 'legacy_unknown', count: 5 }),
      ];
      expect(computePlatformBreakdown(unattributedOnly)).toEqual({
        website: 0,
        mobileApp: 0,
        unattributed: 15,
        total: 15,
        hasVerifiedSplit: false,
      });
    });
  });

  describe('daily reporting freshness calculation', () => {
    it('reports yesterday UTC after the 03:00 UTC daily aggregation flow and two days ago before 03:00 UTC', () => {
      // After 03:00 UTC on Nov 15 -> data through Nov 14
      expect(getReportingFreshnessDate(new Date('2026-11-15T16:30:00Z'), [])).toBe('2026-11-14');
      // Before 03:00 UTC on Nov 15 -> 03:00 UTC job has not run yet -> data through Nov 13
      expect(getReportingFreshnessDate(new Date('2026-11-15T02:15:00Z'), [])).toBe('2026-11-13');
    });

    it('honors a newer verified row date when already present in analytics_event_daily without accepting future dates', () => {
      const rows = [
        row({ date: '2026-11-14', count: 3 }),
        row({ date: '2099-01-01', count: 1 }), // malformed future date ignored
      ];
      expect(getReportingFreshnessDate(new Date('2026-11-15T01:30:00Z'), rows)).toBe('2026-11-14');
    });
  });
});
