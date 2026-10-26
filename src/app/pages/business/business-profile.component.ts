import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { CustomerErrorService } from '../../core/services/customer-error.service';
import { I18nService, BUSINESS_TYPES } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Provider, OpeningHour } from '../../core/models/provider.model';
import { Area } from '../../core/models/event.model';
import { PhoneInputComponent } from '../../shared/components/phone-input/phone-input.component';
import { isValidPhone, getWhatsAppUrl } from '../../core/utils/phone';
import {
  isFileDragEvent,
  extractDroppedFiles,
  validateImageUploadFiles,
} from '../../core/utils/event-display.util';

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
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, PhoneInputComponent],
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

                <!-- Business Category -->
                <div class="form-group span-2">
                  <label class="form-label" for="field-type">
                    {{ 'PORTAL.PROFILE.CATEGORY_LABEL' | translate }} <span class="required-star">*</span>
                  </label>
                  <select
                    id="field-type"
                    class="form-control"
                    [class.is-invalid]="touched.businessType && !form().business_type"
                    [ngModel]="form().business_type"
                    (ngModelChange)="onBusinessTypeChange($event)"
                    (blur)="touched.businessType = true"
                  >
                    <option value="" disabled>{{ 'PORTAL.PROFILE.CATEGORY_SELECT_PLACEHOLDER' | translate }}</option>
                    <option
                      *ngIf="form().business_type && !isCanonicalBusinessType(form().business_type)"
                      [value]="form().business_type"
                      disabled
                    >
                      {{ form().business_type }}
                    </option>
                    <option *ngFor="let bt of businessTypes" [value]="bt.value">
                      {{ bt.label }}
                    </option>
                  </select>
                  <p *ngIf="touched.businessType && !form().business_type" class="form-error">
                    {{ 'PORTAL.PROFILE.CATEGORY_REQUIRED' | translate }}
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
              <div
                class="logo-row"
                [class.drag-over]="isLogoDragOver()"
                [class.dropzone-disabled]="uploadingLogo() || saving()"
                (dragenter)="onLogoDragEnter($event)"
                (dragover)="onLogoDragOver($event)"
                (dragleave)="onLogoDragLeave($event)"
                (drop)="onLogoDrop($event)"
              >
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
                  <p class="logo-size-guidance">
                    {{ 'PORTAL.PROFILE.LOGO_SIZE_GUIDANCE' | translate }}
                  </p>
                  <p class="logo-drop-hint">
                    {{ 'PORTAL.PROFILE.LOGO_DRAG_DROP_HINT' | translate }}
                  </p>
                  <div class="logo-actions">
                    <label
                      class="btn btn-secondary btn-sm cursor-pointer"
                      tabindex="0"
                      role="button"
                      [attr.aria-disabled]="uploadingLogo() || saving()"
                      (keydown.enter)="onUploadKeydown($event, logoInput, uploadingLogo() || saving())"
                      (keydown.space)="onUploadKeydown($event, logoInput, uploadingLogo() || saving())"
                    >
                      <span *ngIf="uploadingLogo()" class="spinner spinner-primary"></span>
                      <span>{{ uploadingLogo() ? ('PORTAL.PROFILE.UPLOADING' | translate) : (form().logo ? ('PORTAL.PROFILE.REPLACE_LOGO' | translate) : ('PORTAL.PROFILE.UPLOAD_LOGO' | translate)) }}</span>
                      <input
                        #logoInput
                        type="file"
                        hidden
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        (change)="onLogoSelected($event)"
                        [disabled]="uploadingLogo() || saving()"
                      />
                    </label>
                    <button
                      *ngIf="form().logo"
                      type="button"
                      class="btn btn-ghost btn-sm text-danger"
                      (click)="removeLogo()"
                      [disabled]="uploadingLogo() || saving()"
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
                  <label
                    class="btn btn-outline btn-sm cursor-pointer"
                    tabindex="0"
                    role="button"
                    [attr.aria-disabled]="uploadingGallery() || saving()"
                    (keydown.enter)="onUploadKeydown($event, galleryHeaderInput, uploadingGallery() || saving())"
                    (keydown.space)="onUploadKeydown($event, galleryHeaderInput, uploadingGallery() || saving())"
                  >
                    <span *ngIf="uploadingGallery()" class="spinner spinner-primary"></span>
                    <span>{{ uploadingGallery() ? ('PORTAL.PROFILE.UPLOADING' | translate) : ('PORTAL.PROFILE.ADD_PHOTOS' | translate) }}</span>
                    <input
                      #galleryHeaderInput
                      type="file"
                      hidden
                      multiple
                      accept="image/png,image/jpeg,image/webp"
                      (change)="onGallerySelected($event)"
                      [disabled]="uploadingGallery() || saving()"
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
                      loading="lazy"
                      (error)="onGalleryImageError($event)"
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
                  <label
                    class="gallery-upload-tile"
                    tabindex="0"
                    role="button"
                    [class.tile-loading]="uploadingGallery()"
                    [class.drag-over]="isGalleryDragOver()"
                    [attr.aria-disabled]="uploadingGallery() || saving()"
                    (keydown.enter)="onUploadKeydown($event, galleryTileInput, uploadingGallery() || saving())"
                    (keydown.space)="onUploadKeydown($event, galleryTileInput, uploadingGallery() || saving())"
                    (dragenter)="onGalleryDragEnter($event)"
                    (dragover)="onGalleryDragOver($event)"
                    (dragleave)="onGalleryDragLeave($event)"
                    (drop)="onGalleryDrop($event)"
                  >
                    <input
                      #galleryTileInput
                      type="file"
                      hidden
                      multiple
                      accept="image/png,image/jpeg,image/webp"
                      (change)="onGallerySelected($event)"
                      [disabled]="uploadingGallery() || saving()"
                    />
                    <span *ngIf="uploadingGallery()" class="spinner spinner-primary"></span>
                    <svg *ngIf="!uploadingGallery()" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    <span>{{ uploadingGallery() ? (uploadProgressMessage() || ('PORTAL.PROFILE.UPLOADING' | translate)) : ('PORTAL.PROFILE.UPLOAD_PHOTO' | translate) }}</span>
                    <span *ngIf="!uploadingGallery()" class="gallery-drop-hint">{{ 'PORTAL.PROFILE.GALLERY_DRAG_DROP_HINT' | translate }}</span>
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

                <!-- City / Destination (Published Areas Only) -->
                <div class="form-group span-2">
                  <label class="form-label" for="field-city">
                    {{ 'PORTAL.PROFILE.CITY_LABEL' | translate }}
                  </label>
                  <select
                    id="field-city"
                    class="form-control"
                    [ngModel]="form().city"
                    (ngModelChange)="setCity($event)"
                    [disabled]="areasLoading() || (publishedAreas().length === 0 && !form().city)"
                  >
                    <option value="">
                      {{ (areasLoading() ? 'PORTAL.PROFILE.CITY_LOADING' : 'PORTAL.PROFILE.CITY_SELECT_PLACEHOLDER') | translate }}
                    </option>
                    <option
                      *ngIf="form().city && !isPublishedAreaName(form().city)"
                      [value]="form().city"
                      disabled
                    >
                      {{ form().city }} ({{ 'PORTAL.PROFILE.CITY_LEGACY_UNPUBLISHED' | translate }})
                    </option>
                    <option *ngFor="let area of publishedAreas()" [value]="area.name">
                      {{ area.name }}
                    </option>
                  </select>
                  <div
                    *ngIf="!areasLoading() && (areasError() || publishedAreas().length === 0)"
                    class="city-areas-notice"
                    role="status"
                  >
                    <span>{{ (areasError() ? 'PORTAL.PROFILE.CITY_LOAD_ERROR' : 'PORTAL.PROFILE.CITY_EMPTY') | translate }}</span>
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm"
                      (click)="loadPublishedAreas()"
                    >
                      {{ 'PORTAL.COMMON.RETRY' | translate }}
                    </button>
                  </div>
                </div>

                <!-- Coordinates: Latitude & Longitude -->
                <div class="form-group span-2">
                  <div class="coords-header">
                    <div>
                      <label class="form-label">
                        {{ 'PORTAL.PROFILE.COORDS_LABEL' | translate }}
                      </label>
                      <p class="lp-subhint">{{ 'PORTAL.PROFILE.PIN_HINT' | translate }}</p>
                    </div>
                    <div class="lp-quick-actions">
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
                      <button
                        *ngIf="hasValidCoords()"
                        type="button"
                        class="btn btn-ghost btn-sm btn-clear-pin"
                        (click)="clearLocation()"
                      >
                        {{ 'PORTAL.PROFILE.CLEAR_PIN' | translate }}
                      </button>
                    </div>
                  </div>

                  <div class="coords-grid">
                    <div>
                      <span class="coord-label">{{ 'PORTAL.PROFILE.LATITUDE' | translate }}</span>
                      <input
                        id="profile-coord-lat"
                        type="number"
                        step="0.000001"
                        class="form-control"
                        [ngModel]="lat()"
                        [attr.aria-label]="'PORTAL.PROFILE.LATITUDE' | translate"
                        (ngModelChange)="onLatChange($event)"
                        [placeholder]="'PORTAL.PROFILE.LAT_PLACEHOLDER' | translate"
                      />
                    </div>
                    <div>
                      <span class="coord-label">{{ 'PORTAL.PROFILE.LONGITUDE' | translate }}</span>
                      <input
                        id="profile-coord-lng"
                        type="number"
                        step="0.000001"
                        class="form-control"
                        [ngModel]="lng()"
                        [attr.aria-label]="'PORTAL.PROFILE.LONGITUDE' | translate"
                        (ngModelChange)="onLngChange($event)"
                        [placeholder]="'PORTAL.PROFILE.LNG_PLACEHOLDER' | translate"
                      />
                    </div>
                  </div>

                  <!-- Geolocation / Coordinate Validation Error Banner -->
                  <div *ngIf="locationError()" class="lp-error-banner" role="alert">
                    <span>⚠️ {{ locationError() }}</span>
                    <button type="button" class="btn-text-close" (click)="locationError.set(null)">✕</button>
                  </div>

                  <!-- Map Loading Error Fallback Notice -->
                  <div *ngIf="mapError()" class="lp-error-banner" role="status">
                    <span>⚠️ {{ 'PORTAL.PROFILE.MAP_LOAD_ERROR' | translate }}</span>
                  </div>

                  <!-- Interactive Visual Map & Pin Picker -->
                  <div class="lp-map-wrapper" *ngIf="!mapError()">
                    <div #profileMapContainer id="profile-map-canvas" class="lp-map"></div>

                    <!-- Overlay prompt if no pin set -->
                    <div *ngIf="!hasValidCoords()" class="lp-map-overlay" (click)="focusMap()">
                      <div class="lp-overlay-content">
                        <span class="lp-overlay-icon">📍</span>
                        <div>
                          <strong>{{ 'PORTAL.PROFILE.NO_PIN_TITLE' | translate }}</strong>
                          <p>{{ 'PORTAL.PROFILE.NO_PIN_DESC' | translate }}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div *ngIf="hasValidCoords()" class="coords-preview">
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
                  <label class="form-label" for="field-phone">
                    {{ 'PORTAL.PROFILE.PHONE_LABEL' | translate }} <span class="required-star">*</span>
                  </label>
                  <app-phone-input
                    id="field-phone"
                    name="phone"
                    [ngModel]="form().phone"
                    (ngModelChange)="onPhoneChange($event)"
                    (blurred)="touched.phone = true; markDirty()"
                    [isInvalid]="touched.phone && (!form().phone.trim() || !isPhoneValid(form().phone))"
                  ></app-phone-input>
                  <p *ngIf="touched.phone && !form().phone.trim()" class="form-error">
                    {{ 'PORTAL.PROFILE.PHONE_REQUIRED' | translate }}
                  </p>
                  <p *ngIf="touched.phone && form().phone.trim() && !isPhoneValid(form().phone)" class="form-error">
                    {{ 'PORTAL.PROFILE.PHONE_INVALID' | translate }}
                  </p>
                  <div class="phone-link-wrap" *ngIf="form().phone && isPhoneValid(form().phone)">
                    <a [href]="'tel:' + form().phone" class="phone-test-link">
                      📞 {{ form().phone }}
                    </a>
                  </div>
                </div>

                <!-- WhatsApp -->
                <div class="form-group">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <label class="form-label" for="field-wa" style="margin-bottom: 0;">
                      <span>{{ 'PORTAL.PROFILE.WHATSAPP_LABEL' | translate }}</span>
                      <span class="wa-badge">{{ 'PORTAL.PROFILE.WHATSAPP_BADGE' | translate }}</span>
                    </label>
                    <label class="wa-same-toggle" style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.84rem; cursor: pointer; color: var(--vamo-text-muted, #64748b);">
                      <input
                        type="checkbox"
                        [checked]="waNumberSameAsPhone"
                        (change)="toggleWaSameAsPhone($event)"
                        style="cursor: pointer; accent-color: var(--vamo-pink, #F93CAD);"
                      />
                      <span>{{ 'PORTAL.PROFILE.WA_SAME_AS_PHONE' | translate }}</span>
                    </label>
                  </div>
                  <app-phone-input
                    id="field-wa"
                    name="wa_number"
                    [disabled]="waNumberSameAsPhone"
                    [ngModel]="form().wa_number"
                    (ngModelChange)="onWaChange($event)"
                    (blurred)="touched.waNumber = true; markDirty()"
                    [isInvalid]="touched.waNumber && !!form().wa_number.trim() && !isPhoneValid(form().wa_number)"
                  ></app-phone-input>
                  <div class="wa-footer">
                    <p *ngIf="touched.waNumber && form().wa_number.trim() && !isPhoneValid(form().wa_number)" class="form-error">
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
                  <label class="form-label" for="field-email">
                    {{ 'PORTAL.PROFILE.EMAIL_LABEL' | translate }} <span class="required-star">*</span>
                  </label>
                  <input
                    id="field-email"
                    type="email"
                    class="form-control"
                    [class.is-invalid]="touched.email && (!form().email.trim() || !isEmailValid(form().email))"
                    [(ngModel)]="form().email"
                    (blur)="touched.email = true; markDirty()"
                    [placeholder]="'PORTAL.PROFILE.EMAIL_PLACEHOLDER' | translate"
                  />
                  <p *ngIf="touched.email && !form().email.trim()" class="form-error">
                    {{ 'PORTAL.PROFILE.EMAIL_REQUIRED' | translate }}
                  </p>
                  <p *ngIf="touched.email && form().email.trim() && !isEmailValid(form().email)" class="form-error">
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
                        [attr.aria-label]="getDayLabel(hour.day)"
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
                        [attr.aria-label]="getDayLabel(hour.day) + ' - ' + ('PORTAL.PROFILE.HOURS_OPENS' | translate)"
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
                        [attr.aria-label]="getDayLabel(hour.day) + ' - ' + ('PORTAL.PROFILE.HOURS_CLOSES' | translate)"
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
                        [attr.aria-label]="getDayLabel(hour.day) + ' - ' + ('PORTAL.PROFILE.HOURS_BREAK_FROM' | translate)"
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
                        [attr.aria-label]="getDayLabel(hour.day) + ' - ' + ('PORTAL.PROFILE.HOURS_BREAK_TO' | translate)"
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
      background: rgba(128, 112, 192, 0.1);
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
      padding: 16px;
      border: 2px dashed var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      background: var(--vamo-surface-subtle);
      margin-bottom: 24px;
      transition: all 0.18s ease;
    }

    .logo-row.drag-over {
      border-color: var(--vamo-primary);
      border-style: solid;
      background: rgba(128, 112, 192, 0.08);
      box-shadow: 0 0 0 3px rgba(128, 112, 192, 0.18);
    }

    .logo-row.dropzone-disabled {
      opacity: 0.7;
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
      object-fit: contain;
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

    .logo-size-guidance {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--vamo-text);
    }

    .logo-drop-hint {
      font-size: 0.78rem;
      color: var(--vamo-text-muted);
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
      min-height: 110px;
      padding: 8px;
      border-radius: var(--vamo-radius-sm);
      border: 2px dashed var(--vamo-border);
      background: var(--vamo-surface-subtle);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      cursor: pointer;
      color: var(--vamo-text-muted);
      font-size: 0.82rem;
      font-weight: 600;
      text-align: center;
      transition: all 0.18s ease;
    }

    .gallery-upload-tile:hover,
    .gallery-upload-tile:focus-visible,
    .gallery-upload-tile.drag-over {
      border-color: var(--vamo-primary);
      color: var(--vamo-primary);
      background: rgba(128, 112, 192, 0.06);
    }

    .gallery-upload-tile.drag-over {
      border-style: solid;
      box-shadow: 0 0 0 3px rgba(128, 112, 192, 0.18);
      transform: translateY(-1px);
    }

    .gallery-drop-hint {
      font-size: 0.68rem;
      font-weight: 500;
      color: var(--vamo-text-muted);
      line-height: 1.2;
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

    .city-areas-notice {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-top: 6px;
      padding: 8px 12px;
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: var(--vamo-radius-sm);
      font-size: 0.82rem;
      color: #b45309;
    }

    .coords-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }

    .lp-subhint { margin: 2px 0 0; font-size: 0.8rem; color: var(--vamo-text-muted); }
    .lp-quick-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

    .btn-detect {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--vamo-primary);
      font-weight: 600;
      font-size: 0.82rem;
    }

    .btn-clear-pin { font-size: 0.8rem; color: var(--vamo-text-muted); }
    .lp-error-banner { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding: 8px 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: var(--vamo-radius-sm); font-size: 0.82rem; color: #dc2626; }
    .btn-text-close { background: none; border: none; color: inherit; cursor: pointer; font-size: 0.9rem; padding: 0 4px; }
    .lp-map-wrapper { position: relative; width: 100%; height: 280px; margin-top: 12px; border-radius: var(--vamo-radius-sm); overflow: hidden; border: 1px solid var(--vamo-border); background: #e2e8f0; }
    .lp-map { width: 100%; height: 100%; z-index: 1; }
    .lp-map-overlay { position: absolute; top: 12px; left: 12px; right: 12px; background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(4px); color: #ffffff; padding: 10px 14px; border-radius: var(--vamo-radius-sm); z-index: 500; cursor: pointer; }
    .lp-overlay-content { display: flex; align-items: center; gap: 10px; font-size: 0.82rem; }
    .lp-overlay-content strong { display: block; color: #ffffff; }
    .lp-overlay-content p { margin: 2px 0 0; opacity: 0.85; font-size: 0.78rem; }
    .lp-overlay-icon { font-size: 1.2rem; }
    :host ::ng-deep .custom-vamo-pin-wrap { background: transparent !important; border: none !important; }
    :host ::ng-deep .vamo-pin-bubble { display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.35)); cursor: grab; transition: transform 0.15s ease; }
    :host ::ng-deep .vamo-pin-bubble:hover { transform: scale(1.12); }

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
      gap: 10px;
      flex-wrap: wrap;
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
      object-fit: contain;
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
      background: rgba(128, 112, 192, 0.1);
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
export class BusinessProfileComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('profileMapContainer', { static: false }) profileMapContainer?: ElementRef<HTMLDivElement>;

  authService = inject(AuthService);
  businessService = inject(BusinessService);
  customerErrorService = inject(CustomerErrorService);
  i18n = inject(I18nService);

  loading = signal(true);
  saving = signal(false);
  uploadingLogo = signal(false);
  uploadingGallery = signal(false);
  isLogoDragOver = signal(false);
  isGalleryDragOver = signal(false);
  private logoDragDepth = 0;
  private galleryDragDepth = 0;
  uploadProgressMessage = signal<string | null>(null);
  detectingLocation = signal(false);
  locationError = signal<string | null>(null);
  mapError = signal(false);
  loadError = signal<string | null>(null);
  saveSuccess = signal(false);
  saveError = signal<string | null>(null);

  isDirty = signal(false);

  provider = signal<Provider | null>(null);
  publishedAreas = signal<Area[]>([]);
  areasLoading = signal(false);
  areasError = signal(false);

  private map: any = null;
  private marker: any = null;
  private mapInitialized = false;
  private destroyed = false;
  private mapInitTimers: Array<ReturnType<typeof setTimeout>> = [];
  private mapResizeObserver: ResizeObserver | null = null;
  private readonly onWindowResizeBound = () => this.focusMap();

  private static readonly DEFAULT_HUB_CENTER = { lat: 19.3175, lng: -69.5422 };
  private static readonly DESTINATION_HUB_COORDS: Record<string, { lat: number; lng: number }> = {
    'las terrenas': { lat: 19.3175, lng: -69.5422 },
    'las terrenas/samana': { lat: 19.3175, lng: -69.5422 },
    'samana': { lat: 19.2056, lng: -69.3369 },
    'cabarete': { lat: 19.7498, lng: -70.4083 },
    'sosua': { lat: 19.7522, lng: -70.5199 },
    'puerto plata': { lat: 19.7938, lng: -70.6918 },
    'punta cana': { lat: 18.5622, lng: -68.4044 },
    'bavaro': { lat: 18.6815, lng: -68.4504 },
    'bayahibe': { lat: 18.3685, lng: -68.8398 },
    'la romana': { lat: 18.4273, lng: -68.9728 },
    'santo domingo': { lat: 18.4861, lng: -69.9312 },
    'santiago': { lat: 19.4517, lng: -70.697 },
    'jarabacoa': { lat: 19.1167, lng: -70.6333 },
    'constanza': { lat: 18.9092, lng: -70.7449 },
    'las galeras': { lat: 19.2897, lng: -69.2022 },
  };

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

  waNumberSameAsPhone = false;

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

  lat = computed(() => this.form().location?.coordinates?.[1] ?? null);
  lng = computed(() => this.form().location?.coordinates?.[0] ?? null);
  hasValidCoords = computed(() => this.isValidCoordinatePair(this.lat(), this.lng()));

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
    await Promise.all([this.loadProfile(), this.loadPublishedAreas()]);
  }

  async loadPublishedAreas(): Promise<void> {
    if (typeof (this.businessService as any).getAreas !== 'function') {
      this.publishedAreas.set([]);
      this.areasLoading.set(false);
      this.areasError.set(false);
      return;
    }
    this.areasLoading.set(true);
    this.areasError.set(false);
    try {
      const areas = await this.businessService.getAreas();
      this.publishedAreas.set(Array.isArray(areas) ? areas : []);
    } catch {
      this.publishedAreas.set([]);
      this.areasError.set(true);
    } finally {
      this.areasLoading.set(false);
    }
  }

  async ngAfterViewInit(): Promise<void> {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.onWindowResizeBound);
    }
    if (!this.loading() && this.provider()) {
      await this.initMap();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearMapInitTimers();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onWindowResizeBound);
    }
    if (this.mapResizeObserver) {
      try {
        this.mapResizeObserver.disconnect();
      } catch {}
      this.mapResizeObserver = null;
    }
    if (this.marker) {
      try {
        this.marker.off?.();
        this.marker.remove?.();
      } catch {}
      this.marker = null;
    }
    if (this.map) {
      try {
        this.map.off?.();
        this.map.remove?.();
      } catch {}
      this.map = null;
    }
    this.mapInitialized = false;
  }

  private clearMapInitTimers(): void {
    for (const timer of this.mapInitTimers) {
      clearTimeout(timer);
    }
    this.mapInitTimers = [];
  }

  private scheduleMapInit(delayMs = 50): void {
    if (this.destroyed || typeof window === 'undefined') return;
    const timer = setTimeout(() => {
      if (!this.destroyed) {
        void this.initMap();
      }
    }, delayMs);
    this.mapInitTimers.push(timer);
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
      if (this.provider() && !this.destroyed) {
        this.scheduleMapInit(50);
      }
    }
  }

  private normalizeSavedLocation(
    loc: Provider['location'] | null | undefined,
  ): { type: 'Point'; coordinates: [number, number] } | null {
    if (!loc || !Array.isArray(loc.coordinates) || loc.coordinates.length < 2) {
      return null;
    }
    const lng = Number(loc.coordinates[0]);
    const lat = Number(loc.coordinates[1]);
    if (!this.isValidCoordinatePair(lat, lng)) {
      return null;
    }
    return {
      type: 'Point',
      coordinates: [lng, lat],
    };
  }

  populateForm(p: Provider): void {
    const hours = p.opening_times?.length
      ? structuredClone(p.opening_times)
      : structuredClone(this.DEFAULT_HOURS);

    const normalizedLocation = this.normalizeSavedLocation(p.location);

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
      location: normalizedLocation,
      offerings: [...(p.offerings || [])],
      opening_times: hours,
      logo: p.logo || null,
      images: [...(p.images || [])],
      subscription_tier: p.subscription_tier || null,
    });

    this.waNumberSameAsPhone = !!(
      p.phone &&
      p.wa_number &&
      p.phone.trim() !== '' &&
      p.phone.trim() === p.wa_number.trim()
    );

    this.locationError.set(null);
    this.isDirty.set(false);
    this.syncMapToFormState();
  }

  markDirty(): void {
    this.isDirty.set(true);
    this.saveSuccess.set(false);
    this.saveError.set(null);
  }

  isCanonicalBusinessType(typeValue: string | null | undefined): boolean {
    if (!typeValue) return false;
    return this.businessTypes.some((bt) => bt.value === typeValue);
  }

  onBusinessTypeChange(newType: string): void {
    this.touched.businessType = true;
    this.form.update((f) => ({
      ...f,
      business_type: newType,
    }));
    this.markDirty();
  }

  isPublishedAreaName(cityName: string | null | undefined): boolean {
    if (!cityName) return false;
    const normalized = cityName.trim();
    return this.publishedAreas().some((area) => area.name === normalized);
  }

  onPhoneChange(newPhone: string): void {
    this.form.update((f) => ({
      ...f,
      phone: newPhone,
      wa_number: this.waNumberSameAsPhone ? newPhone : f.wa_number,
    }));
    this.markDirty();
  }

  onWaChange(newWa: string): void {
    this.form.update((f) => ({ ...f, wa_number: newWa }));
    this.markDirty();
  }

  toggleWaSameAsPhone(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.waNumberSameAsPhone = checked;
    if (checked) {
      this.form.update((f) => ({ ...f, wa_number: f.phone }));
    }
    this.markDirty();
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

  isValidLatitude(lat: unknown): lat is number {
    return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90;
  }

  isValidLongitude(lng: unknown): lng is number {
    return typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180;
  }

  isValidCoordinatePair(lat: unknown, lng: unknown): boolean {
    return this.isValidLatitude(lat) && this.isValidLongitude(lng);
  }

  getDefaultMapCenter(city: string = this.form().city): { lat: number; lng: number } {
    const trimmed = (city || '').trim();
    if (trimmed) {
      const matchedArea = this.publishedAreas().find(
        (area) =>
          area.name === trimmed &&
          this.isValidCoordinatePair(Number(area.latitude), Number(area.longitude)),
      );
      if (matchedArea) {
        return { lat: Number(matchedArea.latitude), lng: Number(matchedArea.longitude) };
      }
    }

    const normalized = trimmed
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (!normalized) {
      return BusinessProfileComponent.DEFAULT_HUB_CENTER;
    }
    const exact = BusinessProfileComponent.DESTINATION_HUB_COORDS[normalized];
    if (exact) {
      return exact;
    }
    for (const [hubKey, coords] of Object.entries(BusinessProfileComponent.DESTINATION_HUB_COORDS)) {
      if (normalized.includes(hubKey) || hubKey.includes(normalized)) {
        return coords;
      }
    }
    return BusinessProfileComponent.DEFAULT_HUB_CENTER;
  }

  onCityInput(): void {
    this.markDirty();
    if (!this.hasValidCoords() && this.map) {
      const center = this.getDefaultMapCenter(this.form().city);
      this.map.setView([center.lat, center.lng], 12);
    }
  }

  setCity(city: string): void {
    const normalizedCity = (city ?? '').trim();
    if (
      normalizedCity !== '' &&
      this.publishedAreas().length > 0 &&
      !this.isPublishedAreaName(normalizedCity) &&
      normalizedCity !== (this.provider()?.city || '').trim()
    ) {
      return;
    }
    this.form.update((f) => ({ ...f, city: normalizedCity }));
    this.markDirty();
    if (!this.hasValidCoords() && this.map) {
      const center = this.getDefaultMapCenter(normalizedCity);
      this.map.setView([center.lat, center.lng], 12);
    }
  }

  private createVamoPinIcon(L: any): any {
    return L.divIcon({
      className: 'custom-vamo-pin-wrap',
      html: `<div class="vamo-pin-bubble"><svg width="28" height="34" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 30 12 30C12 30 24 21 24 12C24 5.37 18.63 0 12 0Z" fill="#6366f1"/>
        <circle cx="12" cy="11" r="5" fill="#ffffff"/>
        <circle cx="12" cy="11" r="2.5" fill="#6366f1"/>
      </svg></div>`,
      iconSize: [28, 34],
      iconAnchor: [14, 34],
    });
  }

  async initMap(): Promise<void> {
    if (this.mapInitialized || this.destroyed || typeof window === 'undefined') return;

    const container =
      this.profileMapContainer?.nativeElement || document.getElementById('profile-map-canvas');
    if (!container) {
      this.scheduleMapInit(150);
      return;
    }

    try {
      const L = await this.loadLeaflet();
      if (!L || this.map || this.destroyed) return;

      const hasCoords = this.hasValidCoords();
      const defaultCenter = this.getDefaultMapCenter();
      const initialLat = hasCoords ? (this.lat() as number) : defaultCenter.lat;
      const initialLng = hasCoords ? (this.lng() as number) : defaultCenter.lng;
      const initialZoom = hasCoords ? 15 : 12;

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
      this.mapError.set(false);

      if (hasCoords) {
        this.syncMapMarker(initialLat, initialLng, false);
      }

      this.map.on('click', (e: any) => {
        if (!e?.latlng) return;
        const clickedLat = parseFloat(Number(e.latlng.lat).toFixed(6));
        const clickedLng = parseFloat(Number(e.latlng.lng).toFixed(6));
        this.setCoordinates(clickedLat, clickedLng, true);
      });

      if (typeof ResizeObserver !== 'undefined') {
        try {
          this.mapResizeObserver?.disconnect();
          this.mapResizeObserver = new ResizeObserver(() => {
            if (!this.destroyed) {
              this.map?.invalidateSize();
            }
          });
          this.mapResizeObserver.observe(container);
        } catch {}
      }

      const t1 = setTimeout(() => {
        if (!this.destroyed) this.map?.invalidateSize();
      }, 200);
      const t2 = setTimeout(() => {
        if (!this.destroyed) this.map?.invalidateSize();
      }, 600);
      this.mapInitTimers.push(t1, t2);
    } catch (err) {
      console.warn('[BusinessProfile] Leaflet map init failed or blocked:', err);
      this.mapError.set(true);
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

      const existingScript = document.getElementById('leaflet-js') as HTMLScriptElement | null;
      if (existingScript) {
        if ((window as any).L) {
          resolve((window as any).L);
          return;
        }
        existingScript.addEventListener('load', () => resolve((window as any).L), { once: true });
        existingScript.addEventListener('error', (e) => reject(e), { once: true });
        return;
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

  private syncMapMarker(lat: number, lng: number, updateMapView = true): void {
    if (!this.map || typeof window === 'undefined' || !(window as any).L) return;
    const L = (window as any).L;
    const vamoIcon = this.createVamoPinIcon(L);

    if (this.marker) {
      this.marker.setLatLng([lat, lng]);
    } else {
      this.marker = L.marker([lat, lng], { icon: vamoIcon, draggable: true }).addTo(this.map);
      this.marker.on('dragend', () => {
        const pos = this.marker?.getLatLng?.();
        if (!pos) return;
        this.setCoordinates(
          parseFloat(Number(pos.lat).toFixed(6)),
          parseFloat(Number(pos.lng).toFixed(6)),
          false,
        );
      });
    }

    if (updateMapView) {
      const currentZoom = typeof this.map.getZoom === 'function' ? this.map.getZoom() : 14;
      this.map.setView([lat, lng], Math.max(currentZoom, 14));
    }
  }

  private removeMapMarker(): void {
    if (this.marker) {
      try {
        this.marker.off?.();
        this.marker.remove?.();
      } catch {}
      this.marker = null;
    }
  }

  private syncMapToFormState(): void {
    if (!this.map) return;
    if (this.hasValidCoords()) {
      this.syncMapMarker(this.lat() as number, this.lng() as number, true);
    } else {
      this.removeMapMarker();
      const center = this.getDefaultMapCenter();
      this.map.setView([center.lat, center.lng], 12);
    }
  }

  setCoordinates(lat: number, lng: number, updateMapView = true): void {
    if (!this.isValidCoordinatePair(lat, lng)) {
      this.locationError.set(this.i18n.t('PORTAL.PROFILE.COORDS_INVALID'));
      return;
    }
    const normalizedLat = parseFloat(Number(lat).toFixed(6));
    const normalizedLng = parseFloat(Number(lng).toFixed(6));
    this.form.update((f) => ({
      ...f,
      location: {
        type: 'Point',
        coordinates: [normalizedLng, normalizedLat],
      },
    }));
    this.locationError.set(null);
    this.markDirty();
    this.syncMapMarker(normalizedLat, normalizedLng, updateMapView);
  }

  clearLocation(): void {
    this.form.update((f) => ({ ...f, location: null }));
    this.locationError.set(null);
    this.removeMapMarker();
    this.markDirty();
  }

  focusMap(): void {
    if (this.map) {
      this.map.invalidateSize();
    }
  }

  onLatChange(val: number | string | null): void {
    if (val === null || val === '' || Number.isNaN(Number(val))) {
      this.form.update((f) => ({ ...f, location: null }));
      this.locationError.set(null);
      this.removeMapMarker();
      this.markDirty();
      return;
    }
    const parsedLat = Number(val);
    if (!this.isValidLatitude(parsedLat)) {
      this.locationError.set(this.i18n.t('PORTAL.PROFILE.COORDS_INVALID'));
      return;
    }
    const currentLng = this.isValidLongitude(this.lng())
      ? (this.lng() as number)
      : this.getDefaultMapCenter().lng;
    this.setCoordinates(parsedLat, currentLng, true);
  }

  onLngChange(val: number | string | null): void {
    if (val === null || val === '' || Number.isNaN(Number(val))) {
      this.form.update((f) => ({ ...f, location: null }));
      this.locationError.set(null);
      this.removeMapMarker();
      this.markDirty();
      return;
    }
    const parsedLng = Number(val);
    if (!this.isValidLongitude(parsedLng)) {
      this.locationError.set(this.i18n.t('PORTAL.PROFILE.COORDS_INVALID'));
      return;
    }
    const currentLat = this.isValidLatitude(this.lat())
      ? (this.lat() as number)
      : this.getDefaultMapCenter().lat;
    this.setCoordinates(currentLat, parsedLng, true);
  }

  detectLocation(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const msg = this.i18n.t('PORTAL.PROFILE.GEO_NOT_SUPPORTED');
      this.locationError.set(msg);
      alert(msg);
      return;
    }

    this.detectingLocation.set(true);
    this.locationError.set(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.detectingLocation.set(false);
        const { latitude, longitude } = pos.coords;
        this.setCoordinates(latitude, longitude, true);
      },
      (err) => {
        this.detectingLocation.set(false);
        console.warn('[BusinessProfile] Geolocation error:', err);
        const msg = this.i18n.t('PORTAL.PROFILE.GEO_FAILED');
        this.locationError.set(msg);
        alert(msg);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  // ── Image Handlers ──────────────────────────────────────────────────
  onUploadKeydown(event: Event, input: HTMLInputElement, disabled = false): void {
    if (disabled) return;
    event.preventDefault();
    input.click();
  }

  onLogoDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.uploadingLogo() || this.saving() || !isFileDragEvent(event)) return;
    this.logoDragDepth++;
    this.isLogoDragOver.set(true);
  }

  onLogoDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.uploadingLogo() || this.saving() || !isFileDragEvent(event)) return;
    if (event.dataTransfer) {
      try {
        event.dataTransfer.dropEffect = 'copy';
      } catch {}
    }
    if (!this.isLogoDragOver()) {
      this.logoDragDepth = Math.max(this.logoDragDepth, 1);
      this.isLogoDragOver.set(true);
    }
  }

  onLogoDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.logoDragDepth > 0) {
      this.logoDragDepth--;
    }
    if (this.logoDragDepth === 0 && this.isLogoDragOver()) {
      this.isLogoDragOver.set(false);
    }
  }

  async onLogoDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.logoDragDepth = 0;
    this.isLogoDragOver.set(false);
    if (this.uploadingLogo() || this.saving() || !isFileDragEvent(event)) return;
    const files = extractDroppedFiles(event);
    if (!files.length) return;
    await this.handleLogoFiles(files);
  }

  async onLogoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const files = Array.from(input?.files || []);
    if (input && typeof input.value === 'string') {
      input.value = '';
    }
    if (!files.length) return;
    await this.handleLogoFiles(files);
  }

  async handleLogoFiles(files: File[]): Promise<void> {
    if (this.uploadingLogo() || this.saving() || !files.length) return;

    const validation = validateImageUploadFiles(files, { allowSvg: true, maxFiles: 1 });
    if (!validation.valid) {
      if (validation.errorReason === 'multiple_not_allowed') {
        this.saveError.set(this.i18n.t('PORTAL.PROFILE.LOGO_SINGLE_FILE_ERROR'));
      } else if (validation.errorReason === 'file_too_large') {
        this.saveError.set(this.i18n.t('PORTAL.PROFILE.FILE_TOO_LARGE'));
      } else {
        this.saveError.set(this.i18n.t('PORTAL.PROFILE.INVALID_LOGO_FILE_TYPE'));
      }
      return;
    }

    const file = files[0];
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
    }
  }

  removeLogo(): void {
    this.form.update((f) => ({ ...f, logo: null }));
    this.markDirty();
  }

  onGalleryDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.uploadingGallery() || this.saving() || !isFileDragEvent(event)) return;
    this.galleryDragDepth++;
    this.isGalleryDragOver.set(true);
  }

  onGalleryDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.uploadingGallery() || this.saving() || !isFileDragEvent(event)) return;
    if (event.dataTransfer) {
      try {
        event.dataTransfer.dropEffect = 'copy';
      } catch {}
    }
    if (!this.isGalleryDragOver()) {
      this.galleryDragDepth = Math.max(this.galleryDragDepth, 1);
      this.isGalleryDragOver.set(true);
    }
  }

  onGalleryDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.galleryDragDepth > 0) {
      this.galleryDragDepth--;
    }
    if (this.galleryDragDepth === 0 && this.isGalleryDragOver()) {
      this.isGalleryDragOver.set(false);
    }
  }

  async onGalleryDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.galleryDragDepth = 0;
    this.isGalleryDragOver.set(false);
    if (this.uploadingGallery() || this.saving() || !isFileDragEvent(event)) return;
    const files = extractDroppedFiles(event);
    if (!files.length) return;
    await this.handleGalleryFiles(files);
  }

  async onGallerySelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const files = Array.from(input?.files || []);
    if (input && typeof input.value === 'string') {
      input.value = '';
    }
    if (!files.length) return;
    await this.handleGalleryFiles(files);
  }

  async handleGalleryFiles(files: File[]): Promise<void> {
    if (this.uploadingGallery() || this.saving() || !files.length) return;

    const validation = validateImageUploadFiles(files, { allowSvg: false });
    if (!validation.valid) {
      this.saveError.set(
        validation.errorReason === 'file_too_large'
          ? this.i18n.t('PORTAL.PROFILE.FILE_TOO_LARGE')
          : this.i18n.t('PORTAL.PROFILE.INVALID_GALLERY_FILE_TYPE')
      );
      return;
    }

    this.uploadingGallery.set(true);
    this.saveError.set(null);
    this.uploadProgressMessage.set(null);

    try {
      const total = files.length;
      for (let i = 0; i < total; i++) {
        const file = files[i];
        this.uploadProgressMessage.set(
          this.i18n.t('PORTAL.PROFILE.UPLOADING_PHOTO', { current: i + 1, total })
        );
        const fileId = await this.businessService.uploadProviderImage(this.form().id, file);
        this.form.update((f) => ({
          ...f,
          images: [
            ...(f.images || []),
            { directus_files_id: { id: fileId } },
          ],
        }));
      }

      // Synchronize refreshed provider state to retain accurate junction identifiers
      if (this.form().id) {
        const refreshed = await this.businessService.getProviderById(this.form().id);
        this.provider.set(refreshed);
        this.form.update((f) => ({
          ...f,
          images: [...(refreshed.images || [])],
        }));
      }
      this.markDirty();
    } catch (err: any) {
      this.saveError.set(this.customerErrorService.toCustomerMessage(err, 'upload'));
    } finally {
      this.uploadingGallery.set(false);
      this.uploadProgressMessage.set(null);
    }
  }

  async removeGalleryImage(img: any, index: number): Promise<void> {
    const fid =
      typeof img.directus_files_id === 'object'
        ? img.directus_files_id?.id
        : (img.directus_files_id || img.id);
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
    if (!img) return '';
    if (typeof img === 'string') {
      return this.businessService.getAssetUrl(img, 'width=300&height=220&fit=cover');
    }
    const fileId =
      typeof img.directus_files_id === 'object' && img.directus_files_id !== null
        ? img.directus_files_id.id
        : (img.directus_files_id || img.id);
    if (!fileId) return '';
    return this.businessService.getAssetUrl(fileId, 'width=300&height=220&fit=cover');
  }

  onGalleryImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target && !target.src.includes('data:image/svg+xml')) {
      target.src =
        'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22220%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20300%20220%22%20fill%3D%22none%22%3E%3Crect%20width%3D%22300%22%20height%3D%22220%22%20fill%3D%22%23f1f5f9%22%2F%3E%3Cpath%20d%3D%22M150%2090a20%2020%200%201%200%200%2040%2020%2020%200%200%200%200-40zm-40%2050l25-25%2015%2015%2035-35%2035%2045H110z%22%20fill%3D%22%2394a3b8%22%2F%3E%3C%2Fsvg%3E';
    }
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
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email ?? '').trim());
  }

  isPhoneValid(phone: string | null | undefined): boolean {
    return isValidPhone(phone);
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
      (!f.wa_number?.trim() || isValidPhone(f.wa_number))
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
      const finalPhone = f.phone.trim();
      const finalWa = this.waNumberSameAsPhone
        ? finalPhone
        : (f.wa_number?.trim() || undefined);
      const safeCity =
        f.city &&
        this.publishedAreas().length > 0 &&
        !this.isPublishedAreaName(f.city) &&
        f.city !== (this.provider()?.city || '')
          ? (this.provider()?.city || '')
          : f.city;

      const updated = await this.businessService.updateProvider(
        f.id,
        {
          name: f.name,
          business_type: f.business_type,
          description: f.description,
          address: f.address,
          city: safeCity,
          phone: finalPhone,
          wa_number: finalWa,
          email: f.email.trim(),
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

      // Defensively preserve existing gallery images if response omitted relations
      const safeImages =
        updated && Array.isArray(updated.images) && updated.images.length > 0
          ? updated.images
          : this.form().images || [];

      const consolidatedProvider: Provider = {
        ...updated,
        images: safeImages,
      };

      this.provider.set(consolidatedProvider);
      this.populateForm(consolidatedProvider);
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
