import { TestBed } from '@angular/core/testing';
import { directusClient } from '../directus/directus-client';
import { AuthService } from './auth.service';
import {
  AnalyticsDailyRow,
  EVENT_ID_CHUNK_SIZE,
  InsightsService,
  METRIC_TYPES,
  WHATSAPP_TYPES,
  aggregateByDate,
  calcTrend,
  getRangeDates,
  getTopEvents,
  sumTypes,
} from './insights.service';

vi.mock('../directus/directus-client', () => ({
  directusClient: {
    request: vi.fn(),
  },
}));

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
    count: 1,
    event: null,
    provider: null,
    ...partial,
  };
}

describe('InsightsService (Phase 1D.1 canonical parity)', () => {
  let service: InsightsService;
  let authServiceSpy: any;
  let requestMock: any;

  beforeEach(() => {
    authServiceSpy = { safeRequest: vi.fn((fn) => fn()) };
    requestMock = vi.mocked(directusClient.request);
    requestMock.mockReset();

    TestBed.configureTestingModule({
      providers: [InsightsService, { provide: AuthService, useValue: authServiceSpy }],
    });
    service = TestBed.inject(InsightsService);
  });

  describe('provider scoping', () => {
    it('always filters analytics server-side by provider FK or owned event IDs, with explicit fields', async () => {
      requestMock.mockResolvedValueOnce([]);
      await service.getAnalyticsInRange('prov-1', ['ev-1', 'ev-2'], '2026-09-01', '2026-10-01');

      expect(authServiceSpy.safeRequest).toHaveBeenCalledTimes(1);
      expect(requestMock).toHaveBeenCalledTimes(1);
      const cmd = queryOf(requestMock.mock.calls[0][0]);
      const url = decodeURIComponent(String(cmd.path ?? '')) + ' ' + decodeURIComponent(JSON.stringify(cmd.params ?? {}));
      expect(url).toContain('analytics_event_daily');
      expect(url).toContain('prov-1');
      expect(url).toContain('ev-1');
      expect(url).toContain('ev-2');
      expect(url).toContain('_between');
      expect(url).not.toContain('*');
    });

    it('builds the exact provider-scoped filter', async () => {
      const spy = vi.spyOn(service as any, 'getAnalyticsInRange');
      requestMock.mockImplementation(async (cmd: any) => {
        const q = queryOf(cmd);
        const params = q.params ?? {};
        const filter = typeof params.filter === 'string' ? JSON.parse(params.filter) : params.filter;
        expect(filter).toEqual({
          _and: [
            { date: { _between: ['2026-09-01', '2026-10-01'] } },
            { _or: [{ provider: { _eq: 'prov-1' } }, { event: { _in: ['ev-1'] } }] },
          ],
        });
        const fields = params.fields;
        expect(String(fields)).toBe('id,date,event_type,target_type,count,event,provider');
        return [];
      });
      await service.getAnalyticsInRange('prov-1', ['ev-1'], '2026-09-01', '2026-10-01');
      expect(spy).toHaveBeenCalled();
    });

    it('uses only the provider FK scope when the business has no events', async () => {
      requestMock.mockImplementation(async (cmd: any) => {
        const params = queryOf(cmd).params ?? {};
        const filter = typeof params.filter === 'string' ? JSON.parse(params.filter) : params.filter;
        expect(filter._and[1]).toEqual({ _or: [{ provider: { _eq: 'prov-1' } }] });
        return [];
      });
      await service.getAnalyticsInRange('prov-1', [], '2026-09-01', '2026-10-01');
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    it('chunks large owned-event lists and de-duplicates rows by id', async () => {
      const ids = Array.from({ length: EVENT_ID_CHUNK_SIZE + 5 }, (_, i) => `ev-${i}`);
      requestMock
        .mockResolvedValueOnce([{ id: 1, date: '2026-10-01', event_type: 'event_view', target_type: 'event', count: 2, event: 'ev-0' }])
        .mockResolvedValueOnce([
          { id: 1, date: '2026-10-01', event_type: 'event_view', target_type: 'event', count: 2, event: 'ev-0' },
          { id: 2, date: '2026-10-01', event_type: 'event_view', target_type: 'event', count: 3, event: `ev-${EVENT_ID_CHUNK_SIZE + 1}` },
        ]);
      const rows = await service.getAnalyticsInRange('prov-1', ids, '2026-09-01', '2026-10-01');
      expect(requestMock).toHaveBeenCalledTimes(2);
      expect(rows.map((r) => r.id)).toEqual([1, 2]);
    });

    it('drops any row not tied to the provider (defence in depth) and normalizes FK objects', async () => {
      requestMock.mockResolvedValueOnce([
        { id: 1, date: '2026-10-01', event_type: 'event_view', target_type: 'event', count: 4, event: { id: 'ev-1' } },
        { id: 2, date: '2026-10-01', event_type: 'event_view', target_type: 'event', count: 99, event: 'someone-elses-event' },
        { id: 3, date: '2026-10-01', event_type: 'provider_view', target_type: 'provider', count: 5, provider: 'prov-1' },
        { id: 4, date: '2026-10-01', event_type: 'provider_view', target_type: 'provider', count: 77, provider: 'prov-2' },
      ]);
      const rows = await service.getAnalyticsInRange('prov-1', ['ev-1'], '2026-09-01', '2026-10-01');
      expect(rows.map((r) => r.id)).toEqual([1, 3]);
      expect(rows[0].event).toBe('ev-1');
    });

    it('refuses to query without a provider id', async () => {
      await expect(service.getAnalyticsInRange('', ['ev-1'], 'a', 'b')).rejects.toThrow();
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

  describe('pure helpers', () => {
    it('getRangeDates mirrors canonical math for 7d/30d/90d', () => {
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
    });

    it("getRangeDates('all') starts at 2000-01-01 with an empty previous period", () => {
      const r = getRangeDates('all', new Date(2026, 9, 6));
      expect(r.from).toBe('2000-01-01');
      expect(r.prevFrom).toBe('2000-01-01');
      expect(r.prevTo).toBe('2000-01-01');
    });

    it('calcTrend: prior-period %, rounding, and zero previous → null', () => {
      expect(calcTrend(150, 100)).toBe(50);
      expect(calcTrend(50, 100)).toBe(-50);
      expect(calcTrend(1, 3)).toBe(-67);
      expect(calcTrend(10, 0)).toBeNull();
      expect(calcTrend(0, 0)).toBeNull();
      expect(calcTrend(0, 5)).toBe(-100);
    });

    it('aggregates views (event_view + provider_view) and shares (event_share + provider_share)', () => {
      const rows = [
        row({ event_type: 'event_view', count: 3 }),
        row({ event_type: 'provider_view', target_type: 'provider', count: 2 }),
        row({ event_type: 'event_share', count: 4 }),
        row({ event_type: 'provider_share', target_type: 'provider', count: 1 }),
        row({ event_type: 'event_add_to_calendar', count: 7 }),
        row({ event_type: 'provider_whatsapp_click', target_type: 'provider', count: 5 }),
        row({ event_type: 'event_whatsapp_click', count: 100 }),
      ];
      expect(sumTypes(rows, METRIC_TYPES.views)).toBe(5);
      expect(sumTypes(rows, METRIC_TYPES.shares)).toBe(5);
      expect(sumTypes(rows, METRIC_TYPES.calendar)).toBe(7);
      // WhatsApp = provider_whatsapp_click only (event_whatsapp_click excluded)
      expect(sumTypes(rows, WHATSAPP_TYPES)).toBe(5);
    });

    it('groups daily totals by date, sorted, without zero-fill', () => {
      const rows = [
        row({ date: '2026-10-03', event_type: 'event_view', count: 1 }),
        row({ date: '2026-10-01', event_type: 'provider_view', count: 2 }),
        row({ date: '2026-10-01', event_type: 'event_view', count: 3 }),
        row({ date: '2026-10-02', event_type: 'event_share', count: 9 }),
      ];
      expect(aggregateByDate(rows, METRIC_TYPES.views)).toEqual([
        { date: '2026-10-01', count: 5 },
        { date: '2026-10-03', count: 1 },
      ]);
      expect(aggregateByDate([], METRIC_TYPES.views)).toEqual([]);
    });

    it('top events: event-target rows only, sorted by views desc, max 5', () => {
      const rows: AnalyticsDailyRow[] = [];
      for (let i = 1; i <= 7; i++) {
        rows.push(row({ event: `ev-${i}`, event_type: 'event_view', count: i }));
      }
      rows.push(row({ event: 'ev-1', event_type: 'event_share', count: 4 }));
      rows.push(row({ event: 'ev-1', event_type: 'event_add_to_calendar', count: 2 }));
      rows.push(row({ event: null, target_type: 'provider', event_type: 'provider_view', count: 1000 }));

      const top = getTopEvents(rows);
      expect(top.map((t) => t.eventId)).toEqual(['ev-7', 'ev-6', 'ev-5', 'ev-4', 'ev-3']);

      const all = getTopEvents(rows, 10);
      const ev1 = all.find((t) => t.eventId === 'ev-1')!;
      expect(ev1).toEqual({ eventId: 'ev-1', views: 1, shares: 4, calendar: 2 });
    });
  });
});
