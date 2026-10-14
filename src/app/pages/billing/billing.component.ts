import { Component, OnInit, OnDestroy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { CustomerErrorService } from '../../core/services/customer-error.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import {
  StripeService,
  StripePlan,
  StripeSubscription,
  BillingHistoryItem,
  SavedPaymentMethod,
  PromoResult,
  getCanonicalTierFeatures,
} from '../../core/services/stripe.service';
import {
  capturePromoCode,
  clearSavedPromoCode,
  getSavedPromoCode,
} from '../../core/utils/promo-code.util';
import type { Stripe, StripeElements } from '@stripe/stripe-js';

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
<div class="billing-page">
  <!-- Header -->
  <header class="page-header">
    <div class="header-titles">
      <h1 class="page-title">{{ 'PORTAL.BILLING.TITLE' | translate }}</h1>
      <p class="page-subtitle">{{ 'PORTAL.BILLING.SUBTITLE' | translate }}</p>
    </div>
  </header>
  <div *ngIf="returnEventId" class="status-banner" role="status">
    {{ (returnReason === 'quota' ? 'PORTAL.BILLING.DRAFT_QUOTA_NOTICE' : 'PORTAL.BILLING.DRAFT_SUBSCRIPTION_NOTICE') | translate }}
    <button type="button" class="btn btn-secondary btn-sm" (click)="returnToDraft()">{{ 'PORTAL.BILLING.RETURN_TO_DRAFT' | translate }}</button>
  </div>

  <!-- Global Feedback Banners -->
  <div *ngIf="errorMessage()" class="alert alert-danger" role="alert">
    <span class="alert-icon">⚠️</span>
    <span class="alert-text">{{ errorMessage() }}</span>
    <button type="button" class="alert-close" (click)="errorMessage.set(null); activeErrorPayload.set(null)" [attr.aria-label]="'PORTAL.BILLING.DISMISS' | translate">✕</button>
  </div>

  <div *ngIf="successMessage()" class="alert alert-success" role="alert">
    <span class="alert-icon">✓</span>
    <span class="alert-text">{{ successMessage() }}</span>
    <button type="button" class="alert-close" (click)="successMessage.set(null); activeSuccessPayload.set(null)" [attr.aria-label]="'PORTAL.BILLING.DISMISS' | translate">✕</button>
  </div>

  <!-- Subscription Read Failure Banner (separate from "no subscription") -->
  <div *ngIf="subscriptionLoadError() && !planChangeUnverified()" class="alert alert-warning subscription-read-error-banner" role="status">
    <span class="alert-icon">⚠️</span>
    <span class="alert-text">{{ 'PORTAL.ERRORS.LOAD_FAILED' | translate }}</span>
    <button
      type="button"
      class="btn btn-secondary btn-sm refresh-billing-btn"
      [disabled]="isLoading()"
      (click)="refreshBilling()"
    >
      {{ 'PORTAL.BILLING.BTN_REFRESH_BILLING' | translate }}
    </button>
  </div>

  <!-- Loading State -->
  <div *ngIf="isLoading() && subscription() === undefined" class="loading-container">
    <div class="spinner"></div>
    <p>{{ 'PORTAL.BILLING.LOADING' | translate }}</p>
  </div>

  <!-- Content when loaded -->
  <div *ngIf="subscription() !== undefined" class="billing-content">
    
    <!-- ── ACTIVE SUBSCRIPTION STATE ──────────────────────────────────── -->
    <section *ngIf="subscription() as sub" class="active-subscription-section">
      <!-- Status Banner -->
      <div
        class="status-banner"
        [class.status-banner--canceling]="sub.cancelAtPeriodEnd"
        [class.status-banner--active]="!sub.cancelAtPeriodEnd"
      >
        <div class="status-indicator">
          <span class="status-dot"></span>
          <span class="status-label">
            {{ (sub.cancelAtPeriodEnd ? 'PORTAL.BILLING.STATUS_CANCELING' : 'PORTAL.BILLING.STATUS_ACTIVE') | translate }}
          </span>
        </div>
        <div class="status-date">
          <span *ngIf="sub.cancelAtPeriodEnd">
            {{ 'PORTAL.BILLING.ACCESS_UNTIL' | translate }} <strong>{{ formatDate(sub.currentPeriodEnd) }}</strong>
          </span>
          <span *ngIf="!sub.cancelAtPeriodEnd">
            {{ 'PORTAL.BILLING.RENEWS_ON' | translate }} <strong>{{ formatDate(sub.currentPeriodEnd) }}</strong>
          </span>
        </div>
      </div>

      <!-- Pending Downgrade Alert -->
      <div *ngIf="sub.pendingPlanName && sub.pendingPeriodEnd" class="pending-downgrade-banner">
        <div class="pending-info">
          <span class="pending-icon">⏳</span>
          <div class="pending-text">
            <strong>{{ 'PORTAL.BILLING.SCHEDULED_CHANGE_TITLE' | translate }}</strong>
            <span>{{ 'PORTAL.BILLING.PENDING_DOWNGRADE_DESC' | translate: { plan: (planTitleKey(sub.pendingPlanName) | translate), date: formatDate(sub.pendingPeriodEnd) } }}</span>
          </div>
        </div>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          [disabled]="isLoading()"
          (click)="cancelPendingDowngrade()"
        >
          {{ 'PORTAL.BILLING.CANCEL_DOWNGRADE_BTN' | translate }}
        </button>
      </div>

      <!-- Plan & Quota Cards Grid -->
      <div class="overview-grid">
        <!-- Current Plan Card -->
        <div class="card current-plan-card">
          <div class="card-header">
            <span class="card-eyebrow">{{ 'PORTAL.BILLING.CURRENT_PLAN' | translate }}</span>
            <span class="tier-pill">{{ planTitleKey(sub.plan.productName) | translate }}</span>
          </div>
          <div class="card-body">
            <div class="plan-price-display">
              <span class="price-val">{{ formatPrice(sub.plan.amount, sub.plan.currency) }}</span>
              <span class="price-interval">/ {{ (sub.plan.interval === 'year' ? 'PORTAL.BILLING.INTERVAL_YEAR' : 'PORTAL.BILLING.INTERVAL_MONTH') | translate }}</span>
            </div>
            <p class="plan-note">
              {{ 'PORTAL.BILLING.PLAN_NOTE' | translate }}
            </p>
          </div>
          <div class="card-footer actions-row">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              *ngIf="!showChangePlanSection()"
              (click)="openChangePlan()"
            >
              {{ 'PORTAL.BILLING.CHANGE_PLAN_BTN' | translate }}
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              *ngIf="showChangePlanSection()"
              (click)="closeChangePlan()"
            >
              {{ 'PORTAL.BILLING.KEEP_PLAN_BTN' | translate }}
            </button>
            
            <!-- Cancel / Reactivate -->
            <button
              type="button"
              class="btn btn-outline-danger btn-sm"
              *ngIf="!sub.cancelAtPeriodEnd"
              (click)="openCancelModal()"
            >
              {{ 'PORTAL.BILLING.CANCEL_SUB_BTN' | translate }}
            </button>
            <button
              type="button"
              class="btn btn-outline-success btn-sm"
              *ngIf="sub.cancelAtPeriodEnd"
              [disabled]="isLoading()"
              (click)="reactivateSubscription()"
            >
              {{ 'PORTAL.BILLING.REACTIVATE_SUB_BTN' | translate }}
            </button>
          </div>
        </div>

        <!-- Publishing Quota Card -->
        <div class="card quota-card">
          <div class="card-header">
            <span class="card-eyebrow">{{ 'PORTAL.BILLING.QUOTA_TITLE' | translate }}</span>
            <span class="quota-count font-mono">{{ 'PORTAL.BILLING.QUOTA_COUNT' | translate: { used: postsUsed(), limit: postLimit() } }}</span>
          </div>
          <div class="card-body">
            <div class="progress-bar-bg" role="progressbar" [attr.aria-valuenow]="postsUsed()" [attr.aria-valuemax]="postLimit()">
              <div
                class="progress-bar-fill"
                [style.width.%]="postLimit() > 0 ? (postsUsed() / postLimit()) * 100 : 0"
                [class.progress-bar-fill--full]="postsUsed() >= postLimit()"
              ></div>
            </div>
            <p class="quota-desc">
              {{ 'PORTAL.BILLING.QUOTA_DESC' | translate: { used: postsUsed() } }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── CHANGE PLAN SECTION OR NEW SUBSCRIPTION SELECTION ─────────── -->
    <section
      *ngIf="(subscription() === null && !subscriptionLoadError()) || showChangePlanSection()"
      class="plans-selection-section"
      aria-labelledby="plans-heading"
    >
      <div class="section-header">
        <h2 id="plans-heading" class="section-title">
          {{ (subscription() === null ? 'PORTAL.BILLING.PLANS_TITLE_NEW' : 'PORTAL.BILLING.PLANS_TITLE_CHANGE') | translate }}
        </h2>
        <p class="section-subtitle">
          {{ 'PORTAL.BILLING.PLANS_SUBTITLE' | translate }}
        </p>
      </div>

      <!-- Plan Cards Grid -->
      <div *ngIf="plans().length > 0" class="plans-grid">
        <div
          *ngFor="let plan of plans()"
          class="card plan-card"
          [class.plan-card--selected]="selectedPlan()?.id === plan.id"
          [class.plan-card--current]="isCurrentPlan(plan) || isPendingPlan(plan)"
          (click)="selectPlan(plan)"
        >
          <div class="plan-card-header">
            <div class="plan-title-row">
              <h3 class="plan-name">{{ planTitleKey(plan.name) | translate }}</h3>
              <span *ngIf="isCurrentPlan(plan)" class="badge badge-current">{{ 'PORTAL.BILLING.BADGE_CURRENT' | translate }}</span>
              <span *ngIf="isPendingPlan(plan)" class="badge badge-scheduled">{{ 'PORTAL.BILLING.BADGE_SCHEDULED' | translate }}</span>
            </div>
            <div class="plan-price">
              <span class="currency-amount">{{ formatPrice(plan.amount, plan.currency) }}</span>
              <span class="interval-text">/ {{ (plan.interval === 'year' ? 'PORTAL.BILLING.INTERVAL_YEAR' : 'PORTAL.BILLING.INTERVAL_MONTH') | translate }}</span>
            </div>
            <p class="plan-description">{{ plan.description }}</p>
          </div>

          <div class="plan-card-body">
            <span class="features-label">{{ 'PORTAL.BILLING.ENTITLEMENTS_LABEL' | translate }}</span>
            <ul class="features-list">
              <li *ngFor="let feat of getPlanFeatures(plan)" class="feature-item">
                <span class="feature-check">✓</span>
                <span class="feature-text">{{ feat }}</span>
              </li>
            </ul>
          </div>

          <div class="plan-card-footer">
            <button
              type="button"
              class="btn btn-block"
              [class.btn-primary]="selectedPlan()?.id === plan.id"
              [class.btn-outline-primary]="selectedPlan()?.id !== plan.id && !isCurrentPlan(plan) && !isPendingPlan(plan)"
              [disabled]="isCurrentPlan(plan) || isPendingPlan(plan)"
            >
              <span *ngIf="isCurrentPlan(plan)">{{ 'PORTAL.BILLING.BTN_ACTIVE' | translate }}</span>
              <span *ngIf="isPendingPlan(plan)">{{ 'PORTAL.BILLING.BADGE_SCHEDULED' | translate }}</span>
              <span *ngIf="!isCurrentPlan(plan) && !isPendingPlan(plan)">
                {{ (selectedPlan()?.id === plan.id ? 'PORTAL.BILLING.BTN_SELECTED' : 'PORTAL.BILLING.BTN_SELECT') | translate }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- Empty Plans Fallback Notice -->
      <div *ngIf="plans().length === 0" class="alert alert-warning empty-plans-alert">
        <span class="alert-icon">⚠️</span>
        <span class="alert-text">{{ 'PORTAL.BILLING.EMPTY_PLANS' | translate }}</span>
      </div>

      <!-- Downgrade Warning Notice -->
      <div *ngIf="downgradeWarning() as dw" class="alert alert-warning downgrade-warning-box">
        <span class="alert-icon">⚠️</span>
        <div class="alert-body">
          <strong>{{ 'PORTAL.BILLING.DOWNGRADE_WARN_TITLE' | translate }}</strong>
          <p>
            {{ 'PORTAL.BILLING.DOWNGRADE_WARN_DESC' | translate: { activePosts: dw.activePosts, newLimit: dw.newLimit } }}
          </p>
          <div class="warning-actions">
            <button
              type="button"
              class="btn btn-warning btn-sm"
              [disabled]="isLoading()"
              (click)="confirmDowngradeAnyway()"
            >
              {{ 'PORTAL.BILLING.BTN_DOWNGRADE_ANYWAY' | translate }}
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              (click)="dismissDowngradeWarning()"
            >
              {{ 'PORTAL.BILLING.KEEP_PLAN_BTN' | translate }}
            </button>
          </div>
        </div>
      </div>

      <!-- Action Panel for Selected Plan (Subscribe / Change) -->
      <div *ngIf="selectedPlan() as selPlan" class="card checkout-panel">
        <div class="checkout-header">
          <h3>
            {{ (subscription() === null ? 'PORTAL.BILLING.CHECKOUT_TITLE_NEW' : 'PORTAL.BILLING.CHECKOUT_TITLE_CHANGE') | translate }}
          </h3>
          <p>
            {{ 'PORTAL.BILLING.CHECKOUT_SUBTITLE' | translate: { name: (planTitleKey(selPlan.name) | translate), price: formatPrice(selPlan.amount, selPlan.currency), interval: ((selPlan.interval === 'year' ? 'PORTAL.BILLING.INTERVAL_YEAR' : 'PORTAL.BILLING.INTERVAL_MONTH') | translate) } }}
          </p>
        </div>

        <!-- Coupon Row (for new subscriptions) -->
        <div *ngIf="subscription() === null" class="coupon-section">
          <div *ngIf="promoResult() as promo" class="applied-promo-chip">
            <span class="promo-tag">🎟 {{ promo.name || ('PORTAL.BILLING.PROMO_TAG' | translate) }}</span>
            <span *ngIf="promo.percentOff === 100" class="promo-badge">{{ 'PORTAL.BILLING.PROMO_FREE' | translate }}</span>
            <span *ngIf="promo.percentOff && promo.percentOff < 100" class="promo-badge">{{ 'PORTAL.BILLING.PROMO_OFF' | translate: { percent: promo.percentOff } }}</span>
            <button type="button" class="promo-remove-btn" (click)="removePromoCode()" [attr.title]="'PORTAL.BILLING.PROMO_REMOVE' | translate">✕</button>
          </div>

          <div *ngIf="!promoResult()" class="coupon-input-group">
            <input
              type="text"
              class="form-control coupon-input"
              [placeholder]="'PORTAL.BILLING.COUPON_PLACEHOLDER' | translate"
              [attr.aria-label]="'PORTAL.BILLING.PROMO_TAG' | translate"
              [ngModel]="couponCode()"
              (ngModelChange)="onCouponCodeChange($event)"
              [disabled]="couponLoading()"
            />
            <button
              *ngIf="couponCode().trim()"
              type="button"
              class="btn btn-ghost btn-sm coupon-clear-btn"
              [disabled]="couponLoading()"
              (click)="removePromoCode()"
              [attr.aria-label]="'PORTAL.BILLING.PROMO_REMOVE' | translate"
              [attr.title]="'PORTAL.BILLING.PROMO_REMOVE' | translate"
            >✕</button>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              [disabled]="couponLoading() || !couponCode().trim()"
              (click)="applyPromoCode()"
            >
              {{ (couponLoading() ? 'PORTAL.BILLING.COUPON_APPLYING' : 'PORTAL.BILLING.COUPON_APPLY') | translate }}
            </button>
          </div>
          <span *ngIf="couponError()" class="form-error">{{ couponError() }}</span>
        </div>

        <!-- Current Payment Method Notice (for plan changes on existing subscriptions) -->
        <p *ngIf="subscription() !== null" class="plan-change-payment-notice" role="note">
          {{ 'PORTAL.BILLING.PLAN_CHANGE_PAYMENT_METHOD_NOTICE' | translate }}
        </p>

        <!-- Pending / Unverified Plan Change State -->
        <div *ngIf="planChangeUnverified()" class="plan-change-unverified-box" role="status">
          <div class="unverified-header">
            <span class="badge badge-unverified">{{ 'PORTAL.BILLING.PLAN_CHANGE_UNVERIFIED_BADGE' | translate }}</span>
            <span class="unverified-text">{{ 'PORTAL.BILLING.ERROR_PLAN_CHANGE_UNVERIFIED' | translate }}</span>
          </div>
          <button
            type="button"
            class="btn btn-secondary btn-sm refresh-billing-btn"
            [disabled]="isLoading() || isProcessingPayment()"
            (click)="refreshBilling()"
          >
            {{ 'PORTAL.BILLING.BTN_REFRESH_BILLING' | translate }}
          </button>
        </div>

        <!-- Saved Payment Methods Selection (if available for new subscriptions) -->
        <div *ngIf="!paymentActive() && subscription() === null && savedMethods().length > 0" class="saved-methods-selection">
          <label class="section-label">{{ 'PORTAL.BILLING.SELECT_PAYMENT_METHOD' | translate }}</label>
          <div class="saved-methods-radios">
            <div
              *ngFor="let pm of savedMethods()"
              class="saved-card-radio-item"
              [class.saved-card-radio-item--selected]="selectedSavedMethod()?.id === pm.id"
              (click)="selectSavedMethod(pm)"
            >
              <input
                type="radio"
                name="savedMethodChoice"
                [checked]="selectedSavedMethod()?.id === pm.id"
                [attr.aria-label]="(pm.brand | uppercase) + ' ' + pm.last4"
              />
              <span class="card-brand">{{ pm.brand | uppercase }}</span>
              <span class="card-last4">•••• {{ pm.last4 }}</span>
              <span class="card-exp">{{ 'PORTAL.BILLING.EXP_DATE' | translate: { month: pm.expMonth, year: pm.expYear } }}</span>
            </div>
            <div
              class="saved-card-radio-item"
              [class.saved-card-radio-item--selected]="!selectedSavedMethod()"
              (click)="selectedSavedMethod.set(null)"
            >
              <input type="radio" name="savedMethodChoice" [checked]="!selectedSavedMethod()" [attr.aria-label]="'PORTAL.BILLING.USE_NEW_CARD' | translate" />
              <span>{{ 'PORTAL.BILLING.USE_NEW_CARD' | translate }}</span>
            </div>
          </div>
        </div>

        <!-- Stripe Elements Mount Container -->
        <div *ngIf="paymentActive()" class="payment-elements-container">
          <div id="portal-payment-element" class="stripe-mount-box"></div>
        </div>

        <!-- Checkout Action Buttons -->
        <div class="checkout-actions">
          <!-- When inline card element is mounted -->
          <div *ngIf="paymentActive()" class="button-group">
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="!stripeReady() || isProcessingPayment()"
              (click)="confirmPayment()"
            >
              {{ isProcessingPayment() ? ('PORTAL.BILLING.BTN_PROCESSING' | translate) : (paymentRequiresSetup() ? ('PORTAL.BILLING.BTN_SAVE_ACTIVATE' | translate) : ('PORTAL.BILLING.BTN_PAY_SUBSCRIBE' | translate)) }}
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              [disabled]="isProcessingPayment()"
              (click)="cancelPayment()"
            >
              {{ 'PORTAL.COMMON.CANCEL' | translate }}
            </button>
          </div>

          <!-- When choosing between saved card or initiating payment -->
          <div *ngIf="!paymentActive()" class="button-group">
            <button
              type="button"
              class="btn btn-primary"
              *ngIf="subscription() === null"
              [disabled]="isProcessingPayment()"
              (click)="proceedToPayment()"
            >
              <span *ngIf="isProcessingPayment()">{{ 'PORTAL.BILLING.BTN_PROCESSING' | translate }}</span>
              <span *ngIf="!isProcessingPayment()">
                {{ (selectedSavedMethod() ? 'PORTAL.BILLING.BTN_PAY_SAVED' : 'PORTAL.BILLING.BTN_CONTINUE_PAYMENT') | translate }}
              </span>
            </button>

            <button
              type="button"
              class="btn btn-primary"
              *ngIf="subscription() !== null"
              [disabled]="isLoading()"
              (click)="confirmChangePlan()"
            >
              {{ (isLoading() ? 'PORTAL.BILLING.BTN_UPDATING_PLAN' : 'PORTAL.BILLING.BTN_CONFIRM_PLAN_CHANGE') | translate }}
            </button>

            <button
              type="button"
              class="btn btn-secondary"
              (click)="closeChangePlan()"
            >
              {{ 'PORTAL.COMMON.CANCEL' | translate }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ── SAVED PAYMENT METHODS SECTION ─────────────────────────────── -->
    <!-- ── SAVED PAYMENT METHODS SECTION ─────────────────────────────── -->
    <section *ngIf="savedMethods().length > 0" class="saved-methods-section card">
      <div class="card-header">
        <h3 class="card-title">{{ 'PORTAL.BILLING.SAVED_METHODS_TITLE' | translate }}</h3>
      </div>
      <div class="card-body">
        <div class="saved-cards-list">
          <div *ngFor="let card of savedMethods()" class="saved-card-row">
            <div class="saved-card-meta">
              <span class="brand-badge">{{ card.brand | uppercase }}</span>
              <span class="card-digits font-mono">•••• •••• •••• {{ card.last4 }}</span>
              <span class="card-expiry">{{ 'PORTAL.BILLING.EXPIRES' | translate: { month: card.expMonth, year: card.expYear } }}</span>
            </div>
            <button
              type="button"
              class="btn btn-outline-danger btn-sm"
              [disabled]="deletingMethodId() === card.id"
              (click)="deletePaymentMethod(card)"
            >
              {{ deletingMethodId() === card.id ? ('PORTAL.BILLING.BTN_REMOVING' | translate) : ('PORTAL.BILLING.BTN_REMOVE' | translate) }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ── BILLING & INVOICE HISTORY SECTION ─────────────────────────── -->
    <section class="billing-history-section card">
      <div class="card-header">
        <h3 class="card-title">{{ 'PORTAL.BILLING.HISTORY_TITLE' | translate }}</h3>
      </div>
      <div class="card-body">
        <div *ngIf="billingHistoryLoading()" class="history-loading">
          <div class="spinner-sm"></div>
          <span>{{ 'PORTAL.BILLING.HISTORY_LOADING' | translate }}</span>
        </div>

        <div *ngIf="!billingHistoryLoading() && billingHistory().length === 0" class="empty-history">
          <p>{{ 'PORTAL.BILLING.HISTORY_EMPTY' | translate }}</p>
        </div>

        <div *ngIf="!billingHistoryLoading() && billingHistory().length > 0" class="table-responsive">
          <table class="table billing-table">
            <thead>
              <tr>
                <th>{{ 'PORTAL.BILLING.TH_DATE' | translate }}</th>
                <th>{{ 'PORTAL.BILLING.TH_DESC' | translate }}</th>
                <th>{{ 'PORTAL.BILLING.TH_AMOUNT' | translate }}</th>
                <th>{{ 'PORTAL.BILLING.TH_STATUS' | translate }}</th>
                <th class="text-right">{{ 'PORTAL.BILLING.TH_RECEIPT' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of billingHistory()">
                <td class="font-mono">{{ formatDate(item.date) }}</td>
                <td>{{ item.label }}</td>
                <td class="font-mono">{{ formatPrice(item.amount, item.currency) }}</td>
                <td>
                  <span
                    class="badge"
                    [class.badge-success]="item.status === 'paid' || item.status === 'succeeded'"
                    [class.badge-secondary]="item.status !== 'paid' && item.status !== 'succeeded'"
                  >
                    {{ item.status | uppercase }}
                  </span>
                </td>
                <td class="text-right">
                  <a
                    *ngIf="item.hosted_invoice_url"
                    [href]="item.hosted_invoice_url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="btn btn-sm btn-ghost"
                    [attr.title]="'PORTAL.BILLING.VIEW_RECEIPT_TITLE' | translate"
                  >
                    {{ 'PORTAL.BILLING.VIEW_RECEIPT' | translate }}
                  </a>
                  <span *ngIf="!item.hosted_invoice_url" class="text-muted">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

  </div>

  <!-- Cancellation Confirmation Modal -->
  <div
    *ngIf="showCancelConfirmModal()"
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="cancel-modal-title"
    (click)="closeCancelModal()"
  >
    <div class="modal-dialog card" (click)="$event.stopPropagation()">
      <div class="modal-header">
        <h3 id="cancel-modal-title" class="modal-title">{{ 'PORTAL.BILLING.CANCEL_MODAL_TITLE' | translate }}</h3>
        <button type="button" class="modal-close" (click)="closeCancelModal()" [attr.aria-label]="'PORTAL.BILLING.CLOSE_DIALOG' | translate">✕</button>
      </div>
      <div class="modal-body">
        <p>
          {{ 'PORTAL.BILLING.CANCEL_MODAL_DESC' | translate }}
        </p>
        <p class="modal-subtext">
          {{ 'PORTAL.BILLING.CANCEL_MODAL_SUBTEXT' | translate }}
        </p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" (click)="closeCancelModal()">
          {{ 'PORTAL.BILLING.CANCEL_MODAL_KEEP' | translate }}
        </button>
        <button
          type="button"
          class="btn btn-danger"
          [disabled]="isLoading()"
          (click)="confirmCancelSubscription()"
        >
          {{ isLoading() ? ('PORTAL.BILLING.CANCEL_MODAL_CANCELING' | translate) : ('PORTAL.BILLING.CANCEL_MODAL_CONFIRM' | translate) }}
        </button>
      </div>
    </div>
  </div>
</div>

`,
  styles: [`
.billing-page {
  padding: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.page-header {
  margin-bottom: 0.5rem;

  .page-title {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--vamo-text);
    margin: 0 0 0.25rem 0;
  }

  .page-subtitle {
    font-size: 0.95rem;
    color: var(--vamo-text-muted);
    margin: 0;
  }
}

/* Alert Boxes */
.alert {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1.25rem;
  border-radius: 10px;
  font-size: 0.9rem;

  .alert-icon {
    font-size: 1.1rem;
    line-height: 1;
  }

  .alert-text {
    flex: 1;
    font-weight: 500;
  }

  .alert-close {
    background: none;
    border: none;
    color: inherit;
    font-size: 1.1rem;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.15s ease;

    &:hover {
      opacity: 1;
    }
  }

  &.alert-danger {
    background: var(--vamo-error-bg);
    color: var(--vamo-error);
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  &.alert-success {
    background: var(--vamo-success-bg);
    color: var(--vamo-success);
    border: 1px solid rgba(16, 185, 129, 0.2);
  }

  &.alert-warning {
    background: var(--vamo-warning-bg);
    color: #b45309;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }
}

/* Loading State */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 1rem;
  color: var(--vamo-text-muted);
  gap: 1rem;

  .spinner {
    width: 36px;
    height: 36px;
    border: 3px solid rgba(128, 112, 192, 0.2);
    border-top-color: var(--vamo-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.spinner-sm {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(128, 112, 192, 0.2);
  border-top-color: var(--vamo-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

/* Active Subscription Section */
.active-subscription-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.status-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1.25rem;
  border-radius: 10px;
  font-size: 0.9rem;
  flex-wrap: wrap;
  gap: 0.75rem;

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
  }

  &.status-banner--active {
    background: var(--vamo-success-bg);
    border: 1px solid rgba(16, 185, 129, 0.25);
    color: #065f46;

    .status-dot {
      background: var(--vamo-success);
    }
  }

  &.status-banner--canceling {
    background: var(--vamo-warning-bg);
    border: 1px solid rgba(245, 158, 11, 0.3);
    color: #92400e;

    .status-dot {
      background: var(--vamo-warning);
    }
  }
}

.pending-downgrade-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 10px;
  padding: 0.875rem 1.25rem;
  color: #92400e;
  gap: 1rem;
  flex-wrap: wrap;

  .pending-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.9rem;
  }
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
}

.card {
  background: var(--vamo-surface);
  border: 1px solid var(--vamo-border);
  border-radius: 14px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.current-plan-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;

    .card-eyebrow {
      font-size: 0.8rem;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--vamo-text-muted);
    }

    .tier-pill {
      background: rgba(128, 112, 192, 0.1);
      color: var(--vamo-primary);
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 700;
    }
  }

  .plan-price-display {
    margin-bottom: 0.5rem;

    .price-val {
      font-size: 2.25rem;
      font-weight: 800;
      color: var(--vamo-text);
    }

    .price-interval {
      font-size: 1rem;
      color: var(--vamo-text-muted);
      margin-left: 0.25rem;
    }
  }

  .plan-note {
    font-size: 0.875rem;
    color: var(--vamo-text-muted);
    margin: 0;
  }

  .actions-row {
    display: flex;
    gap: 0.75rem;
    margin-top: 1.5rem;
    flex-wrap: wrap;
  }
}

.quota-card {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;

    .card-eyebrow {
      font-size: 0.8rem;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--vamo-text-muted);
    }

    .quota-count {
      font-weight: 700;
      color: var(--vamo-text);
      font-size: 0.95rem;
    }
  }

  .progress-bar-bg {
    width: 100%;
    height: 10px;
    background: var(--vamo-surface-subtle);
    border-radius: 9999px;
    overflow: hidden;
    margin-bottom: 1rem;

    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--vamo-primary), var(--vamo-secondary));
      border-radius: 9999px;
      transition: width 0.4s ease;

      &.progress-bar-fill--full {
        background: var(--vamo-warning);
      }
    }
  }

  .quota-desc {
    font-size: 0.875rem;
    color: var(--vamo-text-muted);
    margin: 0;
    line-height: 1.4;
  }
}

/* Plans Selection Section */
.plans-selection-section {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-top: 1rem;

  .section-header {
    .section-title {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--vamo-text);
      margin: 0 0 0.25rem 0;
    }

    .section-subtitle {
      font-size: 0.9rem;
      color: var(--vamo-text-muted);
      margin: 0;
    }
  }
}

.plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
}

.plan-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;

  &:hover {
    border-color: var(--vamo-primary);
    box-shadow: 0 6px 16px rgba(128, 112, 192, 0.08);
  }

  &.plan-card--selected {
    border-color: var(--vamo-primary);
    border-width: 2px;
    background: #faf8ff;
  }

  &.plan-card--current {
    opacity: 0.9;
    cursor: default;

    &:hover {
      border-color: var(--vamo-border);
      box-shadow: none;
    }
  }

  .plan-card-header {
    margin-bottom: 1.25rem;

    .plan-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;

      .plan-name {
        font-size: 1.2rem;
        font-weight: 700;
        color: var(--vamo-text);
        margin: 0;
      }
    }

    .plan-price {
      margin-bottom: 0.5rem;

      .currency-amount {
        font-size: 1.85rem;
        font-weight: 800;
        color: var(--vamo-text);
      }

      .interval-text {
        font-size: 0.9rem;
        color: var(--vamo-text-muted);
        margin-left: 0.25rem;
      }
    }

    .plan-description {
      font-size: 0.85rem;
      color: var(--vamo-text-muted);
      margin: 0;
      line-height: 1.4;
    }
  }

  .plan-card-body {
    flex: 1;
    margin-bottom: 1.5rem;

    .features-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--vamo-text-muted);
      letter-spacing: 0.05em;
      display: block;
      margin-bottom: 0.75rem;
    }

    .features-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      .feature-item {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        font-size: 0.85rem;
        color: var(--vamo-text);

        .feature-check {
          color: var(--vamo-success);
          font-weight: 700;
          line-height: 1.2;
        }

        .feature-text {
          line-height: 1.35;
        }
      }
    }
  }

  .plan-card-footer {
    button {
      width: 100%;
    }
  }
}

/* Badges */
.badge {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;

  &.badge-current {
    background: rgba(16, 185, 129, 0.15);
    color: #065f46;
  }

  &.badge-scheduled {
    background: rgba(245, 158, 11, 0.15);
    color: #92400e;
  }

  &.badge-unverified {
    background: rgba(245, 158, 11, 0.18);
    color: #92400e;
  }

  &.badge-success {
    background: rgba(16, 185, 129, 0.15);
    color: #065f46;
  }

  &.badge-secondary {
    background: var(--vamo-surface-subtle);
    color: var(--vamo-text-muted);
  }
}

/* Checkout Panel */
.checkout-panel {
  background: var(--vamo-surface);
  border: 2px solid var(--vamo-primary);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;

  .checkout-header {
    h3 {
      font-size: 1.2rem;
      font-weight: 700;
      color: var(--vamo-text);
      margin: 0 0 0.25rem 0;
    }

    p {
      font-size: 0.9rem;
      color: var(--vamo-text-muted);
      margin: 0;
    }
  }

  .plan-change-payment-notice {
    font-size: 0.875rem;
    color: var(--vamo-text);
    background: var(--vamo-surface-subtle);
    border: 1px solid var(--vamo-border);
    border-radius: 8px;
    padding: 0.65rem 0.9rem;
    margin: 0;
    line-height: 1.45;
  }

  .plan-change-unverified-box {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.75rem;
    background: var(--vamo-warning-bg);
    border: 1px solid rgba(245, 158, 11, 0.35);
    border-radius: 10px;
    padding: 0.75rem 1rem;
    color: #92400e;

    .unverified-header {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
      font-size: 0.875rem;
      flex: 1;
    }
  }
}

/* Coupon Section */
.coupon-section {
  .coupon-input-group {
    display: flex;
    gap: 0.5rem;
    max-width: 360px;

    .coupon-input {
      flex: 1;
    }
  }

  .form-error {
    font-size: 0.8rem;
    color: var(--vamo-error);
    margin-top: 0.25rem;
    display: block;
  }

  .applied-promo-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(128, 112, 192, 0.1);
    color: var(--vamo-primary);
    padding: 0.4rem 0.75rem;
    border-radius: 8px;
    font-size: 0.85rem;

    .promo-tag {
      font-weight: 600;
    }

    .promo-badge {
      background: var(--vamo-primary);
      color: #fff;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
    }

    .promo-remove-btn {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      font-size: 0.9rem;
      line-height: 1;
      padding: 0 0.2rem;
    }
  }
}

/* Saved Methods Selection */
.saved-methods-selection {
  .section-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--vamo-text);
    display: block;
    margin-bottom: 0.5rem;
  }

  .saved-methods-radios {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: 480px;

    .saved-card-radio-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 0.85rem;
      border: 1px solid var(--vamo-border);
      border-radius: 8px;
      font-size: 0.875rem;
      cursor: pointer;
      transition: background 0.15s ease;

      &:hover {
        background: var(--vamo-surface-subtle);
      }

      &.saved-card-radio-item--selected {
        border-color: var(--vamo-primary);
        background: #faf8ff;
      }

      .card-brand {
        font-weight: 700;
        font-size: 0.8rem;
      }

      .card-last4 {
        font-family: monospace;
      }

      .card-exp {
        color: var(--vamo-text-muted);
        font-size: 0.8rem;
        margin-left: auto;
      }
    }
  }
}

/* Stripe Mount Box */
.payment-elements-container {
  max-width: 520px;
  background: #ffffff;
  border: 1px solid var(--vamo-border);
  padding: 1.25rem;
  border-radius: 12px;
}

.stripe-mount-box {
  min-height: 200px;
}

.checkout-actions {
  .button-group {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
}

/* Saved Payment Methods Section */
.saved-methods-section {
  .saved-cards-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    .saved-card-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      border: 1px solid var(--vamo-border);
      border-radius: 10px;
      flex-wrap: wrap;
      gap: 0.75rem;

      .saved-card-meta {
        display: flex;
        align-items: center;
        gap: 1rem;
        font-size: 0.9rem;

        .brand-badge {
          background: var(--vamo-surface-subtle);
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          font-weight: 700;
          font-size: 0.8rem;
        }

        .card-digits {
          font-size: 0.9rem;
          font-weight: 500;
        }

        .card-expiry {
          color: var(--vamo-text-muted);
          font-size: 0.85rem;
        }
      }
    }
  }
}

/* Billing History Section */
.billing-history-section {
  .history-loading,
  .empty-history {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--vamo-text-muted);
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
  }

  .table-responsive {
    overflow-x: auto;
  }

  .billing-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;

    th {
      text-align: left;
      padding: 0.75rem 1rem;
      border-bottom: 2px solid var(--vamo-border);
      color: var(--vamo-text-muted);
      font-weight: 600;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;

      &.text-right {
        text-align: right;
      }
    }

    td {
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--vamo-border);
      color: var(--vamo-text);

      &.text-right {
        text-align: right;
      }
    }

    tr:last-child td {
      border-bottom: none;
    }
  }
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.6rem 1.25rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
  text-decoration: none;

  &:focus-visible {
    outline: 2px solid var(--vamo-primary);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &.btn-primary {
    background: var(--vamo-primary);
    color: #fff;

    &:hover:not(:disabled) {
      background: var(--vamo-primary-hover);
    }
  }

  &.btn-secondary {
    background: var(--vamo-surface-subtle);
    color: var(--vamo-text);
    border-color: var(--vamo-border);

    &:hover:not(:disabled) {
      background: #e2e8f0;
    }
  }

  &.btn-outline-primary {
    background: transparent;
    color: var(--vamo-primary);
    border-color: var(--vamo-primary);

    &:hover:not(:disabled) {
      background: rgba(128, 112, 192, 0.08);
    }
  }

  &.btn-outline-danger {
    background: transparent;
    color: var(--vamo-error);
    border-color: rgba(239, 68, 68, 0.3);

    &:hover:not(:disabled) {
      background: var(--vamo-error-bg);
      border-color: var(--vamo-error);
    }
  }

  &.btn-outline-success {
    background: transparent;
    color: var(--vamo-success);
    border-color: rgba(16, 185, 129, 0.3);

    &:hover:not(:disabled) {
      background: var(--vamo-success-bg);
      border-color: var(--vamo-success);
    }
  }

  &.btn-danger {
    background: var(--vamo-error);
    color: #fff;

    &:hover:not(:disabled) {
      background: #dc2626;
    }
  }

  &.btn-warning {
    background: var(--vamo-warning);
    color: #fff;

    &:hover:not(:disabled) {
      background: #d97706;
    }
  }

  &.btn-ghost {
    background: transparent;
    color: var(--vamo-primary);

    &:hover {
      text-decoration: underline;
    }
  }

  &.btn-sm {
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
  }

  &.btn-block {
    width: 100%;
  }
}

.form-control {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--vamo-border);
  border-radius: 8px;
  font-size: 0.875rem;
  color: var(--vamo-text);
  background: var(--vamo-surface);

  &:focus {
    outline: none;
    border-color: var(--vamo-primary);
  }
}

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.modal-dialog {
  max-width: 480px;
  width: 100%;
  padding: 1.5rem;
  background: var(--vamo-surface);

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;

    .modal-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--vamo-text);
      margin: 0;
    }

    .modal-close {
      background: none;
      border: none;
      color: var(--vamo-text-muted);
      font-size: 1.25rem;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--vamo-primary);
        border-radius: 4px;
      }
    }
  }

  .modal-body {
    font-size: 0.9rem;
    color: var(--vamo-text);
    margin-bottom: 1.5rem;

    p {
      margin: 0 0 0.5rem 0;
    }

    .modal-subtext {
      color: var(--vamo-text-muted);
      font-size: 0.85rem;
    }
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }
}

@media (max-width: 640px) {
  .billing-page {
    padding: 1rem;
  }

  .overview-grid {
    grid-template-columns: 1fr;
  }

  .plans-grid {
    grid-template-columns: 1fr;
  }
}

`]
})
export class BillingComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  businessService = inject(BusinessService);
  stripeService = inject(StripeService);
  errorService = inject(CustomerErrorService);
  i18n = inject(I18nService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  get returnEventId(): string | null {
    const id = this.route.snapshot.queryParamMap.get('returnEventId');
    return id && /^[A-Za-z0-9_-]+$/.test(id) ? id : null;
  }
  get returnReason(): string | null { return this.route.snapshot.queryParamMap.get('reason'); }
  async returnToDraft(): Promise<void> {
    if (this.returnEventId) await this.router.navigate(['/app/listings/edit', this.returnEventId]);
  }

  // Core State Signals
  subscription = signal<StripeSubscription | null | undefined>(undefined);
  subscriptionLoadError = signal(false);
  plans = signal<StripePlan[]>([]);
  selectedPlan = signal<StripePlan | null>(null);
  planChangeUnverified = signal(false);
  pendingPlanChangeTarget = signal<{
    plan: StripePlan;
    isUpgrade: boolean;
    previousPriceId: string;
    expectedRenewalEnd: number;
  } | null>(null);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  // Quota & Post Limits
  postsUsed = signal(0);
  postLimit = signal(0);
  downgradeWarning = signal<{ activePosts: number; newLimit: number } | null>(null);
  private bypassDowngradeCheck = false;

  // View Controls
  showChangePlanSection = signal(false);
  showCancelConfirmModal = signal(false);

  // Saved Payment Methods (initial checkout & Saved Payment Methods section)
  savedMethods = signal<SavedPaymentMethod[]>([]);
  selectedSavedMethod = signal<SavedPaymentMethod | null>(null);
  deletingMethodId = signal<string | null>(null);

  // Billing History
  billingHistory = signal<BillingHistoryItem[]>([]);
  billingHistoryLoading = signal(false);

  // Promotion / Coupon
  couponCode = signal('');
  promoResult = signal<PromoResult | null>(null);
  couponLoading = signal(false);
  couponError = signal<string | null>(null);
  private promoDismissedInCheckout = false;

  // Inline Payment Element
  clientSecret = signal<string | null>(null);
  stripeReady = signal(false);
  paymentActive = signal(false);
  paymentRequiresSetup = signal(false);
  isProcessingPayment = signal(false);
  activeSuccessPayload = signal<{ key: string; params?: Record<string, any> } | null>(null);
  activeErrorPayload = signal<{ key: string; params?: Record<string, any> } | null>(null);

  private stripeInstance: Stripe | null = null;
  private stripeElements: StripeElements | null = null;
  private planChangeInFlight = false;
  private paymentSubmissionInFlight = false;

  constructor() {
    effect(() => {
      this.i18n.lang();
      const payload = this.activeSuccessPayload();
      if (payload) {
        const params = { ...payload.params };
        if (params['planKey']) {
          params['plan'] = this.i18n.t(params['planKey']);
        }
        this.successMessage.set(this.i18n.t(payload.key, params));
      }
      const errPayload = this.activeErrorPayload();
      if (errPayload) {
        this.errorMessage.set(this.i18n.t(errPayload.key, errPayload.params));
      }
    });
    effect(() => {
      const secret = this.clientSecret();
      const active = this.paymentActive();
      if (active && secret) {
        setTimeout(() => this.mountPaymentElement(secret), 100);
      }
    });
  }

  private setTranslatedError(key: string, params?: Record<string, any>): void {
    this.activeErrorPayload.set({ key, params });
    this.errorMessage.set(this.i18n.t(key, params));
  }

  private clearError(): void {
    this.activeErrorPayload.set(null);
    this.errorMessage.set(null);
  }

  planTitleKey(name: string | null | undefined): string {
    return this.stripeService.planTitleKey(name);
  }

  getPlanTitle(name: string | null | undefined): string {
    return this.stripeService.getPlanTitle(name);
  }

  async ngOnInit(): Promise<void> {
    const promoParam =
      this.route.snapshot?.queryParamMap?.get('promo') ??
      (this.route.snapshot as any)?.queryParams?.['promo'];
    capturePromoCode(promoParam);
    await this.loadInitialData();
  }

  ngOnDestroy(): void {
    this.stripeService.cleanup();
  }

  private prefillPromoCodeIfEligible(): void {
    if (this.promoDismissedInCheckout) return;
    if (this.subscription() !== null && this.subscription() !== undefined) return;
    if (this.promoResult() !== null) return;
    if (this.couponCode().trim().length > 0) return;
    const saved = getSavedPromoCode();
    if (saved) {
      this.couponCode.set(saved);
    }
  }

  async loadInitialData(): Promise<void> {
    this.isLoading.set(true);
    this.clearError();
    try {
      const user = await this.authService.waitForInitialAuth();
      if (!user?.email) {
        this.isLoading.set(false);
        return;
      }

      await Promise.all([
        this.loadSubscription(user.email),
        this.loadPlans(),
        this.loadSavedMethods(),
        this.loadBillingHistory(),
      ]);
    } catch (err) {
      this.activeErrorPayload.set(null);
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'load'));
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadSubscription(email: string): Promise<void> {
    this.subscriptionLoadError.set(false);
    try {
      const sub = await this.stripeService.getSubscription(email);
      this.subscription.set(sub);
      if (sub) {
        await this.loadPostUsage(sub);
      } else {
        this.prefillPromoCodeIfEligible();
      }
    } catch {
      this.subscriptionLoadError.set(true);
      if (this.subscription() === undefined) {
        this.subscription.set(null);
      }
    }
  }

  async loadPlans(): Promise<void> {
    try {
      const plans = await this.stripeService.getPlans();
      this.plans.set(plans);
    } catch {
      this.plans.set([]);
      this.setTranslatedError('PORTAL.BILLING.EMPTY_PLANS');
    }
  }

  async loadPostUsage(sub: StripeSubscription): Promise<void> {
    const user = this.authService.currentUser;
    const providerId = user?.provider_link?.id;
    const tier = this.stripeService.tierFromProductName(sub.plan.productName) ?? 'starter';
    const baseLimit = tier === 'advanced' ? 8 : tier === 'basic' ? 4 : 1;
    const extra = await this.stripeService.getExtraPosts().catch(() => 0);
    this.postLimit.set(baseLimit + extra);

    if (providerId) {
      try {
        const events = await this.businessService.getEventsForProvider(providerId);
        const publishedCount = events.filter((e: any) => e.status === 'published').length;
        this.postsUsed.set(publishedCount);
      } catch {
        this.postsUsed.set(0);
      }
    }
  }

  async loadSavedMethods(): Promise<void> {
    try {
      const methods = await this.stripeService.getSavedPaymentMethods();
      this.savedMethods.set(methods);
    } catch {
      this.savedMethods.set([]);
    }
  }

  async loadBillingHistory(): Promise<void> {
    this.billingHistoryLoading.set(true);
    try {
      const history = await this.stripeService.getBillingHistory();
      this.billingHistory.set(history);
    } catch {
      this.billingHistory.set([]);
    } finally {
      this.billingHistoryLoading.set(false);
    }
  }

  // ─── Promotion Code ───────────────────────────────────────────────

  onCouponCodeChange(value: string): void {
    this.promoDismissedInCheckout = true;
    this.couponCode.set(value ?? '');
    if (this.couponError()) {
      this.couponError.set(null);
    }
  }

  async applyPromoCode(): Promise<void> {
    const code = this.couponCode().trim();
    if (!code) return;
    this.couponLoading.set(true);
    this.couponError.set(null);
    this.promoResult.set(null);
    try {
      const result = await this.stripeService.validatePromoCode(code);
      if (result.valid) {
        this.promoResult.set(result);
      } else {
        this.couponError.set(this.i18n.t('PORTAL.BILLING.COUPON_INVALID'));
      }
    } catch {
      this.couponError.set(this.i18n.t('PORTAL.BILLING.COUPON_ERROR'));
    } finally {
      this.couponLoading.set(false);
    }
  }

  removePromoCode(): void {
    this.promoDismissedInCheckout = true;
    this.promoResult.set(null);
    this.couponCode.set('');
    this.couponError.set(null);
  }

  // ─── Plan Selection & Subscribe Flow ─────────────────────────────

  selectPlan(plan: StripePlan): void {
    if (this.isCurrentPlan(plan) || this.isPendingPlan(plan)) return;
    const nextPlan = this.selectedPlan()?.id === plan.id ? null : plan;
    this.selectedPlan.set(nextPlan);
    this.planChangeUnverified.set(false);
    this.pendingPlanChangeTarget.set(null);
    this.clearError();
    if (nextPlan) {
      this.prefillPromoCodeIfEligible();
    }
  }

  selectSavedMethod(pm: SavedPaymentMethod): void {
    this.selectedSavedMethod.set(this.selectedSavedMethod()?.id === pm.id ? null : pm);
  }

  async proceedToPayment(): Promise<void> {
    if (this.paymentSubmissionInFlight || this.isProcessingPayment()) return;
    const plan = this.selectedPlan();
    const user = this.authService.currentUser;
    if (!plan || !user?.email) return;
    if (this.plans().length === 0) {
      this.setTranslatedError('PORTAL.BILLING.EMPTY_PLANS');
      return;
    }

    this.paymentSubmissionInFlight = true;
    this.isProcessingPayment.set(true);
    this.clearError();
    try {
      const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;
      const promoId = this.promoResult()?.promoCodeId;
      const result = await this.stripeService.createSubscription(user.email, name, plan.id, promoId);

      // If no clientSecret returned (e.g. 100% free bypass)
      if (!result.clientSecret) {
        await this.finalizeSubscriptionSuccess(plan);
        return;
      }

      // If saved payment method was chosen
      const saved = this.selectedSavedMethod();
      if (saved) {
        const { error } = result.requiresSetup
          ? await this.stripeService.confirmSetupWithSavedMethod(result.clientSecret, saved.id)
          : await this.stripeService.confirmWithSavedMethod(result.clientSecret, saved.id);
        if (error) {
          this.activeErrorPayload.set(null);
          this.errorMessage.set(this.errorService.toCustomerMessage(error, 'save'));
          return;
        }
        await this.finalizeSubscriptionSuccess(plan);
      } else {
        this.clientSecret.set(result.clientSecret);
        this.paymentRequiresSetup.set(result.requiresSetup);
        this.paymentActive.set(true);
      }
    } catch (err: any) {
      this.activeErrorPayload.set(null);
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'save'));
    } finally {
      this.isProcessingPayment.set(false);
      this.paymentSubmissionInFlight = false;
    }
  }

  private async mountPaymentElement(clientSecret: string): Promise<void> {
    try {
      const { stripe, elements } = await this.stripeService.mountPaymentElement(
        clientSecret,
        'portal-payment-element'
      );
      this.stripeInstance = stripe;
      this.stripeElements = elements;
      this.stripeReady.set(true);
    } catch (err: any) {
      this.activeErrorPayload.set(null);
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'load'));
    }
  }

  async confirmPayment(): Promise<void> {
    if (this.paymentSubmissionInFlight || this.isProcessingPayment()) return;
    if (!this.stripeInstance || !this.stripeElements) return;
    this.paymentSubmissionInFlight = true;
    this.isProcessingPayment.set(true);
    this.clearError();
    try {
      const { error } = this.paymentRequiresSetup()
        ? await this.stripeService.confirmSetup(this.stripeInstance, this.stripeElements)
        : await this.stripeService.confirmPayment(this.stripeInstance, this.stripeElements);

      if (error) {
        this.activeErrorPayload.set(null);
        this.errorMessage.set(this.errorService.toCustomerMessage(error, 'save'));
      } else {
        const plan = this.selectedPlan();
        if (plan) {
          await this.finalizeSubscriptionSuccess(plan);
        }
      }
    } catch (err: any) {
      this.activeErrorPayload.set(null);
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'save'));
    } finally {
      this.isProcessingPayment.set(false);
      this.paymentSubmissionInFlight = false;
    }
  }

  cancelPayment(): void {
    this.paymentActive.set(false);
    this.clientSecret.set(null);
    this.paymentRequiresSetup.set(false);
    this.stripeReady.set(false);
    this.stripeInstance = null;
    this.stripeElements = null;
    this.stripeService.cleanup();
  }

  private async finalizeSubscriptionSuccess(plan: StripePlan): Promise<void> {
    this.paymentActive.set(false);
    this.clientSecret.set(null);
    this.paymentRequiresSetup.set(false);
    this.stripeReady.set(false);

    // Reload authoritative state before updating tier or navigating back to draft
    const user = this.authService.currentUser;
    if (user?.email) {
      await this.loadSubscription(user.email);
      await this.loadBillingHistory();
      await this.loadSavedMethods();
    }

    const isSubscriptionActive =
      !this.subscriptionLoadError() && ['active', 'trialing'].includes(this.subscription()?.status ?? '');
    if (!isSubscriptionActive) {
      this.setTranslatedError('PORTAL.BILLING.ERROR_PAYMENT_PENDING');
      return;
    }

    await this.stripeService.setProviderTier(plan.tier).catch(() => {});
    this.selectedPlan.set(null);
    this.selectedSavedMethod.set(null);
    this.showChangePlanSection.set(false);
    const planKey = this.planTitleKey(plan.name);
    const planTitle = this.getPlanTitle(plan.name);
    this.activeSuccessPayload.set({ key: 'PORTAL.BILLING.SUCCESS_ACTIVE', params: { planKey, plan: planTitle } });
    this.successMessage.set(this.i18n.t('PORTAL.BILLING.SUCCESS_ACTIVE', { plan: planTitle }));

    clearSavedPromoCode();
    this.promoDismissedInCheckout = false;
    this.promoResult.set(null);
    this.couponCode.set('');
    this.couponError.set(null);
    // Resume only after the API confirms the subscription. The editor rechecks
    // quota when the user chooses Publish; checkout never publishes for them.
    if (this.returnEventId && isSubscriptionActive) {
      await this.returnToDraft();
    }
  }

  // ─── Upgrade & Downgrade (Change Plan) ────────────────────────────

  openChangePlan(): void {
    this.showChangePlanSection.set(true);
    this.selectedSavedMethod.set(null);
    this.planChangeUnverified.set(false);
    this.pendingPlanChangeTarget.set(null);
    this.clearError();
    this.successMessage.set(null);
  }

  closeChangePlan(): void {
    if (this.paymentActive()) {
      this.cancelPayment();
    }
    this.showChangePlanSection.set(false);
    this.selectedPlan.set(null);
    this.selectedSavedMethod.set(null);
    this.planChangeUnverified.set(false);
    this.pendingPlanChangeTarget.set(null);
    this.downgradeWarning.set(null);
    this.bypassDowngradeCheck = false;
    this.clearError();
  }

  async confirmChangePlan(): Promise<void> {
    if (this.planChangeInFlight || this.isLoading() || this.isProcessingPayment()) return;
    const sub = this.subscription();
    const newPlan = this.selectedPlan();
    if (!sub || !newPlan) return;

    const isUpgrade = newPlan.amount > (sub.plan.amount ?? 0);

    if (!isUpgrade && !this.bypassDowngradeCheck) {
      const activePosts = this.postsUsed();
      if (activePosts > newPlan.maxPosts) {
        this.downgradeWarning.set({ activePosts, newLimit: newPlan.maxPosts });
        return;
      }
    }
    this.bypassDowngradeCheck = false;
    this.downgradeWarning.set(null);

    this.planChangeInFlight = true;
    this.isLoading.set(true);
    this.planChangeUnverified.set(false);
    this.clearError();
    this.successMessage.set(null);

    const targetContext = {
      plan: newPlan,
      isUpgrade,
      previousPriceId: sub.plan.priceId,
      expectedRenewalEnd: sub.currentPeriodEnd,
    };
    this.pendingPlanChangeTarget.set(targetContext);

    try {
      const result = await this.stripeService.changeSubscriptionPlan(
        sub.subscriptionId,
        sub.subscriptionItemId,
        newPlan.id,
        isUpgrade,
        newPlan.name,
        sub.currentPeriodStart,
        sub.currentPeriodEnd,
        sub.plan.priceId,
      );

      const status = result?.status;
      if (status === 'requires_action') {
        this.pendingPlanChangeTarget.set(null);
        if (result.message) {
          this.activeErrorPayload.set(null);
          this.errorMessage.set(result.message);
        } else {
          this.setTranslatedError('PORTAL.BILLING.ERROR_ACTION_REQUIRED');
        }
        return;
      }
      if (status === 'pending_payment') {
        this.pendingPlanChangeTarget.set(null);
        if (result.message) {
          this.activeErrorPayload.set(null);
          this.errorMessage.set(result.message);
        } else {
          this.setTranslatedError('PORTAL.BILLING.ERROR_PAYMENT_PENDING');
        }
        return;
      }
      if (status === 'failed') {
        this.pendingPlanChangeTarget.set(null);
        this.activeErrorPayload.set(null);
        this.errorMessage.set(
          this.errorService.toCustomerMessage(result.message || new Error('Plan change failed'), 'save')
        );
        return;
      }

      // Re-fetch authoritative subscription/schedule state before reporting completion or updating tier
      const user = this.authService.currentUser;
      if (user?.email) {
        await this.loadSubscription(user.email);
      }

      await this.verifyAndApplyPlanChange(targetContext);
    } catch (err: any) {
      this.pendingPlanChangeTarget.set(null);
      this.activeErrorPayload.set(null);
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'save'));
    } finally {
      this.isLoading.set(false);
      this.planChangeInFlight = false;
    }
  }

  async refreshBilling(): Promise<void> {
    if (this.planChangeInFlight || this.isLoading() || this.isProcessingPayment()) return;
    const user = this.authService.currentUser;
    if (!user?.email) return;

    this.isLoading.set(true);
    this.clearError();
    try {
      await Promise.all([
        this.loadSubscription(user.email),
        this.loadBillingHistory(),
      ]);

      const pendingTarget = this.pendingPlanChangeTarget();
      if (pendingTarget) {
        await this.verifyAndApplyPlanChange(pendingTarget);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  private checkVerifiedSchedule(
    schedule: StripeSubscription['schedule'],
    targetPriceId: string,
    expectedRenewalEnd: number,
  ): boolean {
    if (typeof this.stripeService.hasVerifiedRenewalSchedule === 'function') {
      return this.stripeService.hasVerifiedRenewalSchedule(schedule, targetPriceId, expectedRenewalEnd);
    }
    return StripeService.prototype.hasVerifiedRenewalSchedule.call(
      this.stripeService,
      schedule,
      targetPriceId,
      expectedRenewalEnd,
    );
  }

  private async verifyAndApplyPlanChange(target: {
    plan: StripePlan;
    isUpgrade: boolean;
    previousPriceId: string;
    expectedRenewalEnd: number;
  }): Promise<boolean> {
    const refreshed = this.subscription();
    if (this.subscriptionLoadError() || !refreshed) {
      this.planChangeUnverified.set(true);
      this.setTranslatedError('PORTAL.BILLING.ERROR_PLAN_CHANGE_UNVERIFIED');
      return false;
    }

    if (target.isUpgrade) {
      if (refreshed.paymentIntentStatus === 'requires_action') {
        this.planChangeUnverified.set(false);
        this.pendingPlanChangeTarget.set(null);
        this.setTranslatedError('PORTAL.BILLING.ERROR_ACTION_REQUIRED');
        return false;
      }

      const hasPendingOrFailedPayment =
        ['past_due', 'unpaid', 'incomplete', 'incomplete_expired'].includes(refreshed.status) ||
        ['open', 'uncollectible', 'draft', 'void'].includes(refreshed.latestInvoiceStatus ?? '') ||
        ['requires_payment_method', 'requires_confirmation', 'processing', 'canceled'].includes(
          refreshed.paymentIntentStatus ?? ''
        ) ||
        Boolean(refreshed.pendingUpdate);

      if (hasPendingOrFailedPayment) {
        this.planChangeUnverified.set(false);
        this.pendingPlanChangeTarget.set(null);
        this.setTranslatedError('PORTAL.BILLING.ERROR_PAYMENT_PENDING');
        return false;
      }

      const isRefreshedActive = ['active', 'trialing'].includes(refreshed.status);
      const isTargetPriceVerified = refreshed.plan?.priceId === target.plan.id;
      if (!isRefreshedActive || !isTargetPriceVerified) {
        this.planChangeUnverified.set(true);
        this.setTranslatedError('PORTAL.BILLING.ERROR_PLAN_CHANGE_UNVERIFIED');
        return false;
      }

      await this.stripeService.setProviderTier(target.plan.tier).catch(() => {});
    } else {
      // Downgrades must keep the current plan active and have an authoritative schedule
      // confirming both target priceId and renewal timing. Never rely solely on Directus
      // pending fields and never accept immediate downgrade as a fallback.
      const isCurrentPlanStillActive =
        ['active', 'trialing'].includes(refreshed.status) &&
        refreshed.plan?.priceId === target.previousPriceId;
      const isScheduleVerified = this.checkVerifiedSchedule(
        refreshed.schedule,
        target.plan.id,
        target.expectedRenewalEnd,
      );

      if (!isCurrentPlanStillActive || !isScheduleVerified) {
        this.planChangeUnverified.set(true);
        this.setTranslatedError('PORTAL.BILLING.ERROR_PLAN_CHANGE_UNVERIFIED');
        return false;
      }

      if (!refreshed.pendingPlanName || !refreshed.pendingPeriodEnd) {
        this.subscription.set({
          ...refreshed,
          pendingPlanName: refreshed.pendingPlanName ?? target.plan.name,
          pendingPeriodEnd: refreshed.pendingPeriodEnd ?? target.expectedRenewalEnd,
          pendingScheduleId: refreshed.pendingScheduleId ?? refreshed.schedule?.id ?? null,
        });
      }
    }

    this.planChangeUnverified.set(false);
    this.pendingPlanChangeTarget.set(null);
    this.clearError();
    this.showChangePlanSection.set(false);
    this.selectedPlan.set(null);
    this.selectedSavedMethod.set(null);

    const planKey = this.planTitleKey(target.plan.name);
    const planTitle = this.getPlanTitle(target.plan.name);
    const msgKey = target.isUpgrade
      ? 'PORTAL.BILLING.SUCCESS_UPGRADED'
      : 'PORTAL.BILLING.SUCCESS_DOWNGRADE_SCHEDULED';
    this.activeSuccessPayload.set({ key: msgKey, params: { planKey, plan: planTitle } });
    this.successMessage.set(
      target.isUpgrade
        ? this.i18n.t('PORTAL.BILLING.SUCCESS_UPGRADED', { plan: planTitle })
        : this.i18n.t('PORTAL.BILLING.SUCCESS_DOWNGRADE_SCHEDULED', { plan: planTitle })
    );
    return true;
  }

  confirmDowngradeAnyway(): void {
    this.bypassDowngradeCheck = true;
    this.confirmChangePlan();
  }

  dismissDowngradeWarning(): void {
    this.downgradeWarning.set(null);
    this.bypassDowngradeCheck = false;
  }

  async cancelPendingDowngrade(): Promise<void> {
    const sub = this.subscription();
    if (!sub?.pendingScheduleId) return;
    this.isLoading.set(true);
    this.clearError();
    try {
      await this.stripeService.releaseSchedule(sub.pendingScheduleId);
      this.successMessage.set(this.i18n.t('PORTAL.BILLING.SUCCESS_DOWNGRADE_CANCELED'));
      const user = this.authService.currentUser;
      if (user?.email) {
        await this.loadSubscription(user.email);
      }
    } catch (err: any) {
      this.activeErrorPayload.set(null);
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'save'));
    } finally {
      this.isLoading.set(false);
    }
  }

  // ─── Cancellation & Reactivation ─────────────────────────────────

  openCancelModal(): void {
    this.showCancelConfirmModal.set(true);
  }

  closeCancelModal(): void {
    this.showCancelConfirmModal.set(false);
  }

  async confirmCancelSubscription(): Promise<void> {
    const sub = this.subscription();
    if (!sub) return;
    this.isLoading.set(true);
    this.clearError();
    try {
      await this.stripeService.cancelSubscription(sub.subscriptionId, true);
      this.showCancelConfirmModal.set(false);
      this.successMessage.set(
        this.i18n.t('PORTAL.BILLING.SUCCESS_CANCELED', { date: this.formatDate(sub.currentPeriodEnd) })
      );
      const user = this.authService.currentUser;
      if (user?.email) {
        await this.loadSubscription(user.email);
      }
    } catch (err: any) {
      this.activeErrorPayload.set(null);
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'save'));
    } finally {
      this.isLoading.set(false);
    }
  }

  async reactivateSubscription(): Promise<void> {
    const sub = this.subscription();
    if (!sub) return;
    this.isLoading.set(true);
    this.clearError();
    try {
      await this.stripeService.cancelSubscription(sub.subscriptionId, false);
      this.successMessage.set(this.i18n.t('PORTAL.BILLING.SUCCESS_REACTIVATED'));
      const user = this.authService.currentUser;
      if (user?.email) {
        await this.loadSubscription(user.email);
      }
    } catch (err: any) {
      this.activeErrorPayload.set(null);
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'save'));
    } finally {
      this.isLoading.set(false);
    }
  }

  // ─── Payment Methods ─────────────────────────────────────────────

  async deletePaymentMethod(pm: SavedPaymentMethod): Promise<void> {
    this.deletingMethodId.set(pm.id);
    this.clearError();
    try {
      await this.stripeService.detachPaymentMethod(pm.id);
      this.savedMethods.update((list) => list.filter((m) => m.id !== pm.id));
      if (this.selectedSavedMethod()?.id === pm.id) {
        this.selectedSavedMethod.set(null);
      }
    } catch (err: any) {
      this.activeErrorPayload.set(null);
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'delete'));
    } finally {
      this.deletingMethodId.set(null);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  getPlanFeatures(plan: StripePlan): string[] {
    if (plan.tier) {
      return getCanonicalTierFeatures(plan.tier, this.i18n.lang());
    }
    return plan.features || [];
  }

  formatPrice(amount: number, currency: string): string {
    return this.stripeService.formatPrice(amount, currency);
  }

  formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleDateString(this.i18n.dateLocale(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  isCurrentPlan(plan: StripePlan): boolean {
    return this.subscription()?.plan?.priceId === plan.id;
  }

  isPendingPlan(plan: StripePlan): boolean {
    const sub = this.subscription();
    if (!sub) return false;
    if (this.checkVerifiedSchedule(sub.schedule, plan.id, sub.currentPeriodEnd)) {
      return true;
    }
    if (!sub.pendingPlanName) return false;
    return plan.name.toLowerCase() === sub.pendingPlanName.toLowerCase();
  }
}
