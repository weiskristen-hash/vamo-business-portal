import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { CustomerErrorService } from '../../core/services/customer-error.service';
import { VamoEvent, EVENT_CATEGORIES, EventCategory } from '../../core/models/event.model';

@Component({
  selector: 'app-listings',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="listings-page">
      <!-- Page Header -->
      <header class="page-header">
        <div class="header-content">
          <div class="header-titles">
            <h1 class="page-title">Listings & Posts</h1>
            <p class="page-subtitle">
              Manage your business events, recurring activities, excursions, and special promotions on VAMO.
            </p>
          </div>
          <div class="header-actions">
            <button
              type="button"
              class="btn btn-secondary refresh-btn"
              [disabled]="loading"
              (click)="loadEvents()"
              title="Refresh listings"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M23 4v6h-6"></path>
                <path d="M1 20v-6h6"></path>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
              <span>Refresh</span>
            </button>
            <a routerLink="/app/listings/create" class="btn btn-primary create-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="16"></line>
                <line x1="8" y1="12" x2="16" y2="12"></line>
              </svg>
              <span>Create Listing</span>
            </a>
          </div>
        </div>

        <!-- Success Toast / Notification -->
        <div *ngIf="actionSuccessMessage" class="alert alert-success alert-dismissible" role="status">
          <div class="alert-icon">✓</div>
          <div class="alert-message">{{ actionSuccessMessage }}</div>
          <button type="button" class="alert-close" (click)="actionSuccessMessage = null" aria-label="Dismiss">✕</button>
        </div>

        <!-- Error Banner -->
        <div *ngIf="error" class="alert alert-danger" role="alert">
          <div class="alert-icon">⚠️</div>
          <div class="alert-message">{{ error }}</div>
          <button type="button" class="btn btn-sm btn-ghost" (click)="loadEvents()">Retry</button>
        </div>

        <!-- Metrics Overview Bar -->
        <div class="metrics-row">
          <div class="metric-card" (click)="setStatusFilter('all')" [class.active-metric]="statusFilter === 'all'">
            <div class="metric-label">All Listings</div>
            <div class="metric-value">{{ stats.total }}</div>
          </div>
          <div class="metric-card metric-success" (click)="setStatusFilter('active')" [class.active-metric]="statusFilter === 'active'">
            <div class="metric-label">Active / Upcoming</div>
            <div class="metric-value">{{ stats.active }}</div>
          </div>
          <div class="metric-card metric-warning" (click)="setStatusFilter('draft')" [class.active-metric]="statusFilter === 'draft'">
            <div class="metric-label">Drafts & Paused</div>
            <div class="metric-value">{{ stats.draft }}</div>
          </div>
          <div class="metric-card metric-neutral" (click)="setStatusFilter('past')" [class.active-metric]="statusFilter === 'past'">
            <div class="metric-label">Past / Expired</div>
            <div class="metric-value">{{ stats.past }}</div>
          </div>
        </div>
      </header>

      <!-- Filter & Search Toolbar -->
      <section class="toolbar-section card card-flat">
        <div class="search-box">
          <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="search"
            class="form-control search-input"
            placeholder="Search listings by title or address…"
            [(ngModel)]="searchQuery"
            (ngModelChange)="applyFilters()"
            aria-label="Search listings"
          />
          <button *ngIf="searchQuery" type="button" class="search-clear" (click)="clearSearch()">✕</button>
        </div>

        <div class="filter-controls">
          <!-- Status Pill Tabs -->
          <div class="filter-tabs" role="tablist" aria-label="Listing Status Filters">
            <button
              type="button"
              role="tab"
              class="filter-tab"
              [class.active]="statusFilter === 'all'"
              [attr.aria-selected]="statusFilter === 'all'"
              (click)="setStatusFilter('all')"
            >
              All ({{ stats.total }})
            </button>
            <button
              type="button"
              role="tab"
              class="filter-tab"
              [class.active]="statusFilter === 'active'"
              [attr.aria-selected]="statusFilter === 'active'"
              (click)="setStatusFilter('active')"
            >
              Active ({{ stats.active }})
            </button>
            <button
              type="button"
              role="tab"
              class="filter-tab"
              [class.active]="statusFilter === 'draft'"
              [attr.aria-selected]="statusFilter === 'draft'"
              (click)="setStatusFilter('draft')"
            >
              Drafts ({{ stats.draft }})
            </button>
            <button
              type="button"
              role="tab"
              class="filter-tab"
              [class.active]="statusFilter === 'past'"
              [attr.aria-selected]="statusFilter === 'past'"
              (click)="setStatusFilter('past')"
            >
              Past ({{ stats.past }})
            </button>
          </div>

          <div class="select-filters">
            <!-- Category Filter Dropdown -->
            <select
              class="form-select filter-select"
              [(ngModel)]="categoryFilter"
              (ngModelChange)="applyFilters()"
              aria-label="Filter by Category"
            >
              <option value="all">All Categories</option>
              <option *ngFor="let cat of categories" [value]="cat.value">
                {{ cat.emoji }} {{ cat.label }}
              </option>
            </select>

            <!-- Mode Filter Dropdown -->
            <select
              class="form-select filter-select"
              [(ngModel)]="modeFilter"
              (ngModelChange)="applyFilters()"
              aria-label="Filter by Mode"
            >
              <option value="all">All Schedules</option>
              <option value="single">Single Date / Multi-day</option>
              <option value="recurring">Weekly Recurring</option>
            </select>
          </div>
        </div>
      </section>

      <!-- Content Area -->
      <!-- Loading Skeleton -->
      <div *ngIf="loading" class="listings-grid-loading" aria-label="Loading listings">
        <div *ngFor="let i of [1, 2, 3, 4, 5, 6]" class="skeleton-card card">
          <div class="skeleton-img"></div>
          <div class="skeleton-body">
            <div class="skeleton-line skeleton-title"></div>
            <div class="skeleton-line skeleton-subtitle"></div>
            <div class="skeleton-line skeleton-meta"></div>
          </div>
        </div>
      </div>

      <!-- Empty State: Zero Listings in Account -->
      <div *ngIf="!loading && events.length === 0" class="empty-state card">
        <div class="empty-icon-bubble">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </div>
        <h2 class="empty-title">You have no listings yet</h2>
        <p class="empty-description">
          Create events, recurring specials, live entertainment, or tours to engage customers in the Dominican Republic.
        </p>
        <a routerLink="/app/listings/create" class="btn btn-primary btn-lg empty-action">
          + Create Your First Listing
        </a>
      </div>

      <!-- Empty State: Filter Returned No Results -->
      <div *ngIf="!loading && events.length > 0 && filteredEvents.length === 0" class="empty-state card">
        <div class="empty-icon-bubble">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
        <h2 class="empty-title">No listings match your filters</h2>
        <p class="empty-description">
          Try clearing your search query or switching your status and category filters.
        </p>
        <button type="button" class="btn btn-secondary empty-action" (click)="resetFilters()">
          Clear All Filters
        </button>
      </div>

      <!-- Active Listings Grid -->
      <div *ngIf="!loading && filteredEvents.length > 0" class="listings-grid">
        <article *ngFor="let event of filteredEvents; trackBy: trackById" class="listing-card card card-interactive">
          <!-- Thumbnail / Cover Section -->
          <div class="listing-media">
            <img
              [src]="getEventImageUrl(event)"
              [alt]="event.name"
              class="listing-image"
              loading="lazy"
            />
            <div class="media-badges">
              <span class="category-badge badge">
                {{ getCategoryEmoji(event.category) }} {{ getCategoryLabel(event.category) }}
              </span>
              <span class="status-badge badge" [ngClass]="getStatusBadge(event).class">
                {{ getStatusBadge(event).text }}
              </span>
            </div>

            <!-- Boost indicators if active -->
            <div class="boost-tags" *ngIf="event.is_main_banner || event.is_whats_hot">
              <span *ngIf="event.is_main_banner" class="boost-pill pill-banner" title="Featured in Main Banner">
                ⭐ Main Banner
              </span>
              <span *ngIf="event.is_whats_hot" class="boost-pill pill-hot" title="Featured in What's Hot">
                🔥 What's Hot
              </span>
            </div>
          </div>

          <!-- Body Information -->
          <div class="listing-body">
            <div class="mode-tag-row">
              <span class="mode-pill" [class.mode-recurring]="event.mode === 'recurring'">
                {{ event.mode === 'recurring' ? '🔁 Weekly Recurring' : '📅 Single Event' }}
              </span>
              <span class="price-pill">
                {{ formatPrice(event) }}
              </span>
            </div>

            <h3 class="listing-title" [title]="event.name">
              {{ event.name }}
            </h3>

            <p class="listing-desc" *ngIf="event.description">
              {{ event.description }}
            </p>

            <div class="listing-meta-items">
              <!-- Schedule / Date -->
              <div class="meta-row schedule-row">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <span class="meta-text">{{ formatSchedule(event) }}</span>
              </div>

              <!-- Time Window -->
              <div class="meta-row time-row" *ngIf="formatTimeWindow(event)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span class="meta-text">{{ formatTimeWindow(event) }}</span>
              </div>

              <!-- Location / Address -->
              <div class="meta-row location-row" *ngIf="event.address">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <span class="meta-text truncate" [title]="event.address">{{ event.address }}</span>
              </div>

              <!-- Promotion Callout if configured -->
              <div class="meta-row promo-row" *ngIf="event.hasPromotion && event.promoText">
                <span class="promo-icon">🎁</span>
                <span class="promo-text truncate" [title]="event.promoText">{{ event.promoText }}</span>
              </div>
            </div>
          </div>

          <!-- Card Actions Footer -->
          <footer class="listing-footer">
            <div class="action-buttons">
              <!-- Edit Action -->
              <button
                type="button"
                class="btn btn-secondary btn-sm action-btn edit-btn"
                (click)="onEdit(event)"
                [disabled]="actionInProgressId === event.id"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                <span>Edit</span>
              </button>

              <!-- Duplicate Action -->
              <button
                type="button"
                class="btn btn-ghost btn-sm action-btn duplicate-btn"
                (click)="onDuplicate(event)"
                [disabled]="actionInProgressId === event.id"
                title="Duplicate as new draft"
              >
                <svg *ngIf="actionInProgressId !== event.id" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span *ngIf="actionInProgressId === event.id" class="spinner-inline"></span>
                <span>Duplicate</span>
              </button>

              <!-- Pause / Publish Toggle -->
              <button
                *ngIf="event.status === 'published'"
                type="button"
                class="btn btn-ghost btn-sm action-btn pause-btn"
                (click)="onPause(event)"
                [disabled]="actionInProgressId === event.id"
                title="Pause active listing"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="10" y1="15" x2="10" y2="9"></line>
                  <line x1="14" y1="15" x2="14" y2="9"></line>
                </svg>
                <span>Pause</span>
              </button>

              <button
                *ngIf="event.status === 'draft'"
                type="button"
                class="btn btn-ghost btn-sm action-btn publish-btn"
                (click)="onPublish(event)"
                [disabled]="actionInProgressId === event.id"
                title="Publish draft listing"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polygon points="10 8 16 12 10 16 10 8"></polygon>
                </svg>
                <span>Publish</span>
              </button>

              <!-- Delete Action -->
              <button
                type="button"
                class="btn btn-ghost btn-sm action-btn delete-btn"
                (click)="openDeleteConfirm(event)"
                [disabled]="actionInProgressId === event.id"
                title="Delete listing"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </footer>
        </article>
      </div>

      <!-- Delete Confirmation Modal Dialog -->
      <div *ngIf="deletingEvent" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
        <div class="modal-dialog">
          <div class="modal-content card">
            <div class="modal-header">
              <div class="warning-icon-bubble">⚠️</div>
              <h2 id="delete-dialog-title" class="modal-title">Delete Listing</h2>
            </div>
            <div class="modal-body">
              <p class="modal-desc">
                Are you sure you want to permanently delete <strong>"{{ deletingEvent.name }}"</strong>?
              </p>
              <p class="modal-subtext">
                This will remove the listing from VAMO immediately. This action cannot be undone.
              </p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="cancelDelete()">
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-danger"
                [disabled]="actionInProgressId === deletingEvent.id"
                (click)="executeDelete()"
              >
                <span *ngIf="actionInProgressId === deletingEvent.id" class="spinner-inline"></span>
                <span>Delete Listing</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .listings-page {
      display: flex;
      flex-direction: column;
      gap: 24px;
      padding-bottom: 48px;
    }

    /* Page Header */
    .page-header {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .header-content {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
    }

    .header-titles {
      max-width: 680px;
    }

    .page-title {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--vamo-text);
      letter-spacing: -0.02em;
      margin: 0 0 6px;
    }

    .page-subtitle {
      font-size: 0.95rem;
      color: var(--vamo-text-muted);
      margin: 0;
      line-height: 1.5;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .create-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
    }

    .refresh-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    /* Metric Counters */
    .metrics-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }

    .metric-card {
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-lg);
      padding: 16px 20px;
      cursor: pointer;
      transition: all 0.2s ease;
      user-select: none;
    }

    .metric-card:hover {
      border-color: var(--vamo-border-hover);
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);
    }

    .metric-card.active-metric {
      border-color: var(--vamo-primary);
      box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.15);
      background: var(--vamo-primary-light);
    }

    .metric-label {
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--vamo-text-muted);
      margin-bottom: 6px;
    }

    .metric-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--vamo-text);
      line-height: 1;
    }

    .metric-card.metric-success .metric-value {
      color: var(--vamo-success);
    }

    .metric-card.metric-warning .metric-value {
      color: var(--vamo-warning);
    }

    .metric-card.metric-neutral .metric-value {
      color: var(--vamo-text-muted);
    }

    /* Toolbar Section */
    .toolbar-section {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 18px 20px;
    }

    .search-box {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;
    }

    .search-icon {
      position: absolute;
      left: 14px;
      color: var(--vamo-text-muted);
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      padding-left: 42px;
      padding-right: 36px;
      height: 44px;
      font-size: 0.95rem;
    }

    .search-clear {
      position: absolute;
      right: 12px;
      background: none;
      border: none;
      color: var(--vamo-text-muted);
      cursor: pointer;
      padding: 4px;
      font-size: 14px;
    }

    .filter-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .filter-tabs {
      display: inline-flex;
      background: var(--vamo-surface-subtle);
      border-radius: var(--vamo-radius-md);
      padding: 4px;
      gap: 2px;
    }

    .filter-tab {
      background: transparent;
      border: none;
      padding: 7px 14px;
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--vamo-text-muted);
      border-radius: calc(var(--vamo-radius-md) - 2px);
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .filter-tab:hover {
      color: var(--vamo-text);
    }

    .filter-tab.active {
      background: var(--vamo-surface);
      color: var(--vamo-primary);
      font-weight: 600;
      box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
    }

    .select-filters {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .filter-select {
      min-width: 170px;
      height: 38px;
      font-size: 0.85rem;
    }

    /* Grid Layout */
    .listings-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 24px;
    }

    .listing-card {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: var(--vamo-radius-lg);
      padding: 0;
      height: 100%;
    }

    /* Media Area */
    .listing-media {
      position: relative;
      width: 100%;
      height: 190px;
      background: var(--vamo-slate-800);
      overflow: hidden;
    }

    .listing-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease;
    }

    .listing-card:hover .listing-image {
      transform: scale(1.03);
    }

    .media-badges {
      position: absolute;
      top: 12px;
      left: 12px;
      right: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      pointer-events: none;
    }

    .category-badge {
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(8px);
      color: #ffffff;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: var(--vamo-radius-full);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .status-badge {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: var(--vamo-radius-full);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
    }

    .boost-tags {
      position: absolute;
      bottom: 10px;
      left: 12px;
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .boost-pill {
      font-size: 0.7rem;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: var(--vamo-radius-full);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .pill-banner {
      background: #fef08a;
      color: #854d0e;
    }

    .pill-hot {
      background: #fecdd3;
      color: #9f1239;
    }

    /* Body Area */
    .listing-body {
      padding: 20px;
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .mode-tag-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }

    .mode-pill {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--vamo-text-muted);
      background: var(--vamo-surface-subtle);
      padding: 3px 8px;
      border-radius: var(--vamo-radius-sm);
    }

    .mode-pill.mode-recurring {
      color: var(--vamo-primary);
      background: var(--vamo-primary-light);
    }

    .price-pill {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--vamo-text);
    }

    .listing-title {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--vamo-text);
      margin: 0 0 6px;
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .listing-desc {
      font-size: 0.85rem;
      color: var(--vamo-text-muted);
      margin: 0 0 16px;
      line-height: 1.45;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .listing-meta-items {
      display: flex;
      flex-direction: column;
      gap: 7px;
      margin-top: auto;
      padding-top: 12px;
      border-top: 1px solid var(--vamo-border);
    }

    .meta-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.82rem;
      color: var(--vamo-text-muted);
    }

    .meta-row svg {
      flex-shrink: 0;
      color: var(--vamo-text-muted);
    }

    .meta-text {
      line-height: 1.3;
    }

    .truncate {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .promo-row {
      color: var(--vamo-secondary);
      font-weight: 500;
    }

    .promo-icon {
      font-size: 13px;
    }

    /* Footer Area */
    .listing-footer {
      padding: 12px 20px;
      background: var(--vamo-surface-subtle);
      border-top: 1px solid var(--vamo-border);
    }

    .action-buttons {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-weight: 500;
    }

    .delete-btn {
      margin-left: auto;
      color: var(--vamo-text-muted);
      padding: 6px 8px;
    }

    .delete-btn:hover {
      color: var(--vamo-danger);
      background: #fef2f2;
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

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Empty States */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 64px 24px;
      gap: 16px;
    }

    .empty-icon-bubble {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: var(--vamo-primary-light);
      color: var(--vamo-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 8px;
    }

    .empty-title {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--vamo-text);
      margin: 0;
    }

    .empty-description {
      font-size: 0.95rem;
      color: var(--vamo-text-muted);
      max-width: 480px;
      margin: 0;
      line-height: 1.5;
    }

    .empty-action {
      margin-top: 8px;
    }

    /* Skeletons */
    .listings-grid-loading {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 24px;
    }

    .skeleton-card {
      height: 380px;
      overflow: hidden;
      padding: 0;
    }

    .skeleton-img {
      height: 190px;
      background: #e2e8f0;
      animation: pulse 1.5s infinite;
    }

    .skeleton-body {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .skeleton-line {
      background: #e2e8f0;
      border-radius: 4px;
      animation: pulse 1.5s infinite;
    }

    .skeleton-title {
      height: 22px;
      width: 75%;
    }

    .skeleton-subtitle {
      height: 14px;
      width: 95%;
    }

    .skeleton-meta {
      height: 14px;
      width: 50%;
      margin-top: 20px;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* Modal Backdrop and Dialog */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .modal-dialog {
      width: 100%;
      max-width: 460px;
      animation: popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes popIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .modal-content {
      padding: 24px;
    }

    .modal-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .warning-icon-bubble {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #fef2f2;
      color: var(--vamo-danger);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }

    .modal-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--vamo-text);
      margin: 0;
    }

    .modal-desc {
      font-size: 0.95rem;
      color: var(--vamo-text);
      margin: 0 0 8px;
      line-height: 1.5;
    }

    .modal-subtext {
      font-size: 0.85rem;
      color: var(--vamo-text-muted);
      margin: 0;
      line-height: 1.4;
    }

    .modal-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 24px;
    }

    @media (max-width: 768px) {
      .metrics-row {
        grid-template-columns: repeat(2, 1fr);
      }

      .filter-controls {
        flex-direction: column;
        align-items: stretch;
      }

      .filter-tabs {
        overflow-x: auto;
      }

      .select-filters {
        width: 100%;
      }

      .filter-select {
        flex: 1;
      }
    }
  `],
})
export class ListingsComponent implements OnInit {
  private authService = inject(AuthService);
  private businessService = inject(BusinessService);
  private customerErrorService = inject(CustomerErrorService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  categories: EventCategory[] = EVENT_CATEGORIES;

  loading = true;
  error: string | null = null;
  events: VamoEvent[] = [];
  filteredEvents: VamoEvent[] = [];

  searchQuery = '';
  statusFilter: 'all' | 'active' | 'draft' | 'past' = 'all';
  categoryFilter: string = 'all';
  modeFilter: 'all' | 'single' | 'recurring' = 'all';

  actionInProgressId: string | null = null;
  actionSuccessMessage: string | null = null;
  deletingEvent: VamoEvent | null = null;

  stats = {
    total: 0,
    active: 0,
    draft: 0,
    past: 0,
  };

  ngOnInit(): void {
    this.loadEvents();
  }

  async loadEvents(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();

    try {
      const user = this.authService.currentUser;
      const providerId = user?.provider_link?.id;

      if (!providerId) {
        this.error = 'No business profile is associated with your account.';
        this.events = [];
        this.filteredEvents = [];
        this.updateStats();
        return;
      }

      this.events = await this.businessService.getEventsForProvider(providerId);
      this.updateStats();
      this.applyFilters();
    } catch (err: any) {
      this.error = this.customerErrorService.toCustomerMessage(err, 'load');
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  updateStats(): void {
    let active = 0;
    let draft = 0;
    let past = 0;

    for (const ev of this.events) {
      if (ev.status === 'draft') {
        draft++;
      } else if (ev.status === 'published' && (ev.mode === 'recurring' || this.businessService.isEventUpcomingOrOngoing(ev))) {
        active++;
      } else {
        past++;
      }
    }

    this.stats = {
      total: this.events.length,
      active,
      draft,
      past,
    };
  }

  applyFilters(): void {
    const query = this.searchQuery.trim().toLowerCase();

    this.filteredEvents = this.events.filter((ev) => {
      // 1. Status Filter
      if (this.statusFilter === 'draft' && ev.status !== 'draft') {
        return false;
      }
      if (this.statusFilter === 'active') {
        const isActive = ev.status === 'published' && (ev.mode === 'recurring' || this.businessService.isEventUpcomingOrOngoing(ev));
        if (!isActive) return false;
      }
      if (this.statusFilter === 'past') {
        const isPast = ev.status === 'archived' || (ev.status === 'published' && ev.mode !== 'recurring' && !this.businessService.isEventUpcomingOrOngoing(ev));
        if (!isPast) return false;
      }

      // 2. Category Filter
      if (this.categoryFilter !== 'all' && ev.category !== this.categoryFilter) {
        return false;
      }

      // 3. Mode Filter
      if (this.modeFilter !== 'all' && ev.mode !== this.modeFilter) {
        return false;
      }

      // 4. Search Query
      if (query) {
        const matchName = ev.name?.toLowerCase().includes(query);
        const matchAddress = ev.address?.toLowerCase().includes(query);
        const matchDesc = ev.description?.toLowerCase().includes(query);
        if (!matchName && !matchAddress && !matchDesc) {
          return false;
        }
      }

      return true;
    });

    this.cdr.markForCheck();
  }

  setStatusFilter(filter: 'all' | 'active' | 'draft' | 'past'): void {
    this.statusFilter = filter;
    this.applyFilters();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.applyFilters();
  }

  resetFilters(): void {
    this.searchQuery = '';
    this.statusFilter = 'all';
    this.categoryFilter = 'all';
    this.modeFilter = 'all';
    this.applyFilters();
  }

  getCategoryLabel(categoryKey?: string): string {
    const found = this.categories.find((c) => c.value === categoryKey);
    return found ? found.label : (categoryKey || 'General');
  }

  getCategoryEmoji(categoryKey?: string): string {
    const found = this.categories.find((c) => c.value === categoryKey);
    return found ? found.emoji : '📌';
  }

  getEventImageUrl(event: VamoEvent): string {
    if (event.images && event.images.length > 0) {
      const fileId = typeof event.images[0].directus_files_id === 'string'
        ? event.images[0].directus_files_id
        : (event.images[0].directus_files_id as any)?.id;
      if (fileId) {
        return this.businessService.getAssetUrl(fileId, 'width=600&height=400&fit=cover');
      }
    }
    return '/assets/placeholder.png';
  }

  getStatusBadge(event: VamoEvent): { text: string; class: string } {
    if (event.status === 'draft') {
      return { text: 'Draft / Paused', class: 'badge-warning' };
    }
    if (event.status === 'archived') {
      return { text: 'Archived', class: 'badge-neutral' };
    }
    const isOngoing = event.mode === 'recurring' || this.businessService.isEventUpcomingOrOngoing(event);
    if (isOngoing) {
      return { text: 'Active', class: 'badge-success' };
    }
    return { text: 'Past', class: 'badge-neutral' };
  }

  formatSchedule(event: VamoEvent): string {
    if (event.mode === 'recurring') {
      const days = (event.recurring as any)?.days;
      if (Array.isArray(days) && days.length > 0) {
        const capitalized = days.map((d: string) => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
        return `Every ${capitalized}`;
      }
      return 'Weekly Recurring';
    }

    if (!event.startDate) return 'Date TBA';

    const start = new Date(event.startDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    if (event.endDate) {
      const end = new Date(event.endDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return `${start} – ${end}`;
    }

    return start;
  }

  formatTimeWindow(event: VamoEvent): string {
    if (event.allDay) return 'All Day';
    if (!event.from) return '';

    const start = event.from.substring(0, 5);
    if (event.openEnd || !event.to) return `${start} · Open End`;

    const end = event.to.substring(0, 5);
    return `${start} – ${end}`;
  }

  formatPrice(event: VamoEvent): string {
    if (event.isFree) return 'Free';
    if (event.contactForPrice) return 'Contact for price';
    if (event.price !== undefined && event.price !== null) {
      const currency = event.currency || 'USD';
      return `${currency} $${Number(event.price).toFixed(2)}`;
    }
    return 'Free';
  }

  onEdit(event: VamoEvent): void {
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

  async onPause(event: VamoEvent): Promise<void> {
    this.actionInProgressId = event.id;
    this.cdr.markForCheck();

    try {
      await this.businessService.pauseEvent(event.id);
      this.actionSuccessMessage = `"${event.name}" was paused and moved to Drafts.`;
      await this.loadEvents();
    } catch (err: any) {
      this.error = this.customerErrorService.toCustomerMessage(err, 'save');
    } finally {
      this.actionInProgressId = null;
      this.cdr.markForCheck();
    }
  }

  async onPublish(event: VamoEvent): Promise<void> {
    this.actionInProgressId = event.id;
    this.cdr.markForCheck();

    try {
      await this.businessService.publishEvent(event.id);
      this.actionSuccessMessage = `"${event.name}" is now live and published!`;
      await this.loadEvents();
    } catch (err: any) {
      this.error = this.customerErrorService.toCustomerMessage(err, 'save');
    } finally {
      this.actionInProgressId = null;
      this.cdr.markForCheck();
    }
  }

  openDeleteConfirm(event: VamoEvent): void {
    this.deletingEvent = event;
    this.cdr.markForCheck();
  }

  cancelDelete(): void {
    this.deletingEvent = null;
    this.cdr.markForCheck();
  }

  async executeDelete(): Promise<void> {
    if (!this.deletingEvent) return;

    const eventToDelete = this.deletingEvent;
    this.actionInProgressId = eventToDelete.id;
    this.cdr.markForCheck();

    try {
      await this.businessService.deleteEvent(eventToDelete.id);
      this.actionSuccessMessage = `"${eventToDelete.name}" was permanently deleted.`;
      this.deletingEvent = null;
      await this.loadEvents();
    } catch (err: any) {
      this.error = this.customerErrorService.toCustomerMessage(err, 'delete');
    } finally {
      this.actionInProgressId = null;
      this.cdr.markForCheck();
    }
  }

  trackById(_index: number, item: VamoEvent): string {
    return item.id;
  }
}
