import { Injectable, inject } from '@angular/core';
import { readItems } from '@directus/sdk';
import { directusClient } from '../directus/directus-client';
import { AuthService } from './auth.service';

/**
 * Business Insights Service — VAMO Business Engagement Reporting (Phase 3).
 *
 * Authoritative Directus sources:
 * - `analytics_event_daily`: daily aggregated interactions populated by the
 *   scheduled Directus Flow `Aggregate Analytics Events (Daily)` (`0 3 * * *` UTC),
 *   grouped by `(date, event_type, target_type, target_id, referrer)`.
 * - `bookmarks`: business bookmark aggregate (`provider = providerId`).
 *
 * Query behavior preserves the verified Directus permission contract: Directus
 * receives only the requested date range and `fields: ['*', 'event.id', ...]`,
 * letting server-side `Customer` row-level permissions enforce business isolation
 * (`event.provider == $CURRENT_USER.provider_link.id || provider == $CURRENT_USER.provider_link.id`).
 * Strict client-side ownership validation is then applied as defense in depth.
 */

export type InsightsRange = '7d' | '30d' | '90d' | 'all';
export type InsightsMetric = 'views' | 'whatsapp' | 'promotions' | 'shares' | 'calendar';

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
  referrer?: string | null;
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
  whatsapp: number;
  promoReveals: number;
  shares: number;
  calendar: number;
  reservationRequests: number;
}

export interface PlatformBreakdown {
  website: number;
  mobileApp: number;
  unattributed: number;
  total: number;
  /** True only when at least one counted interaction carries a verified platform referrer (`vamo_website` or `vamo_app`). */
  hasVerifiedSplit: boolean;
}

/** Canonical event_type mappings per business engagement metric. */
export const PROFILE_VIEW_TYPES: readonly string[] = ['provider_view'];
export const EVENT_VIEW_TYPES: readonly string[] = ['event_view'];
export const WHATSAPP_TYPES: readonly string[] = ['provider_whatsapp_click', 'event_whatsapp_click'];
export const PROMO_REVEAL_TYPES: readonly string[] = ['promo_reveal'];
export const PHONE_CLICK_TYPES: readonly string[] = ['provider_phone_click'];
export const SHARE_TYPES: readonly string[] = ['provider_share', 'event_share'];
export const RESERVATION_REQUEST_TYPES: readonly string[] = ['event_reserve_request'];
export const CALENDAR_TYPES: readonly string[] = ['event_add_to_calendar'];

/** All eligible customer engagement event types surfaced in Business Insights. */
export const ELIGIBLE_ENGAGEMENT_TYPES: readonly string[] = [
  ...PROFILE_VIEW_TYPES,
  ...EVENT_VIEW_TYPES,
  ...WHATSAPP_TYPES,
  ...PROMO_REVEAL_TYPES,
  ...PHONE_CLICK_TYPES,
  ...SHARE_TYPES,
  ...RESERVATION_REQUEST_TYPES,
  ...CALENDAR_TYPES,
];

/** Metric → event_type mapping for the daily performance chart toggle. */
export const METRIC_TYPES: Record<InsightsMetric, readonly string[]> = {
  views: ['event_view', 'provider_view'],
  whatsapp: WHATSAPP_TYPES,
  promotions: PROMO_REVEAL_TYPES,
  shares: SHARE_TYPES,
  calendar: CALENDAR_TYPES,
};

/** Known Directus `analytics_event_daily.referrer` identifiers. */
export const WEBSITE_REFERRER = 'vamo_website';
export const APP_REFERRER = 'vamo_app';

/** Hour in UTC at which the Directus `Aggregate Analytics Events (Daily)` flow (`0 3 * * *`) runs. */
const DAILY_ROLLUP_CRON_UTC_HOUR = 3;

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

/**
 * Aggregates eligible business interactions by verified `referrer` in `analytics_event_daily`.
 * - `vamo_website` → `website`
 * - `vamo_app` → `mobileApp`
 * - missing, empty, or unrecognized `referrer` → `unattributed`
 * Never fabricates a website/app split when all counted rows lack verified platform attribution.
 */
export function computePlatformBreakdown(
  rows: readonly AnalyticsDailyRow[],
  eligibleTypes: readonly string[] = ELIGIBLE_ENGAGEMENT_TYPES
): PlatformBreakdown {
  let website = 0;
  let mobileApp = 0;
  let unattributed = 0;

  for (const r of rows) {
    if (!r.count || !eligibleTypes.includes(r.event_type)) continue;
    const ref = typeof r.referrer === 'string' ? r.referrer.trim().toLowerCase() : '';
    if (ref === WEBSITE_REFERRER) {
      website += r.count;
    } else if (ref === APP_REFERRER) {
      mobileApp += r.count;
    } else {
      unattributed += r.count;
    }
  }

  const total = website + mobileApp + unattributed;
  return {
    website,
    mobileApp,
    unattributed,
    total,
    hasVerifiedSplit: website + mobileApp > 0,
  };
}

/**
 * Computes the most recent completed daily reporting date (`YYYY-MM-DD` UTC)
 * for `analytics_event_daily`.
 *
 * Verified Directus Flow `Aggregate Analytics Events (Daily)` (`0 3 * * *` UTC)
 * aggregates the prior UTC calendar day at 03:00 UTC:
 * - At or after 03:00 UTC, yesterday (UTC - 1 day) is the latest scheduled rollup date.
 * - Before 03:00 UTC, two days ago (UTC - 2 days) is the latest completed scheduled rollup date.
 * - If loaded rows already contain a newer verified calendar date (<= today UTC), that date is honored.
 */
export function getReportingFreshnessDate(
  now: Date = new Date(),
  rows: readonly AnalyticsDailyRow[] = []
): string {
  const todayUtc = now.toISOString().slice(0, 10);
  const daysBack = now.getUTCHours() >= DAILY_ROLLUP_CRON_UTC_HOUR ? 1 : 2;
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack));
  let latest = cutoff.toISOString().slice(0, 10);

  for (const r of rows) {
    if (!r.date || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
    if (r.date > latest && r.date <= todayUtc) {
      latest = r.date;
    }
  }
  return latest;
}

/** Top events: event-target rows grouped by event, sorted by views desc. */
export function getTopEvents(rows: readonly AnalyticsDailyRow[], limit = 5): TopListing[] {
  const map = new Map<string, TopListing>();
  for (const r of rows) {
    if (r.target_type !== 'event' || !r.event) continue;
    let entry = map.get(r.event);
    if (!entry) {
      entry = {
        eventId: r.event,
        views: 0,
        whatsapp: 0,
        promoReveals: 0,
        shares: 0,
        calendar: 0,
        reservationRequests: 0,
      };
      map.set(r.event, entry);
    }
    if (r.event_type === 'event_view') entry.views += r.count;
    else if (r.event_type === 'event_whatsapp_click') entry.whatsapp += r.count;
    else if (r.event_type === 'promo_reveal') entry.promoReveals += r.count;
    else if (r.event_type === 'event_share') entry.shares += r.count;
    else if (r.event_type === 'event_add_to_calendar') entry.calendar += r.count;
    else if (r.event_type === 'event_reserve_request') entry.reservationRequests += r.count;
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

function normalizeReferrer(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeRow(raw: any): AnalyticsDailyRow | null {
  if (!raw || typeof raw.date !== 'string' || typeof raw.event_type !== 'string') return null;
  const date = raw.date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const count = Number(raw.count);
  return {
    id: raw.id ?? null,
    date,
    event_type: raw.event_type,
    target_type: typeof raw.target_type === 'string' ? raw.target_type : '',
    referrer: normalizeReferrer(raw.referrer),
    count: Number.isFinite(count) && count >= 0 ? count : 0,
    event: fkId(raw.event),
    provider: fkId(raw.provider),
  };
}

@Injectable({
  providedIn: 'root',
})
export class InsightsService {
  private authService = inject(AuthService);

  /**
   * Exact canonical VAMO Insights field contract.
   * Using `*` lets Directus return all fields permitted to the authenticated Customer role
   * (`date`, `event_type`, `target_type`, `referrer`, `count`, `event`, `provider`),
   * while the event expansion matches the working VAMO app request.
   */
  readonly analyticsFields = ['*', 'event.id', 'event.name', 'event.images.directus_files_id'] as const;

  /**
   * Reads `analytics_event_daily` rows in [from, to] using the canonical date-only
   * server query. Directus row-level permissions remain the authoritative server-side
   * business boundary. Strict provider/event ownership checks are enforced client-side
   * to reject foreign, orphaned, or mismatched ownership rows before rendering.
   */
  async getAnalyticsInRange(
    providerId: string,
    ownedEventIds: readonly string[],
    from: string,
    to: string
  ): Promise<AnalyticsDailyRow[]> {
    const normalizedProviderId = typeof providerId === 'string' ? providerId.trim() : '';
    if (!normalizedProviderId) {
      throw new Error('INSIGHTS_PROVIDER_REQUIRED');
    }

    const ownedSet = new Set(
      ownedEventIds
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter((id) => !!id)
    );
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

      // Reject any row explicitly tied to a different provider (including mismatched provider+event rows).
      if (row.provider !== null && row.provider !== normalizedProviderId) continue;
      // Reject any row referencing an event not owned by this provider (foreign or orphaned event).
      if (row.event !== null && !ownedSet.has(row.event)) continue;

      const ownsEvent = row.event !== null && ownedSet.has(row.event);
      const ownsProvider = row.provider === normalizedProviderId;
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
    const normalizedProviderId = typeof providerId === 'string' ? providerId.trim() : '';
    if (!normalizedProviderId) {
      throw new Error('INSIGHTS_PROVIDER_REQUIRED');
    }
    return this.authService.safeRequest(async () => {
      const data = await directusClient.request<any[]>(
        readItems('bookmarks' as any, {
          filter: { provider: { _eq: normalizedProviderId } },
          aggregate: { count: ['*'] },
        } as any)
      );
      const first = (data as any)?.[0];
      const value = Number(first?.count?.['*'] ?? first?.count ?? 0);
      return Number.isFinite(value) ? value : 0;
    });
  }
}
