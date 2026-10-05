import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { CustomerErrorService } from '../../core/services/customer-error.service';
import { I18nService, BUSINESS_TYPES } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Provider, OpeningHour } from '../../core/models/provider.model';

export interface BusinessTypeOption {
  value: string;
  label: string;
  icon?: string;
}

export interface OfferingOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-business-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe],
  template: `
    <div class="profile-container">
      <!-- ── Loading State ─────────────────────────────────────────────── -->
      <div *ngIf="loading()" class="state-card" role="status" aria-live="polite">
        <div class="spinner spinner-primary"></div>
        <h3 class="state-title">{{ 'PORTAL.PROFILE.LOADING_TITLE' | translate }}</h3>
        <p class="state-desc">{{ 'PORTAL.PROFILE.LOADING_DESC' | translate }}</p>
      </div>

      <!-- ── Error State ───────────────────────────────────────────────── -->
      <div *ngIf="!loading() && loadError()" class="alert alert-error" role="alert">
        <span>⚠️ {{ loadError() }}</span>
        <button type="button" class="btn btn-secondary btn-sm" (click)="loadProfile()">
          {{ 'PORTAL.COMMON.RETRY' | translate }}
        </button>
      </div>

      <!-- ── Main Profile Editor ───────────────────────────────────────── -->
      <div *ngIf="!loading() && provider()" class="profile-layout">
        <!-- ── Top Header & Actions Bar ───────────────────────────────── -->
        <header class="profile-header">
          <div class="header-titles">
            <div class="header-breadcrumbs">
              <span>{{ 'PORTAL.PROFILE.BREADCRUMB_MANAGE' | translate }}</span>
              <span class="bc-sep">/</span>
              <span class="bc-current">{{ 'PORTAL.PROFILE.BREADCRUMB_CURRENT' | translate }}</span>
            </div>
            <h1 class="header-main-title">{{ form().name || ('PORTAL.PROFILE.DEFAULT_TITLE' | translate) }}</h1>
            <p class="header-subtitle">
              {{ 'PORTAL.PROFILE.HEADER_SUBTITLE' | translate }}
            </p>
          </div>

          <div class="header-actions">
            <span *ngIf="isDirty()" class="unsaved-badge">
              <span class="status-dot"></span> {{ 'PORTAL.PROFILE.UNSAVED_CHANGES' | translate }}
            </span>
            <button
              type="button"
              class="btn btn-secondary"
              (click)="resetForm()"
              [disabled]="saving() || !isDirty()"
            >
              {{ 'PORTAL.PROFILE.DISCARD' | translate }}
            </button>
            <button
              type="button"
              class="btn btn-brand btn-save"
              (click)="saveProfile()"
              [disabled]="saving() || !isFormValid()"
            >
              <span *ngIf="saving()" class="spinner"></span>
              <span>{{ saving() ? ('PORTAL.PROFILE.SAVING_CHANGES' | translate) : ('PORTAL.PROFILE.SAVE_CHANGES' | translate) }}</span>
            </button>
          </div>
        </header>

        <!-- ── Feedback Banners ────────────────────────────────────────── -->
        <div *ngIf="saveSuccess()" class="alert alert-success" role="status">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <div class="alert-content">
            <strong>{{ 'PORTAL.PROFILE.SAVE_SUCCESS_TITLE' | translate }}</strong>
            <span>{{ 'PORTAL.PROFILE.SAVE_SUCCESS_MSG' | translate }}</span>
          </div>
        </div>

        <div *ngIf="saveError()" class="alert alert-error" role="alert">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div class="alert-content">
            <strong>{{ 'PORTAL.PROFILE.SAVE_ERROR_TITLE' | translate }}</strong>
            <span>{{ saveError() }}</span>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" (click)="saveProfile()">
            {{ 'PORTAL.ERRORS.TRY_AGAIN' | translate }}
          </button>
        </div>

        <!-- ── Two-Column Desktop Layout ───────────────────────────────── -->
        <div class="content-grid">
          <!-- ── Left Column: Form Sections ────────────────────────────── -->
          <div class="form-columns">
            <!-- 1. BUSINESS IDENTITY & CATEGORY -->
            <section class="card form-section" id="section-identity">
              <div class="card-header">
                <div>
                  <h2 class="card-title">{{ 'PORTAL.PROFILE.SECTION_IDENTITY_TITLE' | translate }}</h2>
                  <p class="card-desc">{{ 'PORTAL.PROFILE.SECTION_IDENTITY_DESC' | translate }}</p>
                </div>
                <span class="section-tag">{{ 'PORTAL.PROFILE.REQUIRED_TAG' | translate }}</span>
              </div>

              <div class="form-grid">
                <!-- Business Name -->
                <div class="form-group span-2">
                  <label class="form-label" for="field-name">
                    {{ 'PORTAL.PROFILE.NAME_LABEL' | translate }} <span class="required-star">*</span>
                  </label>
                  <input
                    id="field-name"
                    type="text"
                    class="form-control"
                    [class.is-invalid]="touched.name && !form().name.trim()"
                    [(ngModel)]="form().name"
                    (blur)="touched.name = true; markDirty()"
                    [placeholder]="'PORTAL.PROFILE.NAME_PLACEHOLDER' | translate"
                  />
                  <p *ngIf="touched.name && !form().name.trim()" class="form-error">
                    {{ 'PORTAL.PROFILE.NAME_REQUIRED' | translate }}
                  </p>
                </div>

                <!-- Business Type (Non-editable after onboarding) -->
                <div class="form-group span-2">
                  <label class="form-label" for="field-type">
                    {{ 'PORTAL.PROFILE.CATEGORY_LABEL' | translate }}
                  </label>
                  <select
                    id="field-type"
                    class="form-control"
                    [ngModel]="form().business_type"
                    disabled
                  >
                    <option value="" disabled>{{ 'PORTAL.PROFILE.CATEGORY_SELECT_PLACEHOLDER' | translate }}</option>
                    <option *ngFor="let bt of businessTypes" [value]="bt.value">
                      {{ bt.label }}
                    </option>
                  </select>
                  <p class="form-hint">
                    {{ 'PORTAL.PROFILE.CATEGORY_LOCKED_HINT' | translate }}
                  </p>
                </div>

                <!-- Category Offerings (Conditional) -->
                <div *ngIf="currentOfferingChoices.length > 0" class="form-group span-2">
                  <label class="form-label">
                    {{ 'PORTAL.PROFILE.OFFERINGS_LABEL' | translate }}
                  </label>
                  <p class="form-hint">{{ 'PORTAL.PROFILE.OFFERINGS_HINT' | translate }}</p>
                  <div class="chips-container">
                    <button
                      *ngFor="let choice of currentOfferingChoices"
                      type="button"
                      class="chip-btn"
                      [class.chip-active]="isOfferingSelected(choice.value)"
                      (click)="toggleOffering(choice.value)"
                    >
                      <span *ngIf="isOfferingSelected(choice.value)" class="chip-check">✓</span>
                      <span>{{ choice.label }}</span>
                    </button>
                  </div>
                </div>

                <!-- Description -->
                <div class="form-group span-2">
                  <label class="form-label" for="field-desc">
                    {{ 'PORTAL.PROFILE.DESC_LABEL' | translate }} <span class="required-star">*</span>
                  </label>
                  <textarea
                    id="field-desc"
                    class="form-control form-textarea"
                    [class.is-invalid]="touched.description && !form().description.trim()"
                    [(ngModel)]="form().description"
                    (blur)="touched.description = true; markDirty()"
                    rows="4"
                    [placeholder]="'PORTAL.PROFILE.DESC_PLACEHOLDER' | translate"
                  ></textarea>
                  <div class="desc-footer">
                    <p *ngIf="touched.description && !form().description.trim()" class="form-error">
                      {{ 'PORTAL.PROFILE.DESC_REQUIRED' | translate }}
                    </p>
                    <span class="char-count">{{ form().description.length || 0 }} {{ 'PORTAL.PROFILE.CHARACTERS' | translate }}</span>
                  </div>
                </div>
              </div>
            </section>

            <!-- 2. BRANDING & MEDIA -->
            <section class="card form-section" id="section-media">
              <div class="card-header">
                <div>
                  <h2 class="card-title">{{ 'PORTAL.PROFILE.SECTION_BRANDING_TITLE' | translate }}</h2>
                  <p class="card-desc">{{ 'PORTAL.PROFILE.SECTION_BRANDING_DESC' | translate }}</p>
                </div>
              </div>

              <!-- Logo Upload & Preview -->
              <div class="logo-row">
                <div class="logo-preview-box">
                  <img
                    *ngIf="logoPreviewUrl(); else logoPlaceholder"
                    [src]="logoPreviewUrl()"
                    [alt]="'PORTAL.PROFILE.LOGO_ALT' | translate"
                    class="logo-preview-img"
                  />
                  <ng-template #logoPlaceholder>
                    <div class="logo-fallback-box">
                      {{ getInitials(form().name || 'VAMO') }}
                    </div>
                  </ng-template>
                </div>

                <div class="logo-info">
                  <h3 class="logo-title">{{ 'PORTAL.PROFILE.LOGO_TITLE' | translate }}</h3>
                  <p class="logo-desc">
                    {{ 'PORTAL.PROFILE.LOGO_DESC' | translate }}
                  </p>
                  <div class="logo-actions">
                    <label class="btn btn-secondary btn-sm cursor-pointer">
                      <span *ngIf="uploadingLogo()" class="spinner spinner-primary"></span>
                      <span>{{ uploadingLogo() ? ('PORTAL.PROFILE.UPLOADING' | translate) : (form().logo ? ('PORTAL.PROFILE.REPLACE_LOGO' | translate) : ('PORTAL.PROFILE.UPLOAD_LOGO' | translate)) }}</span>
                      <input
                        type="file"
                        hidden
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        (change)="onLogoSelected($event)"
                        [disabled]="uploadingLogo()"
                      />
                    </label>
                    <button
                      *ngIf="form().logo"
                      type="button"
                      class="btn btn-ghost btn-sm text-danger"
                      (click)="removeLogo()"
                      [disabled]="uploadingLogo()"
                    >
                      {{ 'PORTAL.PROFILE.REMOVE' | translate }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Gallery Images -->
              <div class="gallery-wrapper">
                <div class="gallery-header">
                  <div>
                    <h3 class="gallery-title">{{ 'PORTAL.PROFILE.GALLERY_TITLE' | translate }}</h3>
                    <p class="gallery-desc">{{ 'PORTAL.PROFILE.GALLERY_DESC' | translate }}</p>
                  </div>
                  <label class="btn btn-outline btn-sm cursor-pointer">
                    <span *ngIf="uploadingGallery()" class="spinner spinner-primary"></span>
                    <span>{{ uploadingGallery() ? ('PORTAL.PROFILE.UPLOADING' | translate) : ('PORTAL.PROFILE.ADD_PHOTOS' | translate) }}</span>
                    <input
                      type="file"
                      hidden
                      multiple
                      accept="image/png,image/jpeg,image/webp"
                      (change)="onGallerySelected($event)"
                      [disabled]="uploadingGallery()"
                    />
                  </label>
                </div>

                <div class="gallery-grid">
                  <div
                    *ngFor="let img of galleryItems(); let i = index"
                    class="gallery-item-card"
                  >
                    <img
                      [src]="getGalleryImageUrl(img)"
                      [alt]="'PORTAL.PROFILE.GALLERY_PHOTO_ALT' | translate"
                      class="gallery-img"
                    />
                    <button
                      type="button"
                      class="gallery-delete-btn"
                      (click)="removeGalleryImage(img, i)"
                      [attr.aria-label]="'PORTAL.PROFILE.DELETE_IMAGE_ARIA' | translate"
                      [attr.title]="'PORTAL.PROFILE.DELETE_IMAGE_ARIA' | translate"
                    >
                      ✕
                    </button>
                  </div>

                  <!-- Upload Tile -->
                  <label class="gallery-upload-tile" [class.tile-loading]="uploadingGallery()">
                    <input
                      type="file"
                      hidden
                      multiple
                      accept="image/png,image/jpeg,image/webp"
                      (change)="onGallerySelected($event)"
                      [disabled]="uploadingGallery()"
                    />
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    <span>{{ 'PORTAL.PROFILE.UPLOAD_PHOTO' | translate }}</span>
                  </label>
                </div>
              </div>
            </section>

            <!-- 3. LOCATION & ADDRESS -->
            <section class="card form-section" id="section-location">
              <div class="card-header">
                <div>
                  <h2 class="card-title">{{ 'PORTAL.PROFILE.SECTION_LOCATION_TITLE' | translate }}</h2>
                  <p class="card-desc">{{ 'PORTAL.PROFILE.SECTION_LOCATION_DESC' | translate }}</p>
                </div>
                <span class="section-tag">{{ 'PORTAL.PROFILE.REQUIRED_TAG' | translate }}</span>
              </div>

              <div class="form-grid">
                <!-- Address -->
                <div class="form-group span-2">
                  <label class="form-label" for="field-address">
                    {{ 'PORTAL.PROFILE.ADDRESS_LABEL' | translate }} <span class="required-star">*</span>
                  </label>
                  <input
                    id="field-address"
                    type="text"
                    class="form-control"
                    [class.is-invalid]="touched.address && !form().address.trim()"
                    [(ngModel)]="form().address"
                    (blur)="touched.address = true; markDirty()"
                    [placeholder]="'PORTAL.PROFILE.ADDRESS_PLACEHOLDER' | translate"
                  />
                  <p *ngIf="touched.address && !form().address.trim()" class="form-error">
                    {{ 'PORTAL.PROFILE.ADDRESS_REQUIRED' | translate }}
                  </p>
                </div>

                <!-- City / Area -->
                <div class="form-group">
                  <label class="form-label" for="field-city">
                    {{ 'PORTAL.PROFILE.CITY_LABEL' | translate }}
                  </label>
                  <input
                    id="field-city"
                    type="text"
                    class="form-control"
                    [(ngModel)]="form().city"
                    (input)="markDirty()"
                    [placeholder]="'PORTAL.PROFILE.CITY_PLACEHOLDER' | translate"
                    list="city-suggestions"
                  />
                  <datalist id="city-suggestions">
                    <option value="Las Terrenas"></option>
                    <option value="Samaná"></option>
                    <option value="Cabarete"></option>
                    <option value="Sosúa"></option>
                    <option value="Puerto Plata"></option>
                    <option value="Punta Cana"></option>
                    <option value="Bávaro"></option>
                    <option value="Bayahibe"></option>
                    <option value="La Romana"></option>
                    <option value="Santo Domingo"></option>
                    <option value="Santiago"></option>
                    <option value="Jarabacoa"></option>
                    <option value="Constanza"></option>
                    <option value="Las Galeras"></option>
                  </datalist>
                </div>

                <!-- Quick Destination Chips -->
                <div class="form-group">
                  <label class="form-label">{{ 'PORTAL.PROFILE.POPULAR_HUBS' | translate }}</label>
                  <div class="quick-city-chips">
                    <button
                      *ngFor="let c of ['Las Terrenas', 'Cabarete', 'Punta Cana', 'Samaná', 'Santo Domingo']"
                      type="button"
                      class="city-chip"
                      [class.city-chip-active]="form().city === c"
                      (click)="setCity(c)"
                    >
                      {{ c }}
                    </button>
                  </div>
                </div>

                <!-- Coordinates: Latitude & Longitude -->
                <div class="form-group span-2">
                  <div class="coords-header">
                    <label class="form-label">
                      {{ 'PORTAL.PROFILE.COORDS_LABEL' | translate }}
                    </label>
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm btn-detect"
                      (click)="detectLocation()"
                      [disabled]="detectingLocation()"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
                      </svg>
                      <span>{{ detectingLocation() ? ('PORTAL.PROFILE.DETECTING' | translate) : ('PORTAL.PROFILE.USE_DEVICE_LOCATION' | translate) }}</span>
                    </button>
                  </div>

                  <div class="coords-grid">
                    <div>
                      <span class="coord-label">{{ 'PORTAL.PROFILE.LATITUDE' | translate }}</span>
                      <input
                        type="number"
                        step="0.000001"
                        class="form-control"
                        [ngModel]="lat()"
                        (ngModelChange)="onLatChange($event)"
                        [placeholder]="'PORTAL.PROFILE.LAT_PLACEHOLDER' | translate"
                      />
                    </div>
                    <div>
                      <span class="coord-label">{{ 'PORTAL.PROFILE.LONGITUDE' | translate }}</span>
                      <input
                        type="number"
                        step="0.000001"
                        class="form-control"
                        [ngModel]="lng()"
                        (ngModelChange)="onLngChange($event)"
                        [placeholder]="'PORTAL.PROFILE.LNG_PLACEHOLDER' | translate"
                      />
                    </div>
                  </div>

                  <div *ngIf="lat() && lng()" class="coords-preview">
                    <span>📍 {{ 'PORTAL.PROFILE.COORDS_PINNED' | translate:{ lat: (lat() | number:'1.4-4'), lng: (lng() | number:'1.4-4') } }}</span>
                    <a
                      [href]="'https://www.google.com/maps?q=' + lat() + ',' + lng()"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="coords-link"
                    >
                      {{ 'PORTAL.PROFILE.PREVIEW_MAPS' | translate }}
                    </a>
                  </div>
                </div>
              </div>
            </section>

            <!-- 4. CONTACT & CHANNELS -->
            <section class="card form-section" id="section-contact">
              <div class="card-header">
                <div>
                  <h2 class="card-title">{{ 'PORTAL.PROFILE.SECTION_CONTACT_TITLE' | translate }}</h2>
                  <p class="card-desc">{{ 'PORTAL.PROFILE.SECTION_CONTACT_DESC' | translate }}</p>
                </div>
              </div>

              <div class="form-grid">
                <!-- Phone -->
                <div class="form-group">
                  <label class="form-label" for="field-phone">{{ 'PORTAL.PROFILE.PHONE_LABEL' | translate }}</label>
                  <input
                    id="field-phone"
                    type="tel"
                    class="form-control"
                    [class.is-invalid]="touched.phone && !isPhoneValid(form().phone)"
                    [(ngModel)]="form().phone"
                    (blur)="touched.phone = true; markDirty()"
                    [placeholder]="'PORTAL.PROFILE.PHONE_PLACEHOLDER' | translate"
                  />
                  <p *ngIf="touched.phone && !isPhoneValid(form().phone)" class="form-error">
                    {{ 'PORTAL.PROFILE.PHONE_INVALID' | translate }}
                  </p>
                </div>

                <!-- WhatsApp -->
                <div class="form-group">
                  <label class="form-label" for="field-wa">
                    <span>{{ 'PORTAL.PROFILE.WHATSAPP_LABEL' | translate }}</span>
                    <span class="wa-badge">{{ 'PORTAL.PROFILE.WHATSAPP_BADGE' | translate }}</span>
                  </label>
                  <input
                    id="field-wa"
                    type="tel"
                    class="form-control"
                    [class.is-invalid]="touched.waNumber && !isPhoneValid(form().wa_number)"
                    [(ngModel)]="form().wa_number"
                    (blur)="touched.waNumber = true; markDirty()"
                    [placeholder]="'PORTAL.PROFILE.WHATSAPP_PLACEHOLDER' | translate"
                  />
                  <div class="wa-footer">
                    <p *ngIf="touched.waNumber && !isPhoneValid(form().wa_number)" class="form-error">
                      {{ 'PORTAL.PROFILE.WHATSAPP_INVALID' | translate }}
                    </p>
                    <a
                      *ngIf="form().wa_number && isPhoneValid(form().wa_number)"
                      [href]="getWhatsAppUrl(form().wa_number)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="wa-test-link"
                    >
                      {{ 'PORTAL.PROFILE.WHATSAPP_TEST' | translate }}
                    </a>
                  </div>
                </div>

                <!-- Email -->
                <div class="form-group">
                  <label class="form-label" for="field-email">{{ 'PORTAL.PROFILE.EMAIL_LABEL' | translate }}</label>
                  <input
                    id="field-email"
                    type="email"
                    class="form-control"
                    [class.is-invalid]="touched.email && !isEmailValid(form().email)"
                    [(ngModel)]="form().email"
                    (blur)="touched.email = true; markDirty()"
                    [placeholder]="'PORTAL.PROFILE.EMAIL_PLACEHOLDER' | translate"
                  />
                  <p *ngIf="touched.email && !isEmailValid(form().email)" class="form-error">
                    {{ 'PORTAL.PROFILE.EMAIL_INVALID' | translate }}
                  </p>
                </div>
              </div>
            </section>

            <!-- 5. SOCIAL MEDIA -->
            <section class="card form-section" id="section-social">
              <div class="card-header">
                <div>
                  <h2 class="card-title">{{ 'PORTAL.PROFILE.SECTION_SOCIAL_TITLE' | translate }}</h2>
                  <p class="card-desc">{{ 'PORTAL.PROFILE.SECTION_SOCIAL_DESC' | translate }}</p>
                </div>
              </div>

              <div class="form-grid">
                <!-- Instagram -->
                <div class="form-group">
                  <label class="form-label" for="field-ig">{{ 'PORTAL.PROFILE.INSTAGRAM_LABEL' | translate }}</label>
                  <input
                    id="field-ig"
                    type="text"
                    class="form-control"
                    [(ngModel)]="form().instagram"
                    (blur)="markDirty()"
                    [placeholder]="'PORTAL.PROFILE.INSTAGRAM_PLACEHOLDER' | translate"
                  />
                </div>

                <!-- Facebook -->
                <div class="form-group">
                  <label class="form-label" for="field-fb">{{ 'PORTAL.PROFILE.FACEBOOK_LABEL' | translate }}</label>
                  <input
                    id="field-fb"
                    type="text"
                    class="form-control"
                    [(ngModel)]="form().facebook"
                    (blur)="markDirty()"
                    [placeholder]="'PORTAL.PROFILE.FACEBOOK_PLACEHOLDER' | translate"
                  />
                </div>

                <!-- Google Business Profile -->
                <div class="form-group span-2">
                  <label class="form-label" for="field-google">{{ 'PORTAL.PROFILE.GOOGLE_LABEL' | translate }}</label>
                  <input
                    id="field-google"
                    type="url"
                    class="form-control"
                    [(ngModel)]="form().google_business_link"
                    (blur)="markDirty()"
                    [placeholder]="'PORTAL.PROFILE.GOOGLE_PLACEHOLDER' | translate"
                  />
                </div>
              </div>
            </section>

            <!-- 6. OPERATING HOURS -->
            <section class="card form-section" id="section-hours">
              <div class="card-header">
                <div>
                  <h2 class="card-title">{{ 'PORTAL.PROFILE.SECTION_HOURS_TITLE' | translate }}</h2>
                  <p class="card-desc">{{ 'PORTAL.PROFILE.SECTION_HOURS_DESC' | translate }}</p>
                </div>
                <div class="hours-quick-actions">
                  <button type="button" class="btn btn-ghost btn-sm" (click)="setWeekdaysStandard()">
                    {{ 'PORTAL.PROFILE.HOURS_SET_STANDARD' | translate }}
                  </button>
                  <button type="button" class="btn btn-ghost btn-sm" (click)="copyMondayToAll()">
                    {{ 'PORTAL.PROFILE.HOURS_COPY_MON' | translate }}
                  </button>
                </div>
              </div>

              <div class="hours-list">
                <div
                  *ngFor="let hour of form().opening_times; let i = index"
                  class="hour-row"
                  [class.hour-row-closed]="hour.closed"
                >
                  <div class="hour-day-col">
                    <span class="hour-day-name">{{ getDayLabel(hour.day) }}</span>
                    <label class="toggle-switch">
                      <input
                        type="checkbox"
                        [checked]="!hour.closed"
                        (change)="toggleDayOpen(i, $event)"
                      />
                      <span class="toggle-slider"></span>
                      <span class="toggle-status-text">{{ hour.closed ? ('PORTAL.PROFILE.HOURS_CLOSED' | translate) : ('PORTAL.PROFILE.HOURS_OPEN' | translate) }}</span>
                    </label>
                  </div>

                  <div *ngIf="!hour.closed" class="hour-times-col">
                    <div class="time-block">
                      <span class="time-label">{{ 'PORTAL.PROFILE.HOURS_OPENS' | translate }}</span>
                      <input
                        type="time"
                        class="form-control time-input"
                        [(ngModel)]="hour.opens_at"
                        (change)="markDirty()"
                      />
                    </div>
                    <span class="time-sep">—</span>
                    <div class="time-block">
                      <span class="time-label">{{ 'PORTAL.PROFILE.HOURS_CLOSES' | translate }}</span>
                      <input
                        type="time"
                        class="form-control time-input"
                        [(ngModel)]="hour.closes_at"
                        (change)="markDirty()"
                      />
                    </div>

                    <!-- Optional Midday Break -->
                    <div class="time-break-group">
                      <div class="time-block">
                        <span class="time-label">{{ 'PORTAL.PROFILE.HOURS_BREAK_FROM' | translate }}</span>
                        <input
                          type="time"
                          class="form-control time-input"
                          [(ngModel)]="hour.break_from"
                          (change)="markDirty()"
                        />
                      </div>
                      <span class="time-sep">{{ 'PORTAL.PROFILE.HOURS_TO' | translate }}</span>
                      <div class="time-block">
                        <span class="time-label">{{ 'PORTAL.PROFILE.HOURS_BREAK_TO' | translate }}</span>
                        <input
                          type="time"
                          class="form-control time-input"
                          [(ngModel)]="hour.break_to"
                          (change)="markDirty()"
                        />
                      </div>
                    </div>
                  </div>

                  <div *ngIf="hour.closed" class="hour-closed-note">
                    {{ 'PORTAL.PROFILE.HOURS_CLOSED_ALL_DAY' | translate }}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <!-- ── Right Column: Sticky Sidebar Widgets ──────────────────── -->
          <aside class="sidebar-column">
            <!-- Profile Completeness Card -->
            <div class="card completeness-card">
              <div class="completeness-header">
                <h3 class="completeness-title">{{ 'PORTAL.PROFILE.COMPLETENESS_TITLE' | translate }}</h3>
                <span class="completeness-score">{{ completeness() }}%</span>
              </div>

              <div class="progress-track">
                <div
                  class="progress-fill"
                  [style.width.%]="completeness()"
                ></div>
              </div>

              <p class="completeness-hint">
                {{ completeness() === 100 ? ('PORTAL.PROFILE.COMPLETENESS_HINT_100' | translate) : ('PORTAL.PROFILE.COMPLETENESS_HINT_INCOMPLETE' | translate) }}
              </p>

              <div *ngIf="missingItems().length > 0" class="missing-checklist">
                <span class="checklist-heading">{{ 'PORTAL.PROFILE.IMPROVEMENTS_HEADING' | translate }}</span>
                <ul>
                  <li *ngFor="let item of missingItems()">
                    <span class="bullet">+</span>
                    <span>{{ item }}</span>
                  </li>
                </ul>
              </div>
            </div>

            <!-- Mobile App Listing Card Preview -->
            <div class="card preview-card">
              <h3 class="preview-card-title">{{ 'PORTAL.PROFILE.PREVIEW_TITLE' | translate }}</h3>
              <p class="preview-card-desc">{{ 'PORTAL.PROFILE.PREVIEW_DESC' | translate }}</p>

              <div class="preview-app-mockup">
                <!-- Cover / Hero Thumbnail -->
                <div class="mockup-hero">
                  <img
                    *ngIf="galleryItems().length > 0; else noGalleryMock"
                    [src]="getGalleryImageUrl(galleryItems()[0])"
                    [alt]="'PORTAL.PROFILE.PREVIEW_COVER_ALT' | translate"
                    class="mockup-hero-img"
                  />
                  <ng-template #noGalleryMock>
                    <div class="mockup-hero-empty">
                      <span>{{ 'PORTAL.PROFILE.PREVIEW_APP_SUBTITLE' | translate }}</span>
                    </div>
                  </ng-template>

                  <!-- Floating Logo -->
                  <div class="mockup-logo-floating">
                    <img
                      *ngIf="logoPreviewUrl(); else noLogoMock"
                      [src]="logoPreviewUrl()"
                      [alt]="'PORTAL.PROFILE.PREVIEW_LOGO_ALT' | translate"
                      class="mockup-logo-img"
                    />
                    <ng-template #noLogoMock>
                      <div class="mockup-logo-empty">
                        {{ getInitials(form().name || 'VAMO') }}
                      </div>
                    </ng-template>
                  </div>
                </div>

                <!-- Mockup Content -->
                <div class="mockup-content">
                  <div class="mockup-badge-row">
                    <span class="badge badge-brand">
                      {{ getBusinessTypeLabel(form().business_type) }}
                    </span>
                    <span class="mockup-city">{{ form().city || ('PORTAL.PROFILE.PREVIEW_DEFAULT_CITY' | translate) }}</span>
                  </div>

                  <h4 class="mockup-name">{{ form().name || ('PORTAL.PROFILE.PREVIEW_DEFAULT_NAME' | translate) }}</h4>
                  <p class="mockup-desc">
                    {{ form().description || ('PORTAL.PROFILE.PREVIEW_DEFAULT_DESC' | translate) }}
                  </p>

                  <div class="mockup-footer-actions">
                    <span class="mockup-btn mockup-btn-wa">
                      {{ 'PORTAL.PROFILE.PREVIEW_ACTION_WA' | translate }}
                    </span>
                    <span class="mockup-btn mockup-btn-call">
                      {{ 'PORTAL.PROFILE.PREVIEW_ACTION_CALL' | translate }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Account Status Card -->
            <div class="card meta-card">
              <h3 class="meta-title">{{ 'PORTAL.PROFILE.ACCOUNT_STATUS_TITLE' | translate }}</h3>
              <div class="meta-list">
                <div class="meta-item">
                  <span class="meta-label">{{ 'PORTAL.PROFILE.SUBSCRIPTION_TIER_LABEL' | translate }}</span>
                  <span class="meta-value tier-badge">
                    {{ form().subscription_tier ? (form().subscription_tier | uppercase) : ('PORTAL.PROFILE.TIER_ACTIVE' | translate) }}
                  </span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">{{ 'PORTAL.PROFILE.PLATFORM_STATUS_LABEL' | translate }}</span>
                  <span class="meta-value">{{ 'PORTAL.PROFILE.STATUS_CONNECTED' | translate }}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <!-- ── Sticky Bottom Save Bar on Mobile / Scrolled ──────────────── -->
        <div class="sticky-save-bar" *ngIf="isDirty()">
          <div class="sticky-save-inner">
            <div class="sticky-save-info">
              <span class="status-dot"></span>
              <span>{{ 'PORTAL.PROFILE.MOBILE_UNSAVED' | translate }}</span>
            </div>
            <div class="sticky-save-actions">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                (click)="resetForm()"
                [disabled]="saving()"
              >
                {{ 'PORTAL.PROFILE.DISCARD' | translate }}
              </button>
              <button
                type="button"
                class="btn btn-brand btn-sm"
                (click)="saveProfile()"
                [disabled]="saving() || !isFormValid()"
              >
                <span *ngIf="saving()" class="spinner"></span>
                <span>{{ saving() ? ('PORTAL.PROFILE.MOBILE_SAVING' | translate) : ('PORTAL.PROFILE.SAVE_CHANGES' | translate) }}</span>
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

    .profile-container {
      width: 100%;
      max-width: var(--vamo-container-max);
      margin: 0 auto;
      padding: 32px 28px 80px 28px;
    }

    /* ── State & Alerts ──────────────────────────────────────────────── */
    .state-card {
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      padding: 60px 24px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      box-shadow: var(--vamo-shadow-sm);
    }

    .state-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--vamo-text);
    }

    .state-desc {
      font-size: 0.92rem;
      color: var(--vamo-text-muted);
    }

    .alert {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 24px;
    }

    .alert-content {
      display: flex;
      flex-direction: column;
      line-height: 1.4;
      flex: 1;
    }

    .alert-content strong {
      font-size: 0.95rem;
    }

    .alert-content span {
      font-size: 0.85rem;
      opacity: 0.9;
    }

    /* ── Header ──────────────────────────────────────────────────────── */
    .profile-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 28px;
      gap: 20px;
      flex-wrap: wrap;
    }

    .header-breadcrumbs {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--vamo-text-muted);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .bc-sep { opacity: 0.4; }
    .bc-current { color: var(--vamo-primary); }

    .header-main-title {
      font-size: 2rem;
      font-weight: 800;
      color: var(--vamo-text);
      letter-spacing: -0.02em;
      margin-bottom: 6px;
    }

    .header-subtitle {
      font-size: 0.95rem;
      color: var(--vamo-text-muted);
      max-width: 650px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .unsaved-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: var(--vamo-radius-full);
      background: var(--vamo-warning-bg);
      color: #b45309;
      font-size: 0.82rem;
      font-weight: 600;
    }

    .unsaved-badge .status-dot {
      background: var(--vamo-warning);
    }

    /* ── Content Grid ────────────────────────────────────────────────── */
    .content-grid {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 28px;
      align-items: start;
    }

    .form-columns {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .form-section {
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      box-shadow: var(--vamo-shadow-sm);
      padding: 28px;
    }

    .section-tag {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--vamo-surface-subtle);
      border: 1px solid var(--vamo-border);
      padding: 4px 10px;
      border-radius: var(--vamo-radius-full);
      color: var(--vamo-text-muted);
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 18px 20px;
    }

    .span-2 {
      grid-column: span 2;
    }

    .desc-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 4px;
    }

    .char-count {
      font-size: 0.78rem;
      color: var(--vamo-text-dim);
      margin-left: auto;
    }

    /* ── Offerings Chips ─────────────────────────────────────────────── */
    .chips-container {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }

    .chip-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: var(--vamo-radius-full);
      border: 1px solid var(--vamo-border);
      background: var(--vamo-surface-subtle);
      color: var(--vamo-text);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .chip-btn:hover {
      border-color: var(--vamo-primary);
      color: var(--vamo-primary);
    }

    .chip-btn.chip-active {
      background: rgba(124, 58, 237, 0.1);
      border-color: var(--vamo-primary);
      color: var(--vamo-primary);
    }

    .chip-check {
      font-weight: 800;
      font-size: 0.85rem;
    }

    /* ── Logo Row ────────────────────────────────────────────────────── */
    .logo-row {
      display: flex;
      align-items: center;
      gap: 24px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--vamo-border);
      margin-bottom: 24px;
    }

    .logo-preview-box {
      width: 90px;
      height: 90px;
      border-radius: 50%;
      overflow: hidden;
      border: 3px solid var(--vamo-surface);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
      background: var(--vamo-surface-subtle);
      flex-shrink: 0;
    }

    .logo-preview-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .logo-fallback-box {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--vamo-gradient-brand);
      color: #ffffff;
      font-weight: 800;
      font-size: 1.6rem;
      letter-spacing: -0.02em;
    }

    .logo-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .logo-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--vamo-text);
    }

    .logo-desc {
      font-size: 0.85rem;
      color: var(--vamo-text-muted);
      max-width: 440px;
    }

    .logo-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 8px;
    }

    .text-danger {
      color: var(--vamo-error) !important;
    }

    /* ── Gallery ─────────────────────────────────────────────────────── */
    .gallery-wrapper {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .gallery-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    .gallery-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--vamo-text);
    }

    .gallery-desc {
      font-size: 0.85rem;
      color: var(--vamo-text-muted);
    }

    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 14px;
    }

    .gallery-item-card {
      position: relative;
      height: 110px;
      border-radius: var(--vamo-radius-sm);
      overflow: hidden;
      border: 1px solid var(--vamo-border);
      box-shadow: var(--vamo-shadow-sm);
    }

    .gallery-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.25s ease;
    }

    .gallery-item-card:hover .gallery-img {
      transform: scale(1.05);
    }

    .gallery-delete-btn {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(4px);
      color: #ffffff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      transition: background 0.15s ease, transform 0.15s ease;
    }

    .gallery-delete-btn:hover {
      background: var(--vamo-error);
      transform: scale(1.1);
    }

    .gallery-upload-tile {
      height: 110px;
      border-radius: var(--vamo-radius-sm);
      border: 2px dashed var(--vamo-border);
      background: var(--vamo-surface-subtle);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      color: var(--vamo-text-muted);
      font-size: 0.82rem;
      font-weight: 600;
      transition: all 0.18s ease;
    }

    .gallery-upload-tile:hover {
      border-color: var(--vamo-primary);
      color: var(--vamo-primary);
      background: rgba(124, 58, 237, 0.04);
    }

    .tile-loading {
      opacity: 0.6;
      pointer-events: none;
    }

    /* ── Location & Coordinates ──────────────────────────────────────── */
    .quick-city-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 2px;
    }

    .city-chip {
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      padding: 6px 12px;
      border-radius: var(--vamo-radius-full);
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--vamo-text);
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .city-chip:hover {
      border-color: var(--vamo-primary);
      color: var(--vamo-primary);
    }

    .city-chip.city-chip-active {
      background: var(--vamo-primary);
      border-color: var(--vamo-primary);
      color: #ffffff;
    }

    .coords-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .btn-detect {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--vamo-primary);
      font-weight: 600;
      font-size: 0.82rem;
    }

    .coords-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }

    .coord-label {
      font-size: 0.8rem;
      color: var(--vamo-text-muted);
      margin-bottom: 4px;
      display: block;
    }

    .coords-preview {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 10px;
      padding: 10px 14px;
      background: var(--vamo-surface-subtle);
      border-radius: var(--vamo-radius-sm);
      font-size: 0.85rem;
      color: var(--vamo-text);
    }

    .coords-link {
      color: var(--vamo-primary);
      font-weight: 600;
      text-decoration: none;
      font-size: 0.82rem;
    }

    .coords-link:hover {
      text-decoration: underline;
    }

    /* ── WhatsApp & Contact Badges ───────────────────────────────────── */
    .wa-badge {
      background: rgba(16, 185, 129, 0.12);
      color: #059669;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: var(--vamo-radius-full);
      margin-left: auto;
    }

    .wa-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 4px;
    }

    .wa-test-link {
      color: #059669;
      font-weight: 600;
      font-size: 0.82rem;
      text-decoration: none;
      margin-left: auto;
    }

    .wa-test-link:hover {
      text-decoration: underline;
    }

    /* ── Operating Hours ─────────────────────────────────────────────── */
    .hours-quick-actions {
      display: flex;
      gap: 8px;
    }

    .hours-list {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-sm);
      overflow: hidden;
      background: var(--vamo-surface);
    }

    .hour-row {
      display: grid;
      grid-template-columns: 160px 1fr;
      align-items: center;
      padding: 14px 18px;
      border-bottom: 1px solid var(--vamo-border);
      gap: 20px;
      transition: background 0.15s ease;
    }

    .hour-row:last-child {
      border-bottom: none;
    }

    .hour-row:hover {
      background: var(--vamo-surface-subtle);
    }

    .hour-row-closed {
      background: #fafafa;
    }

    .hour-day-col {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .hour-day-name {
      font-weight: 700;
      font-size: 0.95rem;
      color: var(--vamo-text);
    }

    /* Toggle Switch */
    .toggle-switch {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      user-select: none;
    }

    .toggle-switch input {
      display: none;
    }

    .toggle-slider {
      width: 36px;
      height: 20px;
      background: var(--vamo-border-hover);
      border-radius: 999px;
      position: relative;
      transition: background 0.2s ease;
    }

    .toggle-slider::before {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #ffffff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      transition: transform 0.2s ease;
    }

    .toggle-switch input:checked + .toggle-slider {
      background: var(--vamo-primary);
    }

    .toggle-switch input:checked + .toggle-slider::before {
      transform: translateX(16px);
    }

    .toggle-status-text {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--vamo-text-muted);
    }

    .hour-times-col {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .time-block {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .time-label {
      font-size: 0.72rem;
      color: var(--vamo-text-dim);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .time-input {
      padding: 6px 10px;
      font-size: 0.88rem;
      width: 120px;
    }

    .time-sep {
      color: var(--vamo-text-dim);
      font-size: 0.9rem;
      align-self: flex-end;
      padding-bottom: 8px;
    }

    .time-break-group {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: 12px;
      padding-left: 14px;
      border-left: 1px dashed var(--vamo-border);
    }

    .hour-closed-note {
      font-size: 0.88rem;
      color: var(--vamo-text-dim);
      font-style: italic;
    }

    /* ── Right Column: Sticky Widgets ────────────────────────────────── */
    .sidebar-column {
      display: flex;
      flex-direction: column;
      gap: 24px;
      position: sticky;
      top: 24px;
    }

    /* Completeness Card */
    .completeness-card {
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      box-shadow: var(--vamo-shadow-sm);
      padding: 24px;
    }

    .completeness-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .completeness-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--vamo-text);
    }

    .completeness-score {
      font-size: 1.3rem;
      font-weight: 800;
      color: var(--vamo-primary);
    }

    .completeness-hint {
      font-size: 0.82rem;
      color: var(--vamo-text-muted);
      margin-top: 10px;
      line-height: 1.4;
    }

    .missing-checklist {
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px solid var(--vamo-border);
    }

    .checklist-heading {
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--vamo-text-dim);
      display: block;
      margin-bottom: 8px;
    }

    .missing-checklist ul {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .missing-checklist li {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.82rem;
      color: var(--vamo-text);
    }

    .bullet {
      color: var(--vamo-secondary);
      font-weight: 700;
    }

    /* App Preview Card */
    .preview-card {
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      box-shadow: var(--vamo-shadow-sm);
      padding: 24px;
    }

    .preview-card-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--vamo-text);
      margin-bottom: 4px;
    }

    .preview-card-desc {
      font-size: 0.82rem;
      color: var(--vamo-text-muted);
      margin-bottom: 16px;
    }

    .preview-app-mockup {
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      overflow: hidden;
      background: #ffffff;
      box-shadow: var(--vamo-shadow-md);
    }

    .mockup-hero {
      position: relative;
      height: 130px;
      background: var(--vamo-dark);
    }

    .mockup-hero-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .mockup-hero-empty {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: rgba(255, 255, 255, 0.4);
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.05em;
    }

    .mockup-logo-floating {
      position: absolute;
      bottom: -18px;
      left: 16px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: 2px solid #ffffff;
      background: #ffffff;
      overflow: hidden;
      box-shadow: var(--vamo-shadow-sm);
    }

    .mockup-logo-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .mockup-logo-empty {
      width: 100%;
      height: 100%;
      background: var(--vamo-gradient-brand);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 0.95rem;
    }

    .mockup-content {
      padding: 24px 16px 16px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .mockup-badge-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .mockup-city {
      font-size: 0.75rem;
      color: var(--vamo-text-muted);
      font-weight: 500;
    }

    .mockup-name {
      font-size: 1.05rem;
      font-weight: 800;
      color: var(--vamo-text);
      line-height: 1.25;
    }

    .mockup-desc {
      font-size: 0.8rem;
      color: var(--vamo-text-muted);
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .mockup-footer-actions {
      display: flex;
      gap: 8px;
      margin-top: 6px;
    }

    .mockup-btn {
      flex: 1;
      padding: 6px 10px;
      border-radius: var(--vamo-radius-full);
      font-size: 0.75rem;
      font-weight: 700;
      text-align: center;
      user-select: none;
    }

    .mockup-btn-wa {
      background: rgba(16, 185, 129, 0.12);
      color: #059669;
    }

    .mockup-btn-call {
      background: var(--vamo-surface-subtle);
      color: var(--vamo-text);
      border: 1px solid var(--vamo-border);
    }

    /* Meta Card */
    .meta-card {
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      padding: 20px 24px;
      box-shadow: var(--vamo-shadow-sm);
    }

    .meta-title {
      font-size: 0.88rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--vamo-text-dim);
      margin-bottom: 12px;
    }

    .meta-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .meta-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.82rem;
    }

    .meta-label {
      color: var(--vamo-text-muted);
    }

    .meta-value {
      color: var(--vamo-text);
      font-weight: 600;
    }

    .font-mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.78rem;
    }

    .tier-badge {
      background: rgba(124, 58, 237, 0.1);
      color: var(--vamo-primary);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.72rem;
      font-weight: 700;
    }

    /* ── Sticky Save Bar ─────────────────────────────────────────────── */
    .sticky-save-bar {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 50;
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: var(--vamo-radius-full);
      padding: 10px 20px;
      box-shadow: 0 16px 36px -6px rgba(15, 23, 42, 0.4);
      animation: slideUp 0.25s ease-out;
    }

    @keyframes slideUp {
      from { transform: translate(-50%, 20px); opacity: 0; }
      to { transform: translate(-50%, 0); opacity: 1; }
    }

    .sticky-save-inner {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .sticky-save-info {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #ffffff;
      font-size: 0.88rem;
      font-weight: 600;
    }

    .sticky-save-info .status-dot {
      background: var(--vamo-warning);
    }

    .sticky-save-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    /* ── Responsive Breakpoints ──────────────────────────────────────── */
    @media (max-width: 1024px) {
      .content-grid {
        grid-template-columns: 1fr;
      }

      .sidebar-column {
        position: static;
      }
    }

    @media (max-width: 768px) {
      .profile-container {
        padding: 20px 16px 80px 16px;
      }

      .profile-header {
        flex-direction: column;
        align-items: stretch;
      }

      .header-actions {
        justify-content: flex-end;
      }

      .form-grid {
        grid-template-columns: 1fr;
      }

      .span-2 {
        grid-column: span 1;
      }

      .coords-grid {
        grid-template-columns: 1fr;
      }

      .hour-row {
        grid-template-columns: 1fr;
        gap: 12px;
      }

      .time-break-group {
        margin-left: 0;
        padding-left: 0;
        border-left: none;
        width: 100%;
        margin-top: 8px;
      }
    }
  `],
})
export class BusinessProfileComponent implements OnInit {
  authService = inject(AuthService);
  businessService = inject(BusinessService);
  customerErrorService = inject(CustomerErrorService);
  i18n = inject(I18nService);

  loading = signal(true);
  saving = signal(false);
  uploadingLogo = signal(false);
  uploadingGallery = signal(false);
  detectingLocation = signal(false);
  loadError = signal<string | null>(null);
  saveSuccess = signal(false);
  saveError = signal<string | null>(null);

  isDirty = signal(false);

  provider = signal<Provider | null>(null);

  form = signal<{
    id: string;
    name: string;
    business_type: string;
    description: string;
    address: string;
    city: string;
    phone: string;
    wa_number: string;
    email: string;
    website: string;
    facebook: string;
    instagram: string;
    google_business_link: string;
    location: { type: 'Point'; coordinates: [number, number] } | null;
    offerings: string[];
    opening_times: OpeningHour[];
    logo: any;
    images: any[];
    subscription_tier?: string | null;
  }>({
    id: '',
    name: '',
    business_type: '',
    description: '',
    address: '',
    city: '',
    phone: '',
    wa_number: '',
    email: '',
    website: '',
    facebook: '',
    instagram: '',
    google_business_link: '',
    location: null,
    offerings: [],
    opening_times: [],
    logo: null,
    images: [],
    subscription_tier: null,
  });

  touched = {
    name: false,
    businessType: false,
    description: false,
    address: false,
    phone: false,
    waNumber: false,
    email: false,
  };

  readonly businessTypes: BusinessTypeOption[] = BUSINESS_TYPES;

  private readonly offeringMap: Record<string, OfferingOption[]> = {
    restaurant_and_bar: [
      { value: 'breakfast', label: 'Breakfast' },
      { value: 'lunch', label: 'Lunch' },
      { value: 'dinner', label: 'Dinner' },
      { value: 'snacks', label: 'Snacks' },
      { value: 'cocktails', label: 'Cocktails' },
    ],
    restaurant: [
      { value: 'breakfast', label: 'Breakfast' },
      { value: 'lunch', label: 'Lunch' },
      { value: 'dinner', label: 'Dinner' },
      { value: 'snacks', label: 'Snacks' },
      { value: 'cocktails', label: 'Cocktails' },
    ],
    bar: [
      { value: 'breakfast', label: 'Breakfast' },
      { value: 'lunch', label: 'Lunch' },
      { value: 'dinner', label: 'Dinner' },
      { value: 'snacks', label: 'Snacks' },
      { value: 'cocktails', label: 'Cocktails' },
    ],
    bakery: [
      { value: 'breakfast', label: 'Breakfast' },
      { value: 'lunch', label: 'Lunch' },
      { value: 'snacks', label: 'Snacks' },
    ],
    wellness: [
      { value: 'sauna', label: 'Sauna' },
      { value: 'massage', label: 'Massage' },
      { value: 'cosmetics', label: 'Cosmetics' },
      { value: 'adults_only', label: 'Adults only' },
    ],
    car_rental: [
      { value: 'cars', label: 'Cars' },
      { value: 'scooters', label: 'Scooters / Pasolas' },
      { value: 'quads', label: 'Quads' },
    ],
    disco_club: [
      { value: 'adults_only', label: 'Adults only' },
    ],
  };

  private readonly DEFAULT_HOURS: OpeningHour[] = [
    { day: 'monday', opens_at: '09:00', closes_at: '18:00', break_from: '', break_to: '', closed: false },
    { day: 'tuesday', opens_at: '09:00', closes_at: '18:00', break_from: '', break_to: '', closed: false },
    { day: 'wednesday', opens_at: '09:00', closes_at: '18:00', break_from: '', break_to: '', closed: false },
    { day: 'thursday', opens_at: '09:00', closes_at: '18:00', break_from: '', break_to: '', closed: false },
    { day: 'friday', opens_at: '09:00', closes_at: '18:00', break_from: '', break_to: '', closed: false },
    { day: 'saturday', opens_at: '10:00', closes_at: '16:00', break_from: '', break_to: '', closed: false },
    { day: 'sunday', opens_at: '', closes_at: '', break_from: '', break_to: '', closed: true },
  ];

  lat = computed(() => this.form().location?.coordinates[1] ?? null);
  lng = computed(() => this.form().location?.coordinates[0] ?? null);

  get currentOfferingChoices(): OfferingOption[] {
    const type = this.form().business_type;
    const choices = type ? this.offeringMap[type] || [] : [];
    return choices.map((c) => ({
      value: c.value,
      label: this.i18n.t(`PORTAL.PROFILE.OFFERINGS.${c.value.toUpperCase()}`),
    }));
  }

  galleryItems = computed(() => this.form().images || []);

  logoPreviewUrl = computed(() => {
    const logo = this.form().logo;
    if (!logo) return null;
    return this.businessService.getAssetUrl(logo);
  });

  // ── Profile Completeness Computation ────────────────────────────────
  completeness = computed(() => {
    const f = this.form();
    const checks = [
      !!f.name?.trim(),
      !!f.business_type,
      !!f.description?.trim(),
      !!f.address?.trim(),
      !!f.city?.trim(),
      !!f.logo,
      (f.images?.length || 0) > 0,
      !!f.phone?.trim(),
      !!f.wa_number?.trim(),
      !!f.email?.trim(),
      !!f.location?.coordinates,
      (f.opening_times?.length || 0) > 0,
    ];
    const passed = checks.filter(Boolean).length;
    return Math.round((passed / checks.length) * 100);
  });

  missingItems = computed(() => {
    const f = this.form();
    // Read lang signal to guarantee reactivity on language switch
    this.i18n.lang();
    const missing: string[] = [];
    if (!f.logo) missing.push(this.i18n.t('PORTAL.PROFILE.MISSING_LOGO'));
    if (!f.images?.length) missing.push(this.i18n.t('PORTAL.PROFILE.MISSING_GALLERY'));
    if (!f.wa_number?.trim()) missing.push(this.i18n.t('PORTAL.PROFILE.MISSING_WHATSAPP'));
    if (!f.city?.trim()) missing.push(this.i18n.t('PORTAL.PROFILE.MISSING_CITY'));
    if (!f.location?.coordinates) missing.push(this.i18n.t('PORTAL.PROFILE.MISSING_COORDS'));
    if (!f.instagram?.trim() && !f.google_business_link?.trim()) missing.push(this.i18n.t('PORTAL.PROFILE.MISSING_SOCIAL'));
    return missing;
  });

  async ngOnInit(): Promise<void> {
    await this.loadProfile();
  }

  async loadProfile(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);

    try {
      const user = await this.authService.waitForInitialAuth();
      const providerLink = user?.provider_link;

      if (!providerLink?.id) {
        throw new Error('No associated business profile found for this account.');
      }

      // Fetch full provider record with expanded media
      const fullProvider = await this.businessService.getProviderById(providerLink.id);
      this.provider.set(fullProvider);

      this.populateForm(fullProvider);
    } catch (err: any) {
      this.loadError.set(this.customerErrorService.toCustomerMessage(err, 'load'));
    } finally {
      this.loading.set(false);
    }
  }

  populateForm(p: Provider): void {
    const hours = p.opening_times?.length
      ? structuredClone(p.opening_times)
      : structuredClone(this.DEFAULT_HOURS);

    this.form.set({
      id: p.id,
      name: p.name || '',
      business_type: p.business_type || '',
      description: p.description || '',
      address: p.address || '',
      city: p.city || '',
      phone: p.phone || '',
      wa_number: p.wa_number || '',
      email: p.email || '',
      website: p.website || '',
      facebook: p.facebook || '',
      instagram: p.instagram || '',
      google_business_link: p.google_business_link || '',
      location: p.location || null,
      offerings: [...(p.offerings || [])],
      opening_times: hours,
      logo: p.logo || null,
      images: [...(p.images || [])],
      subscription_tier: p.subscription_tier || null,
    });

    this.isDirty.set(false);
  }

  markDirty(): void {
    this.isDirty.set(true);
    this.saveSuccess.set(false);
    this.saveError.set(null);
  }

  resetForm(): void {
    const current = this.provider();
    if (current) {
      this.populateForm(current);
    }
  }

  isOfferingSelected(value: string): boolean {
    return this.form().offerings.includes(value);
  }

  toggleOffering(value: string): void {
    const list = [...this.form().offerings];
    const index = list.indexOf(value);
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.push(value);
    }
    this.form.update((f) => ({ ...f, offerings: list }));
    this.markDirty();
  }

  setCity(city: string): void {
    this.form.update((f) => ({ ...f, city }));
    this.markDirty();
  }

  onLatChange(val: number | null): void {
    const currentLng = this.lng() ?? -69.5422;
    if (val === null || isNaN(val)) {
      this.form.update((f) => ({ ...f, location: null }));
    } else {
      this.form.update((f) => ({
        ...f,
        location: { type: 'Point', coordinates: [currentLng, Number(val)] },
      }));
    }
    this.markDirty();
  }

  onLngChange(val: number | null): void {
    const currentLat = this.lat() ?? 19.3175;
    if (val === null || isNaN(val)) {
      this.form.update((f) => ({ ...f, location: null }));
    } else {
      this.form.update((f) => ({
        ...f,
        location: { type: 'Point', coordinates: [Number(val), currentLat] },
      }));
    }
    this.markDirty();
  }

  detectLocation(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      alert(this.i18n.t('PORTAL.PROFILE.GEO_NOT_SUPPORTED'));
      return;
    }

    this.detectingLocation.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.detectingLocation.set(false);
        const { latitude, longitude } = pos.coords;
        this.form.update((f) => ({
          ...f,
          location: { type: 'Point', coordinates: [longitude, latitude] },
        }));
        this.markDirty();
      },
      (err) => {
        this.detectingLocation.set(false);
        console.warn('[BusinessProfile] Geolocation error:', err);
        alert(this.i18n.t('PORTAL.PROFILE.GEO_FAILED'));
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  // ── Image Handlers ──────────────────────────────────────────────────
  async onLogoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    this.uploadingLogo.set(true);
    this.saveError.set(null);

    try {
      const fileId = await this.businessService.updateProviderLogo(this.form().id, file);
      this.form.update((f) => ({ ...f, logo: { id: fileId } }));
      this.markDirty();
    } catch (err: any) {
      this.saveError.set(this.customerErrorService.toCustomerMessage(err, 'upload'));
    } finally {
      this.uploadingLogo.set(false);
      input.value = '';
    }
  }

  removeLogo(): void {
    this.form.update((f) => ({ ...f, logo: null }));
    this.markDirty();
  }

  async onGallerySelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    this.uploadingGallery.set(true);
    this.saveError.set(null);

    try {
      const files = Array.from(input.files);
      for (const file of files) {
        const fileId = await this.businessService.uploadProviderImage(this.form().id, file);
        this.form.update((f) => ({
          ...f,
          images: [
            ...(f.images || []),
            { directus_files_id: { id: fileId } },
          ],
        }));
      }
      this.markDirty();
    } catch (err: any) {
      this.saveError.set(this.customerErrorService.toCustomerMessage(err, 'upload'));
    } finally {
      this.uploadingGallery.set(false);
      input.value = '';
    }
  }

  async removeGalleryImage(img: any, index: number): Promise<void> {
    const fid = typeof img.directus_files_id === 'object' ? img.directus_files_id?.id : img.directus_files_id;
    const junctionId = img.id;

    const list = [...this.form().images];
    list.splice(index, 1);
    this.form.update((f) => ({ ...f, images: list }));
    this.markDirty();

    if (this.form().id && (fid || junctionId)) {
      try {
        await this.businessService.removeProviderImage(this.form().id, fid, junctionId);
      } catch (err) {
        this.saveError.set(this.customerErrorService.toCustomerMessage(err, 'delete'));
      }
    }
  }

  getGalleryImageUrl(img: any): string {
    const fileId = typeof img.directus_files_id === 'object' ? img.directus_files_id?.id : img.directus_files_id;
    return this.businessService.getAssetUrl(fileId, 'width=300&height=220&fit=cover');
  }

  // ── Operating Hours Handlers ────────────────────────────────────────
  getDayLabel(day: string): string {
    const key = `DAYS.${day.toLowerCase()}`;
    const translated = this.i18n.t(key);
    return translated !== key ? translated : day;
  }

  toggleDayOpen(index: number, event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    const hours = [...this.form().opening_times];
    hours[index] = {
      ...hours[index],
      closed: !isChecked,
      opens_at: isChecked ? hours[index].opens_at || '09:00' : '',
      closes_at: isChecked ? hours[index].closes_at || '18:00' : '',
    };
    this.form.update((f) => ({ ...f, opening_times: hours }));
    this.markDirty();
  }

  setWeekdaysStandard(): void {
    const hours = this.form().opening_times.map((h) => {
      if (['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(h.day)) {
        return { ...h, opens_at: '09:00', closes_at: '18:00', closed: false };
      }
      return h;
    });
    this.form.update((f) => ({ ...f, opening_times: hours }));
    this.markDirty();
  }

  copyMondayToAll(): void {
    const mon = this.form().opening_times.find((h) => h.day === 'monday');
    if (!mon) return;

    const hours = this.form().opening_times.map((h) => ({
      ...h,
      closed: mon.closed,
      opens_at: mon.opens_at,
      closes_at: mon.closes_at,
      break_from: mon.break_from,
      break_to: mon.break_to,
    }));
    this.form.update((f) => ({ ...f, opening_times: hours }));
    this.markDirty();
  }

  // ── Validation Helpers ──────────────────────────────────────────────
  isEmailValid(email: string | null | undefined): boolean {
    if (!email || !email.trim()) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  isPhoneValid(phone: string | null | undefined): boolean {
    if (!phone || !phone.trim()) return true;
    const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
    return /^\+?[0-9]{7,15}$/.test(cleaned);
  }

  isFormValid(): boolean {
    const f = this.form();
    return !!(
      f.name?.trim() &&
      f.business_type &&
      f.description?.trim() &&
      f.address?.trim() &&
      this.isEmailValid(f.email) &&
      this.isPhoneValid(f.phone) &&
      this.isPhoneValid(f.wa_number)
    );
  }

  // ── Save Operation ──────────────────────────────────────────────────
  async saveProfile(): Promise<void> {
    this.touched.name = true;
    this.touched.businessType = true;
    this.touched.description = true;
    this.touched.address = true;
    this.touched.email = true;
    this.touched.phone = true;
    this.touched.waNumber = true;

    if (!this.isFormValid()) {
      this.saveError.set(this.i18n.t('PORTAL.PROFILE.VALIDATION_BANNER'));
      return;
    }

    this.saving.set(true);
    this.saveSuccess.set(false);
    this.saveError.set(null);

    try {
      const f = this.form();
      const updated = await this.businessService.updateProvider(
        f.id,
        {
          name: f.name,
          description: f.description,
          address: f.address,
          city: f.city,
          phone: f.phone,
          wa_number: f.wa_number,
          email: f.email,
          facebook: f.facebook,
          instagram: f.instagram,
          google_business_link: f.google_business_link,
          location: f.location,
          offerings: f.offerings,
          opening_times: f.opening_times,
          logo: f.logo,
        },
        this.provider() ?? undefined
      );

      this.provider.set(updated);
      this.populateForm(updated);
      this.saveSuccess.set(true);
      this.isDirty.set(false);

      // Scroll smoothly to top
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err: any) {
      this.saveError.set(this.customerErrorService.toCustomerMessage(err, 'save'));
    } finally {
      this.saving.set(false);
    }
  }

  // ── Formatting Utilities ────────────────────────────────────────────
  getInitials(name: string): string {
    const parts = (name || '').trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (name || 'VB').slice(0, 2).toUpperCase();
  }

  getBusinessTypeLabel(typeValue: string): string {
    const match = this.businessTypes.find((b) => b.value === typeValue);
    return match ? match.label : typeValue || 'Business';
  }

  getWhatsAppUrl(phone: string): string {
    const digits = (phone || '').replace(/\D/g, '');
    return `https://wa.me/${digits}`;
  }
}
