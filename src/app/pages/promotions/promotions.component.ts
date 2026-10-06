import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { CustomerErrorService } from '../../core/services/customer-error.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import {
  StripeService,
  StripeAddonPlan,
  AddonType,
  BoostAvailability,
  SavedPaymentMethod,
} from '../../core/services/stripe.service';
import { VamoEvent, Area } from '../../core/models/event.model';
import type { Stripe, StripeElements } from '@stripe/stripe-js';

interface MessageDescriptor {
  key?: string;
  params?: Record<string, any>;
  raw?: string;
}

interface PartialSuccessState {
  completedTypes: AddonType[];
  failedTypes: AddonType[];
}

@Component({
  selector: 'app-promotions',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe, DatePipe],
  template: `
<div class="promotions-page">
  <!-- Header -->
  <header class="page-header">
    <div class="header-titles">
      <h1 class="page-title">{{ 'PORTAL.PROMOTIONS.TITLE' | translate }}</h1>
      <p class="page-subtitle">{{ 'PORTAL.PROMOTIONS.SUBTITLE' | translate }}</p>
    </div>
  </header>

  <!-- Global Feedback Banners -->
  <div *ngIf="activationPendingMessage()" class="alert alert-warning" role="alert">
    <span class="alert-icon">⚠️</span>
    <div class="alert-content">
      <strong>{{ 'PORTAL.PROMOTIONS.ACTIVATION_PENDING_TITLE' | translate }}</strong>
      <p>{{ activationPendingMessage() }}</p>
    </div>
    <button type="button" class="alert-close" (click)="clearActivationPending()" [attr.aria-label]="'PORTAL.PROMOTIONS.DISMISS' | translate">✕</button>
  </div>

  <div *ngIf="errorMessage()" class="alert alert-danger" role="alert">
    <span class="alert-icon">⚠️</span>
    <span class="alert-text">{{ errorMessage() }}</span>
    <button type="button" class="alert-close" (click)="errorDescriptor.set(null)" [attr.aria-label]="'PORTAL.PROMOTIONS.DISMISS' | translate">✕</button>
  </div>

  <div *ngIf="partialSuccessMessage()" class="alert alert-warning" role="alert">
    <span class="alert-icon">⚠️</span>
    <div class="alert-content">
      <strong>{{ 'PORTAL.PROMOTIONS.PARTIAL_SUCCESS_TITLE' | translate }}</strong>
      <p>{{ partialSuccessMessage() }}</p>
    </div>
    <button type="button" class="alert-close" (click)="partialSuccessState.set(null)" [attr.aria-label]="'PORTAL.PROMOTIONS.DISMISS' | translate">✕</button>
  </div>

  <div *ngIf="successMessage()" class="alert alert-success" role="alert">
    <span class="alert-icon">✓</span>
    <div class="alert-content">
      <strong>{{ 'PORTAL.PROMOTIONS.SUCCESS_TITLE' | translate }}</strong>
      <p>{{ successMessage() }}</p>
    </div>
    <button type="button" class="alert-close" (click)="successDescriptor.set(null)" [attr.aria-label]="'PORTAL.PROMOTIONS.DISMISS' | translate">✕</button>
  </div>

  <!-- Loading State -->
  <div *ngIf="isLoading()" class="loading-container">
    <div class="spinner"></div>
    <p>{{ 'PORTAL.PROMOTIONS.LOADING' | translate }}</p>
  </div>

  <div *ngIf="!isLoading()" class="promotions-content">

    <!-- ── ACTIVE PROMOTIONS SECTION ───────────────────────────────── -->
    <section class="card active-placements-card">
      <div class="card-header">
        <div>
          <h2 class="card-title">{{ 'PORTAL.PROMOTIONS.ACTIVE_PLACEMENTS_TITLE' | translate }}</h2>
          <p class="card-subtitle">{{ 'PORTAL.PROMOTIONS.ACTIVE_PLACEMENTS_SUBTITLE' | translate }}</p>
        </div>
      </div>
      <div class="card-body">
        <div *ngIf="activeEvents().length === 0" class="empty-state">
          <span class="empty-icon">✨</span>
          <p class="empty-text">{{ 'PORTAL.PROMOTIONS.EMPTY_ACTIVE' | translate }}</p>
        </div>

        <div *ngIf="activeEvents().length > 0" class="active-events-grid">
          <div *ngFor="let ev of activeEvents()" class="active-event-card">
            <div class="active-event-info">
              <h3 class="active-event-title">{{ ev.name }}</h3>
              <p class="active-event-meta" *ngIf="ev.startDate">
                {{ ev.startDate | date:'mediumDate' }}
              </p>
            </div>
            <div class="active-event-badges">
              <span *ngIf="ev.is_main_banner" class="badge badge-banner">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 11 18-5v12L3 14v-3z"></path><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"></path></svg>
                {{ 'PORTAL.PROMOTIONS.BANNER_BADGE' | translate }} — {{ 'PORTAL.PROMOTIONS.STATUS_ACTIVE' | translate }}
              </span>
              <span *ngIf="ev.is_whats_hot" class="badge badge-hot">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>
                {{ 'PORTAL.PROMOTIONS.HOT_BADGE' | translate }} — {{ 'PORTAL.PROMOTIONS.STATUS_ACTIVE' | translate }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── PURCHASE PROMOTIONS SECTION ──────────────────────────────── -->
    <section class="card purchase-card">
      <div class="card-header">
        <div>
          <h2 class="card-title">{{ 'PORTAL.PROMOTIONS.AVAILABLE_OPTIONS_TITLE' | translate }}</h2>
          <p class="card-subtitle">{{ 'PORTAL.PROMOTIONS.SUBTITLE' | translate }}</p>
        </div>
      </div>

      <div class="card-body">
        <!-- Zero Published Events Empty State -->
        <div *ngIf="publishedEvents().length === 0" class="no-events-box">
          <span class="no-events-icon">📋</span>
          <h3>{{ 'PORTAL.PROMOTIONS.NO_PUBLISHED_EVENTS' | translate }}</h3>
          <a routerLink="/app/listings/create" class="btn btn-primary btn-sm">
            {{ 'PORTAL.PROMOTIONS.CREATE_LISTING_BTN' | translate }}
          </a>
        </div>

        <div *ngIf="publishedEvents().length > 0" class="purchase-workflow">

          <!-- STEP 1: Select Event -->
          <div class="form-step">
            <label class="step-label" for="event-select">
              <span class="step-number">1</span>
              <div>
                <strong>{{ 'PORTAL.PROMOTIONS.STEP_EVENT_TITLE' | translate }}</strong>
                <p class="step-desc">{{ 'PORTAL.PROMOTIONS.STEP_EVENT_SUBTITLE' | translate }}</p>
              </div>
            </label>

            <select
              id="event-select"
              class="form-control select-event-input"
              [ngModel]="selectedEventId()"
              (ngModelChange)="onEventSelected($event)"
              [disabled]="isProcessingPayment() || paymentActive()"
            >
              <option [ngValue]="null" disabled>{{ 'PORTAL.PROMOTIONS.EVENT_SELECT_PLACEHOLDER' | translate }}</option>
              <option *ngFor="let ev of publishedEvents()" [value]="ev.id">
                {{ ev.name }} {{ (ev.is_main_banner || ev.is_whats_hot) ? ('(' + ('PORTAL.PROMOTIONS.STATUS_ACTIVE' | translate) + ')') : '' }}
              </option>
            </select>
          </div>

          <!-- Area Missing Warning -->
          <div *ngIf="selectedEventId() && hasNoAreaError()" class="alert alert-warning" role="alert">
            <span class="alert-icon">⚠️</span>
            <div class="alert-content">
              <p>{{ 'PORTAL.PROMOTIONS.ERROR_NO_AREA' | translate }}</p>
              <a [routerLink]="['/app/listings/edit', selectedEventId()]" class="btn btn-secondary btn-sm edit-listing-btn">
                {{ 'PORTAL.PROMOTIONS.EDIT_LISTING_BTN' | translate }}
              </a>
            </div>
          </div>

          <!-- STEP 2: Choose Placements -->
          <div class="form-step" *ngIf="selectedEventId()">
            <div class="step-label">
              <span class="step-number">2</span>
              <div>
                <strong>{{ 'PORTAL.PROMOTIONS.STEP_PLACEMENT_TITLE' | translate }}</strong>
                <p class="step-desc">{{ 'PORTAL.PROMOTIONS.STEP_PLACEMENT_SUBTITLE' | translate }}</p>
              </div>
            </div>

            <!-- Availability Loading Indicator -->
            <div *ngIf="availabilityLoading()" class="availability-loading">
              <span class="spinner-sm"></span>
              <span>{{ 'PORTAL.PROMOTIONS.LOADING_AVAILABILITY' | translate }}</span>
            </div>

            <div class="placements-grid">

              <!-- Main Banner Card -->
              <div
                class="placement-option"
                [class.placement-option--selected]="selectedPlacements().has('main_banner')"
                [class.placement-option--disabled]="isMainBannerDisabled()"
                (click)="togglePlacement('main_banner')"
                role="checkbox"
                [attr.aria-checked]="selectedPlacements().has('main_banner')"
                tabindex="0"
              >
                <div class="placement-icon placement-icon--banner">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 11 18-5v12L3 14v-3z"></path><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"></path></svg>
                </div>
                <div class="placement-details">
                  <div class="placement-header-row">
                    <h3 class="placement-title">{{ 'PORTAL.PROMOTIONS.MAIN_BANNER_TITLE' | translate }}</h3>
                    <span class="placement-price" *ngIf="mainBannerPrice() as mb">
                      {{ formatPrice(mb.amount, mb.currency) }} / 7 {{ 'PORTAL.PROMOTIONS.INTERVAL_DAYS' | translate }}
                    </span>
                  </div>
                  <p class="placement-desc">{{ 'PORTAL.PROMOTIONS.MAIN_BANNER_DESC' | translate }}</p>
                  
                  <div class="placement-footer-row">
                    <span *ngIf="selectedEventHasMainBanner()" class="status-chip chip-active">
                      ✓ {{ 'PORTAL.PROMOTIONS.ALREADY_ACTIVE_ON_EVENT' | translate }}
                    </span>
                    <span *ngIf="!selectedEventHasMainBanner() && (isPaymentConfirmed('main_banner') || isActivationPending('main_banner'))" class="status-chip chip-warning">
                      ⏳ {{ 'PORTAL.PROMOTIONS.STATUS_ACTIVATION_PENDING' | translate }}
                    </span>
                    <span *ngIf="!selectedEventHasMainBanner() && !isPaymentConfirmed('main_banner') && !isActivationPending('main_banner') && mainBannerFull()" class="status-chip chip-sold-out">
                      {{ 'PORTAL.PROMOTIONS.SOLD_OUT' | translate }}
                      <span *ngIf="mainBannerNextDate()" class="sold-out-date">
                        ({{ 'PORTAL.PROMOTIONS.SOLD_OUT_NEXT_DATE' | translate: { date: (mainBannerNextDate() | date:'mediumDate') } }})
                      </span>
                    </span>
                    <span *ngIf="!selectedEventHasMainBanner() && !isPaymentConfirmed('main_banner') && !isActivationPending('main_banner') && !mainBannerFull() && mainBannerSlotsLeft() !== null" class="status-chip chip-slots">
                      {{ 'PORTAL.PROMOTIONS.SLOTS_LEFT' | translate: { count: mainBannerSlotsLeft() } }}
                    </span>
                  </div>
                </div>
                <div class="placement-checkbox">
                  <input
                    type="checkbox"
                    [checked]="selectedPlacements().has('main_banner')"
                    [disabled]="isMainBannerDisabled()"
                    tabindex="-1"
                    [attr.aria-label]="'PORTAL.PROMOTIONS.MAIN_BANNER_TITLE' | translate"
                  />
                </div>
              </div>

              <!-- What's Hot Card -->
              <div
                class="placement-option"
                [class.placement-option--selected]="selectedPlacements().has('whats_hot')"
                [class.placement-option--disabled]="isWhatsHotDisabled()"
                (click)="togglePlacement('whats_hot')"
                role="checkbox"
                [attr.aria-checked]="selectedPlacements().has('whats_hot')"
                tabindex="0"
              >
                <div class="placement-icon placement-icon--hot">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>
                </div>
                <div class="placement-details">
                  <div class="placement-header-row">
                    <h3 class="placement-title">{{ 'PORTAL.PROMOTIONS.WHATS_HOT_TITLE' | translate }}</h3>
                    <span class="placement-price" *ngIf="whatsHotPrice() as wh">
                      {{ formatPrice(wh.amount, wh.currency) }} / 7 {{ 'PORTAL.PROMOTIONS.INTERVAL_DAYS' | translate }}
                    </span>
                  </div>
                  <p class="placement-desc">{{ 'PORTAL.PROMOTIONS.WHATS_HOT_DESC' | translate }}</p>
                  
                  <div class="placement-footer-row">
                    <span *ngIf="selectedEventHasWhatsHot()" class="status-chip chip-active">
                      ✓ {{ 'PORTAL.PROMOTIONS.ALREADY_ACTIVE_ON_EVENT' | translate }}
                    </span>
                    <span *ngIf="!selectedEventHasWhatsHot() && (isPaymentConfirmed('whats_hot') || isActivationPending('whats_hot'))" class="status-chip chip-warning">
                      ⏳ {{ 'PORTAL.PROMOTIONS.STATUS_ACTIVATION_PENDING' | translate }}
                    </span>
                    <span *ngIf="!selectedEventHasWhatsHot() && !isPaymentConfirmed('whats_hot') && !isActivationPending('whats_hot') && whatsHotFull()" class="status-chip chip-sold-out">
                      {{ 'PORTAL.PROMOTIONS.SOLD_OUT' | translate }}
                      <span *ngIf="whatsHotNextDate()" class="sold-out-date">
                        ({{ 'PORTAL.PROMOTIONS.SOLD_OUT_NEXT_DATE' | translate: { date: (whatsHotNextDate() | date:'mediumDate') } }})
                      </span>
                    </span>
                    <span *ngIf="!selectedEventHasWhatsHot() && !isPaymentConfirmed('whats_hot') && !isActivationPending('whats_hot') && !whatsHotFull() && whatsHotSlotsLeft() !== null" class="status-chip chip-slots">
                      {{ 'PORTAL.PROMOTIONS.SLOTS_LEFT' | translate: { count: whatsHotSlotsLeft() } }}
                    </span>
                  </div>
                </div>
                <div class="placement-checkbox">
                  <input
                    type="checkbox"
                    [checked]="selectedPlacements().has('whats_hot')"
                    [disabled]="isWhatsHotDisabled()"
                    tabindex="-1"
                    [attr.aria-label]="'PORTAL.PROMOTIONS.WHATS_HOT_TITLE' | translate"
                  />
                </div>
              </div>

            </div>
          </div>

          <!-- STEP 3: Summary & Payment -->
          <div class="form-step" *ngIf="selectedEventId() && hasSelection()">
            <div class="step-label">
              <span class="step-number">3</span>
              <div>
                <strong>{{ 'PORTAL.PROMOTIONS.STEP_SUMMARY_TITLE' | translate }}</strong>
              </div>
            </div>

            <div class="order-summary-box">
              <div class="summary-line">
                <span class="summary-key">{{ 'PORTAL.PROMOTIONS.SUMMARY_LISTING' | translate }}</span>
                <span class="summary-val font-semibold">{{ selectedEvent()?.name }}</span>
              </div>
              <div class="summary-line">
                <span class="summary-key">{{ 'PORTAL.PROMOTIONS.SUMMARY_PLACEMENTS' | translate }}</span>
                <div class="summary-val">
                  <span *ngIf="selectedPlacements().has('main_banner')" class="summary-pill">
                    {{ 'PORTAL.PROMOTIONS.MAIN_BANNER_TITLE' | translate }} ({{ formatPrice(mainBannerPrice()?.amount ?? 0, mainBannerPrice()?.currency ?? 'usd') }})
                  </span>
                  <span *ngIf="selectedPlacements().has('whats_hot')" class="summary-pill">
                    {{ 'PORTAL.PROMOTIONS.WHATS_HOT_TITLE' | translate }} ({{ formatPrice(whatsHotPrice()?.amount ?? 0, whatsHotPrice()?.currency ?? 'usd') }})
                  </span>
                </div>
              </div>
              <div class="summary-line">
                <span class="summary-key">{{ 'PORTAL.PROMOTIONS.SUMMARY_DURATION' | translate }}</span>
                <span class="summary-val">{{ 'PORTAL.PROMOTIONS.SUMMARY_DURATION_VAL' | translate }}</span>
              </div>
              <div class="summary-total-line" *ngIf="hasSameCurrency()">
                <span class="total-key">{{ 'PORTAL.PROMOTIONS.SUMMARY_TOTAL' | translate }}</span>
                <span class="total-val">{{ formattedTotal() }}</span>
              </div>
              <p class="separate-charges-note" *ngIf="selectedPlacements().size > 1">
                {{ 'PORTAL.PROMOTIONS.SEPARATE_CHARGES_NOTE' | translate }}
              </p>
            </div>

            <!-- Payment Options -->
            <div class="payment-step-container">
              <h3 class="payment-heading">{{ 'PORTAL.PROMOTIONS.STEP_PAYMENT_TITLE' | translate }}</h3>

              <!-- Saved cards list if available -->
              <div *ngIf="savedMethods().length > 0 && !paymentActive()" class="saved-methods-block">
                <div
                  *ngFor="let card of savedMethods()"
                  class="saved-card-choice"
                  [class.saved-card-choice--selected]="selectedSavedMethod()?.id === card.id && !useNewCard()"
                  (click)="selectSavedCard(card)"
                >
                  <input
                    type="radio"
                    name="paymentMethodChoice"
                    [checked]="selectedSavedMethod()?.id === card.id && !useNewCard()"
                    tabindex="-1"
                  />
                  <div class="card-brand-badge">{{ card.brand | uppercase }}</div>
                  <span class="card-digits font-mono">•••• •••• •••• {{ card.last4 }}</span>
                  <span class="card-exp">{{ card.expMonth }}/{{ card.expYear }}</span>
                </div>

                <div
                  class="saved-card-choice"
                  [class.saved-card-choice--selected]="useNewCard()"
                  (click)="selectUseNewCard()"
                >
                  <input
                    type="radio"
                    name="paymentMethodChoice"
                    [checked]="useNewCard()"
                    tabindex="-1"
                  />
                  <span class="new-card-label">{{ 'PORTAL.PROMOTIONS.NEW_CARD_TITLE' | translate }}</span>
                </div>
              </div>

              <!-- Inline Stripe Payment Element Mount Container -->
              <div *ngIf="paymentActive()" class="stripe-mount-wrapper">
                <div id="boost-payment-element" class="stripe-mount-box"></div>
              </div>

              <!-- CTA Actions -->
              <div class="checkout-actions">
                <button
                  type="button"
                  class="btn btn-primary"
                  *ngIf="!paymentActive()"
                  [disabled]="isProcessingPayment() || !hasSelection() || hasNoAreaError() || availabilityLoading() || !boostAvailability() || hasActivationPending()"
                  (click)="proceedToPayment()"
                >
                  <span *ngIf="isProcessingPayment()">{{ 'PORTAL.PROMOTIONS.PROCESSING' | translate }}</span>
                  <span *ngIf="!isProcessingPayment()">
                    {{ getPayButtonLabel() }} <span *ngIf="hasSameCurrency() && !isRetrying()">({{ formattedTotal() }})</span>
                  </span>
                </button>

                <button
                  type="button"
                  class="btn btn-primary"
                  *ngIf="paymentActive()"
                  [disabled]="!stripeReady() || isProcessingPayment()"
                  (click)="confirmInlinePayment()"
                >
                  <span *ngIf="isProcessingPayment()">{{ 'PORTAL.PROMOTIONS.PROCESSING' | translate }}</span>
                  <span *ngIf="!isProcessingPayment()">
                    {{ getConfirmButtonLabel() }}
                  </span>
                </button>

                <button
                  type="button"
                  class="btn btn-secondary"
                  *ngIf="paymentActive()"
                  [disabled]="isProcessingPayment()"
                  (click)="cancelPayment()"
                >
                  {{ 'PORTAL.PROMOTIONS.CANCEL_PAYMENT' | translate }}
                </button>
              </div>

            </div>

          </div>

        </div>
      </div>
    </section>

  </div>
</div>
  `,
  styles: [`
.promotions-page {
  padding: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
  color: #ffffff;
}

.page-header {
  margin-bottom: 2rem;
}

.page-title {
  font-size: 1.875rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 0.5rem 0;
  letter-spacing: -0.025em;
}

.page-subtitle {
  font-size: 1rem;
  color: #a0a0b8;
  margin: 0;
  max-width: 700px;
}

/* Feedback Alerts */
.alert {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-radius: 12px;
  margin-bottom: 1.5rem;
  font-size: 0.9375rem;
}

.alert-danger {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
}

.alert-warning {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #fcd34d;
}

.alert-success {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #6ee7b7;
}

.alert-icon {
  font-size: 1.25rem;
  line-height: 1;
}

.alert-content strong {
  display: block;
  font-size: 1rem;
  margin-bottom: 0.25rem;
}

.alert-content p {
  margin: 0;
}

.alert-close {
  background: transparent;
  border: none;
  color: currentColor;
  margin-left: auto;
  font-size: 1.25rem;
  cursor: pointer;
  opacity: 0.7;
  padding: 0 0.25rem;
}

.alert-close:hover {
  opacity: 1;
}

.edit-listing-btn {
  margin-top: 0.5rem;
  display: inline-block;
}

/* Loading */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 1rem;
  gap: 1rem;
  color: #a0a0b8;
}

.spinner {
  width: 2.5rem;
  height: 2.5rem;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #FE397F;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner-sm {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: #FE397F;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

.availability-loading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #a0a0b8;
  margin-bottom: 0.75rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.promotions-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

/* Cards */
.card {
  background: #181826;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  overflow: hidden;
}

.card-header {
  padding: 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #ffffff;
  margin: 0 0 0.25rem 0;
}

.card-subtitle {
  font-size: 0.875rem;
  color: #a0a0b8;
  margin: 0;
}

.card-body {
  padding: 1.5rem;
}

/* Active Events Grid */
.active-events-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
}

.active-event-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.active-event-title {
  font-size: 1rem;
  font-weight: 600;
  color: #ffffff;
  margin: 0 0 0.25rem 0;
}

.active-event-meta {
  font-size: 0.8125rem;
  color: #a0a0b8;
  margin: 0;
}

.active-event-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.65rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.badge-banner {
  background: rgba(254, 57, 127, 0.15);
  color: #FE397F;
  border: 1px solid rgba(254, 57, 127, 0.3);
}

.badge-hot {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.empty-state {
  text-align: center;
  padding: 2.5rem 1rem;
  color: #a0a0b8;
}

.empty-icon {
  font-size: 2.5rem;
  display: block;
  margin-bottom: 0.5rem;
}

.empty-text {
  margin: 0;
  font-size: 0.9375rem;
}

/* Purchase Workflow */
.purchase-workflow {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.form-step {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.step-label {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  cursor: pointer;
}

.step-number {
  background: #FE397F;
  color: #ffffff;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8125rem;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 2px;
}

.step-label strong {
  font-size: 1rem;
  color: #ffffff;
  display: block;
}

.step-desc {
  font-size: 0.8125rem;
  color: #a0a0b8;
  margin: 0.15rem 0 0 0;
}

.select-event-input {
  max-width: 480px;
}

/* Form Controls */
.form-control {
  background: #12121c;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: #ffffff;
  padding: 0.65rem 0.85rem;
  font-size: 0.9375rem;
  outline: none;
  transition: border-color 0.15s;
}

.form-control:focus {
  border-color: #FE397F;
}

.form-control:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Placements Grid */
.placements-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1rem;
  margin-top: 0.5rem;
}

.placement-option {
  background: rgba(255, 255, 255, 0.02);
  border: 2px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 1.25rem;
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.placement-option:hover:not(.placement-option--disabled) {
  border-color: rgba(254, 57, 127, 0.4);
  background: rgba(255, 255, 255, 0.04);
}

.placement-option--selected {
  border-color: #FE397F !important;
  background: rgba(254, 57, 127, 0.06) !important;
}

.placement-option--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.placement-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.placement-icon--banner {
  background: rgba(254, 57, 127, 0.15);
  color: #FE397F;
}

.placement-icon--hot {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.placement-details {
  flex: 1;
}

.placement-header-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.placement-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: #ffffff;
  margin: 0;
}

.placement-price {
  font-size: 0.9375rem;
  font-weight: 700;
  color: #FE397F;
}

.placement-desc {
  font-size: 0.8125rem;
  color: #a0a0b8;
  margin: 0 0 0.75rem 0;
  line-height: 1.4;
}

.placement-footer-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-chip {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-weight: 500;
}

.chip-active {
  background: rgba(16, 185, 129, 0.15);
  color: #6ee7b7;
}

.chip-warning {
  background: rgba(245, 158, 11, 0.15);
  color: #fcd34d;
}

.chip-sold-out {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
}

.sold-out-date {
  opacity: 0.85;
}

.chip-slots {
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
}

.placement-checkbox input[type="checkbox"] {
  accent-color: #FE397F;
  width: 18px;
  height: 18px;
  cursor: pointer;
}

/* Order Summary */
.order-summary-box {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.summary-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9375rem;
}

.summary-key {
  color: #a0a0b8;
}

.summary-pill {
  display: inline-block;
  background: rgba(254, 57, 127, 0.15);
  color: #FE397F;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  font-size: 0.8125rem;
  margin-left: 0.35rem;
}

.summary-total-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 0.75rem;
  margin-top: 0.25rem;
}

.total-key {
  font-size: 1.125rem;
  font-weight: 700;
  color: #ffffff;
}

.total-val {
  font-size: 1.25rem;
  font-weight: 800;
  color: #FE397F;
}

.separate-charges-note {
  margin: 0.5rem 0 0 0;
  font-size: 0.8125rem;
  color: #a0a0b8;
  font-style: italic;
}

/* Payment Step */
.payment-step-container {
  margin-top: 1.75rem;
  max-width: 600px;
}

.payment-heading {
  font-size: 1.125rem;
  font-weight: 600;
  color: #ffffff;
  margin: 0 0 1rem 0;
}

.saved-methods-block {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  margin-bottom: 1.25rem;
}

.saved-card-choice {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.saved-card-choice:hover {
  background: rgba(255, 255, 255, 0.04);
}

.saved-card-choice--selected {
  border-color: #FE397F;
  background: rgba(254, 57, 127, 0.05);
}

.saved-card-choice input[type="radio"] {
  accent-color: #FE397F;
}

.card-brand-badge {
  background: rgba(255, 255, 255, 0.1);
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.card-digits {
  font-size: 0.9375rem;
  letter-spacing: 0.05em;
}

.card-exp {
  font-size: 0.8125rem;
  color: #a0a0b8;
  margin-left: auto;
}

.new-card-label {
  font-size: 0.9375rem;
  color: #ffffff;
}

.stripe-mount-wrapper {
  margin: 1.25rem 0;
  background: #1c1c2e;
  padding: 1.25rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.checkout-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.25rem;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  border-radius: 10px;
  padding: 0.7rem 1.25rem;
  font-size: 0.9375rem;
  cursor: pointer;
  border: none;
  transition: all 0.15s ease;
  text-decoration: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #FE397F;
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
  background: #e0286e;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}

.btn-sm {
  padding: 0.4rem 0.85rem;
  font-size: 0.8125rem;
}

.no-events-box {
  text-align: center;
  padding: 3rem 1rem;
}

.no-events-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: 0.75rem;
}
  `]
})
export class PromotionsComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private businessService = inject(BusinessService);
  private stripeService = inject(StripeService);
  private errorService = inject(CustomerErrorService);
  private i18n = inject(I18nService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  // State Signals
  events = signal<VamoEvent[]>([]);
  addonPrices = signal<StripeAddonPlan[]>([]);
  savedMethods = signal<SavedPaymentMethod[]>([]);
  boostAvailability = signal<BoostAvailability | null>(null);

  selectedEventId = signal<string | null>(null);
  selectedPlacements = signal<Set<AddonType>>(new Set());

  selectedSavedMethod = signal<SavedPaymentMethod | null>(null);
  useNewCard = signal<boolean>(false);

  isLoading = signal<boolean>(true);
  availabilityLoading = signal<boolean>(false);
  hasNoAreaError = signal<boolean>(false);
  hasAvailabilityError = signal<boolean>(false);
  isProcessingPayment = signal<boolean>(false);

  // Reactive message descriptors & states
  errorDescriptor = signal<MessageDescriptor | null>(null);
  successDescriptor = signal<MessageDescriptor | null>(null);
  partialSuccessState = signal<PartialSuccessState | null>(null);

  paymentActive = signal<boolean>(false);
  stripeReady = signal<boolean>(false);
  currentMountedType = signal<AddonType | null>(null);

  // Payment Confirmation & Activation Protection
  paymentConfirmedTypes = signal<Set<AddonType>>(new Set());
  activationPendingTypes = signal<Set<AddonType>>(new Set());
  activationPendingDismissed = signal<boolean>(false);

  private stripeInstance: Stripe | null = null;
  private stripeElements: StripeElements | null = null;
  private pendingQueue: AddonType[] = [];
  completedAddons = signal<AddonType[]>([]);
  private routeSub: Subscription | null = null;
  private availabilitySeq = 0;

  hasActivationPending = computed(() => this.activationPendingTypes().size > 0);

  activationPendingMessage = computed(() => {
    if (this.activationPendingTypes().size === 0 || this.activationPendingDismissed()) return null;
    this.i18n.lang(); // reactive tracking
    return this.i18n.t('PORTAL.PROMOTIONS.ACTIVATION_PENDING_DESC');
  });

  // Computed Values
  publishedEvents = computed(() =>
    this.events().filter(e => e.status === 'published')
  );

  activeEvents = computed(() =>
    this.events().filter(e => e.is_main_banner || e.is_whats_hot)
  );

  selectedEvent = computed(() =>
    this.events().find(e => e.id === this.selectedEventId()) ?? null
  );

  mainBannerPrice = computed(() =>
    this.addonPrices().find(p => this.normalize(p.name).includes('main banner'))
  );

  whatsHotPrice = computed(() =>
    this.addonPrices().find(p => this.normalize(p.name).includes('whats hot'))
  );

  mainBannerSlotsLeft = computed(() => {
    const avail = this.boostAvailability();
    if (!avail?.mainBanner) return null;
    return Math.max(0, avail.mainBanner.limit - avail.mainBanner.count);
  });

  whatsHotSlotsLeft = computed(() => {
    const avail = this.boostAvailability();
    if (!avail?.whatsHot) return null;
    return Math.max(0, avail.whatsHot.limit - avail.whatsHot.count);
  });

  mainBannerFull = computed(() => {
    const avail = this.boostAvailability();
    return !!avail?.mainBanner && avail.mainBanner.count >= avail.mainBanner.limit;
  });

  whatsHotFull = computed(() => {
    const avail = this.boostAvailability();
    return !!avail?.whatsHot && avail.whatsHot.count >= avail.whatsHot.limit;
  });

  mainBannerNextDate = computed(() =>
    this.boostAvailability()?.mainBanner?.nextAvailableDate ?? null
  );

  whatsHotNextDate = computed(() =>
    this.boostAvailability()?.whatsHot?.nextAvailableDate ?? null
  );

  selectedEventHasMainBanner = computed(() =>
    !!this.selectedEvent()?.is_main_banner
  );

  selectedEventHasWhatsHot = computed(() =>
    !!this.selectedEvent()?.is_whats_hot
  );

  isMainBannerDisabled = computed(() =>
    this.selectedEventHasMainBanner() ||
    this.mainBannerFull() ||
    this.hasNoAreaError() ||
    this.availabilityLoading() ||
    !this.boostAvailability() ||
    this.hasAvailabilityError() ||
    this.paymentConfirmedTypes().has('main_banner') ||
    this.activationPendingTypes().has('main_banner')
  );

  isWhatsHotDisabled = computed(() =>
    this.selectedEventHasWhatsHot() ||
    this.whatsHotFull() ||
    this.hasNoAreaError() ||
    this.availabilityLoading() ||
    !this.boostAvailability() ||
    this.hasAvailabilityError() ||
    this.paymentConfirmedTypes().has('whats_hot') ||
    this.activationPendingTypes().has('whats_hot')
  );

  totalAmount = computed(() => {
    let total = 0;
    if (this.selectedPlacements().has('main_banner') && this.mainBannerPrice()) {
      total += this.mainBannerPrice()!.amount;
    }
    if (this.selectedPlacements().has('whats_hot') && this.whatsHotPrice()) {
      total += this.whatsHotPrice()!.amount;
    }
    return total;
  });

  hasSameCurrency = computed(() => {
    const currencies = new Set<string>();
    if (this.selectedPlacements().has('main_banner') && this.mainBannerPrice()) {
      currencies.add(this.mainBannerPrice()!.currency.toLowerCase());
    }
    if (this.selectedPlacements().has('whats_hot') && this.whatsHotPrice()) {
      currencies.add(this.whatsHotPrice()!.currency.toLowerCase());
    }
    return currencies.size <= 1;
  });

  primaryCurrency = computed(() => {
    if (this.selectedPlacements().has('main_banner') && this.mainBannerPrice()) {
      return this.mainBannerPrice()!.currency;
    }
    if (this.selectedPlacements().has('whats_hot') && this.whatsHotPrice()) {
      return this.whatsHotPrice()!.currency;
    }
    return 'usd';
  });

  formattedTotal = computed(() => {
    this.i18n.lang();
    if (!this.hasSameCurrency()) return '';
    return this.formatPrice(this.totalAmount(), this.primaryCurrency());
  });

  isRetrying = computed(() =>
    this.completedAddons().length > 0 && this.selectedPlacements().size > 0
  );

  currentPlacementPrice = computed(() => {
    const type = this.currentMountedType();
    if (!type) return null;
    return type === 'main_banner' ? this.mainBannerPrice() : this.whatsHotPrice();
  });

  // Reactive message strings
  errorMessage = computed(() => {
    const d = this.errorDescriptor();
    if (!d) return null;
    this.i18n.lang();
    if (d.key) {
      return this.i18n.t(d.key, d.params);
    }
    return d.raw ?? null;
  });

  successMessage = computed(() => {
    const d = this.successDescriptor();
    if (!d) return null;
    this.i18n.lang();
    if (d.key) {
      return this.i18n.t(d.key, d.params);
    }
    return d.raw ?? null;
  });

  partialSuccessMessage = computed(() => {
    const state = this.partialSuccessState();
    if (!state) return null;
    this.i18n.lang(); // reactive dependency on current active language

    const completedNames = state.completedTypes
      .map((t) =>
        this.i18n.t(
          t === 'main_banner'
            ? 'PORTAL.PROMOTIONS.MAIN_BANNER_TITLE'
            : 'PORTAL.PROMOTIONS.WHATS_HOT_TITLE'
        )
      )
      .join(', ');

    const failedNames = state.failedTypes
      .map((t) =>
        this.i18n.t(
          t === 'main_banner'
            ? 'PORTAL.PROMOTIONS.MAIN_BANNER_TITLE'
            : 'PORTAL.PROMOTIONS.WHATS_HOT_TITLE'
        )
      )
      .join(', ');

    return this.i18n.t('PORTAL.PROMOTIONS.PARTIAL_SUCCESS_DESC', {
      completed: completedNames,
      failed: failedNames,
    });
  });

  ngOnInit(): void {
    void this.loadData();
    this.routeSub = this.route.queryParamMap.subscribe((params) => {
      const qEventId = params.get('eventId');
      if (qEventId && !this.isLoading()) {
        const found = this.publishedEvents().find((e) => e.id === qEventId);
        if (found) {
          void this.onEventSelected(found.id);
        } else {
          this.errorDescriptor.set({ key: 'PORTAL.PROMOTIONS.ERROR_INVALID_EVENT' });
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.cleanupStripe();
  }

  async loadData(): Promise<void> {
    this.isLoading.set(true);
    this.errorDescriptor.set(null);

    const user = this.authService.currentUser;
    const providerId = user?.provider_link?.id;

    try {
      const [events, prices, methods] = await Promise.all([
        providerId ? this.businessService.getEventsForProvider(providerId) : Promise.resolve([]),
        this.stripeService.getAddonPrices().catch(() => []),
        this.stripeService.getSavedPaymentMethods().catch(() => []),
      ]);

      this.events.set(events);
      this.addonPrices.set(prices);
      this.savedMethods.set(methods);

      if (methods.length > 0) {
        this.selectedSavedMethod.set(methods[0]);
        this.useNewCard.set(false);
      } else {
        this.useNewCard.set(true);
      }

      // Check query params for event preselection
      const queryEventId = this.route.snapshot.queryParamMap.get('eventId');
      if (queryEventId) {
        const found = this.publishedEvents().find((e) => e.id === queryEventId);
        if (found) {
          await this.onEventSelected(found.id);
        } else {
          this.errorDescriptor.set({ key: 'PORTAL.PROMOTIONS.ERROR_INVALID_EVENT' });
        }
      }
    } catch (err) {
      this.errorDescriptor.set(this.errorService.toCustomerErrorKey(err, 'load'));
    } finally {
      this.isLoading.set(false);
    }
  }

  getEventAreaId(event: VamoEvent | null | undefined): string | null {
    if (!event || !event.areas || event.areas.length === 0) return null;
    const first = event.areas[0];
    if (!first) return null;
    if (typeof first.areas_id === 'string' && first.areas_id.trim()) {
      return first.areas_id.trim();
    }
    if (first.areas_id && typeof first.areas_id === 'object' && 'id' in first.areas_id) {
      const id = (first.areas_id as Area).id;
      return typeof id === 'string' && id.trim() ? id.trim() : null;
    }
    return null;
  }

  async onEventSelected(eventId: string | null): Promise<void> {
    this.availabilitySeq++;
    const currentSeq = this.availabilitySeq;

    this.selectedEventId.set(eventId);
    this.errorDescriptor.set(null);
    this.hasAvailabilityError.set(false);
    this.boostAvailability.set(null);
    this.paymentConfirmedTypes.set(new Set());
    this.activationPendingTypes.set(new Set());
    this.activationPendingDismissed.set(false);
    this.cancelPayment();

    if (!eventId) {
      this.hasNoAreaError.set(false);
      this.availabilityLoading.set(false);
      return;
    }

    const ev = this.events().find((e) => e.id === eventId);
    if (!ev) {
      this.hasNoAreaError.set(false);
      this.availabilityLoading.set(false);
      return;
    }

    // Prune active placements already on event
    const next = new Set(this.selectedPlacements());
    if (ev.is_main_banner) next.delete('main_banner');
    if (ev.is_whats_hot) next.delete('whats_hot');
    this.selectedPlacements.set(next);

    // Validate area
    const areaId = this.getEventAreaId(ev);
    if (!areaId) {
      this.hasNoAreaError.set(true);
      this.availabilityLoading.set(false);
      return;
    }

    this.hasNoAreaError.set(false);
    this.availabilityLoading.set(true);
    try {
      const avail = await this.stripeService.getBoostAvailability(areaId);
      if (currentSeq !== this.availabilitySeq || this.selectedEventId() !== eventId) {
        return; // Discard stale async response
      }
      this.boostAvailability.set(avail);
      this.hasAvailabilityError.set(false);
    } catch {
      if (currentSeq !== this.availabilitySeq || this.selectedEventId() !== eventId) {
        return; // Discard stale error
      }
      this.boostAvailability.set(null);
      this.hasAvailabilityError.set(true);
      this.errorDescriptor.set({ key: 'PORTAL.PROMOTIONS.ERROR_AVAILABILITY' });
    } finally {
      if (currentSeq === this.availabilitySeq) {
        this.availabilityLoading.set(false);
      }
    }
  }

  togglePlacement(type: AddonType): void {
    if (type === 'main_banner' && this.isMainBannerDisabled()) return;
    if (type === 'whats_hot' && this.isWhatsHotDisabled()) return;
    if (this.paymentConfirmedTypes().has(type) || this.activationPendingTypes().has(type)) return;

    const current = new Set(this.selectedPlacements());
    if (current.has(type)) {
      current.delete(type);
    } else {
      current.add(type);
    }
    this.selectedPlacements.set(current);
    this.cancelPayment();
  }

  hasSelection(): boolean {
    return this.selectedPlacements().size > 0;
  }

  selectSavedCard(card: SavedPaymentMethod): void {
    this.selectedSavedMethod.set(card);
    this.useNewCard.set(false);
    this.cancelPayment();
  }

  selectUseNewCard(): void {
    this.selectedSavedMethod.set(null);
    this.useNewCard.set(true);
  }

  getPayButtonLabel(): string {
    if (this.completedAddons().length > 0 && this.selectedPlacements().size > 0) {
      const remainingType = Array.from(this.selectedPlacements())[0];
      const placementName = remainingType
        ? this.i18n.t(
            remainingType === 'main_banner'
              ? 'PORTAL.PROMOTIONS.MAIN_BANNER_TITLE'
              : 'PORTAL.PROMOTIONS.WHATS_HOT_TITLE'
          )
        : '';
      return this.i18n.t('PORTAL.PROMOTIONS.RETRY_BTN', { placement: placementName });
    }
    return this.i18n.t('PORTAL.PROMOTIONS.PAY_BTN');
  }

  getConfirmButtonLabel(): string {
    const type = this.currentMountedType();
    const price = this.currentPlacementPrice();
    if (type && price) {
      const formattedPrice = this.formatPrice(price.amount, price.currency);
      const placementName = this.i18n.t(
        type === 'main_banner'
          ? 'PORTAL.PROMOTIONS.MAIN_BANNER_TITLE'
          : 'PORTAL.PROMOTIONS.WHATS_HOT_TITLE'
      );
      return this.i18n.t('PORTAL.PROMOTIONS.PAY_CURRENT_BTN', {
        price: formattedPrice,
        placement: placementName,
      });
    }
    return this.i18n.t('PORTAL.PROMOTIONS.PAY_BTN');
  }

  async proceedToPayment(): Promise<void> {
    const event = this.selectedEvent();
    if (!event) {
      this.errorDescriptor.set({ key: 'PORTAL.PROMOTIONS.ERROR_SELECT_EVENT' });
      return;
    }
    if (this.hasNoAreaError()) {
      return;
    }
    if (this.availabilityLoading() || !this.boostAvailability() || this.hasAvailabilityError()) {
      this.errorDescriptor.set({ key: 'PORTAL.PROMOTIONS.ERROR_AVAILABILITY' });
      return;
    }
    if (!this.hasSelection()) {
      this.errorDescriptor.set({ key: 'PORTAL.PROMOTIONS.ERROR_SELECT_PLACEMENT' });
      return;
    }

    const user = this.authService.currentUser;
    const providerId = user?.provider_link?.id;
    if (!providerId) {
      this.errorDescriptor.set({ key: 'PORTAL.PROMOTIONS.ERROR_SELECT_EVENT' });
      return;
    }

    this.errorDescriptor.set(null);
    // Queue only remaining uncompleted and unconfirmed placements to prevent duplicate charges
    this.pendingQueue = Array.from(this.selectedPlacements()).filter(
      (t) =>
        !this.completedAddons().includes(t) &&
        !this.paymentConfirmedTypes().has(t) &&
        !this.activationPendingTypes().has(t)
    );
    if (this.pendingQueue.length === 0) {
      return;
    }
    await this.processQueue(providerId, event.id);
  }

  private async processQueue(providerId: string, eventId: string): Promise<void> {
    if (this.pendingQueue.length === 0) {
      // All selected placements completed successfully
      this.successDescriptor.set({ key: 'PORTAL.PROMOTIONS.SUCCESS_DESC' });
      this.partialSuccessState.set(null);
      this.selectedPlacements.set(new Set());
      this.completedAddons.set([]);
      this.cleanupStripe();
      await this.loadData();
      return;
    }

    const type = this.pendingQueue[0];
    if (
      !type ||
      this.paymentConfirmedTypes().has(type) ||
      this.activationPendingTypes().has(type) ||
      this.completedAddons().includes(type)
    ) {
      this.pendingQueue.shift();
      await this.processQueue(providerId, eventId);
      return;
    }

    const price = type === 'main_banner' ? this.mainBannerPrice() : this.whatsHotPrice();
    if (!price) {
      this.errorDescriptor.set({ key: 'PORTAL.PROMOTIONS.ERROR_PRICE_NOT_FOUND' });
      return;
    }

    this.isProcessingPayment.set(true);

    try {
      const result = await this.stripeService.createAddonPayment(
        price.id,
        type,
        providerId,
        eventId,
        undefined
      );

      // If 100% coupon / free
      if ('free' in result && result.free) {
        try {
          await this.stripeService.applyAddon(type, undefined, eventId, undefined);
          this.recordPlacementSuccess(type, eventId);
          this.pendingQueue.shift();
          await this.processQueue(providerId, eventId);
          return;
        } catch (freeErr: any) {
          this.handlePaymentFailure(freeErr);
          return;
        }
      }

      const paidResult = result as { clientSecret: string; paymentIntentId: string };
      const savedCard = this.selectedSavedMethod();

      if (savedCard && !this.useNewCard()) {
        const { error } = await this.stripeService.confirmWithSavedMethod(
          paidResult.clientSecret,
          savedCard.id
        );
        if (error) {
          this.handlePaymentFailure(error);
          return;
        }

        // Mark payment confirmed BEFORE calling applyAddon
        this.markPaymentConfirmed(type);

        try {
          await this.stripeService.applyAddon(type, undefined, eventId, undefined);
          this.clearPaymentConfirmed(type);
          this.recordPlacementSuccess(type, eventId);
          this.pendingQueue.shift();
          await this.processQueue(providerId, eventId);
        } catch (applyErr: any) {
          this.handleActivationFailure(type, applyErr);
          return;
        }
      } else {
        // Mount PaymentElement for new card
        this.currentMountedType.set(type);
        this.paymentActive.set(true);
        setTimeout(() => this.mountPayment(paidResult.clientSecret), 150);
      }
    } catch (err: any) {
      this.handlePaymentFailure(err);
    } finally {
      this.isProcessingPayment.set(false);
    }
  }

  private async mountPayment(clientSecret: string): Promise<void> {
    try {
      const { stripe, elements } = await this.stripeService.mountPaymentElement(
        clientSecret,
        'boost-payment-element'
      );
      this.stripeInstance = stripe;
      this.stripeElements = elements;
      this.stripeReady.set(true);
    } catch (err: any) {
      this.errorDescriptor.set(this.errorService.toCustomerErrorKey(err, 'load'));
    }
  }

  async confirmInlinePayment(): Promise<void> {
    if (!this.stripeInstance || !this.stripeElements || this.pendingQueue.length === 0) return;

    const event = this.selectedEvent();
    const user = this.authService.currentUser;
    const providerId = user?.provider_link?.id;
    if (!event || !providerId) return;

    this.isProcessingPayment.set(true);
    this.errorDescriptor.set(null);

    const type = this.pendingQueue[0];

    try {
      const { error } = await this.stripeInstance.confirmPayment({
        elements: this.stripeElements,
        redirect: 'if_required',
      });

      if (error) {
        this.handlePaymentFailure(error);
        return;
      }

      // Mark payment confirmed BEFORE calling applyAddon
      this.markPaymentConfirmed(type);

      try {
        await this.stripeService.applyAddon(type, undefined, event.id, undefined);
        this.clearPaymentConfirmed(type);
        this.recordPlacementSuccess(type, event.id);
        this.pendingQueue.shift();

        this.cleanupStripe();
        await this.processQueue(providerId, event.id);
      } catch (applyErr: any) {
        this.handleActivationFailure(type, applyErr);
        return;
      }
    } catch (err: any) {
      if (this.paymentConfirmedTypes().has(type)) {
        this.handleActivationFailure(type, err);
      } else {
        this.handlePaymentFailure(err);
      }
    } finally {
      this.isProcessingPayment.set(false);
    }
  }

  private recordPlacementSuccess(type: AddonType, eventId: string): void {
    this.completedAddons.set([...this.completedAddons(), type]);

    // Update local event object so UI immediately reflects active boost
    const ev = this.events().find((e) => e.id === eventId);
    if (ev) {
      if (type === 'main_banner') ev.is_main_banner = true;
      if (type === 'whats_hot') ev.is_whats_hot = true;
      this.events.set([...this.events()]);
    }

    // Remove from selected placements so retry cannot charge it again
    const next = new Set(this.selectedPlacements());
    next.delete(type);
    this.selectedPlacements.set(next);
  }

  private handleActivationFailure(type: AddonType, err: any): void {
    // Mark placement in activation pending state
    this.activationPendingTypes.update((set) => new Set(set).add(type));
    this.paymentConfirmedTypes.update((set) => new Set(set).add(type));
    this.activationPendingDismissed.set(false);

    // Stop automatic processing immediately (do not charge subsequent queued placements)
    this.pendingQueue = [];

    // Remove from selected placements so user cannot pay for it again
    const next = new Set(this.selectedPlacements());
    next.delete(type);
    this.selectedPlacements.set(next);

    // Clear any generic error or partial success descriptors
    this.errorDescriptor.set(null);
    this.partialSuccessState.set(null);

    // Clean up Stripe element
    this.cleanupStripe();
  }

  private handlePaymentFailure(err: any): void {
    if (this.completedAddons().length > 0) {
      this.partialSuccessState.set({
        completedTypes: [...this.completedAddons()],
        failedTypes: [...this.pendingQueue],
      });
    }

    this.errorDescriptor.set(this.errorService.toCustomerErrorKey(err, 'save'));
    this.pendingQueue = [];
    this.cleanupStripe();
  }

  getPlacementState(type: AddonType): 'not_started' | 'payment_confirmed' | 'activation_pending' | 'completed' {
    if (this.completedAddons().includes(type)) return 'completed';
    if (this.activationPendingTypes().has(type)) return 'activation_pending';
    if (this.paymentConfirmedTypes().has(type)) return 'payment_confirmed';
    return 'not_started';
  }

  isPaymentConfirmed(type: AddonType): boolean {
    return this.paymentConfirmedTypes().has(type);
  }

  isActivationPending(type: AddonType): boolean {
    return this.activationPendingTypes().has(type);
  }

  clearActivationPending(): void {
    this.activationPendingDismissed.set(true);
  }

  private markPaymentConfirmed(type: AddonType): void {
    this.paymentConfirmedTypes.update((set) => new Set(set).add(type));
  }

  private clearPaymentConfirmed(type: AddonType): void {
    this.paymentConfirmedTypes.update((set) => {
      const next = new Set(set);
      next.delete(type);
      return next;
    });
  }

  cancelPayment(): void {
    this.cleanupStripe();
    this.pendingQueue = [];
  }

  private cleanupStripe(): void {
    this.paymentActive.set(false);
    this.stripeReady.set(false);
    this.stripeInstance = null;
    this.stripeElements = null;
    this.currentMountedType.set(null);
    this.stripeService.cleanup();
  }

  formatPrice(amount: number, currency: string): string {
    const lang = this.i18n.lang();
    return new Intl.NumberFormat(lang === 'es' ? 'es-DO' : 'en-US', {
      style: 'currency',
      currency: (currency || 'usd').toUpperCase(),
      minimumFractionDigits: 0,
    }).format(amount / 100);
  }

  private normalize(s: string): string {
    return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  }
}
