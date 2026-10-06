import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
import { VamoEvent } from '../../core/models/event.model';
import type { Stripe, StripeElements } from '@stripe/stripe-js';

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
  <div *ngIf="errorMessage()" class="alert alert-danger" role="alert">
    <span class="alert-icon">⚠️</span>
    <span class="alert-text">{{ errorMessage() }}</span>
    <button type="button" class="alert-close" (click)="errorMessage.set(null)" [attr.aria-label]="'PORTAL.PROMOTIONS.DISMISS' | translate">✕</button>
  </div>

  <div *ngIf="successMessage()" class="alert alert-success" role="alert">
    <span class="alert-icon">✓</span>
    <div class="alert-content">
      <strong>{{ isLastScheduled() ? ('PORTAL.PROMOTIONS.SUCCESS_SCHEDULED_TITLE' | translate) : ('PORTAL.PROMOTIONS.SUCCESS_TITLE' | translate) }}</strong>
      <p>{{ successMessage() }}</p>
    </div>
    <button type="button" class="alert-close" (click)="successMessage.set(null)" [attr.aria-label]="'PORTAL.PROMOTIONS.DISMISS' | translate">✕</button>
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

          <!-- STEP 2: Choose Placements -->
          <div class="form-step" *ngIf="selectedEventId()">
            <div class="step-label">
              <span class="step-number">2</span>
              <div>
                <strong>{{ 'PORTAL.PROMOTIONS.STEP_PLACEMENT_TITLE' | translate }}</strong>
                <p class="step-desc">{{ 'PORTAL.PROMOTIONS.STEP_PLACEMENT_SUBTITLE' | translate }}</p>
              </div>
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
                    <span *ngIf="!selectedEventHasMainBanner() && mainBannerFull()" class="status-chip chip-sold-out">
                      {{ 'PORTAL.PROMOTIONS.SOLD_OUT' | translate }}
                      <span *ngIf="mainBannerNextDate()" class="sold-out-date">
                        ({{ 'PORTAL.PROMOTIONS.SOLD_OUT_NEXT_DATE' | translate: { date: (mainBannerNextDate() | date:'mediumDate') } }})
                      </span>
                    </span>
                    <span *ngIf="!selectedEventHasMainBanner() && !mainBannerFull() && mainBannerSlotsLeft() !== null" class="status-chip chip-slots">
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
                    aria-label="Main Banner"
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
                    <span *ngIf="!selectedEventHasWhatsHot() && whatsHotFull()" class="status-chip chip-sold-out">
                      {{ 'PORTAL.PROMOTIONS.SOLD_OUT' | translate }}
                      <span *ngIf="whatsHotNextDate()" class="sold-out-date">
                        ({{ 'PORTAL.PROMOTIONS.SOLD_OUT_NEXT_DATE' | translate: { date: (whatsHotNextDate() | date:'mediumDate') } }})
                      </span>
                    </span>
                    <span *ngIf="!selectedEventHasWhatsHot() && !whatsHotFull() && whatsHotSlotsLeft() !== null" class="status-chip chip-slots">
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
                    aria-label="What's Hot"
                  />
                </div>
              </div>

            </div>
          </div>

          <!-- STEP 3: Scheduling (Optional) -->
          <div class="form-step" *ngIf="selectedEventId() && hasSelection()">
            <div class="step-label">
              <span class="step-number">3</span>
              <div>
                <strong>{{ 'PORTAL.PROMOTIONS.STEP_SCHEDULE_TITLE' | translate }}</strong>
                <p class="step-desc">{{ 'PORTAL.PROMOTIONS.STEP_SCHEDULE_SUBTITLE' | translate }}</p>
              </div>
            </div>

            <div class="schedule-options">
              <label class="radio-option">
                <input
                  type="radio"
                  name="scheduleMode"
                  value="immediate"
                  [checked]="scheduleMode() === 'immediate'"
                  (change)="scheduleMode.set('immediate')"
                />
                <span class="radio-label">{{ 'PORTAL.PROMOTIONS.SCHEDULE_IMMEDIATE' | translate }}</span>
              </label>

              <label class="radio-option">
                <input
                  type="radio"
                  name="scheduleMode"
                  value="future"
                  [checked]="scheduleMode() === 'future'"
                  (change)="scheduleMode.set('future')"
                />
                <span class="radio-label">{{ 'PORTAL.PROMOTIONS.SCHEDULE_FUTURE' | translate }}</span>
              </label>

              <div *ngIf="scheduleMode() === 'future'" class="schedule-input-container">
                <label for="schedule-date" class="input-sublabel">{{ 'PORTAL.PROMOTIONS.SCHEDULE_LABEL' | translate }}</label>
                <input
                  id="schedule-date"
                  type="date"
                  class="form-control schedule-date-input"
                  [min]="minStartDate"
                  [ngModel]="scheduledDate()"
                  (ngModelChange)="scheduledDate.set($event)"
                />
                <p class="schedule-help-text" *ngIf="scheduledDate()">
                  {{ 'PORTAL.PROMOTIONS.SCHEDULE_NOTICE' | translate: { date: (scheduledDate() | date:'mediumDate') } }}
                </p>
              </div>
            </div>
          </div>

          <!-- STEP 4 & 5: Summary & Payment -->
          <div class="form-step" *ngIf="selectedEventId() && hasSelection()">
            <div class="step-label">
              <span class="step-number">4</span>
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
                    {{ 'PORTAL.PROMOTIONS.MAIN_BANNER_TITLE' | translate }} ({{ formatPrice(mainBannerPrice()?.amount ?? 0, 'usd') }})
                  </span>
                  <span *ngIf="selectedPlacements().has('whats_hot')" class="summary-pill">
                    {{ 'PORTAL.PROMOTIONS.WHATS_HOT_TITLE' | translate }} ({{ formatPrice(whatsHotPrice()?.amount ?? 0, 'usd') }})
                  </span>
                </div>
              </div>
              <div class="summary-line">
                <span class="summary-key">{{ 'PORTAL.PROMOTIONS.SUMMARY_START' | translate }}</span>
                <span class="summary-val">
                  {{ scheduleMode() === 'future' && scheduledDate() ? (scheduledDate() | date:'mediumDate') : ('PORTAL.PROMOTIONS.SUMMARY_START_NOW' | translate) }}
                </span>
              </div>
              <div class="summary-line">
                <span class="summary-key">{{ 'PORTAL.PROMOTIONS.SUMMARY_DURATION' | translate }}</span>
                <span class="summary-val">{{ 'PORTAL.PROMOTIONS.SUMMARY_DURATION_VAL' | translate }}</span>
              </div>
              <div class="summary-total-line">
                <span class="total-key">{{ 'PORTAL.PROMOTIONS.SUMMARY_TOTAL' | translate }}</span>
                <span class="total-val">{{ formattedTotal() }}</span>
              </div>
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
                  [disabled]="isProcessingPayment() || !hasSelection()"
                  (click)="proceedToPayment()"
                >
                  <span *ngIf="isProcessingPayment()">{{ 'PORTAL.PROMOTIONS.PROCESSING' | translate }}</span>
                  <span *ngIf="!isProcessingPayment()">
                    {{ (scheduleMode() === 'future' ? ('PORTAL.PROMOTIONS.SCHEDULE_BTN' | translate) : ('PORTAL.PROMOTIONS.PAY_BTN' | translate)) }} ({{ formattedTotal() }})
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
                    {{ (scheduleMode() === 'future' ? ('PORTAL.PROMOTIONS.SCHEDULE_BTN' | translate) : ('PORTAL.PROMOTIONS.PAY_BTN' | translate)) }} ({{ formattedTotal() }})
                  </span>
                </button>

                <button
                  type="button"
                  class="btn btn-secondary"
                  *ngIf="paymentActive()"
                  [disabled]="isProcessingPayment()"
                  (click)="cancelPayment()"
                >
                  {{ 'PORTAL.BILLING.CANCEL_DOWNGRADE_BTN' | translate }}
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

/* Loading */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  gap: 1rem;
  color: #a0a0b8;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(254, 57, 127, 0.2);
  border-top-color: #FE397F;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Cards System */
.card {
  background: #1c1c2e;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 1.75rem;
  margin-bottom: 2rem;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  padding-bottom: 1rem;
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

/* Active Placements Grid */
.active-events-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.active-event-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.75rem;
}

.active-event-title {
  font-size: 1.05rem;
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
  gap: 0.375rem;
  padding: 0.35rem 0.65rem;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.badge-banner {
  background: rgba(254, 57, 127, 0.15);
  border: 1px solid rgba(254, 57, 127, 0.4);
  color: #FE397F;
}

.badge-hot {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #fbbf24;
}

.empty-state {
  text-align: center;
  padding: 2.5rem 1rem;
  color: #a0a0b8;
}

.empty-icon {
  font-size: 2.5rem;
  display: block;
  margin-bottom: 0.75rem;
}

.empty-text {
  font-size: 0.9375rem;
  max-width: 440px;
  margin: 0 auto;
}

/* Workflow Steps */
.purchase-workflow {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.form-step {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  padding-bottom: 2rem;
}

.form-step:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.step-label {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 1rem;
  cursor: pointer;
}

.step-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: #FE397F;
  color: #ffffff;
  font-weight: 700;
  font-size: 0.875rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.step-desc {
  font-size: 0.875rem;
  color: #a0a0b8;
  margin: 0.2rem 0 0 0;
}

.select-event-input {
  width: 100%;
  max-width: 520px;
}

.form-control {
  background: #121220;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #ffffff;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  font-size: 0.9375rem;
  outline: none;
  transition: border-color 0.2s;
}

.form-control:focus {
  border-color: #FE397F;
}

/* Placements Grid */
.placements-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.25rem;
  margin-top: 1rem;
}

.placement-option {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 1.5rem;
  display: flex;
  gap: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.placement-option:hover:not(.placement-option--disabled) {
  border-color: rgba(254, 57, 127, 0.4);
  background: rgba(255, 255, 255, 0.05);
}

.placement-option--selected {
  border-color: #FE397F !important;
  background: rgba(254, 57, 127, 0.08) !important;
}

.placement-option--disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.placement-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
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
  color: #fbbf24;
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
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
  color: #ffffff;
}

.placement-price {
  font-size: 0.9375rem;
  font-weight: 700;
  color: #FE397F;
}

.placement-desc {
  font-size: 0.84375rem;
  color: #a0a0b8;
  line-height: 1.4;
  margin: 0 0 0.75rem 0;
}

.placement-footer-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.status-chip {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  font-weight: 600;
}

.chip-active {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.chip-sold-out {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.sold-out-date {
  font-size: 0.7rem;
  opacity: 0.85;
}

.chip-slots {
  background: rgba(255, 255, 255, 0.08);
  color: #d1d5db;
}

.placement-checkbox input[type="checkbox"] {
  accent-color: #FE397F;
  width: 18px;
  height: 18px;
  margin-top: 0.25rem;
}

/* Scheduling Options */
.schedule-options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 440px;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.9375rem;
}

.radio-option input[type="radio"] {
  accent-color: #FE397F;
  width: 16px;
  height: 16px;
}

.schedule-input-container {
  margin-top: 0.5rem;
  padding-left: 1.5rem;
}

.input-sublabel {
  display: block;
  font-size: 0.8125rem;
  color: #a0a0b8;
  margin-bottom: 0.25rem;
}

.schedule-date-input {
  max-width: 240px;
}

.schedule-help-text {
  font-size: 0.8125rem;
  color: #a0a0b8;
  margin-top: 0.35rem;
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
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.saved-card-choice {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.saved-card-choice:hover {
  background: rgba(255, 255, 255, 0.05);
}

.saved-card-choice--selected {
  border-color: #FE397F;
  background: rgba(254, 57, 127, 0.08);
}

.card-brand-badge {
  font-size: 0.75rem;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.1);
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
}

.card-digits {
  font-size: 0.9375rem;
  color: #ffffff;
}

.card-exp {
  margin-left: auto;
  font-size: 0.8125rem;
  color: #a0a0b8;
}

.stripe-mount-wrapper {
  margin: 1.25rem 0;
}

.stripe-mount-box {
  background: #1c1c2e;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 1.25rem;
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
  padding: 0.75rem 1.5rem;
  border-radius: 10px;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background 0.15s ease, opacity 0.15s ease;
}

.btn-primary {
  background: #FE397F;
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
  background: #e0286e;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

  // State Signals
  events = signal<VamoEvent[]>([]);
  addonPrices = signal<StripeAddonPlan[]>([]);
  savedMethods = signal<SavedPaymentMethod[]>([]);
  boostAvailability = signal<BoostAvailability | null>(null);

  selectedEventId = signal<string | null>(null);
  selectedPlacements = signal<Set<AddonType>>(new Set());
  scheduleMode = signal<'immediate' | 'future'>('immediate');
  scheduledDate = signal<string>('');

  selectedSavedMethod = signal<SavedPaymentMethod | null>(null);
  useNewCard = signal<boolean>(false);

  isLoading = signal<boolean>(true);
  isProcessingPayment = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  isLastScheduled = signal<boolean>(false);

  paymentActive = signal<boolean>(false);
  stripeReady = signal<boolean>(false);

  private stripeInstance: Stripe | null = null;
  private stripeElements: StripeElements | null = null;
  private pendingQueue: AddonType[] = [];
  private completedAddons: AddonType[] = [];

  readonly minStartDate = new Date().toISOString().split('T')[0];

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

  formattedTotal = computed(() =>
    this.formatPrice(this.totalAmount(), 'usd')
  );

  ngOnInit(): void {
    void this.loadData();
  }

  ngOnDestroy(): void {
    this.cleanupStripe();
  }

  async loadData(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const user = this.authService.currentUser;
    const providerId = user?.provider_link?.id;

    try {
      const [events, prices, availability, methods] = await Promise.all([
        providerId ? this.businessService.getEventsForProvider(providerId) : Promise.resolve([]),
        this.stripeService.getAddonPrices().catch(() => []),
        this.stripeService.getBoostAvailability().catch(() => null),
        this.stripeService.getSavedPaymentMethods().catch(() => []),
      ]);

      this.events.set(events);
      this.addonPrices.set(prices);
      this.boostAvailability.set(availability);
      this.savedMethods.set(methods);

      if (methods.length > 0) {
        this.selectedSavedMethod.set(methods[0]);
        this.useNewCard.set(false);
      } else {
        this.useNewCard.set(true);
      }
    } catch (err) {
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'load'));
    } finally {
      this.isLoading.set(false);
    }
  }

  onEventSelected(eventId: string): void {
    this.selectedEventId.set(eventId);
    // If the event already has an active placement, remove it from selection
    const next = new Set(this.selectedPlacements());
    const ev = this.events().find(e => e.id === eventId);
    if (ev?.is_main_banner) next.delete('main_banner');
    if (ev?.is_whats_hot) next.delete('whats_hot');
    this.selectedPlacements.set(next);
    this.cancelPayment();
  }

  togglePlacement(type: AddonType): void {
    if (type === 'main_banner' && this.isMainBannerDisabled()) return;
    if (type === 'whats_hot' && this.isWhatsHotDisabled()) return;

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

  isMainBannerDisabled(): boolean {
    return this.selectedEventHasMainBanner() || this.mainBannerFull();
  }

  isWhatsHotDisabled(): boolean {
    return this.selectedEventHasWhatsHot() || this.whatsHotFull();
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

  async proceedToPayment(): Promise<void> {
    const event = this.selectedEvent();
    if (!event) {
      this.errorMessage.set(this.i18n.t('PORTAL.PROMOTIONS.ERROR_SELECT_EVENT'));
      return;
    }
    if (!this.hasSelection()) {
      this.errorMessage.set(this.i18n.t('PORTAL.PROMOTIONS.ERROR_SELECT_PLACEMENT'));
      return;
    }

    const user = this.authService.currentUser;
    const providerId = user?.provider_link?.id;
    if (!providerId) {
      this.errorMessage.set(this.i18n.t('PORTAL.PROMOTIONS.ERROR_SELECT_EVENT'));
      return;
    }

    this.errorMessage.set(null);
    this.completedAddons = [];
    this.pendingQueue = Array.from(this.selectedPlacements());
    await this.processQueue(providerId, event.id);
  }

  private async processQueue(providerId: string, eventId: string): Promise<void> {
    if (this.pendingQueue.length === 0) {
      // Completed all placements
      const isSched = this.scheduleMode() === 'future' && !!this.scheduledDate();
      this.isLastScheduled.set(isSched);
      if (isSched) {
        this.successMessage.set(
          this.i18n.t('PORTAL.PROMOTIONS.SUCCESS_SCHEDULED_DESC', {
            date: this.scheduledDate(),
          })
        );
      } else {
        this.successMessage.set(this.i18n.t('PORTAL.PROMOTIONS.SUCCESS_DESC'));
      }

      this.selectedPlacements.set(new Set());
      this.selectedEventId.set(null);
      this.scheduledDate.set('');
      this.scheduleMode.set('immediate');
      this.cleanupStripe();
      await this.loadData();
      return;
    }

    const type = this.pendingQueue[0];
    const price = type === 'main_banner' ? this.mainBannerPrice() : this.whatsHotPrice();
    if (!price) {
      this.errorMessage.set(this.i18n.t('PORTAL.PROMOTIONS.ERROR_PRICE_NOT_FOUND'));
      return;
    }

    this.isProcessingPayment.set(true);

    const scheduledStart =
      this.scheduleMode() === 'future' && this.scheduledDate()
        ? new Date(this.scheduledDate()).toISOString()
        : undefined;

    try {
      const result = await this.stripeService.createAddonPayment(
        price.id,
        type,
        providerId,
        eventId,
        scheduledStart
      );

      // If 100% coupon / free
      if ('free' in result && result.free) {
        await this.stripeService.applyAddon(type, undefined, eventId, scheduledStart);
        this.completedAddons.push(type);
        this.pendingQueue.shift();
        await this.processQueue(providerId, eventId);
        return;
      }

      const paidResult = result as { clientSecret: string; paymentIntentId: string };
      const savedCard = this.selectedSavedMethod();

      if (savedCard && !this.useNewCard()) {
        const { error } = await this.stripeService.confirmWithSavedMethod(
          paidResult.clientSecret,
          savedCard.id
        );
        if (error) {
          this.errorMessage.set(this.errorService.toCustomerMessage(error, 'save'));
          return;
        }
        await this.stripeService.applyAddon(type, undefined, eventId, scheduledStart);
        this.completedAddons.push(type);
        this.pendingQueue.shift();
        await this.processQueue(providerId, eventId);
      } else {
        // Mount PaymentElement for new card
        this.paymentActive.set(true);
        setTimeout(() => this.mountPayment(paidResult.clientSecret), 150);
      }
    } catch (err: any) {
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'save'));
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
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'load'));
    }
  }

  async confirmInlinePayment(): Promise<void> {
    if (!this.stripeInstance || !this.stripeElements || this.pendingQueue.length === 0) return;

    const event = this.selectedEvent();
    const user = this.authService.currentUser;
    const providerId = user?.provider_link?.id;
    if (!event || !providerId) return;

    this.isProcessingPayment.set(true);
    this.errorMessage.set(null);

    const type = this.pendingQueue[0];
    const scheduledStart =
      this.scheduleMode() === 'future' && this.scheduledDate()
        ? new Date(this.scheduledDate()).toISOString()
        : undefined;

    try {
      const { error } = await this.stripeInstance.confirmPayment({
        elements: this.stripeElements,
        redirect: 'if_required',
      });

      if (error) {
        this.errorMessage.set(this.errorService.toCustomerMessage(error, 'save'));
        return;
      }

      await this.stripeService.applyAddon(type, undefined, event.id, scheduledStart);
      this.completedAddons.push(type);
      this.pendingQueue.shift();

      this.cleanupStripe();
      await this.processQueue(providerId, event.id);
    } catch (err: any) {
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'save'));
    } finally {
      this.isProcessingPayment.set(false);
    }
  }

  cancelPayment(): void {
    this.cleanupStripe();
    this.pendingQueue = [];
    this.completedAddons = [];
  }

  private cleanupStripe(): void {
    this.paymentActive.set(false);
    this.stripeReady.set(false);
    this.stripeInstance = null;
    this.stripeElements = null;
    this.stripeService.cleanup();
  }

  formatPrice(amount: number, currency: string): string {
    return new Intl.NumberFormat(this.i18n.lang() === 'es' ? 'es-DO' : 'en-US', {
      style: 'currency',
      currency: (currency || 'usd').toUpperCase(),
      minimumFractionDigits: 0,
    }).format(amount / 100);
  }

  private normalize(s: string): string {
    return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  }
}
