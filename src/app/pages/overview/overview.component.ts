import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { CustomerErrorService } from '../../core/services/customer-error.service';
import { I18nService, BUSINESS_TYPES } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { VamoUser } from '../../core/models/user.model';
import { Provider } from '../../core/models/provider.model';
import { VamoEvent, ProviderEventStats } from '../../core/models/event.model';
import {
  getEventCoverImageUrl,
  isEventPast,
  getEventStatusBadge,
  EventStatusBadge,
  formatEventSchedule,
  formatEventTimeWindow,
  canEditEvent,
} from '../../core/utils/event-display.util';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  template: `
    <div class="overview-page">
      <!-- Loading State -->
      <div *ngIf="loading" class="state-container state-loading" role="status" aria-live="polite">
        <div class="loading-spinner"></div>
        <h3 class="state-title">{{ 'PORTAL.OVERVIEW.LOADING_TITLE' | translate }}</h3>
        <p class="state-desc">{{ 'PORTAL.OVERVIEW.LOADING_DESC' | translate }}</p>
      </div>

      <!-- Error State -->
      <div *ngIf="!loading && error" class="state-container state-error" role="alert">
        <div class="state-icon error-icon">⚠️</div>
        <h3 class="state-title">{{ 'PORTAL.OVERVIEW.ERROR_TITLE' | translate }}</h3>
        <p class="state-desc">{{ error }}</p>
        <button type="button" class="btn btn-secondary retry-btn" (click)="loadData()">
          ↻ {{ 'PORTAL.COMMON.RETRY' | translate }}
        </button>
      </div>

      <!-- Main Overview Content -->
      <div *ngIf="!loading && !error" class="overview-content">
        <!-- Header Banner with Business Identity -->
        <header class="overview-header card">
          <div class="header-left">
            <div class="business-brand-avatar" *ngIf="businessLogoUrl as logoUrl; else defaultLogo">
              <img [src]="logoUrl" [alt]="provider?.name || ('PORTAL.SHELL.DEFAULT_BUSINESS_NAME' | translate)" />
            </div>
            <ng-template #defaultLogo>
              <div class="business-brand-avatar avatar-fallback">
                {{ getInitials(provider?.name || user?.first_name || 'VAMO') }}
              </div>
            </ng-template>

            <div class="greeting-meta">
              <h1 class="greeting-title">{{ greetingKey | translate }}, {{ user?.first_name || ('PORTAL.OVERVIEW.PARTNER' | translate) }}</h1>
              <div class="greeting-subtitle">
                <span class="business-name-badge">{{ provider?.name || ('PORTAL.OVERVIEW.YOUR_BUSINESS' | translate) }}</span>
                <span class="subtext-divider">•</span>
                <span class="market-tag">{{ provider?.city || ('PORTAL.OVERVIEW.DEFAULT_MARKET' | translate) }} {{ 'PORTAL.OVERVIEW.ON_VAMO' | translate }}</span>
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
              <span>{{ 'PORTAL.SHELL.NAV_CREATE_LISTING' | translate }}</span>
            </a>
          </div>
        </header>

        <!-- Summary Cards Grid -->
        <section class="summary-grid" [attr.aria-label]="'PORTAL.OVERVIEW.SUMMARY_ARIA' | translate">
          <!-- Card 1: Live Posts -->
          <div class="summary-card card">
            <div class="summary-header">
              <span class="summary-label">{{ 'PORTAL.OVERVIEW.STAT_LIVE_POSTS' | translate }}</span>
              <span class="summary-icon icon-live">●</span>
            </div>
            <div class="summary-value">{{ stats.active !== undefined ? stats.active : stats.published }}</div>
            <div class="summary-footer">
              <span class="badge badge-published">{{ 'PORTAL.OVERVIEW.STAT_LIVE_BADGE' | translate }}</span>
            </div>
          </div>

          <!-- Card 2: Drafts -->
          <div class="summary-card card">
            <div class="summary-header">
              <span class="summary-label">{{ 'PORTAL.OVERVIEW.STAT_DRAFTS' | translate }}</span>
              <span class="summary-icon icon-draft">✎</span>
            </div>
            <div class="summary-value">{{ stats.draft }}</div>
            <div class="summary-footer">
              <span class="badge badge-draft">{{ 'PORTAL.OVERVIEW.STAT_DRAFTS_BADGE' | translate }}</span>
            </div>
          </div>

          <!-- Card 3: Total Posts -->
          <div class="summary-card card">
            <div class="summary-header">
              <span class="summary-label">{{ 'PORTAL.OVERVIEW.STAT_TOTAL_POSTS' | translate }}</span>
              <span class="summary-icon icon-total">▦</span>
            </div>
            <div class="summary-value">{{ stats.total }}</div>
            <div class="summary-footer">
              <span class="summary-subtext">{{ 'PORTAL.OVERVIEW.STAT_ARCHIVED' | translate: { count: stats.archived } }}</span>
            </div>
          </div>

          <!-- Card 4: Business Profile & Plan -->
          <div class="summary-card card">
            <div class="summary-header">
              <span class="summary-label">{{ 'PORTAL.OVERVIEW.STAT_TIER' | translate }}</span>
              <span class="summary-icon icon-tier">✦</span>
            </div>
            <div class="summary-value tier-value">
              {{ provider?.subscription_tier ? (provider?.subscription_tier | uppercase) : ('PORTAL.OVERVIEW.TIER_VERIFIED' | translate) }}
            </div>
            <div class="summary-footer">
              <span class="badge badge-published">
                {{ getBusinessTypeLabel(provider?.business_type) }}
              </span>
            </div>
          </div>
        </section>

        <!-- Quick Actions Row -->
        <section class="quick-actions-section" [attr.aria-label]="'PORTAL.OVERVIEW.QUICK_ACTIONS_ARIA' | translate">
          <div class="section-heading">
            <h2 class="section-title">{{ 'PORTAL.OVERVIEW.QUICK_ACTIONS_TITLE' | translate }}</h2>
            <span class="section-subtitle">{{ 'PORTAL.OVERVIEW.QUICK_ACTIONS_SUBTITLE' | translate }}</span>
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
                <strong class="action-title">{{ 'PORTAL.OVERVIEW.ACTION_EDIT_PROFILE_TITLE' | translate }}</strong>
                <span class="action-desc">{{ 'PORTAL.OVERVIEW.ACTION_EDIT_PROFILE_DESC' | translate }}</span>
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
                <strong class="action-title">{{ 'PORTAL.OVERVIEW.ACTION_MANAGE_LISTINGS_TITLE' | translate }}</strong>
                <span class="action-desc">{{ 'PORTAL.OVERVIEW.ACTION_MANAGE_LISTINGS_DESC' | translate }}</span>
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
                <strong class="action-title">{{ 'PORTAL.OVERVIEW.ACTION_CREATE_LISTING_TITLE' | translate }}</strong>
                <span class="action-desc">{{ 'PORTAL.OVERVIEW.ACTION_CREATE_LISTING_DESC' | translate }}</span>
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
                <strong class="action-title">{{ 'PORTAL.OVERVIEW.ACTION_INSIGHTS_TITLE' | translate }}</strong>
                <span class="action-desc">{{ 'PORTAL.OVERVIEW.ACTION_INSIGHTS_DESC' | translate }}</span>
              </div>
            </a>
          </div>
        </section>

        <!-- Recent Posts Section -->
        <section class="recent-posts-section" [attr.aria-label]="'PORTAL.OVERVIEW.RECENT_POSTS_ARIA' | translate">
          <div class="section-heading-row">
            <div>
              <h2 class="section-title">{{ 'PORTAL.OVERVIEW.RECENT_POSTS_TITLE' | translate }}</h2>
              <span class="section-subtitle">{{ 'PORTAL.OVERVIEW.RECENT_POSTS_SUBTITLE' | translate: { name: provider?.name || ('PORTAL.OVERVIEW.YOUR_BUSINESS' | translate) } }}</span>
            </div>
            <a routerLink="/app/listings" class="btn btn-ghost btn-sm" *ngIf="recentEvents.length > 0">
              {{ 'PORTAL.OVERVIEW.VIEW_ALL_LISTINGS' | translate }}
            </a>
          </div>

          <!-- Empty State -->
          <div *ngIf="recentEvents.length === 0" class="empty-posts-card card">
            <div class="empty-icon">📅</div>
            <h3 class="empty-title">{{ 'PORTAL.OVERVIEW.EMPTY_POSTS_TITLE' | translate }}</h3>
            <p class="empty-desc">
              {{ 'PORTAL.OVERVIEW.EMPTY_POSTS_DESC' | translate }}
            </p>
            <a routerLink="/app/listings/create" class="btn btn-primary">
              {{ 'PORTAL.OVERVIEW.EMPTY_POSTS_CTA' | translate }}
            </a>
          </div>

          <!-- Posts Table / List -->
          <div *ngIf="recentEvents.length > 0" class="posts-table-card card">
            <div class="posts-list">
              <div *ngFor="let ev of recentEvents" class="post-row">
                <div class="post-thumb">
                  <img
                    [src]="getEventThumbUrl(ev)"
                    [alt]="ev.name"
                    loading="lazy"
                  />
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
                      {{ formatSchedule(ev) }}
                    </span>
                    <span *ngIf="formatTimeWindow(ev)" class="post-time">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      {{ formatTimeWindow(ev) }}
                    </span>
                  </div>
                </div>

                <div class="post-status">
                  <span class="badge" [ngClass]="getStatusBadge(ev).cssClass">
                    {{ getStatusBadge(ev).text }}
                  </span>
                </div>

                <div class="post-actions">
                  <!-- Edit Action -->
                  <button
                    *ngIf="canEdit(ev)"
                    type="button"
                    class="btn btn-secondary btn-sm action-btn edit-btn"
                    (click)="onEdit(ev)"
                    [disabled]="actionInProgressId === ev.id"
                    [title]="'PORTAL.LISTINGS.ACTIONS.EDIT' | translate"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    <span>{{ 'PORTAL.LISTINGS.ACTIONS.EDIT' | translate }}</span>
                  </button>

                  <!-- Duplicate / Copy Action -->
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm action-btn duplicate-btn"
                    (click)="onDuplicate(ev)"
                    [disabled]="actionInProgressId === ev.id"
                    [title]="'PORTAL.LISTINGS.ACTIONS.COPY' | translate"
                  >
                    <svg *ngIf="actionInProgressId !== ev.id" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span *ngIf="actionInProgressId === ev.id" class="spinner-inline"></span>
                    <span>{{ 'PORTAL.LISTINGS.ACTIONS.COPY' | translate }}</span>
                  </button>
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
      border-color: rgba(128, 112, 192, 0.3);
      background: rgba(128, 112, 192, 0.03);
    }

    .action-card-highlight:hover {
      background: rgba(128, 112, 192, 0.08);
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
      background: rgba(128, 112, 192, 0.1);
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

    .post-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
      flex-shrink: 0;
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 0.8rem;
      padding: 6px 10px;
      font-weight: 500;
    }

    .action-btn.disabled,
    .action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .spinner-inline {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin 0.75s linear infinite;
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
        flex-wrap: wrap;
      }
      .post-actions {
        width: 100%;
        justify-content: flex-end;
        margin-top: 4px;
      }
    }
  `],
})
export class OverviewComponent implements OnInit {
  authService = inject(AuthService);
  businessService = inject(BusinessService);
  customerErrorService = inject(CustomerErrorService);
  i18n = inject(I18nService);
  router = inject(Router);
  cdr = inject(ChangeDetectorRef);

  user: VamoUser | null = null;
  provider: Provider | null = null;

  loading = true;
  error = '';
  hasInitialized = false;
  actionInProgressId: string | null = null;

  stats: ProviderEventStats = {
    total: 0,
    published: 0,
    active: 0,
    draft: 0,
    past: 0,
    archived: 0,
  };

  recentEvents: VamoEvent[] = [];

  get greetingKey(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'PORTAL.OVERVIEW.GREETING_MORNING';
    if (hour < 18) return 'PORTAL.OVERVIEW.GREETING_AFTERNOON';
    return 'PORTAL.OVERVIEW.GREETING_EVENING';
  }

  get businessLogoUrl(): string | null {
    const logo = this.provider?.logo;
    if (!logo) return null;
    return this.businessService.getAssetUrl(logo, 'width=120&height=120&fit=cover');
  }

  getBusinessTypeLabel(type?: string | null): string {
    if (!type) return this.i18n.t('PORTAL.OVERVIEW.VERIFIED_BUSINESS');
    const match = BUSINESS_TYPES.find((bt) => bt.value === type);
    return match ? match.label : type;
  }

  getStatusLabel(status?: string): string {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s === 'published') return this.i18n.t('PORTAL.STATUS.PUBLISHED');
    if (s === 'draft') return this.i18n.t('PORTAL.STATUS.DRAFT');
    if (s === 'archived') return this.i18n.t('PORTAL.STATUS.ARCHIVED');
    return status;
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
        this.error = this.i18n.t('PORTAL.ERRORS.NO_BUSINESS');
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

  getEventThumbUrl(event: VamoEvent): string {
    return getEventCoverImageUrl(event, this.businessService, 'width=100&height=100&fit=cover');
  }

  getStatusBadge(event: VamoEvent): EventStatusBadge {
    return getEventStatusBadge(event, this.businessService, this.i18n);
  }

  formatSchedule(event: VamoEvent): string {
    return formatEventSchedule(event, this.i18n);
  }

  formatTimeWindow(event: VamoEvent): string {
    return formatEventTimeWindow(event, this.i18n);
  }

  canEdit(event: VamoEvent): boolean {
    return canEditEvent(event, this.businessService);
  }

  onEdit(event: VamoEvent): void {
    if (!this.canEdit(event)) {
      this.error = this.i18n.t('PORTAL.LISTINGS.ERRORS.PAST_EVENT_NO_EDIT');
      return;
    }
    if (event.status === 'draft') {
      this.router.navigate(['/app/listings/create'], { queryParams: { eventId: event.id } });
    } else {
      this.router.navigate(['/app/listings/edit', event.id]);
    }
  }

  async onDuplicate(event: VamoEvent): Promise<void> {
    const user = this.authService.currentUser;
    const providerId = user?.provider_link?.id;
    if (!providerId) return;

    this.actionInProgressId = event.id;
    this.cdr.markForCheck();

    try {
      const newId = await this.businessService.duplicateEventAsDraft(event);
      this.router.navigate(['/app/listings/create'], { queryParams: { eventId: newId } });
    } catch (err: any) {
      this.error = this.customerErrorService.toCustomerMessage(err, 'save');
    } finally {
      this.actionInProgressId = null;
      this.cdr.markForCheck();
    }
  }

  formatDate(dateStr?: string | null): string {
    if (!dateStr) return this.i18n.t('PORTAL.OVERVIEW.NO_DATE_SET');
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(this.i18n.dateLocale(), {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }
}
