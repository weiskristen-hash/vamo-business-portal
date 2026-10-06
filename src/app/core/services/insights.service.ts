import { Injectable, inject } from '@angular/core';
import { readItems } from '@directus/sdk';
import { directusClient } from '../directus/directus-client';
import { AuthService } from './auth.service';

/**
 * Business Insights (Phase 1D.1) — canonical parity with the VAMO app
 * `InsightsService` / `InsightsPage` (Isla-Labs-DR/vamo-app, read only).
 *
 * Only analytics that the canonical app already tracks and shows are read here:
 * the `analytics_event_daily` rollup collection and the `bookmarks` aggregate.
 * No new tracking, no new fields.
 *
 * Query behavior intentionally mirrors the canonical VAMO app: Directus receives
 * only the requested date range and its existing row-level permissions decide
 * which analytics rows the authenticated provider account may read. The portal
 * then applies a client-side provider/event ownership check as defense in depth.
 */

export type InsightsRange = '7d' | '30d' | '90d' | 'all';
export type InsightsMetric = 'views' | 'shares' | 'calendar';

export interface InsightsRangeDates {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
}

/** Normalized `analytics_event_daily` row (foreign keys reduced to IDs). */
export interface AnalyticsDailyRow {
  id: string | number | null;
  date: string;
  event_type: string;
  target_type: string;
  count: number;
  event: string | null;
  provider: string | null;
}

export interface DailyPoint {
  date: string;
  count: number;
}

export interface TopListing {
  eventId: string;
  views: number;
  shares: number;
  calendar: number;
}

/** Canonical metric → event_type mapping (chart toggle). */
export const METRIC_TYPES: Record<InsightsMetric, readonly string[]> = {
  views: ['event_view', 'provider_view'],
  shares: ['event_share', 'provider_share'],
  calendar: ['event_add_to_calendar'],
};

/**
 * WhatsApp KPI uses ONLY `provider_whatsapp_click`.
 * `event_whatsapp_click` is intentionally excluded (Phase 1D.1 requirement).
 */
export const WHATSAPP_TYPES: readonly string[] = ['provider_whatsapp_click'];

const RANGE_DAYS: Record<Exclude<InsightsRange, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

/**
 * Canonical date-range math (mirrors `InsightsPage.getRangeDates`):
 * `to` = today 23:59:59.999 local → ISO date; `from` = to - days;
 * previous period = [from - 1 - days, from - 1]. 'all' starts at 2000-01-01 and
 * has an empty previous period (so trends are null).
 */
export function getRangeDates(range: InsightsRange, now: Date = new Date()): InsightsRangeDates {
  const today = new Date(now.getTime());
  today.setHours(23, 59, 59, 999);
  const toStr = today.toISOString().slice(0, 10);

  if (range === 'all') {
    return { from: '2000-01-01', to: toStr, prevFrom: '2000-01-01', prevTo: '2000-01-01' };
  }

  const days = RANGE_DAYS[range];
  const from = new Date(today);
  from.setDate(from.getDate() - days);

  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - days);

  return {
    from: from.toISOString().slice(0, 10),
    to: toStr,
    prevFrom: prevFrom.toISOString().slice(0, 10),
    prevTo: prevTo.toISOString().slice(0, 10),
  };
}

/** Canonical trend: null when the previous period is 0, otherwise rounded % change. */
export function calcTrend(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Sums `count` for rows whose `event_type` is in `types`. */
export function sumTypes(rows: readonly AnalyticsDailyRow[], types: readonly string[]): number {
  let total = 0;
  for (const r of rows) {
    if (types.includes(r.event_type)) total += r.count;
  }
  return total;
}

/** Canonical daily grouping: sum per date, sorted ascending, no zero-fill. */
export function aggregateByDate(rows: readonly AnalyticsDailyRow[], types: readonly string[]): DailyPoint[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (!types.includes(r.event_type)) continue;
    map.set(r.date, (map.get(r.date) ?? 0) + r.count);
  }
  return Array.from(map.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Canonical top events: event-target rows grouped by event, sorted by views desc. */
export function getTopEvents(rows: readonly AnalyticsDailyRow[], limit = 5): TopListing[] {
  const map = new Map<string, TopListing>();
  for (const r of rows) {
    if (r.target_type !== 'event' || !r.event) continue;
    let entry = map.get(r.event);
    if (!entry) {
      entry = { eventId: r.event, views: 0, shares: 0, calendar: 0 };
      map.set(r.event, entry);
    }
    if (r.event_type === 'event_view') entry.views += r.count;
    else if (r.event_type === 'event_share') entry.shares += r.count;
    else if (r.event_type === 'event_add_to_calendar') entry.calendar += r.count;
  }
  return Array.from(map.values())
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
}

function fkId(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id;
    return id === null || id === undefined || id === '' ? null : String(id);
  }
  return String(value);
}

function normalizeRow(raw: any): AnalyticsDailyRow | null {
  if (!raw || typeof raw.date !== 'string' || typeof raw.event_type !== 'string') return null;
  const count = Number(raw.count);
  return {
    id: raw.id ?? null,
    date: raw.date.slice(0, 10),
    event_type: raw.event_type,
    target_type: typeof raw.target_type === 'string' ? raw.target_type : '',
    count: Number.isFinite(count) ? count : 0,
    event: fkId(raw.event),
    provider: fkId(raw.provider),
  };
}

@Injectable({
  providedIn: 'root',
})
export class InsightsService {
  private authService = inject(AuthService);

  /** Explicit, minimal fields. Foreign keys are read raw (no relational expansion). */
  readonly analyticsFields = ['id', 'date', 'event_type', 'target_type', 'count', 'event', 'provider'] as const;

  /**
   * Reads `analytics_event_daily` rows in [from, to] using the same date-only
   * server query as the canonical VAMO app. Directus row-level permissions remain
   * the authoritative server-side business boundary. Provider/event IDs are used
   * only to reject any unexpected rows client-side before rendering.
   */
  async getAnalyticsInRange(
    providerId: string,
    ownedEventIds: readonly string[],
    from: string,
    to: string
  ): Promise<AnalyticsDailyRow[]> {
    if (!providerId) {
      throw new Error('INSIGHTS_PROVIDER_REQUIRED');
    }

    const ownedSet = new Set(ownedEventIds.filter((id) => !!id));
    const items = await this.authService.safeRequest(async () =>
      directusClient.request<any[]>(
        readItems('analytics_event_daily' as any, {
          fields: this.analyticsFields as any,
          filter: { date: { _between: [from, to] } } as any,
          limit: -1,
        } as any)
      )
    );

    const seen = new Set<string>();
    const rows: AnalyticsDailyRow[] = [];
    for (const raw of items || []) {
      const row = normalizeRow(raw);
      if (!row) continue;

      // Defense in depth only. Directus row-level permissions are the server boundary.
      const ownsEvent = !!row.event && ownedSet.has(row.event);
      const ownsProvider = row.provider === providerId;
      if (!ownsEvent && !ownsProvider) continue;

      if (row.id !== null) {
        const key = String(row.id);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      rows.push(row);
    }
    return rows;
  }

  /**
   * Canonical business bookmark total (`bookmarks` where provider = providerId).
   * Unlike canonical, errors propagate so the UI can show "unavailable" instead
   * of a misleading 0.
   */
  async getBookmarksCount(providerId: string): Promise<number> {
    if (!providerId) {
      throw new Error('INSIGHTS_PROVIDER_REQUIRED');
    }
    return this.authService.safeRequest(async () => {
      const data = await directusClient.request<any[]>(
        readItems('bookmarks' as any, {
          filter: { provider: { _eq: providerId } },
          aggregate: { count: ['*'] },
        } as any)
      );
      const first = (data as any)?.[0];
      const value = Number(first?.count?.['*'] ?? first?.count ?? 0);
      return Number.isFinite(value) ? value : 0;
    });
  }
}
