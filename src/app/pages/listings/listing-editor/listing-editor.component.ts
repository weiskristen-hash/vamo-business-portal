import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { BusinessService } from '../../../core/services/business.service';
import { CustomerErrorService } from '../../../core/services/customer-error.service';
import { VamoEvent, Area, EVENT_CATEGORIES, EventCategory } from '../../../core/models/event.model';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { isEventPast, parseLocalDate, validateEventForPublish, validateEventSchedule, scheduleErrorMessageKey } from '../../../core/utils/event-display.util';
import { getDrCurrentDateTime } from '../../../core/utils/date-validation.util';

export interface ExistingImage {
  junctionId: number | string;
  url: string;
}

@Component({
  selector: 'app-listing-editor',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslatePipe],
  template: `
    <div class="editor-page">
      <!-- Top Navigation & Action Header -->
      <header class="editor-header">
        <div class="header-left">
          <button type="button" class="btn btn-ghost back-btn" (click)="onCancel()" [attr.aria-label]="'PORTAL.EVENT_EDITOR.BACK_TO_LISTINGS' | translate">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>{{ 'PORTAL.EVENT_EDITOR.BACK_TO_LISTINGS' | translate }}</span>
          </button>
          <div class="title-meta">
            <h1 class="page-title">{{ (isEditMode ? 'PORTAL.EVENT_EDITOR.TITLE_EDIT' : 'PORTAL.EVENT_EDITOR.TITLE_CREATE') | translate }}</h1>
            <span class="status-indicator-badge" [ngClass]="isEditMode ? 'badge-primary' : 'badge-neutral'">
              {{ (isEditMode ? (isDraft ? 'PORTAL.EVENT_EDITOR.STATUS_EDITING_DRAFT' : 'PORTAL.EVENT_EDITOR.STATUS_EDITING_PUBLISHED') : 'PORTAL.EVENT_EDITOR.STATUS_NEW') | translate }}
            </span>
          </div>
        </div>

        <div class="header-actions">
          <button type="button" class="btn btn-secondary" (click)="onCancel()" [disabled]="submitting">
            {{ 'PORTAL.COMMON.CANCEL' | translate }}
          </button>
          <ng-container *ngIf="isPastEvent">
            <button type="button" class="btn btn-primary" (click)="copyPastEvent()" [disabled]="submitting">
              <span *ngIf="submitting" class="spinner-inline"></span>
              <span>{{ 'PORTAL.EVENT_EDITOR.COPY_AS_NEW_BTN' | translate }}</span>
            </button>
          </ng-container>
          <ng-container *ngIf="!isPastEvent">
            <button type="button" class="btn btn-secondary" (click)="saveDraft()" [disabled]="submitting">
              <span *ngIf="submitting && saveTargetStatus === 'draft'" class="spinner-inline"></span>
              <span>{{ 'PORTAL.EVENT_EDITOR.SAVE_DRAFT_BTN' | translate }}</span>
            </button>
            <button type="button" class="btn btn-primary" (click)="publishListing()" [disabled]="submitting">
              <span *ngIf="submitting && saveTargetStatus === 'published'" class="spinner-inline"></span>
              <span>{{ (isEditMode && !isDraft ? 'PORTAL.EVENT_EDITOR.SAVE_UPDATE_BTN' : 'PORTAL.EVENT_EDITOR.PUBLISH_BTN') | translate }}</span>
            </button>
          </ng-container>
        </div>
      </header>

      <!-- Error / Notification Banners -->
      <div *ngIf="errorMessage" class="alert alert-danger" role="alert">
        <div class="alert-icon">⚠️</div>
        <div class="alert-message">{{ errorMessage }}</div>
        <button type="button" class="alert-close" (click)="errorMessage = null" [attr.aria-label]="'PORTAL.LISTINGS.DISMISS_ALERT' | translate">✕</button>
      </div>

      <!-- Past Event Read-Only Notice -->
      <div *ngIf="isPastEvent" class="alert alert-warning" role="alert">
        <div class="alert-icon">🕒</div>
        <div class="alert-message">
          <strong>{{ 'PORTAL.EVENT_EDITOR.PAST_EVENT_LOCKED_TITLE' | translate }}</strong>
          <span>{{ 'PORTAL.EVENT_EDITOR.PAST_EVENT_LOCKED_MSG' | translate }}</span>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" (click)="copyPastEvent()" [disabled]="submitting">
          {{ 'PORTAL.EVENT_EDITOR.COPY_AS_NEW_BTN' | translate }}
        </button>
      </div>

      <!-- Date-Lock Warning for published events starting in <24 hours -->
      <div *ngIf="datesLocked && !isPastEvent" class="alert alert-warning" role="alert">
        <div class="alert-icon">🔒</div>
        <div class="alert-message">
          <strong>{{ 'PORTAL.EVENT_EDITOR.SCHEDULE_LOCKED_TITLE' | translate }}</strong> {{ 'PORTAL.EVENT_EDITOR.SCHEDULE_LOCKED_MSG' | translate }}
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
                <h2 class="section-title">{{ 'PORTAL.EVENT_EDITOR.STEP_1_TITLE' | translate }}</h2>
                <p class="section-desc">{{ 'PORTAL.EVENT_EDITOR.STEP_1_DESC' | translate }}</p>
              </div>
            </div>

            <div class="form-body">
              <!-- Title -->
              <div class="form-group">
                <label for="event-name" class="form-label required">{{ 'PORTAL.EVENT_EDITOR.NAME_LABEL' | translate }}</label>
                <input
                  id="event-name"
                  type="text"
                  class="form-control"
                  [placeholder]="'PORTAL.EVENT_EDITOR.NAME_PLACEHOLDER' | translate"
                  [(ngModel)]="draft.name"
                  (ngModelChange)="markDirty()"
                  maxlength="100"
                  required
                />
                <div class="field-footer">
                  <span class="form-hint">{{ 'PORTAL.EVENT_EDITOR.NAME_HINT' | translate }}</span>
                  <span class="char-count">{{ (draft.name || '').length }}/100</span>
                </div>
              </div>

              <!-- Category -->
              <div class="form-group">
                <label class="form-label required">{{ 'PORTAL.EVENT_EDITOR.CATEGORY_LABEL' | translate }}</label>
                <p class="form-hint">{{ 'PORTAL.EVENT_EDITOR.CATEGORY_HINT' | translate }}</p>
                <div class="category-grid">
                  <button
                    type="button"
                    *ngFor="let cat of categories"
                    class="category-card-btn"
                    [class.selected]="draft.category === cat.value"
                    (click)="setCategory(cat.value)"
                  >
                    <span class="cat-emoji">{{ cat.emoji }}</span>
                    <span class="cat-label">{{ 'CATEGORIES.' + cat.value.toUpperCase() | translate }}</span>
                  </button>
                </div>
              </div>

              <!-- Description -->
              <div class="form-group">
                <label for="event-desc" class="form-label required">{{ 'PORTAL.EVENT_EDITOR.DESC_LABEL' | translate }}</label>
                <textarea
                  id="event-desc"
                  rows="4"
                  class="form-control form-textarea"
                  [placeholder]="'PORTAL.EVENT_EDITOR.DESC_PLACEHOLDER' | translate"
                  [(ngModel)]="draft.description"
                  (ngModelChange)="markDirty()"
                ></textarea>
                <div class="field-footer">
                  <span class="form-hint">{{ 'PORTAL.EVENT_EDITOR.DESC_HINT' | translate }}</span>
                  <span class="char-count">{{ (draft.description || '').length }} {{ 'PORTAL.EVENT_EDITOR.CHARS' | translate }}</span>
                </div>
              </div>
            </div>
          </section>

          <!-- SECTION 2: Media & Images -->
          <section class="form-section card">
            <div class="section-header">
              <span class="section-step-num">2</span>
              <div>
                <div style="display: flex; align-items: baseline; gap: 4px;">
                  <h2 class="section-title">{{ 'PORTAL.EVENT_EDITOR.STEP_2_TITLE' | translate }}</h2>
                  <span class="required-star">*</span>
                </div>
                <p class="section-desc">{{ 'PORTAL.EVENT_EDITOR.STEP_2_DESC' | translate }}</p>
              </div>
            </div>

            <div class="form-body">
              <!-- Gallery Preview Grid -->
              <div class="gallery-preview-grid">
                <!-- Existing Images -->
                <div *ngFor="let img of existingImages; let idx = index" class="photo-preview-card">
                  <img [src]="img.url" [alt]="'PORTAL.EVENT_EDITOR.ALT_EXISTING' | translate" class="preview-img" />
                  <span *ngIf="idx === 0 && selectedNewFiles.length === 0" class="cover-badge">{{ 'PORTAL.EVENT_EDITOR.COVER_BADGE' | translate }}</span>
                  <button type="button" class="remove-photo-btn" (click)="removeExistingImage(img)" [disabled]="isPastEvent" [title]="'PORTAL.EVENT_EDITOR.REMOVE_PHOTO' | translate">✕</button>
                </div>

                <!-- Newly Selected Local Files -->
                <div *ngFor="let preview of newFilePreviews; let idx = index" class="photo-preview-card">
                  <img [src]="preview" [alt]="'PORTAL.EVENT_EDITOR.ALT_NEW' | translate" class="preview-img" />
                  <span *ngIf="existingImages.length === 0 && idx === 0" class="cover-badge">{{ 'PORTAL.EVENT_EDITOR.COVER_BADGE' | translate }}</span>
                  <button type="button" class="remove-photo-btn" (click)="removeNewFile(idx)" [disabled]="isPastEvent" [title]="'PORTAL.EVENT_EDITOR.REMOVE_PHOTO' | translate">✕</button>
                </div>

                <!-- Upload Dropzone Button -->
                <label class="upload-dropzone-btn" *ngIf="!isPastEvent">
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
                    <div style="display: flex; align-items: baseline; gap: 4px;">
                      <span class="dropzone-label">{{ 'PORTAL.EVENT_EDITOR.ADD_PHOTOS' | translate }}</span>
                      <span class="required-star">*</span>
                    </div>
                    <span class="dropzone-hint">{{ 'PORTAL.EVENT_EDITOR.PHOTO_FORMATS' | translate }}</span>
                  </div>
                </label>
              </div>
              <p class="form-hint mt-2">
                {{ 'PORTAL.EVENT_EDITOR.MEDIA_HINT' | translate }}
              </p>
            </div>
          </section>

          <!-- SECTION 3: Schedule & Timing -->
          <section class="form-section card">
            <div class="section-header">
              <span class="section-step-num">3</span>
              <div>
                <h2 class="section-title">{{ 'PORTAL.EVENT_EDITOR.STEP_3_TITLE' | translate }}</h2>
                <p class="section-desc">{{ 'PORTAL.EVENT_EDITOR.STEP_3_DESC' | translate }}</p>
              </div>
            </div>

            <div class="form-body">
              <!-- Mode Selector -->
              <div class="form-group">
                <label class="form-label required">{{ 'PORTAL.EVENT_EDITOR.SCHEDULE_TYPE_LABEL' | translate }}</label>
                <div class="schedule-type-toggle">
                  <button
                    type="button"
                    class="type-tab-btn"
                    [class.active]="draft.mode === 'single'"
                    [disabled]="datesLocked || isPastEvent"
                    (click)="setMode('single')"
                  >
                    {{ 'PORTAL.EVENT_EDITOR.MODE_SINGLE_TAB' | translate }}
                  </button>
                  <button
                    type="button"
                    class="type-tab-btn"
                    [class.active]="draft.mode === 'recurring'"
                    [disabled]="datesLocked || isPastEvent"
                    (click)="setMode('recurring')"
                  >
                    {{ 'PORTAL.EVENT_EDITOR.MODE_RECURRING_TAB' | translate }}
                  </button>
                </div>
              </div>

              <!-- SINGLE MODE: Date Pickers -->
              <div *ngIf="draft.mode === 'single'" class="single-mode-fields">
                <div class="form-row">
                  <div class="form-group flex-1">
                    <label for="start-date" class="form-label required">{{ 'PORTAL.EVENT_EDITOR.START_DATE_LABEL' | translate }}</label>
                    <input
                      id="start-date"
                      type="date"
                      class="form-control"
                      [min]="minStartDate"
                      [(ngModel)]="draft.startDate"
                      [disabled]="datesLocked || isPastEvent"
                      (ngModelChange)="onStartDateChange()"
                      required
                    />
                    <div *ngIf="scheduleErrors['startDate']" class="field-inline-error">
                      {{ scheduleErrors['startDate'] | translate }}
                    </div>
                  </div>

                  <div class="form-group flex-1" *ngIf="multiDay">
                    <label for="end-date" class="form-label required">{{ 'PORTAL.EVENT_EDITOR.END_DATE_LABEL' | translate }}</label>
                    <input
                      id="end-date"
                      type="date"
                      class="form-control"
                      [min]="draft.startDate || minStartDate"
                      [(ngModel)]="draft.endDate"
                      [disabled]="datesLocked || isPastEvent"
                      (ngModelChange)="onEndDateChange()"
                      required
                    />
                    <div *ngIf="scheduleErrors['endDate']" class="field-inline-error">
                      {{ scheduleErrors['endDate'] | translate }}
                    </div>
                  </div>
                </div>

                <!-- Multi-Day Toggle -->
                <div class="toggle-row">
                  <label class="toggle-control">
                    <input
                      type="checkbox"
                      [checked]="multiDay"
                      [disabled]="datesLocked || isPastEvent"
                      (change)="toggleMultiDay()"
                    />
                    <span class="toggle-switch"></span>
                    <span class="toggle-text">{{ 'PORTAL.EVENT_EDITOR.MULTI_DAY_LABEL' | translate }}</span>
                  </label>
                </div>
              </div>

              <!-- RECURRING MODE: Weekdays Picker -->
              <div *ngIf="draft.mode === 'recurring'" class="recurring-mode-fields">
                <label class="form-label required">{{ 'PORTAL.EVENT_EDITOR.WEEKDAYS_LABEL' | translate }}</label>
                <p class="form-hint">{{ 'PORTAL.EVENT_EDITOR.WEEKDAYS_HINT' | translate }}</p>
                <div class="weekday-pill-grid">
                  <button
                    type="button"
                    *ngFor="let day of allWeekdays"
                    class="weekday-pill-btn"
                    [class.selected]="isDaySelected(day.key)"
                    [disabled]="datesLocked || isPastEvent"
                    (click)="toggleDay(day.key)"
                  >
                    {{ 'EVENTS.RECURRING.DAYS.' + day.key | translate }}
                  </button>
                </div>
                <div *ngIf="scheduleErrors['recurring']" class="field-inline-error">
                  {{ scheduleErrors['recurring'] | translate }}
                </div>
              </div>

              <!-- TIME WINDOW SECTION -->
              <div class="time-section mt-4">
                <div class="toggle-row mb-3">
                  <label class="toggle-control">
                    <input
                      type="checkbox"
                      [checked]="draft.allDay"
                      [disabled]="datesLocked || isPastEvent"
                      (change)="toggleAllDay()"
                    />
                    <span class="toggle-switch"></span>
                    <span class="toggle-text">{{ 'PORTAL.EVENT_EDITOR.ALL_DAY_LABEL' | translate }}</span>
                  </label>
                </div>

                <div *ngIf="!draft.allDay" class="time-inputs-row">
                  <div class="form-group flex-1">
                    <label for="time-from" class="form-label required">{{ 'PORTAL.EVENT_EDITOR.START_TIME_LABEL' | translate }}</label>
                    <input
                      id="time-from"
                      type="time"
                      class="form-control"
                      [(ngModel)]="draft.from"
                      [disabled]="datesLocked || isPastEvent"
                      (ngModelChange)="onTimeChange()"
                      required
                    />
                    <div *ngIf="scheduleErrors['from']" class="field-inline-error">
                      {{ scheduleErrors['from'] | translate }}
                    </div>
                  </div>

                  <div class="form-group flex-1" *ngIf="!draft.openEnd">
                    <label for="time-to" class="form-label required">{{ 'PORTAL.EVENT_EDITOR.END_TIME_LABEL' | translate }}</label>
                    <input
                      id="time-to"
                      type="time"
                      class="form-control"
                      [(ngModel)]="draft.to"
                      [disabled]="datesLocked || isPastEvent"
                      (ngModelChange)="onTimeChange()"
                      required
                    />
                    <div *ngIf="scheduleErrors['to']" class="field-inline-error">
                      {{ scheduleErrors['to'] | translate }}
                    </div>
                  </div>
                </div>

                <div *ngIf="!draft.allDay" class="toggle-row">
                  <label class="toggle-control">
                    <input
                      type="checkbox"
                      [checked]="draft.openEnd"
                      [disabled]="datesLocked || isPastEvent"
                      (change)="toggleOpenEnd()"
                    />
                    <span class="toggle-switch"></span>
                    <span class="toggle-text">{{ 'PORTAL.EVENT_EDITOR.OPEN_END_LABEL' | translate }}</span>
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
                <h2 class="section-title">{{ 'PORTAL.EVENT_EDITOR.STEP_4_TITLE' | translate }}</h2>
                <p class="section-desc">{{ 'PORTAL.EVENT_EDITOR.STEP_4_DESC' | translate }}</p>
              </div>
            </div>

            <div class="form-body">
              <!-- Area Selector -->
              <div class="form-group">
                <label for="area-select" class="form-label required">{{ 'PORTAL.EVENT_EDITOR.AREA_LABEL' | translate }}</label>
                <select
                  id="area-select"
                  class="form-select"
                  [(ngModel)]="selectedAreaId"
                  (ngModelChange)="markDirty()"
                  required
                >
                  <option value="" disabled>{{ 'PORTAL.EVENT_EDITOR.AREA_PLACEHOLDER' | translate }}</option>
                  <option *ngFor="let area of availableAreas" [value]="area.id">
                    {{ area.emoji }} {{ area.name }}
                  </option>
                </select>
                <span class="form-hint">{{ 'PORTAL.EVENT_EDITOR.AREA_HINT' | translate }}</span>
              </div>

              <!-- Address Field -->
              <div class="form-group">
                <label for="event-address" class="form-label required">{{ 'PORTAL.EVENT_EDITOR.ADDRESS_LABEL' | translate }}</label>
                <input
                  id="event-address"
                  type="text"
                  class="form-control"
                  [placeholder]="'PORTAL.EVENT_EDITOR.ADDRESS_PLACEHOLDER' | translate"
                  [(ngModel)]="draft.address"
                  (ngModelChange)="markDirty()"
                  required
                />
              </div>

              <!-- Interactive Visual Map & Pin Location Picker -->
              <div class="location-picker-box">
                <div class="lp-header-row">
                  <div>
                    <label class="form-label mb-1">{{ 'PORTAL.EVENT_EDITOR.PIN_LABEL' | translate }}</label>
                    <p class="lp-subhint">{{ 'PORTAL.EVENT_EDITOR.PIN_HINT' | translate }}</p>
                  </div>
                  <div class="lp-quick-actions">
                    <button
                      type="button"
                      class="btn btn-sm btn-secondary"
                      *ngIf="providerLat !== null && providerLng !== null"
                      (click)="useBusinessLocation()"
                      [title]="'PORTAL.EVENT_EDITOR.USE_BUSINESS_LOC_TITLE' | translate"
                    >
                      {{ 'PORTAL.EVENT_EDITOR.USE_BUSINESS_LOC' | translate }}
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-secondary"
                      (click)="detectCurrentLocation()"
                      [disabled]="detectingLocation"
                      [title]="'PORTAL.EVENT_EDITOR.USE_MY_LOC_TITLE' | translate"
                    >
                      <span *ngIf="detectingLocation" class="spinner-inline mr-1"></span>
                      <span>{{ 'PORTAL.EVENT_EDITOR.USE_MY_LOC' | translate }}</span>
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-ghost"
                      *ngIf="lat !== null && lng !== null"
                      (click)="clearLocation()"
                      [title]="'PORTAL.EVENT_EDITOR.CLEAR_PIN_TITLE' | translate"
                    >
                      {{ 'PORTAL.EVENT_EDITOR.CLEAR_PIN' | translate }}
                    </button>
                  </div>
                </div>

                <!-- Geolocation error alert if any -->
                <div *ngIf="locationError" class="lp-error-banner">
                  <span>⚠️ {{ locationError }}</span>
                  <button type="button" class="btn-text-close" (click)="locationError = null">✕</button>
                </div>

                <!-- Interactive Map Container -->
                <div class="lp-map-wrapper">
                  <div #mapContainer id="listing-map-canvas" class="lp-map"></div>

                  <!-- Overlay prompt if no pin set -->
                  <div *ngIf="lat === null || lng === null" class="lp-map-overlay" (click)="focusMap()">
                    <div class="lp-overlay-content">
                      <span class="lp-overlay-icon">📍</span>
                      <div>
                        <strong>{{ 'PORTAL.EVENT_EDITOR.NO_PIN_TITLE' | translate }}</strong>
                        <p>{{ 'PORTAL.EVENT_EDITOR.NO_PIN_DESC' | translate }}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Location Status & Coordinates Accordion -->
                <div class="lp-status-bar">
                  <div class="lp-status-left">
                    <span class="status-indicator-dot" [class.active]="lat !== null && lng !== null"></span>
                    <span *ngIf="lat !== null && lng !== null" class="lp-coords-summary">
                      <strong>{{ 'PORTAL.EVENT_EDITOR.PINNED_PREFIX' | translate }}</strong> {{ lat | number:'1.4-4' }}, {{ lng | number:'1.4-4' }}
                      <span *ngIf="draft.address" class="lp-address-preview">({{ draft.address }})</span>
                    </span>
                    <span *ngIf="lat === null || lng === null" class="lp-coords-empty">
                      {{ 'PORTAL.EVENT_EDITOR.NO_COORDS_PINNED' | translate }}
                    </span>
                  </div>

                  <div class="lp-status-right">
                    <a
                      *ngIf="lat && lng"
                      [href]="getGoogleMapsUrl()"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="btn btn-sm btn-ghost map-preview-link"
                    >
                      {{ 'PORTAL.EVENT_EDITOR.GOOGLE_MAPS_LINK' | translate }}
                    </a>
                    <button
                      type="button"
                      class="btn btn-sm btn-ghost coords-toggle-btn"
                      (click)="showManualCoords = !showManualCoords"
                    >
                      {{ (showManualCoords ? 'PORTAL.EVENT_EDITOR.HIDE_COORDS_BTN' : 'PORTAL.EVENT_EDITOR.MANUAL_COORDS_BTN') | translate }}
                    </button>
                  </div>
                </div>

                <!-- Manual / Fine-Tune Coordinate Inputs (Collapsible) -->
                <div *ngIf="showManualCoords" class="manual-coords-panel mt-3">
                  <div class="form-row">
                    <div class="form-group flex-1">
                      <label for="coord-lat" class="form-label">{{ 'PORTAL.EVENT_EDITOR.LAT_LABEL' | translate }}</label>
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
                      <label for="coord-lng" class="form-label">{{ 'PORTAL.EVENT_EDITOR.LNG_LABEL' | translate }}</label>
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
                  <span class="form-hint">{{ 'PORTAL.EVENT_EDITOR.COORDS_HINT' | translate }}</span>
                </div>
              </div>
            </div>
          </section>

          <!-- SECTION 5: Pricing & Promotions -->
          <section class="form-section card">
            <div class="section-header">
              <span class="section-step-num">5</span>
              <div>
                <h2 class="section-title">{{ 'PORTAL.EVENT_EDITOR.STEP_5_TITLE' | translate }}</h2>
                <p class="section-desc">{{ 'PORTAL.EVENT_EDITOR.STEP_5_DESC' | translate }}</p>
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
                  {{ 'PORTAL.EVENT_EDITOR.FREE_TAB' | translate }}
                </button>
                <button
                  type="button"
                  class="pricing-tab-btn"
                  [class.active]="!draft.isFree && !draft.contactForPrice"
                  (click)="setPricingModel('paid')"
                >
                  {{ 'PORTAL.EVENT_EDITOR.PAID_TAB' | translate }}
                </button>
                <button
                  type="button"
                  class="pricing-tab-btn"
                  [class.active]="draft.contactForPrice"
                  (click)="setPricingModel('contact')"
                >
                  {{ 'PORTAL.EVENT_EDITOR.CONTACT_TAB' | translate }}
                </button>
              </div>

              <!-- Price & Currency Inputs when Paid -->
              <div *ngIf="!draft.isFree && !draft.contactForPrice" class="form-row mt-3">
                <div class="form-group flex-1">
                  <label for="price-input" class="form-label required">{{ 'PORTAL.EVENT_EDITOR.PRICE_LABEL' | translate }}</label>
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
                  <label for="currency-select" class="form-label required">{{ 'PORTAL.EVENT_EDITOR.CURRENCY_LABEL' | translate }}</label>
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
                    <span class="toggle-text"><strong>{{ 'PORTAL.EVENT_EDITOR.PROMOTION_TOGGLE' | translate }}</strong></span>
                  </label>
                </div>

                <div *ngIf="draft.hasPromotion" class="form-group mt-3">
                  <label for="promo-text" class="form-label required">{{ 'PORTAL.EVENT_EDITOR.PROMO_TEXT_LABEL' | translate }}</label>
                  <input
                    id="promo-text"
                    type="text"
                    class="form-control"
                    [placeholder]="'PORTAL.EVENT_EDITOR.PROMO_TEXT_PLACEHOLDER' | translate"
                    [(ngModel)]="draft.promoText"
                    (ngModelChange)="markDirty()"
                    maxlength="80"
                    required
                  />
                  <span class="form-hint">{{ 'PORTAL.EVENT_EDITOR.PROMO_TEXT_HINT' | translate }}</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Bottom Error Banner if save failed -->
          <div *ngIf="errorMessage" class="alert alert-danger mt-3" role="alert">
            <div class="alert-icon">⚠️</div>
            <div class="alert-message">{{ errorMessage }}</div>
            <button type="button" class="alert-close" (click)="errorMessage = null" [attr.aria-label]="'PORTAL.LISTINGS.DISMISS_ALERT' | translate">✕</button>
          </div>

          <!-- Synchronized Bottom Action Buttons (Visible across all viewports) -->
          <div class="bottom-actions card card-flat">
            <div class="bottom-actions-status">
              <span *ngIf="isDirty" class="unsaved-indicator">
                <span class="unsaved-dot"></span>
                <span>{{ 'PORTAL.EVENT_EDITOR.UNSAVED_CHANGES' | translate }}</span>
              </span>
              <span *ngIf="!isDirty && isEditMode" class="saved-indicator">
                <span>{{ 'PORTAL.EVENT_EDITOR.ALL_CHANGES_SAVED' | translate }}</span>
              </span>
            </div>

            <div class="bottom-actions-buttons">
              <button type="button" class="btn btn-secondary" (click)="onCancel()" [disabled]="submitting">
                {{ 'PORTAL.COMMON.CANCEL' | translate }}
              </button>
              <ng-container *ngIf="isPastEvent">
                <button type="button" class="btn btn-primary" (click)="copyPastEvent()" [disabled]="submitting">
                  <span *ngIf="submitting" class="spinner-inline"></span>
                  <span>{{ 'PORTAL.EVENT_EDITOR.COPY_AS_NEW_BTN' | translate }}</span>
                </button>
              </ng-container>
              <ng-container *ngIf="!isPastEvent">
                <button type="button" class="btn btn-secondary" (click)="saveDraft()" [disabled]="submitting">
                  <span *ngIf="submitting && saveTargetStatus === 'draft'" class="spinner-inline"></span>
                  <span>{{ 'PORTAL.EVENT_EDITOR.SAVE_DRAFT_BTN' | translate }}</span>
                </button>
                <button type="button" class="btn btn-primary" (click)="publishListing()" [disabled]="submitting">
                  <span *ngIf="submitting && saveTargetStatus === 'published'" class="spinner-inline"></span>
                  <span>{{ (isEditMode && !isDraft ? 'PORTAL.EVENT_EDITOR.SAVE_UPDATE_BTN' : 'PORTAL.EVENT_EDITOR.PUBLISH_BTN') | translate }}</span>
                </button>
              </ng-container>
            </div>
          </div>
        </main>

        <!-- Sticky App Preview Column (Right) -->
        <aside class="editor-preview-col">
          <div class="preview-card-sticky">
            <div class="preview-header-bar">
              <span class="preview-title">{{ 'PORTAL.EVENT_EDITOR.PREVIEW.TITLE' | translate }}</span>
              <span class="live-pill">{{ 'PORTAL.EVENT_EDITOR.PREVIEW.LIVE_SYNC' | translate }}</span>
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
                      [alt]="'PORTAL.EVENT_EDITOR.PREVIEW.COVER_ALT' | translate"
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
                        {{ draft.mode === 'recurring' ? ('PORTAL.EVENT_EDITOR.PREVIEW.RECURRING_TAG' | translate) : ('PORTAL.EVENT_EDITOR.PREVIEW.EVENT_TAG' | translate) }}
                      </span>
                      <span class="phone-provider-name">
                        {{ providerName }}
                      </span>
                    </div>

                    <h4 class="phone-title">
                      {{ draft.name || ('PORTAL.EVENT_EDITOR.PREVIEW.UNTITLED' | translate) }}
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
              {{ 'PORTAL.EVENT_EDITOR.PREVIEW.FOOTNOTE' | translate }}
            </p>
          </div>
        </aside>
      </div>

      <!-- Loading State for Initial Load -->
      <div *ngIf="loadingInitial" class="state-loading-card card">
        <div class="loading-spinner"></div>
        <p>{{ 'PORTAL.EVENT_EDITOR.LOADING_DETAILS' | translate }}</p>
      </div>

      <!-- Discard Changes Modal Dialog -->
      <div *ngIf="showCancelConfirmModal" class="modal-backdrop" role="dialog" aria-modal="true">
        <div class="modal-dialog">
          <div class="modal-content card">
            <div class="modal-header">
              <div class="warning-icon-bubble">⚠️</div>
              <h2 class="modal-title">{{ 'PORTAL.EVENT_EDITOR.DISCARD_DIALOG_TITLE' | translate }}</h2>
            </div>
            <div class="modal-body">
              <p class="modal-desc">
                {{ 'PORTAL.EVENT_EDITOR.DISCARD_DIALOG_DESC' | translate }}
              </p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="showCancelConfirmModal = false">
                {{ 'PORTAL.EVENT_EDITOR.KEEP_EDITING_BTN' | translate }}
              </button>
              <button type="button" class="btn btn-danger" (click)="confirmDiscardAndExit()">
                {{ 'PORTAL.EVENT_EDITOR.DISCARD_BTN' | translate }}
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

    .required-star {
      color: var(--vamo-danger);
      font-weight: 700;
      margin-left: 2px;
    }

    .field-inline-error {
      font-size: 0.8rem;
      color: var(--vamo-danger);
      margin-top: 4px;
      line-height: 1.3;
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

    /* Location Picker & Map Styles */
    .location-picker-box {
      background: var(--vamo-surface-subtle);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-lg);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .lp-header-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .lp-subhint {
      margin: 2px 0 0;
      font-size: 0.8rem;
      color: var(--vamo-text-muted);
    }

    .lp-quick-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .lp-error-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: var(--vamo-radius-md);
      font-size: 0.82rem;
      color: #dc2626;
    }

    .btn-text-close {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      font-size: 0.9rem;
      padding: 0 4px;
    }

    .lp-map-wrapper {
      position: relative;
      width: 100%;
      height: 280px;
      border-radius: var(--vamo-radius-md);
      overflow: hidden;
      border: 1px solid var(--vamo-border);
      background: #e2e8f0;
    }

    .lp-map {
      width: 100%;
      height: 100%;
      z-index: 1;
    }

    .lp-map-overlay {
      position: absolute;
      top: 12px;
      left: 12px;
      right: 12px;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(4px);
      color: #ffffff;
      padding: 10px 14px;
      border-radius: var(--vamo-radius-md);
      z-index: 500;
      cursor: pointer;
    }

    .lp-overlay-content {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.82rem;
    }

    .lp-overlay-content strong {
      display: block;
      color: #ffffff;
    }

    .lp-overlay-content p {
      margin: 2px 0 0;
      opacity: 0.85;
      font-size: 0.78rem;
    }

    .lp-overlay-icon {
      font-size: 1.2rem;
    }

    .lp-status-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      flex-wrap: wrap;
    }

    .lp-status-left {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.82rem;
    }

    .status-indicator-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #94a3b8;
    }

    .status-indicator-dot.active {
      background: #10b981;
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
    }

    .lp-coords-summary {
      color: var(--vamo-text);
    }

    .lp-coords-empty {
      color: var(--vamo-text-muted);
    }

    .lp-address-preview {
      color: var(--vamo-text-muted);
      margin-left: 4px;
    }

    .lp-status-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .coords-toggle-btn {
      font-size: 0.8rem;
    }

    .manual-coords-panel {
      padding: 14px;
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
    }

    /* Custom VAMO Pin Icon on Leaflet Map */
    :host ::ng-deep .custom-vamo-pin-wrap {
      background: transparent !important;
      border: none !important;
    }

    :host ::ng-deep .vamo-pin-bubble {
      display: flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.35));
      cursor: grab;
      transition: transform 0.15s ease;
    }

    :host ::ng-deep .vamo-pin-bubble:hover {
      transform: scale(1.12);
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

    /* Synchronized Bottom Actions (Always visible at end of form) */
    .bottom-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 20px;
      margin-top: 24px;
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-lg);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    .bottom-actions-status {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .bottom-actions-buttons {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .unsaved-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.82rem;
      color: #b45309;
      font-weight: 500;
    }

    .unsaved-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #f59e0b;
      display: inline-block;
    }

    .saved-indicator {
      font-size: 0.82rem;
      color: #059669;
      font-weight: 500;
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
    }

    @media (max-width: 640px) {
      .bottom-actions {
        flex-direction: column;
        align-items: stretch;
      }

      .bottom-actions-buttons {
        flex-direction: column;
        width: 100%;
      }

      .bottom-actions-buttons .btn {
        width: 100%;
      }
    }
  `],
})
export class ListingEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: false }) mapContainer?: ElementRef<HTMLDivElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private businessService = inject(BusinessService);
  private customerErrorService = inject(CustomerErrorService);
  private cdr = inject(ChangeDetectorRef);
  private i18n = inject(I18nService);

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

  // Past event and schedule locks
  originalEvent: VamoEvent | null = null;
  isPastEvent = false;
  datesLocked = false;
  originalStartDate: string | null = null;
  scheduleErrors: Record<string, string | undefined> = {};

  get minStartDate(): string {
    const drToday = this.businessService.drTodayStr();
    if (this.isEditMode && this.originalEvent?.startDate) {
      if (this.originalEvent.startDate < drToday) {
        return this.originalEvent.startDate;
      }
    }
    return drToday;
  }

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
    promotionStart: null,
    address: '',
    recurring: { days: ['fri', 'sat'] },
  };

  multiDay = false;
  lat: number | null = null;
  lng: number | null = null;

  // Location Picker State
  showManualCoords = false;
  detectingLocation = false;
  locationError: string | null = null;
  mapError = false;
  private map: any = null;
  private marker: any = null;
  private mapInitialized = false;

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
      setTimeout(() => this.initMap(), 100);
    }
  }

  async ngAfterViewInit(): Promise<void> {
    if (!this.loadingInitial) {
      await this.initMap();
    }
  }

  ngOnDestroy(): void {
    if (this.map) {
      try {
        this.map.remove();
      } catch {}
      this.map = null;
    }
  }

  initNewDraft(): void {
    const today = this.businessService.drTodayStr();
    this.draft.startDate = today;
    this.draft.promotionStart = new Date().toISOString();
    this.draft.address = this.providerAddress;
    this.lat = this.providerLat;
    this.lng = this.providerLng;
    if (this.lat !== null && this.lng !== null) {
      this.draft.location_point = {
        type: 'Point',
        coordinates: [Number(this.lng), Number(this.lat)],
      };
    }
  }

  async loadExistingEvent(id: string): Promise<void> {
    this.loadingInitial = true;
    this.cdr.markForCheck();

    try {
      const event = await this.businessService.getEventById(id);
      this.originalEvent = event;
      this.isDraft = event.status === 'draft';
      this.originalStartDate = event.startDate || null;

      // Check if event is past (canonical rule: endDate || startDate < drToday or archived)
      this.isPastEvent = isEventPast(event, this.businessService);
      if (this.isPastEvent) {
        this.datesLocked = true;
      } else if (event.status === 'published' && event.startDate) {
        // Check 24h schedule lock for published events
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
        promotionStart: event.promotionStart ?? new Date().toISOString(),
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
      this.errorMessage = this.i18n.t('PORTAL.EVENT_EDITOR.VALIDATION.LOAD_FAILED');
      this.initNewDraft();
    } finally {
      this.loadingInitial = false;
      this.cdr.markForCheck();
      setTimeout(() => this.initMap(), 100);
    }
  }

  markDirty(): void {
    this.isDirty = true;
  }

  setCategory(catValue: string): void {
    this.draft.category = catValue;
    this.markDirty();
  }

  validateCurrentSchedule(isPublish = false): boolean {
    const res = validateEventSchedule({
      ...this.draft,
      endDate: this.multiDay ? this.draft.endDate : undefined,
    }, isPublish, {
      originalEvent: this.isEditMode ? this.originalEvent : undefined,
      todayStr: this.businessService.drTodayStr(),
    });
    // A checked multi-day form must also require its end date when publishing.
    if (isPublish && this.draft.mode !== 'recurring' && this.multiDay && !this.draft.endDate && res.valid) {
      res.valid = false;
      res.field = 'endDate';
      res.errorCode = 'END_DATE_REQUIRED';
    }
    this.scheduleErrors = {};
    if (!res.valid && res.field && res.errorCode) {
      this.scheduleErrors[res.field] = scheduleErrorMessageKey(res.errorCode);
    }
    return res.valid;
  }

  async copyPastEvent(): Promise<void> {
    if (!this.originalEvent) return;
    this.submitting = true;
    this.cdr.markForCheck();
    try {
      const newId = await this.businessService.duplicateEventAsDraft(this.originalEvent);
      this.router.navigate(['/app/listings/edit', newId]);
    } catch (err: any) {
      this.errorMessage = this.customerErrorService.toCustomerMessage(err, 'save');
    } finally {
      this.submitting = false;
      this.cdr.markForCheck();
    }
  }

  setMode(mode: 'single' | 'recurring'): void {
    if (this.datesLocked || this.isPastEvent) return;
    this.draft.mode = mode;
    this.markDirty();
    this.validateCurrentSchedule(false);
  }

  onStartDateChange(): void {
    this.markDirty();
    this.validateCurrentSchedule(false);
  }

  onEndDateChange(): void {
    this.markDirty();
    this.validateCurrentSchedule(false);
  }

  onTimeChange(): void {
    this.markDirty();
    this.validateCurrentSchedule(false);
  }

  toggleMultiDay(): void {
    if (this.datesLocked || this.isPastEvent) return;
    this.multiDay = !this.multiDay;
    if (!this.multiDay) {
      this.draft.endDate = null;
    }
    this.markDirty();
    this.validateCurrentSchedule(false);
  }

  toggleAllDay(): void {
    if (this.datesLocked || this.isPastEvent) return;
    this.draft.allDay = !this.draft.allDay;
    this.markDirty();
    this.validateCurrentSchedule(false);
  }

  toggleOpenEnd(): void {
    if (this.datesLocked || this.isPastEvent) return;
    this.draft.openEnd = !this.draft.openEnd;
    if (this.draft.openEnd) {
      this.draft.to = null;
    }
    this.markDirty();
    this.validateCurrentSchedule(false);
  }

  isDaySelected(dayKey: string): boolean {
    const days = (this.draft.recurring as any)?.days;
    return Array.isArray(days) && days.includes(dayKey);
  }

  toggleDay(dayKey: string): void {
    if (this.datesLocked || this.isPastEvent) return;
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
    this.validateCurrentSchedule(false);
  }

  async initMap(): Promise<void> {
    if (this.mapInitialized || typeof window === 'undefined') return;

    const container = this.mapContainer?.nativeElement || document.getElementById('listing-map-canvas');
    if (!container) {
      setTimeout(() => this.initMap(), 150);
      return;
    }

    try {
      const L = await this.loadLeaflet();
      if (!L || this.map) return;

      const initialLat = this.lat ?? this.providerLat ?? 19.3175;
      const initialLng = this.lng ?? this.providerLng ?? -69.5422;
      const initialZoom = this.lat !== null && this.lng !== null ? 15 : 12;

      this.map = L.map(container, {
        center: [initialLat, initialLng],
        zoom: initialZoom,
        zoomControl: true,
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      }).addTo(this.map);

      this.mapInitialized = true;

      const vamoIcon = L.divIcon({
        className: 'custom-vamo-pin-wrap',
        html: `<div class="vamo-pin-bubble"><svg width="28" height="34" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 30 12 30C12 30 24 21 24 12C24 5.37 18.63 0 12 0Z" fill="#6366f1"/>
          <circle cx="12" cy="11" r="5" fill="#ffffff"/>
          <circle cx="12" cy="11" r="2.5" fill="#6366f1"/>
        </svg></div>`,
        iconSize: [28, 34],
        iconAnchor: [14, 34],
      });

      if (this.lat !== null && this.lng !== null) {
        this.marker = L.marker([this.lat, this.lng], { icon: vamoIcon, draggable: true }).addTo(this.map);
        this.marker.on('dragend', () => {
          const pos = this.marker.getLatLng();
          this.setCoordinates(parseFloat(pos.lat.toFixed(6)), parseFloat(pos.lng.toFixed(6)), false);
        });
      }

      this.map.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        this.setCoordinates(parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6)), true);
      });

      setTimeout(() => this.map?.invalidateSize(), 200);
      setTimeout(() => this.map?.invalidateSize(), 600);
    } catch (err) {
      console.warn('[ListingEditor] Leaflet map init failed or blocked:', err);
      this.mapError = true;
    }
  }

  private loadLeaflet(): Promise<any> {
    if (typeof window === 'undefined') return Promise.reject('No window');
    if ((window as any).L) return Promise.resolve((window as any).L);

    return new Promise((resolve, reject) => {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => resolve((window as any).L);
      script.onerror = (e) => reject(e);
      document.head.appendChild(script);
    });
  }

  setCoordinates(lat: number, lng: number, updateMap = true): void {
    this.lat = lat;
    this.lng = lng;
    this.draft.location_point = {
      type: 'Point',
      coordinates: [lng, lat],
    };
    this.locationError = null;
    this.markDirty();

    if (this.map && (window as any).L) {
      const L = (window as any).L;
      const vamoIcon = L.divIcon({
        className: 'custom-vamo-pin-wrap',
        html: `<div class="vamo-pin-bubble"><svg width="28" height="34" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 30 12 30C12 30 24 21 24 12C24 5.37 18.63 0 12 0Z" fill="#6366f1"/>
          <circle cx="12" cy="11" r="5" fill="#ffffff"/>
          <circle cx="12" cy="11" r="2.5" fill="#6366f1"/>
        </svg></div>`,
        iconSize: [28, 34],
        iconAnchor: [14, 34],
      });

      if (this.marker) {
        this.marker.setLatLng([lat, lng]);
      } else {
        this.marker = L.marker([lat, lng], { icon: vamoIcon, draggable: true }).addTo(this.map);
        this.marker.on('dragend', () => {
          const pos = this.marker.getLatLng();
          this.setCoordinates(parseFloat(pos.lat.toFixed(6)), parseFloat(pos.lng.toFixed(6)), false);
        });
      }

      if (updateMap) {
        this.map.setView([lat, lng], Math.max(this.map.getZoom(), 14));
      }
    }

    this.cdr.markForCheck();
  }

  useBusinessLocation(): void {
    if (this.providerLat !== null && this.providerLng !== null) {
      this.setCoordinates(this.providerLat, this.providerLng, true);
      if (!this.draft.address && this.providerAddress) {
        this.draft.address = this.providerAddress;
      }
    }
  }

  detectCurrentLocation(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.locationError = this.i18n.t('PORTAL.EVENT_EDITOR.VALIDATION.GEO_NOT_SUPPORTED');
      return;
    }

    this.detectingLocation = true;
    this.locationError = null;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.detectingLocation = false;
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        this.setCoordinates(lat, lng, true);
        this.cdr.markForCheck();
      },
      (err) => {
        this.detectingLocation = false;
        console.warn('[ListingEditor] Geolocation error code:', err?.code);
        this.locationError = this.i18n.t('PORTAL.EVENT_EDITOR.VALIDATION.GEO_FAILED');
        this.cdr.markForCheck();
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  clearLocation(): void {
    this.lat = null;
    this.lng = null;
    this.draft.location_point = null;
    if (this.marker) {
      this.marker.remove();
      this.marker = null;
    }
    this.markDirty();
    this.cdr.markForCheck();
  }

  focusMap(): void {
    if (this.map) {
      this.map.invalidateSize();
    }
  }

  onCoordChange(): void {
    this.markDirty();
    if (this.lat !== null && this.lng !== null) {
      this.setCoordinates(Number(this.lat), Number(this.lng), true);
    } else {
      this.clearLocation();
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

    if (this.isPastEvent) {
      this.errorMessage = this.i18n.t('PORTAL.LISTINGS.ERRORS.PAST_EVENT_NO_EDIT');
      return false;
    }

    if (!this.draft.name?.trim()) {
      this.errorMessage = this.i18n.t('PORTAL.EVENT_EDITOR.VALIDATION.NAME_REQUIRED');
      return false;
    }

    if (!this.draft.category) {
      this.errorMessage = this.i18n.t('PORTAL.EVENT_EDITOR.VALIDATION.CATEGORY_REQUIRED');
      return false;
    }

    if (!this.draft.description?.trim() || this.draft.description.trim().length < 10) {
      this.errorMessage = this.i18n.t('PORTAL.EVENT_EDITOR.VALIDATION.DESC_MIN');
      return false;
    }

    if (!this.validateCurrentSchedule(forPublish)) {
      const key = Object.values(this.scheduleErrors).find(Boolean);
      if (key) this.errorMessage = this.i18n.t(key);
      return false;
    }
    if (forPublish) {
      const validation = validateEventForPublish({
        ...this.draft,
        endDate: this.multiDay ? this.draft.endDate : undefined,
      }, {
        originalEvent: this.isEditMode ? this.originalEvent : undefined,
        hasImages: this.existingImages.length > 0 || this.selectedNewFiles.length > 0,
        areaIds: this.selectedAreaId ? [this.selectedAreaId] : [],
        todayStr: this.businessService.drTodayStr(),
      });
      if (!validation.valid) {
        this.errorMessage = this.i18n.t(validation.messageKey);
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
    if (this.isPastEvent) {
      this.errorMessage = this.i18n.t('PORTAL.LISTINGS.ERRORS.PAST_EVENT_NO_EDIT');
      return;
    }

    const user = this.authService.currentUser;
    const providerId = user?.provider_link?.id;
    if (!providerId) {
      this.errorMessage = this.i18n.t('PORTAL.EVENT_EDITOR.VALIDATION.NO_PROVIDER');
      return;
    }

    this.submitting = true;
    this.saveTargetStatus = status;
    this.cdr.markForCheck();

    try {
      if (this.isEditMode && this.eventId) {
        // Guard direct editor route: re-check before update so expiring events cannot be modified
        const fresh = await this.businessService.getEventById(this.eventId);
        if (isEventPast(fresh, this.businessService)) {
          this.isPastEvent = true;
          this.datesLocked = true;
          this.errorMessage = this.i18n.t('PORTAL.LISTINGS.ERRORS.PAST_EVENT_NO_EDIT');
          this.submitting = false;
          this.cdr.markForCheck();
          return;
        }
      }

      // Revalidate all fields against the current DR clock right before write.
      if (!this.validateForm(status === 'published')) {
        this.submitting = false;
        this.cdr.markForCheck();
        return;
      }

      const payload: Partial<VamoEvent> = {
        name: this.draft.name ?? undefined,
        category: this.draft.category ?? undefined,
        description: this.draft.description ?? undefined,
        mode: this.draft.mode!,
        status,
        startDate: this.draft.startDate || undefined,
        endDate: this.multiDay ? (this.draft.endDate || undefined) : undefined,
        allDay: this.draft.allDay,
        openEnd: this.draft.openEnd,
        from: this.draft.allDay ? undefined : (this.draft.from || undefined),
        to: this.draft.openEnd ? undefined : (this.draft.to || undefined),
        recurring: this.draft.mode === 'recurring' ? this.draft.recurring : { days: [] },
        ...(this.isEditMode ? {} : {
          promotionStart: this.draft.promotionStart || new Date().toISOString(),
        }),
        isFree: this.draft.isFree,
        contactForPrice: this.draft.contactForPrice,
        price: this.draft.price,
        currency: this.draft.isFree ? undefined : this.draft.currency,
        hasPromotion: this.draft.hasPromotion,
        promoText: this.draft.promoText,
        address: this.draft.address ?? null,
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
          this.existingAreaJunctionIds,
          this.originalEvent || undefined
        );
      } else {
        await this.businessService.createEvent(
          payload,
          this.selectedNewFiles,
          areaIds
        );
      }

      this.isDirty = false;
      this.router.navigate(['/app/listings']);
    } catch (err: any) {
      this.errorMessage = this.customerErrorService.toCustomerMessage(err, 'save');
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
    if (!categoryKey) return this.i18n.t('CATEGORIES.OTHER');
    const key = 'CATEGORIES.' + categoryKey.toUpperCase();
    const translated = this.i18n.t(key);
    if (translated && !translated.startsWith('CATEGORIES.')) {
      return translated;
    }
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
    if (this.draft.isFree) return this.i18n.t('PORTAL.LISTINGS.FREE');
    if (this.draft.contactForPrice) return this.i18n.t('PORTAL.LISTINGS.CONTACT_FOR_PRICE');
    if (this.draft.price) {
      return `${this.draft.currency || 'USD'} $${Number(this.draft.price).toFixed(2)}`;
    }
    return this.i18n.t('PORTAL.LISTINGS.FREE');
  }

  formatPreviewSchedule(): string {
    if (this.draft.mode === 'recurring') {
      const days = (this.draft.recurring as any)?.days;
      if (Array.isArray(days) && days.length > 0) {
        const localizedDays = days.map((d: string) => {
          const shortKey = 'EVENTS.RECURRING.DAYS.' + d.toLowerCase();
          const translatedShort = this.i18n.t(shortKey);
          if (translatedShort && !translatedShort.startsWith('EVENTS.')) {
            return translatedShort;
          }
          return d.charAt(0).toUpperCase() + d.slice(1);
        }).join(', ');
        const everyPrefix = this.i18n.t('EVENTS.RECURRING.EVERY');
        return `${everyPrefix || 'Every'} ${localizedDays}`;
      }
      return this.i18n.t('PORTAL.LISTINGS.MODE_RECURRING');
    }
    if (!this.draft.startDate) return this.i18n.t('PORTAL.LISTINGS.DATE_TBA');
    const locale = this.i18n.dateLocale();
    try {
      const start = parseLocalDate(this.draft.startDate).toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      if (this.multiDay && this.draft.endDate) {
        const end = parseLocalDate(this.draft.endDate).toLocaleDateString(locale, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        return `${start} – ${end}`;
      }
      return start;
    } catch {
      return this.draft.startDate;
    }
  }

  formatPreviewTime(): string {
    if (this.draft.allDay) return this.i18n.t('PORTAL.LISTINGS.ALL_DAY');
    if (!this.draft.from) return '';
    if (this.draft.openEnd) return `${this.draft.from} · ${this.i18n.t('PORTAL.LISTINGS.OPEN_END')}`;
    return `${this.draft.from} – ${this.draft.to || ''}`;
  }
}
