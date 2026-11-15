import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { CustomerErrorService } from '../../core/services/customer-error.service';
import {
  AnalyticsDailyRow,
  CALENDAR_TYPES,
  ELIGIBLE_ENGAGEMENT_TYPES,
  EVENT_VIEW_TYPES,
  InsightsMetric,
  InsightsRange,
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
} from '../../core/services/insights.service';
import { VamoEvent } from '../../core/models/event.model';

interface MessageDescriptor {
  key: string;
  params?: Record<string, string | number>;
}

export type KpiId =
  | 'profile-views'
  | 'event-views'
  | 'whatsapp'
  | 'promo-reveals'
  | 'phone-clicks'
  | 'shares'
  | 'reservations'
  | 'bookmarks'
  | 'calendar';

interface KpiCard {
  id: KpiId;
  labelKey: string;
  hintKey: string;
  value: number | null;
  trend: number | null;
}

interface PlatformRowView {
  id: 'website' | 'mobile-app' | 'unattributed';
  labelKey: string;
  count: number;
  pct: number;
}

interface TopListingView {
  eventId: string;
  name: string;
  imageUrl: string | null;
  initial: string;
  views: number;
  whatsapp: number;
  promoReveals: number;
  shares: number;
  calendar: number;
}

interface ChartModel {
  width: number;
  height: number;
  baseY: number;
  topY: number;
  midY: number;
  left: number;
  right: number;
  linePath: string;
  areaPath: string;
  points: { x: number; y: number; label: string; count: number }[];
  xTicks: { x: number; label: string }[];
  yMax: number;
  showPoints: boolean;
}

/**
 * Business Insights (Phase 3 — Business Performance & Engagement Reporting).
 * Surfaces complete, accurately attributed engagement across VAMO's app and public website:
 * Profile Views, Event Views, WhatsApp Clicks (profile + event), Promotion Reveals,
 * Phone Clicks, Shares (profile + event), Reservation Requests, Bookmarks, and Calendar,
 * plus daily trend chart, verified Website vs Mobile App breakdown, Top 5 Posts, and
 * daily rollup freshness indicator.
 */
@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [RouterModule, TranslatePipe],
  template: `
    <div class="insights-page">
      <header class="ins-header">
        <div class="ins-header-copy">
          <h1 class="ins-title">{{ 'PORTAL.INSIGHTS.TITLE' | translate }}</h1>
          <p class="ins-subtitle">{{ 'PORTAL.INSIGHTS.SUBTITLE' | translate }}</p>
          <p class="ins-freshness" data-freshness="daily">
            <span class="ins-freshness-dot" aria-hidden="true"></span>
            <span>{{ freshnessText() }}</span>
          </p>
        </div>

        <div class="ins-range" role="group" [attr.aria-label]="'PORTAL.INSIGHTS.RANGE_LABEL' | translate">
          @for (r of ranges; track r.value) {
            <button
              type="button"
              class="ins-range-btn"
              [class.active]="range() === r.value"
              [attr.aria-pressed]="range() === r.value"
              [attr.aria-label]="r.ariaKey | translate"
              [attr.data-range]="r.value"
              [disabled]="loading()"
              (click)="onRangeChange(r.value)"
            >
              {{ r.labelKey | translate }}
            </button>
          }
        </div>
      </header>

      @if (errorMessage(); as msg) {
        <div class="ins-error card" role="alert">
          <p>{{ msg }}</p>
          <button type="button" class="btn btn-secondary ins-retry" (click)="retry()">
            {{ 'PORTAL.INSIGHTS.RETRY' | translate }}
          </button>
        </div>
      } @else if (loading()) {
        <div class="ins-loading" role="status" aria-live="polite">
          <span class="spinner" aria-hidden="true"></span>
          <span>{{ 'PORTAL.INSIGHTS.LOADING' | translate }}</span>
        </div>
      } @else {
        @if (isEmpty()) {
          <div class="ins-empty card">
            <h2>{{ 'PORTAL.INSIGHTS.EMPTY_TITLE' | translate }}</h2>
            <p>{{ 'PORTAL.INSIGHTS.EMPTY_DESC' | translate }}</p>
          </div>
        }

        <section class="ins-perf-block" [attr.aria-label]="'PORTAL.INSIGHTS.BUSINESS_PERFORMANCE_TITLE' | translate">
          <h2 class="ins-group-heading">{{ 'PORTAL.INSIGHTS.BUSINESS_PERFORMANCE_TITLE' | translate }}</h2>
          <div class="ins-kpi-grid">
            @for (k of kpis(); track k.id) {
              <article class="kpi-card card" [attr.data-kpi]="k.id">
                <p class="kpi-label">{{ k.labelKey | translate }}</p>
                @if (k.value === null) {
                  <p class="kpi-value kpi-value--na" aria-hidden="true">—</p>
                  <p class="kpi-unavailable">{{ 'PORTAL.INSIGHTS.BOOKMARKS_UNAVAILABLE' | translate }}</p>
                } @else {
                  <p class="kpi-value">{{ formatNumber(k.value) }}</p>
                }
                @if (k.trend !== null) {
                  <p
                    class="kpi-trend"
                    [class.up]="k.trend >= 0"
                    [class.down]="k.trend < 0"
                    [attr.aria-label]="trendLabel(k.trend)"
                    [attr.title]="trendLabel(k.trend)"
                  >
                    <span aria-hidden="true">{{ k.trend >= 0 ? '▲' : '▼' }} {{ formatNumber(abs(k.trend)) }}%</span>
                  </p>
                }
                <p class="kpi-hint">{{ k.hintKey | translate }}</p>
              </article>
            }
          </div>
        </section>

        <section class="ins-section card">
          <div class="ins-section-head">
            <h2 class="ins-section-title">{{ 'INSIGHTS.PERFORMANCE_TITLE' | translate }}</h2>
            <div class="ins-metric" role="group" [attr.aria-label]="'PORTAL.INSIGHTS.METRIC_LABEL' | translate">
              @for (m of metrics; track m.value) {
                <button
                  type="button"
                  class="ins-metric-btn"
                  [class.active]="metric() === m.value"
                  [attr.aria-pressed]="metric() === m.value"
                  [attr.data-metric]="m.value"
                  (click)="onMetricChange(m.value)"
                >
                  {{ m.labelKey | translate }}
                </button>
              }
            </div>
          </div>

          @if (chart(); as c) {
            <figure class="ins-chart" [attr.data-metric]="metric()">
              <svg
                class="ins-chart-svg"
                role="img"
                [attr.viewBox]="'0 0 ' + c.width + ' ' + c.height"
                [attr.aria-label]="chartAriaLabel()"
              >
                <line class="grid" [attr.x1]="c.left" [attr.x2]="c.right" [attr.y1]="c.topY" [attr.y2]="c.topY" />
                <line class="grid" [attr.x1]="c.left" [attr.x2]="c.right" [attr.y1]="c.midY" [attr.y2]="c.midY" />
                <line class="axis" [attr.x1]="c.left" [attr.x2]="c.right" [attr.y1]="c.baseY" [attr.y2]="c.baseY" />
                <path class="area" [attr.d]="c.areaPath" />
                <path class="line" [attr.d]="c.linePath" />
                @if (c.showPoints) {
                  @for (p of c.points; track $index) {
                    <circle class="pt" [attr.cx]="p.x" [attr.cy]="p.y" r="3.5">
                      <title>{{ p.label }}: {{ formatNumber(p.count) }}</title>
                    </circle>
                  }
                }
              </svg>
              <div class="ins-y-labels" aria-hidden="true">
                <span>{{ formatNumber(c.yMax) }}</span>
                <span>0</span>
              </div>
              <div class="ins-x-labels" aria-hidden="true">
                @for (t of c.xTicks; track $index) {
                  <span [style.left.%]="(t.x / c.width) * 100">{{ t.label }}</span>
                }
              </div>
              <table class="sr-only">
                <caption>{{ chartCaption() }}</caption>
                <thead>
                  <tr>
                    <th scope="col">{{ 'PORTAL.INSIGHTS.CHART_TABLE_DATE' | translate }}</th>
                    <th scope="col">{{ 'PORTAL.INSIGHTS.CHART_TABLE_COUNT' | translate }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of c.points; track $index) {
                    <tr><td>{{ p.label }}</td><td>{{ p.count }}</td></tr>
                  }
                </tbody>
              </table>
            </figure>
          } @else {
            <div class="ins-no-data">{{ 'INSIGHTS.NO_DATA' | translate }}</div>
          }
        </section>

        @if (platformRows().length > 0) {
          <section class="ins-section card ins-platform-section" data-section="platform-breakdown">
            <div class="ins-platform-head">
              <h2 class="ins-section-title">{{ 'PORTAL.INSIGHTS.PLATFORM_TITLE' | translate }}</h2>
              <p class="ins-platform-sub">{{ 'PORTAL.INSIGHTS.PLATFORM_SUBTITLE' | translate }}</p>
            </div>

            <div class="ins-platform-list">
              @for (item of platformRows(); track item.id) {
                <div class="ins-platform-row" [attr.data-platform]="item.id">
                  <div class="ins-platform-meta">
                    <span class="ins-platform-name">{{ item.labelKey | translate }}</span>
                    <span class="ins-platform-values">
                      <strong>{{ formatNumber(item.count) }}</strong>
                      <span class="ins-platform-pct">({{ formatNumber(item.pct) }}%)</span>
                    </span>
                  </div>
                  <div class="ins-platform-bar-track" aria-hidden="true">
                    <div
                      class="ins-platform-bar-fill"
                      [attr.data-platform]="item.id"
                      [style.width.%]="item.pct"
                    ></div>
                  </div>
                </div>
              }
            </div>

            <p class="ins-platform-note">{{ 'PORTAL.INSIGHTS.PLATFORM_NOTE' | translate }}</p>
          </section>
        }

        <section class="ins-section card">
          <h2 class="ins-section-title">{{ 'PORTAL.INSIGHTS.TOP_LISTINGS_TITLE' | translate }}</h2>
          @if (topListings().length === 0) {
            <p class="ins-top-empty">{{ 'PORTAL.INSIGHTS.TOP_LISTINGS_EMPTY' | translate }}</p>
          } @else {
            <ol class="ins-top-list">
              @for (ev of topListings(); track ev.eventId; let i = $index) {
                <li class="ins-top-row">
                  <span class="ins-rank" aria-hidden="true">{{ i + 1 }}</span>
                  @if (ev.imageUrl) {
                    <img
                      class="ins-thumb"
                      [src]="ev.imageUrl"
                      [alt]="imageAlt(ev.name)"
                      loading="lazy"
                      (error)="onImageError(ev.eventId)"
                    />
                  } @else {
                    <span class="ins-thumb ins-thumb--fallback" aria-hidden="true">{{ ev.initial }}</span>
                  }
                  <div class="ins-top-info">
                    <p class="ins-top-name">{{ ev.name }}</p>
                    <div class="ins-top-stats">
                      <span class="stat" data-stat="views">{{ 'INSIGHTS.VIEWS' | translate }}: <strong>{{ formatNumber(ev.views) }}</strong></span>
                      <span class="stat" data-stat="whatsapp">{{ 'PORTAL.INSIGHTS.WHATSAPP_LABEL' | translate }}: <strong>{{ formatNumber(ev.whatsapp) }}</strong></span>
                      <span class="stat" data-stat="promo-reveals">{{ 'PORTAL.INSIGHTS.PROMO_REVEALS_LABEL' | translate }}: <strong>{{ formatNumber(ev.promoReveals) }}</strong></span>
                      <span class="stat" data-stat="shares">{{ 'INSIGHTS.SHARES' | translate }}: <strong>{{ formatNumber(ev.shares) }}</strong></span>
                      <span class="stat" data-stat="calendar">{{ 'INSIGHTS.CALENDAR' | translate }}: <strong>{{ formatNumber(ev.calendar) }}</strong></span>
                    </div>
                  </div>
                </li>
              }
            </ol>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    .insights-page { display: flex; flex-direction: column; gap: 24px; max-width: 1100px; }
    .ins-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 16px; }
    .ins-header-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .ins-title { font-size: 1.8rem; font-weight: 800; color: var(--vamo-text); letter-spacing: -0.02em; margin: 0; }
    .ins-subtitle { color: var(--vamo-text-muted); margin: 2px 0 0; line-height: 1.5; }
    .ins-freshness {
      display: inline-flex; align-items: center; gap: 7px;
      margin: 4px 0 0; font-size: 0.78rem; font-weight: 600; color: var(--vamo-text-muted);
    }
    .ins-freshness-dot {
      width: 7px; height: 7px; border-radius: 50%; background: #16a34a; flex-shrink: 0; opacity: 0.85;
    }

    .ins-range, .ins-metric {
      display: inline-flex; flex-wrap: wrap; gap: 4px; padding: 4px;
      background: var(--vamo-surface); border: 1px solid var(--vamo-border); border-radius: 999px;
    }
    .ins-range-btn, .ins-metric-btn {
      border: 0; background: transparent; color: var(--vamo-text-muted);
      font-weight: 600; font-size: 0.85rem; padding: 6px 14px; border-radius: 999px; cursor: pointer;
    }
    .ins-range-btn.active, .ins-metric-btn.active { background: var(--vamo-primary); color: #fff; }
    .ins-range-btn:disabled { cursor: default; opacity: 0.7; }
    .ins-range-btn:focus-visible, .ins-metric-btn:focus-visible { outline: 2px solid var(--vamo-primary); outline-offset: 2px; }

    .card {
      background: var(--vamo-surface); border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md); box-shadow: var(--vamo-shadow-sm);
    }

    .ins-loading { display: flex; align-items: center; gap: 12px; color: var(--vamo-text-muted); padding: 40px 0; }
    .spinner {
      width: 20px; height: 20px; border-radius: 50%;
      border: 2px solid var(--vamo-border); border-top-color: var(--vamo-primary);
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .ins-error { padding: 20px 24px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
    .ins-error p { margin: 0; color: var(--vamo-text); }
    .ins-empty { padding: 20px 24px; }
    .ins-empty h2 { font-size: 1.05rem; margin: 0 0 6px; color: var(--vamo-text); }
    .ins-empty p { margin: 0; color: var(--vamo-text-muted); }

    .ins-perf-block { display: flex; flex-direction: column; gap: 12px; }
    .ins-group-heading { font-size: 1rem; font-weight: 700; color: var(--vamo-text); margin: 0; }

    .ins-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(185px, 1fr)); gap: 14px; }
    .kpi-card { padding: 16px; display: flex; flex-direction: column; gap: 4px; }
    .kpi-label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--vamo-text-muted); margin: 0; }
    .kpi-value { font-size: 1.7rem; font-weight: 800; color: var(--vamo-text); margin: 0; line-height: 1.15; }
    .kpi-value--na { color: var(--vamo-text-muted); }
    .kpi-unavailable { font-size: 0.78rem; color: var(--vamo-text-muted); margin: 0; }
    .kpi-trend { font-size: 0.8rem; font-weight: 700; margin: 0; }
    .kpi-trend.up { color: #16a34a; }
    .kpi-trend.down { color: #dc2626; }
    .kpi-hint { font-size: 0.78rem; color: var(--vamo-text-muted); margin: 4px 0 0; line-height: 1.35; }

    .ins-section { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
    .ins-section-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; }
    .ins-section-title { font-size: 1.1rem; font-weight: 700; color: var(--vamo-text); margin: 0; }

    .ins-chart { position: relative; margin: 0; padding: 0 0 0 44px; }
    .ins-chart-svg { width: 100%; height: auto; aspect-ratio: 640 / 220; display: block; overflow: visible; }
    .ins-chart-svg .grid { stroke: var(--vamo-border); stroke-dasharray: 4 4; stroke-width: 1; }
    .ins-chart-svg .axis { stroke: var(--vamo-border); stroke-width: 1; }
    .ins-chart-svg .line { fill: none; stroke: var(--chart-color); stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
    .ins-chart-svg .area { fill: var(--chart-color); opacity: 0.12; }
    .ins-chart-svg .pt { fill: var(--chart-color); }
    .ins-chart[data-metric='views'] { --chart-color: #16a34a; }
    .ins-chart[data-metric='whatsapp'] { --chart-color: #15803d; }
    .ins-chart[data-metric='promotions'] { --chart-color: #db2777; }
    .ins-chart[data-metric='shares'] { --chart-color: #2563eb; }
    .ins-chart[data-metric='calendar'] { --chart-color: #ea580c; }
    .ins-y-labels {
      position: absolute; left: 0; top: 0; bottom: 26px; width: 40px;
      display: flex; flex-direction: column; justify-content: space-between;
      font-size: 0.72rem; color: var(--vamo-text-muted); text-align: right;
    }
    .ins-x-labels { position: relative; height: 20px; margin-top: 6px; font-size: 0.72rem; color: var(--vamo-text-muted); }
    .ins-x-labels span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
    .ins-no-data, .ins-top-empty { color: var(--vamo-text-muted); padding: 24px 0; text-align: center; margin: 0; }

    .ins-platform-head { display: flex; flex-direction: column; gap: 4px; }
    .ins-platform-sub { margin: 0; font-size: 0.84rem; color: var(--vamo-text-muted); }
    .ins-platform-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .ins-platform-row { display: flex; flex-direction: column; gap: 6px; }
    .ins-platform-meta { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 0.88rem; }
    .ins-platform-name { font-weight: 600; color: var(--vamo-text); }
    .ins-platform-values { color: var(--vamo-text); display: inline-flex; gap: 6px; align-items: baseline; }
    .ins-platform-pct { font-size: 0.8rem; color: var(--vamo-text-muted); }
    .ins-platform-bar-track {
      height: 8px; width: 100%; border-radius: 999px;
      background: var(--vamo-border); overflow: hidden;
    }
    .ins-platform-bar-fill { height: 100%; border-radius: 999px; min-width: 0; transition: width 0.2s ease; }
    .ins-platform-bar-fill[data-platform='website'] { background: #2563eb; }
    .ins-platform-bar-fill[data-platform='mobile-app'] { background: #16a34a; }
    .ins-platform-bar-fill[data-platform='unattributed'] { background: #64748b; }
    .ins-platform-note { margin: 0; font-size: 0.76rem; color: var(--vamo-text-muted); line-height: 1.45; }

    .ins-top-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .ins-top-row { display: flex; align-items: center; gap: 14px; padding: 8px 0; border-bottom: 1px solid var(--vamo-border); }
    .ins-top-row:last-child { border-bottom: 0; }
    .ins-rank { width: 22px; font-weight: 800; color: var(--vamo-text-muted); text-align: center; }
    .ins-thumb { width: 56px; height: 56px; border-radius: 10px; object-fit: cover; flex-shrink: 0; }
    .ins-thumb--fallback {
      display: inline-flex; align-items: center; justify-content: center;
      background: var(--vamo-pink-light, rgba(249, 60, 173, 0.12)); color: var(--vamo-pink, #F93CAD); font-weight: 800; font-size: 1.2rem;
    }
    .ins-top-info { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .ins-top-name { margin: 0; font-weight: 700; color: var(--vamo-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ins-top-stats { display: flex; flex-wrap: wrap; gap: 14px; font-size: 0.82rem; color: var(--vamo-text-muted); }
    .ins-top-stats strong { color: var(--vamo-text); }

    .sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
    }

    @media (max-width: 640px) {
      .ins-header { align-items: stretch; }
      .ins-range { justify-content: space-between; }
      .ins-metric { border-radius: 14px; }
      .ins-kpi-grid { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
      .ins-section { padding: 16px; }
      .ins-platform-list { grid-template-columns: 1fr; }
    }
  `],
})
export class InsightsComponent implements OnInit {
  private authService = inject(AuthService);
  private businessService = inject(BusinessService);
  private insightsService = inject(InsightsService);
  private errorService = inject(CustomerErrorService);
  private destroyRef = inject(DestroyRef);
  readonly i18n = inject(I18nService);

  readonly ranges: { value: InsightsRange; labelKey: string; ariaKey: string }[] = [
    { value: '7d', labelKey: 'PORTAL.INSIGHTS.RANGE_7D', ariaKey: 'PORTAL.INSIGHTS.RANGE_7D_ARIA' },
    { value: '30d', labelKey: 'PORTAL.INSIGHTS.RANGE_30D', ariaKey: 'PORTAL.INSIGHTS.RANGE_30D_ARIA' },
    { value: '90d', labelKey: 'PORTAL.INSIGHTS.RANGE_90D', ariaKey: 'PORTAL.INSIGHTS.RANGE_90D_ARIA' },
    { value: 'all', labelKey: 'PORTAL.INSIGHTS.RANGE_ALL', ariaKey: 'PORTAL.INSIGHTS.RANGE_ALL_ARIA' },
  ];

  readonly metrics: { value: InsightsMetric; labelKey: string }[] = [
    { value: 'views', labelKey: 'INSIGHTS.VIEWS' },
    { value: 'whatsapp', labelKey: 'PORTAL.INSIGHTS.WHATSAPP_LABEL' },
    { value: 'promotions', labelKey: 'PORTAL.INSIGHTS.PROMO_REVEALS_LABEL' },
    { value: 'shares', labelKey: 'INSIGHTS.SHARES' },
    { value: 'calendar', labelKey: 'INSIGHTS.CALENDAR' },
  ];

  /** Canonical defaults. */
  readonly range = signal<InsightsRange>('30d');
  readonly metric = signal<InsightsMetric>('views');

  readonly loading = signal(true);
  readonly errorDescriptor = signal<MessageDescriptor | null>(null);

  readonly current = signal<AnalyticsDailyRow[]>([]);
  readonly previous = signal<AnalyticsDailyRow[]>([]);
  readonly events = signal<VamoEvent[]>([]);
  /** null = bookmark total could not be loaded (shown as unavailable, not 0). */
  readonly bookmarks = signal<number | null>(0);
  readonly failedImageIds = signal<Set<string>>(new Set());
  readonly dates = signal(getRangeDates('30d'));
  readonly referenceNow = signal<Date>(new Date());

  private providerId: string | null = null;
  private loadSeq = 0;

  readonly errorMessage = computed(() => {
    const d = this.errorDescriptor();
    if (!d) return null;
    this.i18n.lang();
    return this.i18n.t(d.key, d.params);
  });

  readonly freshnessDate = computed(() =>
    getReportingFreshnessDate(this.referenceNow(), this.current())
  );

  readonly freshnessText = computed(() => {
    this.i18n.lang();
    return this.i18n.t('PORTAL.INSIGHTS.FRESHNESS_DAILY', {
      date: this.formatDate(this.freshnessDate()),
    });
  });

  readonly kpis = computed<KpiCard[]>(() => {
    const cur = this.current();
    const prev = this.previous();
    const card = (
      id: KpiId,
      labelKey: string,
      hintKey: string,
      types: readonly string[]
    ): KpiCard => {
      const curVal = sumTypes(cur, types);
      const prevVal = sumTypes(prev, types);
      return {
        id,
        labelKey,
        hintKey,
        value: curVal,
        trend: calcTrend(curVal, prevVal),
      };
    };

    return [
      card('profile-views', 'PORTAL.INSIGHTS.PROFILE_VIEWS_LABEL', 'PORTAL.INSIGHTS.PROFILE_VIEWS_HINT', PROFILE_VIEW_TYPES),
      card('event-views', 'PORTAL.INSIGHTS.EVENT_VIEWS_LABEL', 'PORTAL.INSIGHTS.EVENT_VIEWS_HINT', EVENT_VIEW_TYPES),
      card('whatsapp', 'PORTAL.INSIGHTS.WHATSAPP_LABEL', 'PORTAL.INSIGHTS.WHATSAPP_HINT', WHATSAPP_TYPES),
      card('promo-reveals', 'PORTAL.INSIGHTS.PROMO_REVEALS_LABEL', 'PORTAL.INSIGHTS.PROMO_REVEALS_HINT', PROMO_REVEAL_TYPES),
      card('phone-clicks', 'PORTAL.INSIGHTS.PHONE_CLICKS_LABEL', 'PORTAL.INSIGHTS.PHONE_CLICKS_HINT', PHONE_CLICK_TYPES),
      card('shares', 'INSIGHTS.SHARES', 'PORTAL.INSIGHTS.SHARES_HINT', SHARE_TYPES),
      card('reservations', 'PORTAL.INSIGHTS.RESERVATIONS_LABEL', 'PORTAL.INSIGHTS.RESERVATIONS_HINT', RESERVATION_REQUEST_TYPES),
      {
        id: 'bookmarks',
        labelKey: 'INSIGHTS.BOOKMARKS',
        hintKey: 'PORTAL.INSIGHTS.BOOKMARKS_HINT',
        value: this.bookmarks(),
        trend: null,
      },
      card('calendar', 'INSIGHTS.CALENDAR', 'PORTAL.INSIGHTS.CALENDAR_HINT', CALENDAR_TYPES),
    ];
  });

  readonly platformBreakdown = computed(() => computePlatformBreakdown(this.current()));

  readonly platformRows = computed<PlatformRowView[]>(() => {
    const b = this.platformBreakdown();
    if (!b.hasVerifiedSplit || b.total <= 0) return [];
    const pct = (n: number) => Math.round((n / b.total) * 100);
    const items: PlatformRowView[] = [
      { id: 'website', labelKey: 'PORTAL.INSIGHTS.PLATFORM_WEBSITE', count: b.website, pct: pct(b.website) },
      { id: 'mobile-app', labelKey: 'PORTAL.INSIGHTS.PLATFORM_MOBILE_APP', count: b.mobileApp, pct: pct(b.mobileApp) },
    ];
    if (b.unattributed > 0) {
      items.push({
        id: 'unattributed',
        labelKey: 'PORTAL.INSIGHTS.PLATFORM_UNATTRIBUTED',
        count: b.unattributed,
        pct: pct(b.unattributed),
      });
    }
    return items;
  });

  readonly isEmpty = computed(
    () => sumTypes(this.current(), ELIGIBLE_ENGAGEMENT_TYPES) === 0 && !this.bookmarks()
  );

  readonly series = computed(() => aggregateByDate(this.current(), METRIC_TYPES[this.metric()]));

  readonly chart = computed<ChartModel | null>(() => {
    const s = this.series();
    if (s.length === 0) return null;
    this.i18n.lang();

    const width = 640;
    const height = 220;
    const left = 4;
    const right = width - 4;
    const topY = 10;
    const baseY = height - 6;
    const innerW = right - left;
    const innerH = baseY - topY;
    const rawMax = Math.max(...s.map((p) => p.count), 0);
    const yMax = this.niceMax(rawMax);

    const xAt = (i: number) => (s.length === 1 ? left + innerW / 2 : left + (i * innerW) / (s.length - 1));
    const yAt = (v: number) => baseY - (yMax > 0 ? (v / yMax) * innerH : 0);

    const points = s.map((p, i) => ({
      x: +xAt(i).toFixed(2),
      y: +yAt(p.count).toFixed(2),
      label: this.formatDate(p.date),
      count: p.count,
    }));

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
    const areaPath = `${linePath} L${points[points.length - 1].x} ${baseY} L${points[0].x} ${baseY} Z`;

    // Up to 7 evenly spaced x-axis labels (canonical maxTicksLimit: 7)
    const maxTicks = 7;
    const n = points.length;
    const tickCount = Math.min(maxTicks, n);
    const tickIdx = new Set<number>();
    for (let k = 0; k < tickCount; k++) {
      tickIdx.add(tickCount === 1 ? 0 : Math.round((k * (n - 1)) / (tickCount - 1)));
    }
    const xTicks = Array.from(tickIdx)
      .sort((a, b) => a - b)
      .map((i) => ({ x: points[i].x, label: points[i].label }));

    return {
      width, height, baseY, topY, midY: topY + innerH / 2, left, right,
      linePath, areaPath, points, xTicks, yMax,
      showPoints: points.length <= 30,
    };
  });

  readonly chartCaption = computed(() => {
    this.i18n.lang();
    return this.i18n.t('PORTAL.INSIGHTS.CHART_TABLE_CAPTION', { metric: this.metricLabel() });
  });

  readonly chartAriaLabel = computed(() => {
    const s = this.series();
    this.i18n.lang();
    if (s.length === 0) return '';
    const total = s.reduce((acc, p) => acc + p.count, 0);
    return this.i18n.t('PORTAL.INSIGHTS.CHART_ARIA', {
      metric: this.metricLabel(),
      from: this.formatDate(s[0].date),
      to: this.formatDate(s[s.length - 1].date),
      total: this.formatNumber(total),
    });
  });

  readonly topListings = computed<TopListingView[]>(() => {
    this.i18n.lang();
    const byId = new Map(this.events().map((e) => [e.id, e]));
    const failed = this.failedImageIds();
    return getTopEvents(this.current(), 5).map((t) => {
      const ev = byId.get(t.eventId);
      const rawName = typeof ev?.name === 'string' ? ev.name.trim() : '';
      const name = rawName || this.i18n.t('PORTAL.INSIGHTS.UNTITLED_LISTING');
      const fileId = this.getImageFileId(ev);
      const imageUrl =
        fileId && !failed.has(t.eventId)
          ? this.businessService.getAssetUrl(fileId, 'width=112&height=112&fit=cover&quality=75') || null
          : null;
      return {
        eventId: t.eventId,
        name,
        imageUrl,
        initial: (rawName.charAt(0) || '•').toUpperCase(),
        views: t.views,
        whatsapp: t.whatsapp,
        promoReveals: t.promoReveals,
        shares: t.shares,
        calendar: t.calendar,
      };
    });
  });

  ngOnInit(): void {
    const userStream = (this.authService as Partial<AuthService>).user$;
    if (userStream && typeof userStream.subscribe === 'function') {
      userStream.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((user) => {
        if (user === undefined) return;
        const nextProviderId = user?.provider_link?.id ?? null;
        if (this.providerId !== null && nextProviderId !== this.providerId) {
          this.resetBusinessState();
          void this.loadAll();
        }
      });
    }
    void this.loadAll();
  }

  private resetBusinessState(): void {
    this.loadSeq++;
    this.providerId = null;
    this.current.set([]);
    this.previous.set([]);
    this.events.set([]);
    this.bookmarks.set(0);
    this.failedImageIds.set(new Set());
  }

  /** Initial load: owned events + bookmarks + analytics for the current range. */
  async loadAll(): Promise<void> {
    const seq = ++this.loadSeq;
    this.loading.set(true);
    this.errorDescriptor.set(null);

    const rawProviderId = this.authService.currentUser?.provider_link?.id ?? null;
    const providerId = typeof rawProviderId === 'string' ? rawProviderId.trim() || null : null;
    if (this.providerId !== null && this.providerId !== providerId) {
      this.current.set([]);
      this.previous.set([]);
      this.events.set([]);
      this.bookmarks.set(0);
      this.failedImageIds.set(new Set());
    }
    this.providerId = providerId;
    if (!providerId) {
      this.current.set([]);
      this.previous.set([]);
      this.events.set([]);
      this.bookmarks.set(0);
      this.errorDescriptor.set({ key: 'PORTAL.INSIGHTS.ERROR_LOAD' });
      this.loading.set(false);
      return;
    }

    const bookmarksPromise = this.insightsService
      .getBookmarksCount(providerId)
      .then((n) => n as number | null)
      .catch(() => null);

    try {
      const events = await this.businessService.getEventsForProvider(providerId);
      if (seq !== this.loadSeq) return;
      this.events.set(events || []);
      await this.fetchRange(seq, providerId, this.range());
      const bm = await bookmarksPromise;
      if (seq !== this.loadSeq) return;
      this.bookmarks.set(bm);
    } catch (err) {
      if (seq !== this.loadSeq) return;
      this.errorDescriptor.set(this.toInsightsError(err));
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }

  /** Canonical: range change refetches current + previous analytics (not bookmarks). */
  async onRangeChange(r: InsightsRange): Promise<void> {
    if (r === this.range() && !this.errorDescriptor()) return;
    this.range.set(r);
    const activeProviderId = this.authService.currentUser?.provider_link?.id?.trim() || null;
    if (!this.providerId || activeProviderId !== this.providerId) {
      await this.loadAll();
      return;
    }
    const seq = ++this.loadSeq;
    this.loading.set(true);
    this.errorDescriptor.set(null);
    try {
      await this.fetchRange(seq, this.providerId, r);
    } catch (err) {
      if (seq !== this.loadSeq) return;
      this.errorDescriptor.set(this.toInsightsError(err));
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }

  /** Canonical: metric toggle only re-aggregates the already loaded rows. */
  onMetricChange(m: InsightsMetric): void {
    this.metric.set(m);
  }

  private toInsightsError(err: unknown): MessageDescriptor {
    const descriptor = this.errorService.toCustomerErrorKey(err, 'load');
    // Preserve session/network guidance, but do not mislabel an Insights permission
    // or data-read failure as a business-profile failure.
    if (
      descriptor.key === 'PORTAL.ERRORS.AUTH_MSG' ||
      descriptor.key === 'PORTAL.ERRORS.NETWORK_MSG'
    ) {
      return descriptor;
    }
    return { key: 'PORTAL.INSIGHTS.ERROR_LOAD' };
  }

  retry(): void {
    void this.loadAll();
  }

  onImageError(eventId: string): void {
    const next = new Set(this.failedImageIds());
    next.add(eventId);
    this.failedImageIds.set(next);
  }

  imageAlt(name: string): string {
    return this.i18n.t('PORTAL.INSIGHTS.IMAGE_ALT', { name });
  }

  trendLabel(trend: number): string {
    return this.i18n.t(trend >= 0 ? 'PORTAL.INSIGHTS.TREND_UP' : 'PORTAL.INSIGHTS.TREND_DOWN', {
      value: this.formatNumber(Math.abs(trend)),
    });
  }

  abs(n: number): number {
    return Math.abs(n);
  }

  formatNumber(n: number): string {
    try {
      return new Intl.NumberFormat(this.i18n.dateLocale()).format(n);
    } catch {
      return String(n);
    }
  }

  /** `analytics_event_daily.date` is a calendar date; format in UTC so it never shifts a day. */
  formatDate(date: string): string {
    const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
    if (isNaN(d.getTime())) return date;
    try {
      return new Intl.DateTimeFormat(this.i18n.dateLocale(), { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d);
    } catch {
      return date;
    }
  }

  private metricLabel(): string {
    const m = this.metrics.find((x) => x.value === this.metric());
    return m ? this.i18n.t(m.labelKey) : '';
  }

  private async fetchRange(seq: number, providerId: string, r: InsightsRange): Promise<void> {
    const now = new Date();
    const dates = getRangeDates(r, now);
    const ownedIds = this.events().map((e) => e.id).filter((id): id is string => !!id);
    const [cur, prev] = await Promise.all([
      this.insightsService.getAnalyticsInRange(providerId, ownedIds, dates.from, dates.to),
      // 'all' has an empty previous period in canonical (2000-01-01..2000-01-01) → trend null.
      r === 'all'
        ? Promise.resolve([] as AnalyticsDailyRow[])
        : this.insightsService.getAnalyticsInRange(providerId, ownedIds, dates.prevFrom, dates.prevTo),
    ]);
    if (seq !== this.loadSeq) return;
    this.referenceNow.set(now);
    this.dates.set(dates);
    this.current.set(cur);
    this.previous.set(prev);
  }

  private niceMax(v: number): number {
    if (v <= 0) return 1;
    if (v <= 5) return Math.ceil(v);
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / pow;
    const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return nice * pow;
  }

  private getImageFileId(ev: VamoEvent | undefined): string | null {
    const raw: any = ev?.images?.[0]?.directus_files_id;
    if (!raw) return null;
    if (typeof raw === 'string') return raw.trim() || null;
    if (typeof raw === 'object' && raw.id) return String(raw.id);
    return null;
  }
}
