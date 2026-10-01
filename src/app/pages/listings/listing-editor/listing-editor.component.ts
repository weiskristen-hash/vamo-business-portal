import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { BusinessService } from '../../../core/services/business.service';
import { VamoEvent, Area, EVENT_CATEGORIES, EventCategory } from '../../../core/models/event.model';

export interface ExistingImage {
  junctionId: number | string;
  url: string;
}

@Component({
  selector: 'app-listing-editor',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="editor-page">
      <!-- Top Navigation & Action Header -->
      <header class="editor-header">
        <div class="header-left">
          <button type="button" class="btn btn-ghost back-btn" (click)="onCancel()" aria-label="Back to listings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Back to Listings</span>
          </button>
          <div class="title-meta">
            <h1 class="page-title">{{ isEditMode ? 'Edit Listing' : 'Create New Listing' }}</h1>
            <span class="status-indicator-badge" [ngClass]="isEditMode ? 'badge-primary' : 'badge-neutral'">
              {{ isEditMode ? (isDraft ? 'Editing Draft' : 'Editing Published Post') : 'New Listing' }}
            </span>
          </div>
        </div>

        <div class="header-actions">
          <button type="button" class="btn btn-secondary" (click)="onCancel()" [disabled]="submitting">
            Cancel
          </button>
          <button type="button" class="btn btn-secondary" (click)="saveDraft()" [disabled]="submitting">
            <span *ngIf="submitting && saveTargetStatus === 'draft'" class="spinner-inline"></span>
            <span>Save as Draft</span>
          </button>
          <button type="button" class="btn btn-primary" (click)="publishListing()" [disabled]="submitting">
            <span *ngIf="submitting && saveTargetStatus === 'published'" class="spinner-inline"></span>
            <span>{{ isEditMode && !isDraft ? 'Save & Update' : 'Publish Listing' }}</span>
          </button>
        </div>
      </header>

      <!-- Error / Notification Banners -->
      <div *ngIf="errorMessage" class="alert alert-danger" role="alert">
        <div class="alert-icon">⚠️</div>
        <div class="alert-message">{{ errorMessage }}</div>
        <button type="button" class="alert-close" (click)="errorMessage = null" aria-label="Dismiss">✕</button>
      </div>

      <!-- Date-Lock Warning for published events starting in <24 hours -->
      <div *ngIf="datesLocked" class="alert alert-warning" role="alert">
        <div class="alert-icon">🔒</div>
        <div class="alert-message">
          <strong>Schedule Locked:</strong> This event starts in less than 24 hours. To prevent attendee confusion, dates and times can no longer be edited.
        </div>
      </div>

      <!-- Main Editor Container: 2-Column Desktop Grid -->
      <div class="editor-grid" *ngIf="!loadingInitial">
        <!-- Form Column (Left) -->
        <main class="editor-form-col">
          <!-- SECTION 1: Basics -->
          <section class="form-section card">
            <div class="section-header">
              <span class="section-step-num">1</span>
              <div>
                <h2 class="section-title">Basics</h2>
                <p class="section-desc">Define the title, category, and a compelling description for your listing.</p>
              </div>
            </div>

            <div class="form-body">
              <!-- Title -->
              <div class="form-group">
                <label for="event-name" class="form-label required">Listing Title</label>
                <input
                  id="event-name"
                  type="text"
                  class="form-control"
                  placeholder="e.g. Sunset Salsa Night, Samaná Whale Watching Expedition"
                  [(ngModel)]="draft.name"
                  (ngModelChange)="markDirty()"
                  maxlength="100"
                  required
                />
                <div class="field-footer">
                  <span class="form-hint">Make it clear, catchy, and descriptive.</span>
                  <span class="char-count">{{ (draft.name || '').length }}/100</span>
                </div>
              </div>

              <!-- Category -->
              <div class="form-group">
                <label class="form-label required">Category</label>
                <p class="form-hint">Select the category that best matches your event or activity:</p>
                <div class="category-grid">
                  <button
                    type="button"
                    *ngFor="let cat of categories"
                    class="category-card-btn"
                    [class.selected]="draft.category === cat.value"
                    (click)="setCategory(cat.value)"
                  >
                    <span class="cat-emoji">{{ cat.emoji }}</span>
                    <span class="cat-label">{{ cat.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Description -->
              <div class="form-group">
                <label for="event-desc" class="form-label required">Description</label>
                <textarea
                  id="event-desc"
                  rows="4"
                  class="form-control form-textarea"
                  placeholder="Describe what guests can expect, highlights, dress code, or requirements (minimum 10 characters)…"
                  [(ngModel)]="draft.description"
                  (ngModelChange)="markDirty()"
                ></textarea>
                <div class="field-footer">
                  <span class="form-hint">Minimum 10 characters. Formatted across English and Spanish in the VAMO app.</span>
                  <span class="char-count">{{ (draft.description || '').length }} chars</span>
                </div>
              </div>
            </div>
          </section>

          <!-- SECTION 2: Media & Images -->
          <section class="form-section card">
            <div class="section-header">
              <span class="section-step-num">2</span>
              <div>
                <h2 class="section-title">Media & Photos</h2>
                <p class="section-desc">Add photos for your listing. The first photo will be used as the primary cover card.</p>
              </div>
            </div>

            <div class="form-body">
              <!-- Gallery Preview Grid -->
              <div class="gallery-preview-grid">
                <!-- Existing Images from Directus -->
                <div *ngFor="let img of existingImages; let idx = index" class="photo-preview-card">
                  <img [src]="img.url" alt="Existing photo" class="preview-img" />
                  <span *ngIf="idx === 0 && selectedNewFiles.length === 0" class="cover-badge">Cover Photo</span>
                  <button type="button" class="remove-photo-btn" (click)="removeExistingImage(img)" title="Remove photo">✕</button>
                </div>

                <!-- Newly Selected Local Files -->
                <div *ngFor="let preview of newFilePreviews; let idx = index" class="photo-preview-card">
                  <img [src]="preview" alt="New upload" class="preview-img" />
                  <span *ngIf="existingImages.length === 0 && idx === 0" class="cover-badge">Cover Photo</span>
                  <button type="button" class="remove-photo-btn" (click)="removeNewFile(idx)" title="Remove photo">✕</button>
                </div>

                <!-- Upload Dropzone Button -->
                <label class="upload-dropzone-btn">
                  <input
                    type="file"
                    class="hidden-file-input"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    (change)="onFilesSelected($event)"
                  />
                  <div class="dropzone-content">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <circle cx="8.5" cy="8.5" r="1.5"></circle>
                      <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                    <span class="dropzone-label">+ Add Photos</span>
                    <span class="dropzone-hint">JPEG, PNG, WebP</span>
                  </div>
                </label>
              </div>
              <p class="form-hint mt-2">
                Images are automatically compressed and optimized on upload for crisp mobile viewing.
              </p>
            </div>
          </section>

          <!-- SECTION 3: Schedule & Timing -->
          <section class="form-section card">
            <div class="section-header">
              <span class="section-step-num">3</span>
              <div>
                <h2 class="section-title">Schedule & Timing</h2>
                <p class="section-desc">Configure whether this listing takes place on a specific date or repeats weekly.</p>
              </div>
            </div>

            <div class="form-body">
              <!-- Mode Selector -->
              <div class="form-group">
                <label class="form-label required">Schedule Type</label>
                <div class="schedule-type-toggle">
                  <button
                    type="button"
                    class="type-tab-btn"
                    [class.active]="draft.mode === 'single'"
                    [disabled]="datesLocked"
                    (click)="setMode('single')"
                  >
                    📅 Specific Date / Multi-day
                  </button>
                  <button
                    type="button"
                    class="type-tab-btn"
                    [class.active]="draft.mode === 'recurring'"
                    [disabled]="datesLocked"
                    (click)="setMode('recurring')"
                  >
                    🔁 Weekly Recurring
                  </button>
                </div>
              </div>

              <!-- SINGLE MODE: Date Pickers -->
              <div *ngIf="draft.mode === 'single'" class="single-mode-fields">
                <div class="form-row">
                  <div class="form-group flex-1">
                    <label for="start-date" class="form-label required">Start Date</label>
                    <input
                      id="start-date"
                      type="date"
                      class="form-control"
                      [(ngModel)]="draft.startDate"
                      [disabled]="datesLocked"
                      (ngModelChange)="onStartDateChange()"
                      required
                    />
                  </div>

                  <div class="form-group flex-1" *ngIf="multiDay">
                    <label for="end-date" class="form-label required">End Date</label>
                    <input
                      id="end-date"
                      type="date"
                      class="form-control"
                      [min]="draft.startDate || ''"
                      [(ngModel)]="draft.endDate"
                      [disabled]="datesLocked"
                      (ngModelChange)="markDirty()"
                      required
                    />
                  </div>
                </div>

                <!-- Multi-Day Toggle -->
                <div class="toggle-row">
                  <label class="toggle-control">
                    <input
                      type="checkbox"
                      [checked]="multiDay"
                      [disabled]="datesLocked"
                      (change)="toggleMultiDay()"
                    />
                    <span class="toggle-switch"></span>
                    <span class="toggle-text">Multi-day event (e.g. weekend festival, 3-day retreat)</span>
                  </label>
                </div>
              </div>

              <!-- RECURRING MODE: Weekdays Picker -->
              <div *ngIf="draft.mode === 'recurring'" class="recurring-mode-fields">
                <label class="form-label required">Repeating Days of the Week</label>
                <p class="form-hint">Select the days this activity or special repeats each week:</p>
                <div class="weekday-pill-grid">
                  <button
                    type="button"
                    *ngFor="let day of allWeekdays"
                    class="weekday-pill-btn"
                    [class.selected]="isDaySelected(day.key)"
                    [disabled]="datesLocked"
                    (click)="toggleDay(day.key)"
                  >
                    {{ day.label }}
                  </button>
                </div>
              </div>

              <!-- TIME WINDOW SECTION -->
              <div class="time-section mt-4">
                <div class="toggle-row mb-3">
                  <label class="toggle-control">
                    <input
                      type="checkbox"
                      [checked]="draft.allDay"
                      [disabled]="datesLocked"
                      (change)="toggleAllDay()"
                    />
                    <span class="toggle-switch"></span>
                    <span class="toggle-text">All Day event (no specific start/end hour)</span>
                  </label>
                </div>

                <div *ngIf="!draft.allDay" class="time-inputs-row">
                  <div class="form-group flex-1">
                    <label for="time-from" class="form-label required">Start Time</label>
                    <input
                      id="time-from"
                      type="time"
                      class="form-control"
                      [(ngModel)]="draft.from"
                      [disabled]="datesLocked"
                      (ngModelChange)="markDirty()"
                      required
                    />
                  </div>

                  <div class="form-group flex-1" *ngIf="!draft.openEnd">
                    <label for="time-to" class="form-label required">End Time</label>
                    <input
                      id="time-to"
                      type="time"
                      class="form-control"
                      [(ngModel)]="draft.to"
                      [disabled]="datesLocked"
                      (ngModelChange)="markDirty()"
                      required
                    />
                  </div>
                </div>

                <div *ngIf="!draft.allDay" class="toggle-row">
                  <label class="toggle-control">
                    <input
                      type="checkbox"
                      [checked]="draft.openEnd"
                      [disabled]="datesLocked"
                      (change)="toggleOpenEnd()"
                    />
                    <span class="toggle-switch"></span>
                    <span class="toggle-text">Open End (event has no fixed finish time)</span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          <!-- SECTION 4: Location & Area -->
          <section class="form-section card">
            <div class="section-header">
              <span class="section-step-num">4</span>
              <div>
                <h2 class="section-title">Location & Area</h2>
                <p class="section-desc">Specify where this event takes place and choose the VAMO destination area.</p>
              </div>
            </div>

            <div class="form-body">
              <!-- Area Selector -->
              <div class="form-group">
                <label for="area-select" class="form-label required">Destination Area</label>
                <select
                  id="area-select"
                  class="form-select"
                  [(ngModel)]="selectedAreaId"
                  (ngModelChange)="markDirty()"
                  required
                >
                  <option value="" disabled>Select an Area…</option>
                  <option *ngFor="let area of availableAreas" [value]="area.id">
                    {{ area.emoji }} {{ area.name }}
                  </option>
                </select>
                <span class="form-hint">Used for area filtering in the VAMO discovery feed.</span>
              </div>

              <!-- Address Field -->
              <div class="form-group">
                <label for="event-address" class="form-label required">Street / Venue Address</label>
                <input
                  id="event-address"
                  type="text"
                  class="form-control"
                  placeholder="e.g. Calle Principal 14, Playa Bonita, Las Terrenas"
                  [(ngModel)]="draft.address"
                  (ngModelChange)="markDirty()"
                  required
                />
              </div>

              <!-- Coordinates -->
              <div class="coordinates-box">
                <div class="coords-title-row">
                  <span class="coords-label">Coordinates (Latitude & Longitude)</span>
                  <a
                    *ngIf="lat && lng"
                    [href]="getGoogleMapsUrl()"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="btn btn-sm btn-ghost map-preview-link"
                  >
                    View on Google Maps ↗
                  </a>
                </div>
                <div class="form-row">
                  <div class="form-group flex-1">
                    <label for="coord-lat" class="form-label">Latitude</label>
                    <input
                      id="coord-lat"
                      type="number"
                      step="0.000001"
                      class="form-control"
                      placeholder="e.g. 19.318554"
                      [(ngModel)]="lat"
                      (ngModelChange)="onCoordChange()"
                    />
                  </div>
                  <div class="form-group flex-1">
                    <label for="coord-lng" class="form-label">Longitude</label>
                    <input
                      id="coord-lng"
                      type="number"
                      step="0.000001"
                      class="form-control"
                      placeholder="e.g. -69.539809"
                      [(ngModel)]="lng"
                      (ngModelChange)="onCoordChange()"
                    />
                  </div>
                </div>
                <span class="form-hint">Preloaded from your business location. Adjust if this event is off-site.</span>
              </div>
            </div>
          </section>

          <!-- SECTION 5: Pricing & Promotions -->
          <section class="form-section card">
            <div class="section-header">
              <span class="section-step-num">5</span>
              <div>
                <h2 class="section-title">Pricing & Promotion</h2>
                <p class="section-desc">State whether admission is free or ticketed, and configure promotional offers.</p>
              </div>
            </div>

            <div class="form-body">
              <!-- Pricing Model Buttons -->
              <div class="pricing-model-selector">
                <button
                  type="button"
                  class="pricing-tab-btn"
                  [class.active]="draft.isFree"
                  (click)="setPricingModel('free')"
                >
                  🎉 Free Admission
                </button>
                <button
                  type="button"
                  class="pricing-tab-btn"
                  [class.active]="!draft.isFree && !draft.contactForPrice"
                  (click)="setPricingModel('paid')"
                >
                  💵 Fixed Price / Tickets
                </button>
                <button
                  type="button"
                  class="pricing-tab-btn"
                  [class.active]="draft.contactForPrice"
                  (click)="setPricingModel('contact')"
                >
                  📞 Contact for Price
                </button>
              </div>

              <!-- Price & Currency Inputs when Paid -->
              <div *ngIf="!draft.isFree && !draft.contactForPrice" class="form-row mt-3">
                <div class="form-group flex-1">
                  <label for="price-input" class="form-label required">Price Amount</label>
                  <input
                    id="price-input"
                    type="number"
                    min="0"
                    step="0.01"
                    class="form-control"
                    placeholder="0.00"
                    [(ngModel)]="draft.price"
                    (ngModelChange)="markDirty()"
                    required
                  />
                </div>
                <div class="form-group" style="width: 130px;">
                  <label for="currency-select" class="form-label required">Currency</label>
                  <select
                    id="currency-select"
                    class="form-select"
                    [(ngModel)]="draft.currency"
                    (ngModelChange)="markDirty()"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="DOP">DOP ($)</option>
                  </select>
                </div>
              </div>

              <!-- Special Promotion Toggle & Text -->
              <div class="promotion-box mt-4">
                <div class="toggle-row mb-2">
                  <label class="toggle-control">
                    <input
                      type="checkbox"
                      [checked]="draft.hasPromotion"
                      (change)="togglePromotion()"
                    />
                    <span class="toggle-switch"></span>
                    <span class="toggle-text"><strong>Highlight a Special Promotion or Deal</strong></span>
                  </label>
                </div>

                <div *ngIf="draft.hasPromotion" class="form-group mt-3">
                  <label for="promo-text" class="form-label required">Promotional Callout Text</label>
                  <input
                    id="promo-text"
                    type="text"
                    class="form-control"
                    placeholder="e.g. Free welcome cocktail with dinner, 20% off for locals"
                    [(ngModel)]="draft.promoText"
                    (ngModelChange)="markDirty()"
                    maxlength="80"
                    required
                  />
                  <span class="form-hint">Displayed with a gift tag badge in the app listing.</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Bottom Action Buttons on mobile / small screen -->
          <div class="bottom-actions card card-flat">
            <button type="button" class="btn btn-secondary" (click)="saveDraft()" [disabled]="submitting">
              Save as Draft
            </button>
            <button type="button" class="btn btn-primary" (click)="publishListing()" [disabled]="submitting">
              {{ isEditMode && !isDraft ? 'Save & Update' : 'Publish Listing' }}
            </button>
          </div>
        </main>

        <!-- Sticky App Preview Column (Right) -->
        <aside class="editor-preview-col">
          <div class="preview-card-sticky">
            <div class="preview-header-bar">
              <span class="preview-title">VAMO App Preview</span>
              <span class="live-pill">Live Sync</span>
            </div>

            <div class="phone-frame">
              <!-- Phone Status Bar Mockup -->
              <div class="phone-status-bar">
                <span>9:41</span>
                <span class="status-icons">📶 🔋</span>
              </div>

              <!-- Phone Content Area -->
              <div class="phone-content">
                <!-- Cover Image Card -->
                <div class="phone-card">
                  <div class="phone-card-image-wrap">
                    <img
                      [src]="getPreviewImageUrl()"
                      alt="Preview"
                      class="phone-cover-img"
                    />
                    <div class="phone-overlay-badges">
                      <span class="phone-category-pill">
                        {{ getCategoryEmoji(draft.category) }} {{ getCategoryLabel(draft.category) }}
                      </span>
                      <span class="phone-price-pill">
                        {{ formatPreviewPrice() }}
                      </span>
                    </div>

                    <div *ngIf="draft.promoText && draft.hasPromotion" class="phone-promo-tag">
                      🎁 {{ draft.promoText }}
                    </div>
                  </div>

                  <div class="phone-card-body">
                    <div class="phone-mode-row">
                      <span class="phone-mode-tag">
                        {{ draft.mode === 'recurring' ? '🔁 Recurring' : '📅 Event' }}
                      </span>
                      <span class="phone-provider-name">
                        {{ providerName }}
                      </span>
                    </div>

                    <h4 class="phone-title">
                      {{ draft.name || 'Untitled Listing' }}
                    </h4>

                    <div class="phone-meta-row">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                      </svg>
                      <span>{{ formatPreviewSchedule() }}</span>
                    </div>

                    <div class="phone-meta-row" *ngIf="formatPreviewTime()">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      <span>{{ formatPreviewTime() }}</span>
                    </div>

                    <div class="phone-meta-row" *ngIf="draft.address">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                      </svg>
                      <span class="truncate">{{ draft.address }}</span>
                    </div>

                    <p class="phone-desc" *ngIf="draft.description">
                      {{ draft.description }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <p class="preview-footnote">
              This is how your post appears to users exploring content in Dominican Republic on the VAMO mobile app.
            </p>
          </div>
        </aside>
      </div>

      <!-- Loading State for Initial Load -->
      <div *ngIf="loadingInitial" class="state-loading-card card">
        <div class="loading-spinner"></div>
        <p>Loading listing details…</p>
      </div>

      <!-- Discard Changes Modal Dialog -->
      <div *ngIf="showCancelConfirmModal" class="modal-backdrop" role="dialog" aria-modal="true">
        <div class="modal-dialog">
          <div class="modal-content card">
            <div class="modal-header">
              <div class="warning-icon-bubble">⚠️</div>
              <h2 class="modal-title">Discard Unsaved Changes?</h2>
            </div>
            <div class="modal-body">
              <p class="modal-desc">
                You have unsaved changes in this listing editor. If you leave now, your changes will be discarded.
              </p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="showCancelConfirmModal = false">
                Keep Editing
              </button>
              <button type="button" class="btn btn-danger" (click)="confirmDiscardAndExit()">
                Discard Changes
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

    .editor-page {
      display: flex;
      flex-direction: column;
      gap: 24px;
      padding-bottom: 64px;
    }

    /* Top Navigation Header */
    .editor-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .back-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
    }

    .title-meta {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .page-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--vamo-text);
      letter-spacing: -0.02em;
      margin: 0;
    }

    .status-indicator-badge {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: var(--vamo-radius-full);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    /* 2-Column Grid Layout */
    .editor-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 380px;
      gap: 32px;
      align-items: start;
    }

    .editor-form-col {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    /* Form Section Card */
    .form-section {
      padding: 28px;
    }

    .section-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--vamo-border);
    }

    .section-step-num {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--vamo-primary);
      color: #ffffff;
      font-weight: 700;
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .section-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--vamo-text);
      margin: 0 0 4px;
    }

    .section-desc {
      font-size: 0.88rem;
      color: var(--vamo-text-muted);
      margin: 0;
      line-height: 1.45;
    }

    .form-body {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-label {
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--vamo-text);
    }

    .form-label.required::after {
      content: ' *';
      color: var(--vamo-danger);
    }

    .form-control, .form-select, .form-textarea {
      font-size: 0.92rem;
    }

    .field-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 0.78rem;
      color: var(--vamo-text-muted);
    }

    .char-count {
      font-variant-numeric: tabular-nums;
    }

    .form-row {
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }

    .flex-1 {
      flex: 1;
    }

    /* Category Buttons Grid */
    .category-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }

    .category-card-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 12px 8px;
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      background: var(--vamo-surface);
      cursor: pointer;
      transition: all 0.15s ease;
      text-align: center;
    }

    .category-card-btn:hover {
      border-color: var(--vamo-primary);
      background: var(--vamo-surface-subtle);
    }

    .category-card-btn.selected {
      border-color: var(--vamo-primary);
      background: var(--vamo-primary-light);
      box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.2);
    }

    .cat-emoji {
      font-size: 20px;
    }

    .cat-label {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--vamo-text);
      line-height: 1.2;
    }

    /* Gallery Grid */
    .gallery-preview-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 14px;
    }

    .photo-preview-card {
      position: relative;
      height: 110px;
      border-radius: var(--vamo-radius-md);
      overflow: hidden;
      border: 1px solid var(--vamo-border);
      background: #0f172a;
    }

    .preview-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .cover-badge {
      position: absolute;
      bottom: 6px;
      left: 6px;
      font-size: 0.65rem;
      font-weight: 700;
      background: rgba(15, 23, 42, 0.85);
      color: #ffffff;
      padding: 2px 6px;
      border-radius: var(--vamo-radius-sm);
    }

    .remove-photo-btn {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: rgba(15, 23, 42, 0.75);
      color: #ffffff;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 11px;
    }

    .upload-dropzone-btn {
      height: 110px;
      border: 2px dashed var(--vamo-border-hover);
      border-radius: var(--vamo-radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
      background: var(--vamo-surface-subtle);
    }

    .upload-dropzone-btn:hover {
      border-color: var(--vamo-primary);
      background: var(--vamo-primary-light);
    }

    .hidden-file-input {
      display: none;
    }

    .dropzone-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      color: var(--vamo-text-muted);
    }

    .dropzone-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--vamo-primary);
    }

    .dropzone-hint {
      font-size: 0.7rem;
    }

    /* Schedule Selector */
    .schedule-type-toggle {
      display: flex;
      background: var(--vamo-surface-subtle);
      border-radius: var(--vamo-radius-md);
      padding: 4px;
      gap: 4px;
    }

    .type-tab-btn {
      flex: 1;
      border: none;
      background: transparent;
      padding: 9px 12px;
      border-radius: calc(var(--vamo-radius-md) - 2px);
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--vamo-text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .type-tab-btn.active {
      background: var(--vamo-surface);
      color: var(--vamo-primary);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .weekday-pill-grid {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .weekday-pill-btn {
      padding: 8px 14px;
      border-radius: var(--vamo-radius-full);
      border: 1px solid var(--vamo-border);
      background: var(--vamo-surface);
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--vamo-text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .weekday-pill-btn.selected {
      background: var(--vamo-primary);
      border-color: var(--vamo-primary);
      color: #ffffff;
    }

    /* Toggle Switches */
    .toggle-row {
      display: flex;
      align-items: center;
    }

    .toggle-control {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      user-select: none;
    }

    .toggle-control input {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
    }

    .toggle-switch {
      position: relative;
      display: inline-block;
      width: 40px;
      height: 22px;
      background-color: #cbd5e1;
      border-radius: 22px;
      transition: background-color 0.2s ease;
      flex-shrink: 0;
    }

    .toggle-switch::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 3px;
      width: 16px;
      height: 16px;
      background-color: #ffffff;
      border-radius: 50%;
      transition: transform 0.2s ease;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    }

    .toggle-control input:checked + .toggle-switch {
      background-color: var(--vamo-primary);
    }

    .toggle-control input:checked + .toggle-switch::after {
      transform: translateX(18px);
    }

    .toggle-text {
      font-size: 0.88rem;
      color: var(--vamo-text);
    }

    .time-inputs-row {
      display: flex;
      gap: 16px;
      margin-bottom: 12px;
    }

    /* Coordinates Box */
    .coordinates-box {
      background: var(--vamo-surface-subtle);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .coords-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .coords-label {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--vamo-text);
    }

    /* Pricing Section */
    .pricing-model-selector {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .pricing-tab-btn {
      flex: 1;
      min-width: 140px;
      padding: 10px 14px;
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      background: var(--vamo-surface);
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--vamo-text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .pricing-tab-btn.active {
      border-color: var(--vamo-primary);
      background: var(--vamo-primary-light);
      color: var(--vamo-primary);
    }

    .promotion-box {
      background: #fdf2f8;
      border: 1px dashed var(--vamo-secondary);
      border-radius: var(--vamo-radius-md);
      padding: 16px;
    }

    /* Bottom Actions (Small Screen) */
    .bottom-actions {
      display: none;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 20px;
    }

    /* Right Preview Column (Sticky Mockup) */
    .editor-preview-col {
      position: sticky;
      top: 24px;
    }

    .preview-card-sticky {
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-xl);
      padding: 20px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    }

    .preview-header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .preview-title {
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--vamo-text-muted);
    }

    .live-pill {
      font-size: 0.7rem;
      font-weight: 700;
      background: #dcfce7;
      color: #166534;
      padding: 2px 8px;
      border-radius: var(--vamo-radius-full);
      text-transform: uppercase;
    }

    /* Phone Frame Mockup */
    .phone-frame {
      width: 100%;
      max-width: 330px;
      margin: 0 auto;
      background: #0f172a;
      border-radius: 28px;
      padding: 12px 10px 18px;
      box-shadow: 0 16px 32px -8px rgba(15, 23, 42, 0.35);
      border: 4px solid #1e293b;
    }

    .phone-status-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.72rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.6);
      padding: 4px 12px 10px;
    }

    .phone-content {
      background: #f8fafc;
      border-radius: 20px;
      overflow: hidden;
    }

    .phone-card {
      display: flex;
      flex-direction: column;
      background: #ffffff;
    }

    .phone-card-image-wrap {
      position: relative;
      width: 100%;
      height: 165px;
      background: #1e293b;
    }

    .phone-cover-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .phone-overlay-badges {
      position: absolute;
      top: 10px;
      left: 10px;
      right: 10px;
      display: flex;
      justify-content: space-between;
      gap: 6px;
    }

    .phone-category-pill {
      background: rgba(15, 23, 42, 0.8);
      color: #ffffff;
      font-size: 0.68rem;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 9999px;
      backdrop-filter: blur(4px);
    }

    .phone-price-pill {
      background: #ffffff;
      color: #0f172a;
      font-size: 0.7rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 9999px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
    }

    .phone-promo-tag {
      position: absolute;
      bottom: 8px;
      left: 10px;
      background: #ec4899;
      color: #ffffff;
      font-size: 0.68rem;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 9999px;
    }

    .phone-card-body {
      padding: 14px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .phone-mode-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
    }

    .phone-mode-tag {
      font-size: 0.68rem;
      font-weight: 600;
      color: #7c3aed;
      background: #f5f3ff;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .phone-provider-name {
      font-size: 0.7rem;
      font-weight: 500;
      color: #64748b;
    }

    .phone-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: #0f172a;
      margin: 2px 0 6px;
      line-height: 1.25;
    }

    .phone-meta-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.72rem;
      color: #64748b;
    }

    .phone-desc {
      font-size: 0.75rem;
      color: #475569;
      margin: 6px 0 0;
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .preview-footnote {
      font-size: 0.76rem;
      color: var(--vamo-text-muted);
      text-align: center;
      margin: 14px 0 0;
      line-height: 1.35;
    }

    .spinner-inline {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin 0.75s linear infinite;
      margin-right: 6px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
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
      margin: 0;
    }

    .modal-desc {
      font-size: 0.95rem;
      color: var(--vamo-text);
      line-height: 1.5;
    }

    .modal-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 24px;
    }

    .state-loading-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px;
      gap: 16px;
    }

    @media (max-width: 1024px) {
      .editor-grid {
        grid-template-columns: 1fr;
      }

      .editor-preview-col {
        display: none;
      }

      .bottom-actions {
        display: flex;
      }
    }
  `],
})
export class ListingEditorComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private businessService = inject(BusinessService);
  private cdr = inject(ChangeDetectorRef);

  categories: EventCategory[] = EVENT_CATEGORIES;
  allWeekdays = [
    { key: 'mon', label: 'Mon' },
    { key: 'tue', label: 'Tue' },
    { key: 'wed', label: 'Wed' },
    { key: 'thu', label: 'Thu' },
    { key: 'fri', label: 'Fri' },
    { key: 'sat', label: 'Sat' },
    { key: 'sun', label: 'Sun' },
  ];

  isEditMode = false;
  isDraft = true;
  eventId: string | null = null;
  loadingInitial = true;
  submitting = false;
  saveTargetStatus: 'draft' | 'published' = 'published';
  errorMessage: string | null = null;
  isDirty = false;
  showCancelConfirmModal = false;

  // Published event schedule lock
  datesLocked = false;
  originalStartDate: string | null = null;

  availableAreas: Area[] = [];
  selectedAreaId = '';
  existingAreaJunctionIds: number[] = [];

  // Provider meta for preview and coordinates fallback
  providerName = 'Your Business';
  providerAddress = '';
  providerLat: number | null = null;
  providerLng: number | null = null;

  // Form State
  draft: Partial<VamoEvent> = {
    name: '',
    category: 'live',
    description: '',
    mode: 'single',
    startDate: '',
    endDate: null,
    allDay: false,
    openEnd: false,
    from: '19:00',
    to: '22:00',
    isFree: true,
    contactForPrice: false,
    price: 0,
    currency: 'USD',
    hasPromotion: false,
    promoText: null,
    address: '',
    recurring: { days: ['fri', 'sat'] },
  };

  multiDay = false;
  lat: number | null = null;
  lng: number | null = null;

  // Images State
  existingImages: ExistingImage[] = [];
  removedImageJunctionIds: (number | string)[] = [];
  selectedNewFiles: File[] = [];
  newFilePreviews: string[] = [];

  async ngOnInit(): Promise<void> {
    const user = this.authService.currentUser;
    const provider = user?.provider_link;
    if (provider) {
      this.providerName = provider.name || 'Your Business';
      this.providerAddress = provider.address || '';
      if (provider.location?.coordinates) {
        this.providerLng = provider.location.coordinates[0];
        this.providerLat = provider.location.coordinates[1];
      }
    }

    try {
      this.availableAreas = await this.businessService.getAreas();
      if (this.availableAreas.length > 0) {
        this.selectedAreaId = this.availableAreas[0].id;
      }
    } catch {
      // safe fallback in service
    }

    // Determine Mode & Event ID
    const routeId = this.route.snapshot.paramMap.get('id');
    const queryEventId = this.route.snapshot.queryParamMap.get('eventId');
    this.eventId = routeId || queryEventId;

    if (this.eventId) {
      this.isEditMode = true;
      await this.loadExistingEvent(this.eventId);
    } else {
      // New listing defaults
      this.initNewDraft();
      this.loadingInitial = false;
      this.cdr.markForCheck();
    }
  }

  initNewDraft(): void {
    const today = this.businessService.drTodayStr();
    this.draft.startDate = today;
    this.draft.address = this.providerAddress;
    this.lat = this.providerLat;
    this.lng = this.providerLng;
  }

  async loadExistingEvent(id: string): Promise<void> {
    this.loadingInitial = true;
    this.cdr.markForCheck();

    try {
      const event = await this.businessService.getEventById(id);
      this.isDraft = event.status === 'draft';
      this.originalStartDate = event.startDate || null;

      // Check 24h schedule lock for published events
      if (event.status === 'published' && event.startDate) {
        const start = new Date(event.startDate).getTime();
        this.datesLocked = start - Date.now() <= 24 * 60 * 60 * 1000;
      }

      this.draft = {
        id: event.id,
        name: event.name || '',
        category: event.category || 'other',
        description: event.description || '',
        mode: event.mode || 'single',
        startDate: event.startDate ? String(event.startDate).split('T')[0] : '',
        endDate: event.endDate ? String(event.endDate).split('T')[0] : null,
        allDay: !!event.allDay,
        openEnd: !!event.openEnd,
        from: event.from ? event.from.substring(0, 5) : '19:00',
        to: event.to ? event.to.substring(0, 5) : '22:00',
        isFree: event.isFree !== undefined ? !!event.isFree : true,
        contactForPrice: !!event.contactForPrice,
        price: event.price ?? 0,
        currency: event.currency || 'USD',
        hasPromotion: !!event.hasPromotion,
        promoText: event.promoText || null,
        address: event.address || '',
        recurring: event.recurring || { days: [] },
      };

      this.multiDay = !!event.endDate;

      if (event.location_point?.coordinates) {
        this.lng = event.location_point.coordinates[0];
        this.lat = event.location_point.coordinates[1];
      }

      // Existing Areas
      if (event.areas && event.areas.length > 0) {
        this.existingAreaJunctionIds = event.areas.map((a) => a.id as number).filter(Boolean);
        const firstArea = event.areas[0].areas_id;
        this.selectedAreaId = typeof firstArea === 'string' ? firstArea : firstArea?.id || '';
      }

      // Existing Images
      this.existingImages = (event.images || [])
        .map((img: any) => {
          const fileId = typeof img.directus_files_id === 'string'
            ? img.directus_files_id
            : img.directus_files_id?.id;
          return fileId ? { junctionId: img.id, url: this.businessService.getAssetUrl(fileId) } : null;
        })
        .filter(Boolean) as ExistingImage[];

    } catch (err: any) {
      console.error('[ListingEditor] load error:', err);
      this.errorMessage = 'Could not load existing listing. Starting fresh.';
      this.initNewDraft();
    } finally {
      this.loadingInitial = false;
      this.cdr.markForCheck();
    }
  }

  markDirty(): void {
    this.isDirty = true;
  }

  setCategory(catValue: string): void {
    this.draft.category = catValue;
    this.markDirty();
  }

  setMode(mode: 'single' | 'recurring'): void {
    if (this.datesLocked) return;
    this.draft.mode = mode;
    this.markDirty();
  }

  onStartDateChange(): void {
    this.markDirty();
    if (this.multiDay && this.draft.startDate && this.draft.endDate) {
      if (this.draft.endDate <= this.draft.startDate) {
        this.draft.endDate = null;
      }
    }
  }

  toggleMultiDay(): void {
    if (this.datesLocked) return;
    this.multiDay = !this.multiDay;
    if (!this.multiDay) {
      this.draft.endDate = null;
    }
    this.markDirty();
  }

  toggleAllDay(): void {
    if (this.datesLocked) return;
    this.draft.allDay = !this.draft.allDay;
    this.markDirty();
  }

  toggleOpenEnd(): void {
    if (this.datesLocked) return;
    this.draft.openEnd = !this.draft.openEnd;
    if (this.draft.openEnd) {
      this.draft.to = null;
    }
    this.markDirty();
  }

  isDaySelected(dayKey: string): boolean {
    const days = (this.draft.recurring as any)?.days;
    return Array.isArray(days) && days.includes(dayKey);
  }

  toggleDay(dayKey: string): void {
    if (this.datesLocked) return;
    if (!this.draft.recurring || typeof this.draft.recurring !== 'object') {
      this.draft.recurring = { days: [] };
    }
    const days: string[] = [...((this.draft.recurring as any).days || [])];
    const idx = days.indexOf(dayKey);
    if (idx >= 0) {
      days.splice(idx, 1);
    } else {
      days.push(dayKey);
    }
    this.draft.recurring = { days };
    this.markDirty();
  }

  onCoordChange(): void {
    this.markDirty();
    if (this.lat !== null && this.lng !== null) {
      this.draft.location_point = {
        type: 'Point',
        coordinates: [Number(this.lng), Number(this.lat)],
      };
    }
  }

  getGoogleMapsUrl(): string {
    if (this.lat && this.lng) {
      return `https://www.google.com/maps/search/?api=1&query=${this.lat},${this.lng}`;
    }
    return '#';
  }

  setPricingModel(model: 'free' | 'paid' | 'contact'): void {
    if (model === 'free') {
      this.draft.isFree = true;
      this.draft.contactForPrice = false;
      this.draft.price = 0;
    } else if (model === 'paid') {
      this.draft.isFree = false;
      this.draft.contactForPrice = false;
    } else {
      this.draft.isFree = false;
      this.draft.contactForPrice = true;
      this.draft.price = 0;
    }
    this.markDirty();
  }

  togglePromotion(): void {
    this.draft.hasPromotion = !this.draft.hasPromotion;
    if (!this.draft.hasPromotion) {
      this.draft.promoText = null;
    }
    this.markDirty();
  }

  onFilesSelected(event: Event): void {
    const files = Array.from((event.target as HTMLInputElement)?.files || []);
    if (!files.length) return;

    for (const file of files) {
      this.selectedNewFiles.push(file);
      this.newFilePreviews.push(URL.createObjectURL(file));
    }
    this.markDirty();
  }

  removeNewFile(index: number): void {
    URL.revokeObjectURL(this.newFilePreviews[index]);
    this.selectedNewFiles.splice(index, 1);
    this.newFilePreviews.splice(index, 1);
    this.markDirty();
  }

  removeExistingImage(img: ExistingImage): void {
    this.removedImageJunctionIds.push(img.junctionId);
    this.existingImages = this.existingImages.filter((i) => i.junctionId !== img.junctionId);
    this.markDirty();
  }

  validateForm(forPublish: boolean): boolean {
    this.errorMessage = null;

    if (!this.draft.name?.trim()) {
      this.errorMessage = 'Please provide a listing title.';
      return false;
    }

    if (!this.draft.category) {
      this.errorMessage = 'Please choose a category.';
      return false;
    }

    if (!this.draft.description?.trim() || this.draft.description.trim().length < 10) {
      this.errorMessage = 'Description must be at least 10 characters.';
      return false;
    }

    if (forPublish) {
      const hasImages = this.existingImages.length > 0 || this.selectedNewFiles.length > 0;
      if (!hasImages) {
        this.errorMessage = 'Please add at least one photo before publishing.';
        return false;
      }

      if (!this.draft.address?.trim()) {
        this.errorMessage = 'Please provide a location address.';
        return false;
      }

      if (!this.selectedAreaId) {
        this.errorMessage = 'Please select a destination area.';
        return false;
      }

      if (this.draft.mode === 'single') {
        if (!this.draft.startDate) {
          this.errorMessage = 'Please select a start date.';
          return false;
        }
        if (this.multiDay && !this.draft.endDate) {
          this.errorMessage = 'Please select an end date for multi-day events.';
          return false;
        }
      } else {
        const days = (this.draft.recurring as any)?.days;
        if (!Array.isArray(days) || days.length === 0) {
          this.errorMessage = 'Please choose at least one repeating day of the week.';
          return false;
        }
      }

      if (!this.draft.allDay) {
        if (!this.draft.from) {
          this.errorMessage = 'Please specify a start time.';
          return false;
        }
        if (!this.draft.openEnd && !this.draft.to) {
          this.errorMessage = 'Please specify an end time.';
          return false;
        }
      }

      if (!this.draft.isFree && !this.draft.contactForPrice && (!this.draft.price || Number(this.draft.price) <= 0)) {
        this.errorMessage = 'Please enter a valid price amount.';
        return false;
      }

      if (this.draft.hasPromotion && !this.draft.promoText?.trim()) {
        this.errorMessage = 'Please specify your promotional callout text.';
        return false;
      }
    }

    return true;
  }

  async saveDraft(): Promise<void> {
    if (!this.validateForm(false)) return;
    await this.executeSave('draft');
  }

  async publishListing(): Promise<void> {
    if (!this.validateForm(true)) return;
    await this.executeSave('published');
  }

  private async executeSave(status: 'draft' | 'published'): Promise<void> {
    const user = this.authService.currentUser;
    const providerId = user?.provider_link?.id;
    if (!providerId) {
      this.errorMessage = 'No business profile linked to your user.';
      return;
    }

    this.submitting = true;
    this.saveTargetStatus = status;
    this.cdr.markForCheck();

    try {
      const payload: Partial<VamoEvent> = {
        name: this.draft.name,
        category: this.draft.category,
        description: this.draft.description,
        mode: this.draft.mode,
        status,
        startDate: this.draft.startDate || null,
        endDate: this.multiDay ? (this.draft.endDate || null) : null,
        allDay: !!this.draft.allDay,
        openEnd: !!this.draft.openEnd,
        from: this.draft.allDay ? null : (this.draft.from || null),
        to: this.draft.allDay || this.draft.openEnd ? null : (this.draft.to || null),
        recurring: this.draft.mode === 'recurring' ? this.draft.recurring : null,
        isFree: !!this.draft.isFree,
        contactForPrice: !!this.draft.contactForPrice,
        price: this.draft.isFree || this.draft.contactForPrice ? 0 : (this.draft.price || 0),
        currency: this.draft.currency || 'USD',
        hasPromotion: !!this.draft.hasPromotion,
        promoText: this.draft.hasPromotion ? this.draft.promoText : null,
        address: this.draft.address,
        location_point: this.lat !== null && this.lng !== null
          ? { type: 'Point', coordinates: [Number(this.lng), Number(this.lat)] }
          : null,
      };

      const areaIds = this.selectedAreaId ? [this.selectedAreaId] : [];

      if (this.isEditMode && this.eventId) {
        await this.businessService.updateEvent(
          this.eventId,
          payload,
          this.selectedNewFiles,
          this.removedImageJunctionIds,
          areaIds,
          this.existingAreaJunctionIds
        );
      } else {
        await this.businessService.createEvent(
          providerId,
          payload,
          this.selectedNewFiles,
          areaIds
        );
      }

      this.isDirty = false;
      this.router.navigate(['/app/listings']);
    } catch (err: any) {
      console.error('[ListingEditor] save failed:', err);
      this.errorMessage = err?.message || 'Could not save listing. Please try again.';
    } finally {
      this.submitting = false;
      this.cdr.markForCheck();
    }
  }

  onCancel(): void {
    if (this.isDirty) {
      this.showCancelConfirmModal = true;
    } else {
      this.router.navigate(['/app/listings']);
    }
  }

  confirmDiscardAndExit(): void {
    this.showCancelConfirmModal = false;
    this.isDirty = false;
    this.router.navigate(['/app/listings']);
  }

  // Preview formatting helpers
  getCategoryLabel(categoryKey?: string): string {
    const found = this.categories.find((c) => c.value === categoryKey);
    return found ? found.label : (categoryKey || 'General');
  }

  getCategoryEmoji(categoryKey?: string): string {
    const found = this.categories.find((c) => c.value === categoryKey);
    return found ? found.emoji : '📌';
  }

  getPreviewImageUrl(): string {
    if (this.newFilePreviews.length > 0) {
      return this.newFilePreviews[0];
    }
    if (this.existingImages.length > 0) {
      return this.existingImages[0].url;
    }
    return '/assets/placeholder.png';
  }

  formatPreviewPrice(): string {
    if (this.draft.isFree) return 'Free';
    if (this.draft.contactForPrice) return 'Contact for price';
    if (this.draft.price) {
      return `${this.draft.currency || 'USD'} $${Number(this.draft.price).toFixed(2)}`;
    }
    return 'Free';
  }

  formatPreviewSchedule(): string {
    if (this.draft.mode === 'recurring') {
      const days = (this.draft.recurring as any)?.days;
      if (Array.isArray(days) && days.length > 0) {
        return `Every ${days.map((d: string) => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}`;
      }
      return 'Every Week';
    }
    if (!this.draft.startDate) return 'Select Date';
    return this.draft.startDate;
  }

  formatPreviewTime(): string {
    if (this.draft.allDay) return 'All Day';
    if (!this.draft.from) return '';
    if (this.draft.openEnd) return `${this.draft.from} · Open End`;
    return `${this.draft.from} – ${this.draft.to || ''}`;
  }
}
