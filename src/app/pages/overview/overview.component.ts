import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { CustomerErrorService } from '../../core/services/customer-error.service';
import { VamoUser } from '../../core/models/user.model';
import { Provider } from '../../core/models/provider.model';
import { VamoEvent, ProviderEventStats } from '../../core/models/event.model';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="overview-page">
      <!-- Loading State -->
      <div *ngIf="loading" class="state-container state-loading" role="status" aria-live="polite">
        <div class="loading-spinner"></div>
        <h3 class="state-title">Loading your business workspace…</h3>
        <p class="state-desc">Loading your business workspace…</p>
      </div>

      <!-- Error State -->
      <div *ngIf="!loading && error" class="state-container state-error" role="alert">
        <div class="state-icon error-icon">⚠️</div>
        <h3 class="state-title">Unable to load dashboard</h3>
        <p class="state-desc">{{ error }}</p>
        <button type="button" class="btn btn-secondary retry-btn" (click)="loadData()">
          ↻ Retry
        </button>
      </div>

      <!-- Main Overview Content -->
      <div *ngIf="!loading && !error" class="overview-content">
        <!-- Header Banner with Business Identity -->
        <header class="overview-header card">
          <div class="header-left">
            <div class="business-brand-avatar" *ngIf="businessLogoUrl as logoUrl; else defaultLogo">
              <img [src]="logoUrl" [alt]="provider?.name || 'Business Logo'" />
            </div>
            <ng-template #defaultLogo>
              <div class="business-brand-avatar avatar-fallback">
                {{ getInitials(provider?.name || user?.first_name || 'VAMO') }}
              </div>
            </ng-template>

            <div class="greeting-meta">
              <h1 class="greeting-title">{{ timeGreeting }}, {{ user?.first_name || 'Partner' }}</h1>
              <div class="greeting-subtitle">
                <span class="business-name-badge">{{ provider?.name || 'Your Business' }}</span>
                <span class="subtext-divider">•</span>
                <span class="market-tag">{{ provider?.city || 'Dominican Republic' }} on VAMO</span>
              </div>
            </div>
          </div>

          <div class="header-right">
            <a routerLink="/app/listings/create" class="btn btn-primary create-cta">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="16"></line>
                <line x1="8" y1="12" x2="16" y2="12"></line>
              </svg>
              <span>Create Listing</span>
            </a>
          </div>
        </header>

        <!-- Summary Cards Grid -->
        <section class="summary-grid" aria-label="Business Performance Summary">
          <!-- Card 1: Live Posts -->
          <div class="summary-card card">
            <div class="summary-header">
              <span class="summary-label">Live Posts</span>
              <span class="summary-icon icon-live">●</span>
            </div>
            <div class="summary-value">{{ stats.published }}</div>
            <div class="summary-footer">
              <span class="badge badge-published">Active on VAMO app</span>
            </div>
          </div>

          <!-- Card 2: Drafts -->
          <div class="summary-card card">
            <div class="summary-header">
              <span class="summary-label">Drafts</span>
              <span class="summary-icon icon-draft">✎</span>
            </div>
            <div class="summary-value">{{ stats.draft }}</div>
            <div class="summary-footer">
              <span class="badge badge-draft">Waiting to publish</span>
            </div>
          </div>

          <!-- Card 3: Total Posts -->
          <div class="summary-card card">
            <div class="summary-header">
              <span class="summary-label">Total Posts</span>
              <span class="summary-icon icon-total">▦</span>
            </div>
            <div class="summary-value">{{ stats.total }}</div>
            <div class="summary-footer">
              <span class="summary-subtext">{{ stats.archived }} archived</span>
            </div>
          </div>

          <!-- Card 4: Business Profile & Plan -->
          <div class="summary-card card">
            <div class="summary-header">
              <span class="summary-label">Business Tier</span>
              <span class="summary-icon icon-tier">✦</span>
            </div>
            <div class="summary-value tier-value">
              {{ provider?.subscription_tier ? (provider?.subscription_tier | uppercase) : 'VERIFIED' }}
            </div>
            <div class="summary-footer">
              <span class="badge badge-published">
                {{ provider?.business_type || 'Verified Business' }}
              </span>
            </div>
          </div>
        </section>

        <!-- Quick Actions Row -->
        <section class="quick-actions-section" aria-label="Quick Actions">
          <div class="section-heading">
            <h2 class="section-title">Quick Actions</h2>
            <span class="section-subtitle">Common management tasks</span>
          </div>

          <div class="actions-grid">
            <a routerLink="/app/business" class="action-card card">
              <div class="action-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </div>
              <div class="action-meta">
                <strong class="action-title">Edit Business Profile</strong>
                <span class="action-desc">Update address, hours, photos and contact links</span>
              </div>
            </a>

            <a routerLink="/app/listings" class="action-card card">
              <div class="action-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
              </div>
              <div class="action-meta">
                <strong class="action-title">Manage Listings</strong>
                <span class="action-desc">Manage existing event listings and schedules</span>
              </div>
            </a>

            <a routerLink="/app/listings/create" class="action-card card action-card-highlight">
              <div class="action-icon icon-pink">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="16"></line>
                  <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
              </div>
              <div class="action-meta">
                <strong class="action-title">Create Listing</strong>
                <span class="action-desc">Broadcast a new event to travelers and locals</span>
              </div>
            </a>

            <a routerLink="/app/insights" class="action-card card">
              <div class="action-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"></line>
                  <line x1="12" y1="20" x2="12" y2="4"></line>
                  <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
              </div>
              <div class="action-meta">
                <strong class="action-title">View Insights</strong>
                <span class="action-desc">Explore audience impressions and engagement</span>
              </div>
            </a>
          </div>
        </section>

        <!-- Recent Posts Section -->
        <section class="recent-posts-section" aria-label="Recent Posts">
          <div class="section-heading-row">
            <div>
              <h2 class="section-title">Recent Posts</h2>
              <span class="section-subtitle">Latest listings for {{ provider?.name }}</span>
            </div>
            <a routerLink="/app/listings" class="btn btn-ghost btn-sm" *ngIf="recentEvents.length > 0">
              View all listings →
            </a>
          </div>

          <!-- Empty State -->
          <div *ngIf="recentEvents.length === 0" class="empty-posts-card card">
            <div class="empty-icon">📅</div>
            <h3 class="empty-title">No posts published yet</h3>
            <p class="empty-desc">
              Your business does not have any active posts or events on VAMO yet. Create your first post to reach customers in your area.
            </p>
            <a routerLink="/app/listings/create" class="btn btn-primary">
              ✦ Create Your First Listing
            </a>
          </div>

          <!-- Posts Table / List -->
          <div *ngIf="recentEvents.length > 0" class="posts-table-card card">
            <div class="posts-list">
              <div *ngFor="let ev of recentEvents" class="post-row">
                <div class="post-thumb">
                  <img
                    *ngIf="getEventThumbUrl(ev) as thumb; else noThumb"
                    [src]="thumb"
                    [alt]="ev.name"
                  />
                  <ng-template #noThumb>
                    <div class="post-thumb-fallback">
                      <span>VAMO</span>
                    </div>
                  </ng-template>
                </div>

                <div class="post-details">
                  <h4 class="post-title">{{ ev.name }}</h4>
                  <div class="post-meta">
                    <span class="post-date">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                      </svg>
                      {{ formatDate(ev.startDate) }}
                    </span>
                    <span *ngIf="ev.from" class="post-time">at {{ ev.from }}</span>
                    <span *ngIf="ev.mode === 'recurring'" class="recurring-pill">Recurring</span>
                  </div>
                </div>

                <div class="post-status">
                  <span class="badge" [ngClass]="'badge-' + ev.status">
                    {{ ev.status }}
                  </span>
                </div>

                <div class="post-action">
                  <span class="post-action-hint">Phase 1B Read-only</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .overview-page {
      display: flex;
      flex-direction: column;
      gap: 32px;
    }

    /* States */
    .state-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 80px 20px;
      background: var(--vamo-bg-card);
      border: 1px solid var(--vamo-border-glass);
      border-radius: 16px;
      gap: 12px;
    }

    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255, 255, 255, 0.15);
      border-top-color: var(--vamo-pink);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 8px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .state-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: #ffffff;
    }

    .state-desc {
      font-size: 0.92rem;
      color: var(--vamo-text-muted);
      max-width: 480px;
    }

    .error-icon {
      font-size: 2.2rem;
    }

    .retry-btn {
      margin-top: 12px;
    }

    /* Content Layout */
    .overview-content {
      display: flex;
      flex-direction: column;
      gap: 32px;
    }

    /* Header */
    .overview-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 28px 32px;
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      box-shadow: var(--vamo-shadow-sm);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .business-brand-avatar {
      width: 58px;
      height: 58px;
      border-radius: 14px;
      overflow: hidden;
      background: var(--vamo-surface-subtle);
      border: 2px solid var(--vamo-border);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .business-brand-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-fallback {
      background: var(--vamo-gradient-brand);
      color: #ffffff;
      font-size: 1.3rem;
      font-weight: 800;
      border: none;
    }

    .greeting-meta {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .greeting-title {
      font-size: 1.65rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--vamo-text);
      line-height: 1.2;
    }

    .greeting-subtitle {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.92rem;
      color: var(--vamo-text-secondary);
    }

    .business-name-badge {
      font-weight: 700;
      color: var(--vamo-primary);
    }

    .subtext-divider {
      color: var(--vamo-text-dim);
    }

    .market-tag {
      color: var(--vamo-text-muted);
    }

    /* Summary Grid */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
    }

    .summary-card {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 16px;
      padding: 22px;
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      box-shadow: var(--vamo-shadow-sm);
      transition: all 0.18s ease;
    }

    .summary-card:hover {
      border-color: var(--vamo-border-hover);
      transform: translateY(-2px);
      box-shadow: var(--vamo-shadow-md);
    }

    .summary-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .summary-label {
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--vamo-text-muted);
    }

    .summary-icon {
      font-size: 0.9rem;
      color: var(--vamo-text-dim);
    }

    .icon-live {
      color: var(--vamo-status-published);
    }

    .icon-draft {
      color: var(--vamo-status-draft);
    }

    .summary-value {
      font-size: 2.2rem;
      font-weight: 800;
      color: var(--vamo-text);
      letter-spacing: -0.02em;
      line-height: 1;
    }

    .tier-value {
      font-size: 1.45rem;
      letter-spacing: -0.01em;
      color: var(--vamo-primary);
    }

    .summary-footer {
      display: flex;
      align-items: center;
    }

    .summary-subtext {
      font-size: 0.8rem;
      color: var(--vamo-text-muted);
    }

    /* Quick Actions */
    .section-heading {
      margin-bottom: 16px;
    }

    .section-heading-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .section-title {
      font-size: 1.2rem;
      font-weight: 800;
      color: var(--vamo-text);
      letter-spacing: -0.01em;
    }

    .section-subtitle {
      font-size: 0.84rem;
      color: var(--vamo-text-muted);
    }

    .actions-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 18px;
    }

    .action-card {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 20px;
      text-decoration: none;
      color: inherit;
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      box-shadow: var(--vamo-shadow-sm);
      transition: all 0.18s ease;
    }

    .action-card:hover {
      background: var(--vamo-surface-subtle);
      border-color: var(--vamo-border-hover);
      transform: translateY(-2px);
      box-shadow: var(--vamo-shadow-md);
    }

    .action-card-highlight {
      border-color: rgba(124, 58, 237, 0.3);
      background: rgba(124, 58, 237, 0.03);
    }

    .action-card-highlight:hover {
      background: rgba(124, 58, 237, 0.08);
      border-color: var(--vamo-primary);
    }

    .action-icon {
      width: 42px;
      height: 42px;
      border-radius: 10px;
      background: var(--vamo-surface-subtle);
      color: var(--vamo-text-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .icon-pink {
      background: rgba(124, 58, 237, 0.1);
      color: var(--vamo-primary);
    }

    .action-meta {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .action-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--vamo-text);
    }

    .action-desc {
      font-size: 0.8rem;
      color: var(--vamo-text-muted);
      line-height: 1.4;
    }

    /* Recent Posts */
    .empty-posts-card {
      text-align: center;
      padding: 56px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      box-shadow: var(--vamo-shadow-sm);
    }

    .empty-icon {
      font-size: 2.2rem;
      margin-bottom: 4px;
    }

    .empty-title {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--vamo-text);
    }

    .empty-desc {
      font-size: 0.88rem;
      color: var(--vamo-text-muted);
      max-width: 440px;
      margin-bottom: 12px;
    }

    .posts-table-card {
      padding: 0;
      overflow: hidden;
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      box-shadow: var(--vamo-shadow-sm);
    }

    .posts-list {
      display: flex;
      flex-direction: column;
    }

    .post-row {
      display: flex;
      align-items: center;
      padding: 16px 24px;
      border-bottom: 1px solid var(--vamo-border);
      gap: 18px;
      transition: background 0.15s ease;
    }

    .post-row:last-child {
      border-bottom: none;
    }

    .post-row:hover {
      background: var(--vamo-surface-subtle);
    }

    .post-thumb {
      width: 52px;
      height: 52px;
      border-radius: 8px;
      overflow: hidden;
      background: var(--vamo-surface-subtle);
      flex-shrink: 0;
    }

    .post-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .post-thumb-fallback {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--vamo-surface-subtle);
      color: var(--vamo-text-dim);
      font-size: 0.7rem;
      font-weight: 800;
      letter-spacing: 0.05em;
    }

    .post-details {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .post-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--vamo-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .post-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 0.8rem;
      color: var(--vamo-text-muted);
    }

    .post-date {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .recurring-pill {
      font-size: 0.7rem;
      font-weight: 700;
      color: #93c5fd;
      background: rgba(147, 197, 253, 0.1);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .post-status {
      flex-shrink: 0;
    }

    .post-action-hint {
      font-size: 0.75rem;
      color: var(--vamo-text-dim);
    }

    /* Responsive Breakpoints */
    @media (max-width: 1200px) {
      .summary-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      .actions-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 768px) {
      .overview-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 20px;
        padding: 20px;
      }
      .header-right {
        width: 100%;
      }
      .create-cta {
        width: 100%;
      }
      .summary-grid {
        grid-template-columns: 1fr;
      }
      .actions-grid {
        grid-template-columns: 1fr;
      }
      .post-row {
        padding: 14px 16px;
        gap: 12px;
      }
      .post-action-hint {
        display: none;
      }
    }
  `],
})
export class OverviewComponent implements OnInit {
  authService = inject(AuthService);
  businessService = inject(BusinessService);
  customerErrorService = inject(CustomerErrorService);
  cdr = inject(ChangeDetectorRef);

  user: VamoUser | null = null;
  provider: Provider | null = null;

  loading = true;
  error = '';
  hasInitialized = false;

  stats: ProviderEventStats = {
    total: 0,
    published: 0,
    draft: 0,
    archived: 0,
  };

  recentEvents: VamoEvent[] = [];

  get timeGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  get businessLogoUrl(): string | null {
    const logo = this.provider?.logo;
    if (!logo) return null;
    return this.businessService.getAssetUrl(logo, 'width=120&height=120&fit=cover');
  }

  ngOnInit(): void {
    if (!this.hasInitialized) {
      this.loadData();
    }
  }

  async loadData(): Promise<void> {
    this.hasInitialized = true;
    this.loading = true;
    this.error = '';

    try {
      this.user = this.authService.currentUser;
      if (!this.user) {
        this.user = await this.authService.loadCurrentUser();
      }

      this.provider = this.user?.provider_link || null;
      const providerId = this.provider?.id;

      if (!providerId) {
        this.error = 'No business profile is associated with your account.';
        return;
      }

      const events = await this.businessService.getEventsForProvider(providerId);
      this.stats = this.businessService.calculateStats(events);
      this.recentEvents = this.businessService.getRecentEvents(events, 5);
    } catch (err: any) {
      this.error = this.customerErrorService.toCustomerMessage(err, 'load');
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  getInitials(name: string): string {
    if (!name) return 'VB';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  getEventThumbUrl(event: VamoEvent): string | null {
    const firstImg = event.images?.[0]?.directus_files_id;
    if (!firstImg) return null;
    return this.businessService.getAssetUrl(firstImg, 'width=100&height=100&fit=cover');
  }

  formatDate(dateStr?: string | null): string {
    if (!dateStr) return 'No date set';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }
}
