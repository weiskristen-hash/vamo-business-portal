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
  CouponVerificationState,
  CheckoutVerificationStatus,
  CheckoutPreviewResult,
  CheckoutChargeProtectionError,
  ScheduledDowngradeVerification,
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
      <div *ngIf="hasScheduledDowngrade(sub)" class="pending-downgrade-banner">
        <div class="pending-info">
          <span class="pending-icon">⏳</span>
          <div class="pending-text">
            <strong>{{ 'PORTAL.BILLING.SCHEDULED_CHANGE_TITLE' | translate }}</strong>
            <span>{{ 'PORTAL.BILLING.PENDING_DOWNGRADE_DESC' | translate: { plan: (planTitleKey(sub.pendingPlanName) | translate), date: formatDate(sub.pendingPeriodEnd!) } }}</span>
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
              [disabled]="!canConfirmPlanChange()"
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
          <div class="coupon-header-row">
            <span class="coupon-section-label">{{ 'PORTAL.BILLING.PROMO_TAG' | translate }}</span>
            <span
              class="coupon-state-badge"
              [attr.data-coupon-state]="couponState()"
              [class.coupon-state-badge--verified]="couponState() === 'verified_applied'"
              [class.coupon-state-badge--validating]="couponState() === 'validating'"
              [class.coupon-state-badge--invalid]="couponState() === 'invalid_or_ineligible'"
              [class.coupon-state-badge--expired]="couponState() === 'expired_or_changed'"
              [class.coupon-state-badge--unavailable]="couponState() === 'verification_unavailable'"
            >
              {{ getCouponStateLabelKey() | translate }}
            </span>
          </div>

          <div *ngIf="promoResult() as promo" class="applied-promo-chip">
            <span class="promo-tag">🎟 {{ promo.name || ('PORTAL.BILLING.PROMO_TAG' | translate) }}</span>
            <span *ngIf="promo.percentOff === 100 || (checkoutPreview()?.verified && checkoutPreview()?.amountDueToday === 0)" class="promo-badge">{{ 'PORTAL.BILLING.PROMO_FREE' | translate }}</span>
            <span *ngIf="promo.percentOff && promo.percentOff < 100 && (!checkoutPreview() || checkoutPreview()!.amountDueToday > 0)" class="promo-badge">{{ 'PORTAL.BILLING.PROMO_OFF' | translate: { percent: promo.percentOff } }}</span>
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
              [disabled]="couponLoading() || previewLoading()"
            />
            <button
              *ngIf="couponCode().trim()"
              type="button"
              class="btn btn-ghost btn-sm coupon-clear-btn"
              [disabled]="couponLoading() || previewLoading()"
              (click)="removePromoCode()"
              [attr.aria-label]="'PORTAL.BILLING.PROMO_REMOVE' | translate"
              [attr.title]="'PORTAL.BILLING.PROMO_REMOVE' | translate"
            >✕</button>
            <button
              type="button"
              class="btn btn-secondary btn-sm coupon-apply-btn"
              [disabled]="couponLoading() || previewLoading() || !couponCode().trim()"
              (click)="applyPromoCode()"
            >
              {{ (couponLoading() ? 'PORTAL.BILLING.COUPON_APPLYING' : 'PORTAL.BILLING.COUPON_APPLY') | translate }}
            </button>
          </div>
          <p *ngIf="!promoResult() && couponCode().trim() && couponState() === 'not_applied'" class="coupon-unapplied-hint" role="note">
            {{ 'PORTAL.BILLING.COUPON_UNAPPLIED_HINT' | translate }}
          </p>
          <span *ngIf="couponError()" class="form-error" role="alert">{{ couponError() }}</span>
        </div>

        <!-- Verified Checkout Order Summary (for new subscriptions) -->
        <div
          *ngIf="subscription() === null"
          class="verified-order-summary"
          role="region"
          aria-labelledby="verified-order-summary-title"
        >
          <div class="order-summary-header">
            <h4 id="verified-order-summary-title" class="order-summary-title">
              {{ 'PORTAL.BILLING.ORDER_SUMMARY_TITLE' | translate }}
            </h4>
            <span
              class="verification-status-badge"
              [attr.data-verification-status]="checkoutVerificationStatus()"
              [class.verification-status-badge--verified]="checkoutVerificationStatus() === 'verified'"
              [class.verification-status-badge--verifying]="checkoutVerificationStatus() === 'verifying'"
              [class.verification-status-badge--expired]="checkoutVerificationStatus() === 'expired'"
              [class.verification-status-badge--blocked]="checkoutVerificationStatus() === 'mismatch_blocked'"
              [class.verification-status-badge--unavailable]="checkoutVerificationStatus() === 'unavailable'"
            >
              {{ getVerificationBadgeLabelKey() | translate }}
            </span>
          </div>

          <div class="order-summary-rows">
            <div class="summary-row">
              <span class="summary-label">{{ 'PORTAL.BILLING.SUMMARY_PLAN_LABEL' | translate }}</span>
              <span class="summary-value">
                {{ planTitleKey(selPlan.name) | translate }} / {{ (selPlan.interval === 'year' ? 'PORTAL.BILLING.INTERVAL_YEAR' : 'PORTAL.BILLING.INTERVAL_MONTH') | translate }}
              </span>
            </div>

            <div class="summary-row">
              <span class="summary-label">{{ 'PORTAL.BILLING.SUMMARY_ORIGINAL_PRICE' | translate }}</span>
              <span class="summary-value summary-original-price">
                {{ formatExactPrice(checkoutPreview()?.subtotal ?? selPlan.amount, checkoutPreview()?.currency ?? selPlan.currency) }}
              </span>
            </div>

            <div
              *ngIf="checkoutPreview()?.promoCode || promoResult()?.name || couponCode().trim()"
              class="summary-row"
            >
              <span class="summary-label">{{ 'PORTAL.BILLING.SUMMARY_PROMO_APPLIED' | translate }}</span>
              <span class="summary-value summary-promo-value">
                <span class="summary-promo-code">{{ checkoutPreview()?.promoCodeName || promoResult()?.name || couponCode().trim() }}</span>
                <span class="summary-promo-status">({{ getCouponStateLabelKey() | translate }})</span>
              </span>
            </div>

            <div
              *ngIf="checkoutPreview()?.verified && (checkoutPreview()?.discountAmount ?? 0) > 0"
              class="summary-row summary-row--discount"
            >
              <span class="summary-label">{{ 'PORTAL.BILLING.SUMMARY_DISCOUNT' | translate }}</span>
              <span class="summary-value summary-discount-amount">
                -{{ formatExactPrice(checkoutPreview()!.discountAmount, checkoutPreview()!.currency) }}
              </span>
            </div>

            <div
              *ngIf="checkoutPreview()?.verified && (checkoutPreview()?.tax ?? 0) > 0"
              class="summary-row"
            >
              <span class="summary-label">{{ 'PORTAL.BILLING.SUMMARY_TAX' | translate }}</span>
              <span class="summary-value">
                {{ formatExactPrice(checkoutPreview()!.tax, checkoutPreview()!.currency) }}
              </span>
            </div>

            <div class="summary-row summary-row--total">
              <span class="summary-label">{{ 'PORTAL.BILLING.SUMMARY_DUE_TODAY' | translate }}</span>
              <span class="summary-value summary-due-today-amount" data-testid="amount-due-today">
                {{
                  checkoutPreview()?.verified
                    ? formatExactPrice(checkoutPreview()!.amountDueToday, checkoutPreview()!.currency)
                    : '—'
                }}
              </span>
            </div>

            <div *ngIf="getRenewalDisclosureText(selPlan) as renewalText" class="summary-row summary-row--renewal">
              <span class="summary-label">{{ 'PORTAL.BILLING.SUMMARY_RENEWAL_LABEL' | translate }}</span>
              <span class="summary-value summary-renewal-text" data-testid="renewal-disclosure">
                {{ renewalText }}
              </span>
            </div>
          </div>

          <p class="charge-protection-note">
            🔒 {{ 'PORTAL.BILLING.CHARGE_PROTECTION_GUARANTEE' | translate }}
          </p>
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
              class="btn btn-primary checkout-submit-btn"
              [disabled]="!stripeReady() || isProcessingPayment() || !canProceedToVerifiedCheckout()"
              (click)="confirmPayment()"
            >
              {{ getCheckoutButtonLabel(selPlan) }}
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
              class="btn btn-primary checkout-submit-btn"
              *ngIf="subscription() === null"
              [disabled]="!canProceedToVerifiedCheckout()"
              (click)="proceedToPayment()"
            >
              {{ getCheckoutButtonLabel(selPlan) }}
            </button>

            <button
              type="button"
              class="btn btn-secondary btn-sm reverify-price-btn"
              *ngIf="subscription() === null && (checkoutVerificationStatus() === 'expired' || checkoutVerificationStatus() === 'unavailable' || checkoutVerificationStatus() === 'mismatch_blocked')"
              [disabled]="previewLoading() || couponLoading() || isProcessingPayment()"
              (click)="reverifyCurrentCheckout()"
            >
              {{ 'PORTAL.BILLING.BTN_REVERIFY_PRICE' | translate }}
            </button>

            <button
              type="button"
              class="btn btn-primary"
              *ngIf="subscription() !== null && !isPendingPlan(selPlan)"
              [disabled]="!canConfirmPlanChange()"
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

    <!-- ── PAYMENT METHODS SECTION ───────────────────────────────────── -->
    <section class="saved-methods-section card" aria-labelledby="payment-methods-heading">
      <div class="card-header payment-methods-header">
        <h3 id="payment-methods-heading" class="card-title">{{ 'PORTAL.BILLING.PAYMENT_METHODS_TITLE' | translate }}</h3>
        <button
          *ngIf="!cardSetupOpen()"
          type="button"
          class="btn btn-primary btn-sm add-card-btn"
          [disabled]="isOpeningCardSetup() || isSavingCard()"
          (click)="openAddCard()"
        >
          {{ 'PORTAL.BILLING.BTN_ADD_CARD' | translate }}
        </button>
      </div>

      <div class="card-body">
        <!-- Loading State -->
        <div
          *ngIf="savedMethodsLoading() && savedMethods().length === 0"
          class="payment-methods-loading"
          role="status"
        >
          <div class="spinner-sm"></div>
          <span>{{ 'PORTAL.BILLING.PAYMENT_METHODS_LOADING' | translate }}</span>
        </div>

        <!-- Error State -->
        <div
          *ngIf="!savedMethodsLoading() && savedMethodsError() && savedMethods().length === 0"
          class="payment-methods-error alert alert-warning"
          role="alert"
        >
          <span class="alert-icon">⚠️</span>
          <span class="alert-text">{{ 'PORTAL.BILLING.PAYMENT_METHODS_LOAD_ERROR' | translate }}</span>
          <button
            type="button"
            class="btn btn-secondary btn-sm retry-payment-methods-btn"
            (click)="loadSavedMethods()"
          >
            {{ 'PORTAL.COMMON.RETRY' | translate }}
          </button>
        </div>

        <!-- Empty State -->
        <div
          *ngIf="!savedMethodsLoading() && !savedMethodsError() && savedMethods().length === 0"
          class="empty-saved-cards"
        >
          <p class="empty-cards-title">{{ 'PORTAL.BILLING.NO_SAVED_CARDS_TITLE' | translate }}</p>
          <p class="empty-cards-desc">{{ 'PORTAL.BILLING.NO_SAVED_CARDS_DESC' | translate }}</p>
          <button
            *ngIf="!cardSetupOpen()"
            type="button"
            class="btn btn-outline-primary btn-sm empty-add-card-btn"
            [disabled]="isOpeningCardSetup() || isSavingCard()"
            (click)="openAddCard()"
          >
            {{ 'PORTAL.BILLING.BTN_ADD_CARD' | translate }}
          </button>
        </div>

        <!-- Saved Cards List -->
        <div *ngIf="savedMethods().length > 0" class="saved-cards-list">
          <div *ngFor="let card of savedMethods()" class="saved-card-row">
            <div class="saved-card-meta">
              <span class="brand-badge">{{ card.brand | uppercase }}</span>
              <span class="card-digits font-mono">•••• •••• •••• {{ card.last4 }}</span>
              <span class="card-expiry">{{ 'PORTAL.BILLING.EXPIRES' | translate: { month: card.expMonth, year: card.expYear } }}</span>
              <span
                *ngIf="isVerifiedRenewalCard(card)"
                class="badge badge-current renewal-card-badge"
              >
                {{ 'PORTAL.BILLING.BADGE_RENEWAL_CARD' | translate }}
              </span>
            </div>

            <div class="saved-card-actions">
              <span
                *ngIf="isRenewalCardRemovalBlocked(card)"
                class="renewal-remove-blocked-hint"
              >
                {{ 'PORTAL.BILLING.RENEWAL_CARD_REMOVE_BLOCKED' | translate }}
              </span>

              <button
                *ngIf="!isVerifiedRenewalCard(card)"
                type="button"
                class="btn btn-secondary btn-sm set-renewal-card-btn"
                [disabled]="settingRenewalCardId() === card.id || deletingMethodId() === card.id"
                (click)="setCardAsRenewal(card)"
              >
                {{
                  settingRenewalCardId() === card.id
                    ? ('PORTAL.BILLING.BTN_SETTING_RENEWAL' | translate)
                    : pendingRenewalRetryCardId() === card.id
                      ? ('PORTAL.BILLING.BTN_RETRY_RENEWAL_CARD' | translate)
                      : ('PORTAL.BILLING.BTN_USE_FOR_RENEWALS' | translate)
                }}
              </button>

              <button
                type="button"
                class="btn btn-outline-danger btn-sm remove-card-btn"
                [disabled]="deletingMethodId() === card.id || isRenewalCardRemovalBlocked(card)"
                [attr.title]="isRenewalCardRemovalBlocked(card) ? ('PORTAL.BILLING.RENEWAL_CARD_REMOVE_BLOCKED' | translate) : null"
                (click)="deletePaymentMethod(card)"
              >
                {{ deletingMethodId() === card.id ? ('PORTAL.BILLING.BTN_REMOVING' | translate) : ('PORTAL.BILLING.BTN_REMOVE' | translate) }}
              </button>
            </div>
          </div>
        </div>

        <!-- Scoped Inline Add-Card Panel -->
        <div
          *ngIf="cardSetupOpen()"
          class="add-card-panel"
          role="region"
          aria-labelledby="add-card-panel-title"
        >
          <div class="add-card-panel-header">
            <h4 id="add-card-panel-title" class="add-card-title">
              {{ 'PORTAL.BILLING.ADD_CARD_TITLE' | translate }}
            </h4>
          </div>

          <div *ngIf="cardSetupError()" class="alert alert-danger card-setup-error" role="alert">
            <span class="alert-icon">⚠️</span>
            <span class="alert-text">{{ cardSetupError() }}</span>
          </div>

          <div *ngIf="isOpeningCardSetup()" class="card-setup-loading" role="status">
            <div class="spinner-sm"></div>
            <span>{{ 'PORTAL.BILLING.CARD_SETUP_LOADING' | translate }}</span>
          </div>

          <div [hidden]="!cardSetupClientSecret()" class="payment-elements-container card-setup-elements-container">
            <div id="portal-card-setup-element" class="stripe-mount-box"></div>
          </div>

          <label class="card-setup-checkbox-label">
            <input
              type="checkbox"
              class="card-setup-renewal-checkbox"
              [ngModel]="useCardForRenewals()"
              (ngModelChange)="useCardForRenewals.set(!!$event)"
              [disabled]="isSavingCard() || isOpeningCardSetup()"
            />
            <span>{{ 'PORTAL.BILLING.USE_FOR_RENEWALS_LABEL' | translate }}</span>
          </label>

          <p class="card-setup-hold-notice">
            {{ 'PORTAL.BILLING.CARD_SETUP_HOLD_NOTICE' | translate }}
          </p>

          <div class="card-setup-actions">
            <button
              type="button"
              class="btn btn-secondary cancel-card-setup-btn"
              [disabled]="isSavingCard()"
              (click)="cancelAddCard()"
            >
              {{ 'PORTAL.COMMON.CANCEL' | translate }}
            </button>
            <button
              type="button"
              class="btn btn-primary save-card-btn"
              [disabled]="!cardSetupReady() || isSavingCard() || isOpeningCardSetup()"
              (click)="saveNewCard()"
            >
              {{ (isSavingCard() ? 'PORTAL.BILLING.BTN_SAVING_CARD' : 'PORTAL.BILLING.BTN_SAVE_CARD') | translate }}
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
  display: flex;
  flex-direction: column;
  gap: 0.45rem;

  .coupon-header-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;

    .coupon-section-label {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--vamo-text);
    }
  }

  .coupon-state-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    background: var(--vamo-surface-subtle);
    color: var(--vamo-text-muted);
    border: 1px solid var(--vamo-border);

    &.coupon-state-badge--verified {
      background: #ecfdf5;
      color: #065f46;
      border-color: #6ee7b7;
    }

    &.coupon-state-badge--validating {
      background: #eff6ff;
      color: #1e40af;
      border-color: #93c5fd;
    }

    &.coupon-state-badge--invalid,
    &.coupon-state-badge--expired {
      background: #fef2f2;
      color: #991b1b;
      border-color: #fca5a5;
    }

    &.coupon-state-badge--unavailable {
      background: #fffbeb;
      color: #92400e;
      border-color: #fcd34d;
    }
  }

  .coupon-input-group {
    display: flex;
    gap: 0.5rem;
    max-width: 360px;

    .coupon-input {
      flex: 1;
    }
  }

  .coupon-unapplied-hint {
    font-size: 0.8rem;
    color: #92400e;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 8px;
    padding: 0.45rem 0.7rem;
    margin: 0.15rem 0 0 0;
    max-width: 480px;
  }

  .form-error {
    font-size: 0.8rem;
    color: var(--vamo-error);
    margin-top: 0.15rem;
    display: block;
  }

  .applied-promo-chip {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
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

/* Verified Checkout Order Summary */
.verified-order-summary {
  background: #f8fafc;
  border: 1px solid var(--vamo-border);
  border-radius: 12px;
  padding: 1rem 1.15rem;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;

  .order-summary-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--vamo-border);

    .order-summary-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--vamo-text);
      margin: 0;
    }
  }

  .verification-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.2rem 0.65rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    background: var(--vamo-surface-subtle);
    color: var(--vamo-text-muted);
    border: 1px solid var(--vamo-border);

    &.verification-status-badge--verified {
      background: #ecfdf5;
      color: #065f46;
      border-color: #6ee7b7;
    }

    &.verification-status-badge--verifying {
      background: #eff6ff;
      color: #1e40af;
      border-color: #93c5fd;
    }

    &.verification-status-badge--expired,
    &.verification-status-badge--unavailable {
      background: #fffbeb;
      color: #92400e;
      border-color: #fcd34d;
    }

    &.verification-status-badge--blocked {
      background: #fef2f2;
      color: #991b1b;
      border-color: #fca5a5;
    }
  }

  .order-summary-rows {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;

    .summary-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.75rem;
      font-size: 0.875rem;
      color: var(--vamo-text);

      .summary-label {
        color: var(--vamo-text-muted);
      }

      .summary-value {
        font-weight: 600;
        text-align: right;
      }

      .summary-promo-value {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        flex-wrap: wrap;
        justify-content: flex-end;

        .summary-promo-code {
          font-family: monospace;
          font-weight: 700;
          color: var(--vamo-primary);
        }

        .summary-promo-status {
          font-size: 0.78rem;
          font-weight: 500;
          color: var(--vamo-text-muted);
        }
      }

      &.summary-row--discount {
        color: #059669;

        .summary-label,
        .summary-value {
          color: #059669;
          font-weight: 600;
        }
      }

      &.summary-row--total {
        padding-top: 0.55rem;
        margin-top: 0.25rem;
        border-top: 1px solid var(--vamo-border);
        font-size: 1rem;

        .summary-label {
          color: var(--vamo-text);
          font-weight: 700;
        }

        .summary-due-today-amount {
          font-size: 1.15rem;
          font-weight: 800;
          color: var(--vamo-text);
        }
      }

      &.summary-row--renewal {
        padding-top: 0.35rem;
        font-size: 0.82rem;

        .summary-renewal-text {
          font-weight: 500;
          color: var(--vamo-text-muted);
          max-width: 320px;
        }
      }
    }
  }

  .charge-protection-note {
    margin: 0;
    padding-top: 0.45rem;
    border-top: 1px dashed var(--vamo-border);
    font-size: 0.78rem;
    color: var(--vamo-text-muted);
    line-height: 1.4;
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
  .payment-methods-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;

    .card-title {
      margin: 0;
    }
  }

  .payment-methods-loading {
    padding: 1.5rem 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    color: var(--vamo-text-muted);
    font-size: 0.9rem;
  }

  .empty-saved-cards {
    padding: 1.5rem 1rem;
    text-align: center;
    border: 1px dashed var(--vamo-border);
    border-radius: 10px;
    background: var(--vamo-surface-subtle);

    .empty-cards-title {
      font-size: 1rem;
      font-weight: 700;
      color: var(--vamo-text);
      margin: 0 0 0.35rem 0;
    }

    .empty-cards-desc {
      font-size: 0.875rem;
      color: var(--vamo-text-muted);
      margin: 0 0 1rem 0;
    }
  }

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
        gap: 0.75rem;
        font-size: 0.9rem;
        flex-wrap: wrap;

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

      .saved-card-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;

        .renewal-remove-blocked-hint {
          font-size: 0.8rem;
          color: var(--vamo-text-muted);
        }
      }
    }
  }

  .add-card-panel {
    margin-top: 1.25rem;
    padding: 1.25rem;
    border: 1px solid var(--vamo-border);
    border-radius: 12px;
    background: var(--vamo-surface-subtle);
    display: flex;
    flex-direction: column;
    gap: 1rem;

    .add-card-panel-header {
      .add-card-title {
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--vamo-text);
        margin: 0;
      }
    }

    .card-setup-loading {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem 0;
      color: var(--vamo-text-muted);
      font-size: 0.875rem;
    }

    .card-setup-checkbox-label {
      display: flex;
      align-items: flex-start;
      gap: 0.6rem;
      font-size: 0.9rem;
      color: var(--vamo-text);
      cursor: pointer;
      user-select: none;

      input[type="checkbox"] {
        margin-top: 0.2rem;
        width: 16px;
        height: 16px;
        accent-color: var(--vamo-primary);
        cursor: pointer;
      }
    }

    .card-setup-hold-notice {
      font-size: 0.825rem;
      color: var(--vamo-text-muted);
      margin: 0;
      line-height: 1.45;
    }

    .card-setup-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      flex-wrap: wrap;
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
    subscriptionId: string;
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

  // Saved Payment Methods (initial checkout & Payment Methods section)
  savedMethods = signal<SavedPaymentMethod[]>([]);
  savedMethodsLoading = signal(false);
  savedMethodsError = signal(false);
  defaultPaymentMethodId = signal<string | null>(null);
  defaultPaymentMethodVerified = signal(false);
  selectedSavedMethod = signal<SavedPaymentMethod | null>(null);
  deletingMethodId = signal<string | null>(null);
  settingRenewalCardId = signal<string | null>(null);
  pendingRenewalRetryCardId = signal<string | null>(null);

  // Standalone Card Setup (isolated from subscription checkout)
  cardSetupOpen = signal(false);
  isOpeningCardSetup = signal(false);
  isSavingCard = signal(false);
  cardSetupReady = signal(false);
  cardSetupClientSecret = signal<string | null>(null);
  cardSetupIntentId = signal<string | null>(null);
  useCardForRenewals = signal(false);
  cardSetupError = signal<string | null>(null);
  activeCardSetupErrorPayload = signal<{ key: string; params?: Record<string, any> } | null>(null);

  // Billing History
  billingHistory = signal<BillingHistoryItem[]>([]);
  billingHistoryLoading = signal(false);

  // Promotion / Coupon & Verified Checkout
  couponCode = signal('');
  promoResult = signal<PromoResult | null>(null);
  couponLoading = signal(false);
  couponError = signal<string | null>(null);
  couponState = signal<CouponVerificationState>('not_applied');
  checkoutPreview = signal<CheckoutPreviewResult | null>(null);
  previewLoading = signal(false);
  checkoutVerificationStatus = signal<CheckoutVerificationStatus>('unverified');
  private promoDismissedInCheckout = false;
  private previewRequestSeq = 0;

  // Inline Payment Element (Subscription Checkout)
  clientSecret = signal<string | null>(null);
  stripeReady = signal(false);
  paymentActive = signal(false);
  paymentRequiresSetup = signal(false);
  isProcessingPayment = signal(false);
  activeSuccessPayload = signal<{ key: string; params?: Record<string, any> } | null>(null);
  activeErrorPayload = signal<{ key: string; params?: Record<string, any> } | null>(null);

  private stripeInstance: Stripe | null = null;
  private stripeElements: StripeElements | null = null;
  private cardSetupStripeInstance: Stripe | null = null;
  private cardSetupStripeElements: StripeElements | null = null;
  private planChangeInFlight = false;
  private paymentSubmissionInFlight = false;
  private cardSetupOpenInFlight = false;
  private cardSetupSubmissionInFlight = false;

  constructor() {
    effect(() => {
      this.i18n.lang();
      const payload = this.activeSuccessPayload();
      if (payload) {
        const params = { ...payload.params };
        if (params['planKey']) {
          params['plan'] = this.i18n.t(params['planKey']);
        }
        if (typeof params['dateTimestamp'] === 'number') {
          params['date'] = this.formatDate(params['dateTimestamp']);
        }
        this.successMessage.set(this.i18n.t(payload.key, params));
      }
      const errPayload = this.activeErrorPayload();
      if (errPayload) {
        this.errorMessage.set(this.i18n.t(errPayload.key, errPayload.params));
      }
      const cardSetupErrPayload = this.activeCardSetupErrorPayload();
      if (cardSetupErrPayload) {
        this.cardSetupError.set(this.i18n.t(cardSetupErrPayload.key, cardSetupErrPayload.params));
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

  private setTranslatedSuccess(key: string, params?: Record<string, any>): void {
    this.activeSuccessPayload.set({ key, params });
    this.successMessage.set(this.i18n.t(key, params));
  }

  private setTranslatedError(key: string, params?: Record<string, any>): void {
    this.activeErrorPayload.set({ key, params });
    this.errorMessage.set(this.i18n.t(key, params));
  }

  private clearError(): void {
    this.activeErrorPayload.set(null);
    this.errorMessage.set(null);
  }

  private setTranslatedCardSetupError(key: string, params?: Record<string, any>): void {
    this.activeCardSetupErrorPayload.set({ key, params });
    this.cardSetupError.set(this.i18n.t(key, params));
  }

  private clearCardSetupError(): void {
    this.activeCardSetupErrorPayload.set(null);
    this.cardSetupError.set(null);
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
    await this.handleCardSetupRedirectIfPresent();
  }

  ngOnDestroy(): void {
    this.stripeService.cleanup();
    if (typeof this.stripeService.cleanupCardSetup === 'function') {
      this.stripeService.cleanupCardSetup();
    }
  }

  private prefillPromoCodeIfEligible(): void {
    if (this.promoDismissedInCheckout) return;
    if (this.subscription() !== null && this.subscription() !== undefined) return;
    if (this.promoResult() !== null) return;
    if (this.couponCode().trim().length > 0) return;
    const saved = getSavedPromoCode();
    if (saved) {
      this.couponCode.set(saved);
      this.couponState.set('not_applied');
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
    this.savedMethodsLoading.set(true);
    this.savedMethodsError.set(false);
    try {
      if (typeof this.stripeService.loadSavedPaymentMethods === 'function') {
        const result = await this.stripeService.loadSavedPaymentMethods();
        this.savedMethods.set(result.paymentMethods);
        if (result.defaultVerified) {
          this.defaultPaymentMethodId.set(result.defaultPaymentMethodId);
          this.defaultPaymentMethodVerified.set(true);
        } else {
          const currentVerifiedId = this.defaultPaymentMethodVerified()
            ? this.defaultPaymentMethodId()
            : null;
          if (currentVerifiedId && result.paymentMethods.some((m) => m.id === currentVerifiedId)) {
            this.defaultPaymentMethodId.set(currentVerifiedId);
            this.defaultPaymentMethodVerified.set(true);
          } else {
            this.defaultPaymentMethodId.set(null);
            this.defaultPaymentMethodVerified.set(false);
          }
        }
      } else {
        const methods = await this.stripeService.getSavedPaymentMethods();
        const itemDefault = methods.find((m) => m.isRenewalCard === true);
        const hasVerifiedFlag = methods.some((m) => typeof m.isRenewalCard === 'boolean');
        this.savedMethods.set(methods);
        if (hasVerifiedFlag) {
          this.defaultPaymentMethodId.set(itemDefault?.id ?? null);
          this.defaultPaymentMethodVerified.set(true);
        } else {
          this.defaultPaymentMethodId.set(null);
          this.defaultPaymentMethodVerified.set(false);
        }
      }
    } catch {
      this.savedMethodsError.set(true);
      this.savedMethods.set([]);
      this.defaultPaymentMethodId.set(null);
      this.defaultPaymentMethodVerified.set(false);
    } finally {
      this.savedMethodsLoading.set(false);
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

  // ─── Promotion Code & Authoritative Price Preview ──────────────────

  onCouponCodeChange(value: string): void {
    this.promoDismissedInCheckout = true;
    const nextVal = value ?? '';
    this.couponCode.set(nextVal);
    if (this.couponError()) {
      this.couponError.set(null);
    }
    // Changing the coupon invalidates any previously verified discount total
    if (this.promoResult() !== null) {
      this.promoResult.set(null);
    }
    this.couponState.set('not_applied');
    const currentPreview = this.checkoutPreview();
    if (currentPreview && (currentPreview.promoCodeId || currentPreview.discountAmount > 0)) {
      this.checkoutPreview.set(null);
      this.checkoutVerificationStatus.set('unverified');
      const plan = this.selectedPlan();
      if (plan && !this.subscription()) {
        void this.refreshCheckoutPreview(plan, null);
      }
    }
  }

  async applyPromoCode(): Promise<void> {
    const code = this.couponCode().trim();
    if (!code) return;
    this.couponLoading.set(true);
    this.couponError.set(null);
    this.promoResult.set(null);
    this.couponState.set('validating');

    const plan = this.selectedPlan();
    const user = this.authService.currentUser;

    // When a plan is selected and previewSubscriptionCheckout is available, verify against the authoritative preview
    if (plan && user?.email && typeof this.stripeService.previewSubscriptionCheckout === 'function') {
      this.previewLoading.set(true);
      this.checkoutVerificationStatus.set('verifying');
      try {
        const preview = await this.stripeService.previewSubscriptionCheckout({
          priceId: plan.id,
          planAmount: plan.amount,
          planCurrency: plan.currency,
          planInterval: plan.interval,
          planName: plan.name,
          promotionCode: code,
          customerEmail: user.email,
        });
        if (preview.verified && preview.couponState === 'verified_applied') {
          this.checkoutPreview.set(preview);
          this.checkoutVerificationStatus.set('verified');
          this.couponState.set('verified_applied');
          this.promoResult.set({
            valid: true,
            promoCodeId: preview.promoCodeId ?? undefined,
            name: preview.promoCodeName ?? preview.promoCode ?? code,
            duration: preview.couponDuration ?? undefined,
            durationInMonths: preview.couponDurationInMonths ?? null,
          });
          return;
        }

        // Coupon failed or preview could not verify the discount
        this.couponState.set(preview.couponState);
        if (preview.couponState === 'invalid_or_ineligible') {
          this.couponError.set(this.i18n.t('PORTAL.BILLING.COUPON_INVALID'));
          // Refresh base plan preview without coupon so the undiscounted total remains verified
          await this.refreshCheckoutPreview(plan, null, true);
        } else if (preview.couponState === 'expired_or_changed') {
          this.checkoutPreview.set(null);
          this.checkoutVerificationStatus.set('expired');
          this.couponError.set(this.i18n.t('PORTAL.BILLING.ERROR_VERIFICATION_EXPIRED'));
        } else {
          this.checkoutPreview.set(null);
          this.checkoutVerificationStatus.set('unavailable');
          this.couponError.set(this.i18n.t('PORTAL.BILLING.COUPON_ERROR'));
        }
        return;
      } catch {
        this.couponState.set('verification_unavailable');
        this.checkoutPreview.set(null);
        this.checkoutVerificationStatus.set('unavailable');
        this.couponError.set(this.i18n.t('PORTAL.BILLING.COUPON_ERROR'));
        return;
      } finally {
        this.previewLoading.set(false);
        this.couponLoading.set(false);
      }
    }

    // Fallback when no plan is selected yet or in legacy unit tests without previewSubscriptionCheckout
    try {
      const result = await this.stripeService.validatePromoCode(code);
      if (result.valid) {
        this.promoResult.set(result);
        this.couponState.set('verified_applied');
      } else {
        this.couponState.set('invalid_or_ineligible');
        this.couponError.set(this.i18n.t('PORTAL.BILLING.COUPON_INVALID'));
      }
    } catch {
      this.couponState.set('verification_unavailable');
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
    this.couponState.set('not_applied');
    this.checkoutPreview.set(null);
    this.checkoutVerificationStatus.set('unverified');
    const plan = this.selectedPlan();
    if (plan && !this.subscription()) {
      void this.refreshCheckoutPreview(plan, null);
    }
  }

  async refreshCheckoutPreview(
    plan: StripePlan,
    promoCode?: string | null,
    preserveCouponState = false,
  ): Promise<CheckoutPreviewResult | null> {
    const user = this.authService.currentUser;
    if (!plan || !user?.email) {
      this.checkoutPreview.set(null);
      this.checkoutVerificationStatus.set('unverified');
      return null;
    }
    if (typeof this.stripeService.previewSubscriptionCheckout !== 'function') {
      const fallbackPreview: CheckoutPreviewResult = {
        verified: true,
        verificationStatus: 'verified',
        couponState: preserveCouponState ? this.couponState() : 'not_applied',
        verificationReference: `vref_plan_${plan.id}_${plan.amount}`,
        priceId: plan.id,
        planName: plan.name,
        interval: plan.interval || 'month',
        currency: (plan.currency || 'usd').toLowerCase(),
        subtotal: plan.amount,
        discountAmount: 0,
        tax: 0,
        amountDueToday: plan.amount,
        renewalAmount: plan.amount,
        renewalInterval: plan.interval || 'month',
        promoCode: null,
        promoCodeId: null,
        promoCodeName: null,
        couponDuration: null,
        couponDurationInMonths: null,
        expiresAt: Date.now() + 600_000,
        errorCode: null,
        message: null,
      };
      this.checkoutPreview.set(fallbackPreview);
      this.checkoutVerificationStatus.set('verified');
      return fallbackPreview;
    }

    const seq = ++this.previewRequestSeq;
    this.previewLoading.set(true);
    this.checkoutVerificationStatus.set('verifying');
    try {
      const preview = await this.stripeService.previewSubscriptionCheckout({
        priceId: plan.id,
        planAmount: plan.amount,
        planCurrency: plan.currency,
        planInterval: plan.interval,
        planName: plan.name,
        promotionCode: promoCode ?? null,
        customerEmail: user.email,
      });
      if (seq !== this.previewRequestSeq) {
        return null;
      }
      if (preview.verified) {
        this.checkoutPreview.set(preview);
        this.checkoutVerificationStatus.set('verified');
        if (!preserveCouponState) {
          this.couponState.set(preview.couponState);
        }
        return preview;
      }
      this.checkoutPreview.set(null);
      this.checkoutVerificationStatus.set(preview.verificationStatus);
      if (!preserveCouponState) {
        this.couponState.set(preview.couponState);
      }
      return preview;
    } catch {
      if (seq === this.previewRequestSeq) {
        this.checkoutPreview.set(null);
        this.checkoutVerificationStatus.set('unavailable');
      }
      return null;
    } finally {
      if (seq === this.previewRequestSeq) {
        this.previewLoading.set(false);
      }
    }
  }

  async reverifyCurrentCheckout(): Promise<void> {
    const plan = this.selectedPlan();
    if (!plan) return;
    this.clearError();
    const appliedPromo = this.promoResult()?.valid
      ? (this.couponCode().trim() || this.promoResult()?.name || null)
      : null;
    if (appliedPromo) {
      this.couponCode.set(appliedPromo);
      await this.applyPromoCode();
    } else {
      await this.refreshCheckoutPreview(plan, null);
    }
  }

  getCouponStateLabelKey(): string {
    switch (this.couponState()) {
      case 'validating':
        return 'PORTAL.BILLING.COUPON_STATE_VALIDATING';
      case 'verified_applied':
        return 'PORTAL.BILLING.COUPON_STATE_VERIFIED';
      case 'invalid_or_ineligible':
        return 'PORTAL.BILLING.COUPON_STATE_INVALID';
      case 'expired_or_changed':
        return 'PORTAL.BILLING.COUPON_STATE_EXPIRED';
      case 'verification_unavailable':
        return 'PORTAL.BILLING.COUPON_STATE_UNAVAILABLE';
      case 'not_applied':
      default:
        return 'PORTAL.BILLING.COUPON_STATE_NOT_APPLIED';
    }
  }

  getVerificationBadgeLabelKey(): string {
    switch (this.checkoutVerificationStatus()) {
      case 'verifying':
        return 'PORTAL.BILLING.VERIFICATION_BADGE_VERIFYING';
      case 'verified':
        return 'PORTAL.BILLING.VERIFICATION_BADGE_VERIFIED';
      case 'expired':
        return 'PORTAL.BILLING.VERIFICATION_BADGE_EXPIRED';
      case 'mismatch_blocked':
        return 'PORTAL.BILLING.VERIFICATION_BADGE_BLOCKED';
      case 'unavailable':
        return 'PORTAL.BILLING.VERIFICATION_BADGE_UNAVAILABLE';
      case 'unverified':
      default:
        return 'PORTAL.BILLING.VERIFICATION_BADGE_UNVERIFIED';
    }
  }

  getRenewalDisclosureText(plan: StripePlan): string | null {
    const preview = this.checkoutPreview();
    if (!preview || !preview.verified) return null;
    const intervalKey =
      (preview.renewalInterval || preview.interval || plan.interval) === 'year'
        ? 'PORTAL.BILLING.INTERVAL_YEAR'
        : 'PORTAL.BILLING.INTERVAL_MONTH';
    const intervalLabel = this.i18n.t(intervalKey);
    const renewalAmountCents = preview.renewalAmount ?? preview.subtotal ?? plan.amount;
    const renewalFormatted = this.formatExactPrice(renewalAmountCents, preview.currency);

    if (preview.discountAmount > 0 && preview.couponDuration) {
      if (preview.couponDuration === 'once') {
        return this.i18n.t('PORTAL.BILLING.RENEWAL_ONCE', {
          amount: renewalFormatted,
          interval: intervalLabel,
        });
      }
      if (preview.couponDuration === 'repeating') {
        return this.i18n.t('PORTAL.BILLING.RENEWAL_REPEATING', {
          months: preview.couponDurationInMonths ?? 1,
          amount: renewalFormatted,
          interval: intervalLabel,
        });
      }
      if (preview.couponDuration === 'forever') {
        return this.i18n.t('PORTAL.BILLING.RENEWAL_FOREVER', {
          amount: this.formatExactPrice(preview.amountDueToday, preview.currency),
          interval: intervalLabel,
        });
      }
    }

    return this.i18n.t('PORTAL.BILLING.RENEWAL_STANDARD', {
      amount: renewalFormatted,
      interval: intervalLabel,
    });
  }

  getCheckoutButtonLabel(plan: StripePlan): string {
    if (this.previewLoading() || this.couponLoading()) {
      return this.i18n.t('PORTAL.BILLING.BTN_VERIFYING_PRICE');
    }
    if (this.isProcessingPayment()) {
      return this.i18n.t('PORTAL.BILLING.BTN_PROCESSING');
    }
    const preview = this.checkoutPreview();
    if (preview && preview.verified && preview.priceId === plan.id) {
      const formattedAmount = this.formatExactPrice(preview.amountDueToday, preview.currency);
      if (preview.amountDueToday === 0) {
        return this.i18n.t('PORTAL.BILLING.BTN_ACTIVATE_FREE', { amount: formattedAmount });
      }
      return this.i18n.t('PORTAL.BILLING.BTN_PAY_VERIFIED', { amount: formattedAmount });
    }
    const fallbackAmount = this.formatExactPrice(plan.amount, plan.currency);
    return this.i18n.t('PORTAL.BILLING.BTN_PAY_VERIFIED', { amount: fallbackAmount });
  }

  canProceedToVerifiedCheckout(): boolean {
    const plan = this.selectedPlan();
    if (!plan) return false;
    if (this.isProcessingPayment() || this.previewLoading() || this.couponLoading()) return false;
    if (this.plans().length === 0) return false;
    const status = this.checkoutVerificationStatus();
    if (
      status === 'unavailable' ||
      status === 'expired' ||
      status === 'mismatch_blocked' ||
      status === 'verifying'
    ) {
      return false;
    }
    return true;
  }

  formatExactPrice(amount: number, currency: string): string {
    if (typeof this.stripeService.formatExactPrice === 'function') {
      return this.stripeService.formatExactPrice(amount, currency);
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'usd').toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format((amount || 0) / 100);
  }

  // ─── Plan Selection & Subscribe Flow ─────────────────────────────

  selectPlan(plan: StripePlan): void {
    if (this.isCurrentPlan(plan) || this.isPendingPlan(plan)) return;
    if (this.planChangeUnverified() && this.selectedPlan()?.id === plan.id) return;
    if (this.paymentActive()) {
      this.cancelPayment();
    }
    const nextPlan = this.selectedPlan()?.id === plan.id ? null : plan;
    this.selectedPlan.set(nextPlan);
    this.planChangeUnverified.set(false);
    this.pendingPlanChangeTarget.set(null);
    this.downgradeWarning.set(null);
    this.bypassDowngradeCheck = false;
    this.clearError();

    // Changing or deselecting plan invalidates prior verified total and requires recalculation
    this.checkoutPreview.set(null);
    this.checkoutVerificationStatus.set('unverified');

    if (nextPlan && !this.subscription()) {
      this.prefillPromoCodeIfEligible();
      const appliedPromo = this.promoResult()?.valid
        ? (this.couponCode().trim() || this.promoResult()?.name || null)
        : null;
      if (appliedPromo && typeof this.stripeService.previewSubscriptionCheckout === 'function') {
        void this.refreshCheckoutPreview(nextPlan, appliedPromo);
      } else {
        this.couponState.set(this.promoResult()?.valid ? 'verified_applied' : 'not_applied');
        void this.refreshCheckoutPreview(nextPlan, null, Boolean(this.promoResult()?.valid));
      }
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
      const appliedPromoId = this.promoResult()?.valid ? (this.promoResult()?.promoCodeId ?? null) : null;
      const appliedPromoCode = this.promoResult()?.valid
        ? (this.couponCode().trim() || this.promoResult()?.name || null)
        : null;

      // Ensure we have an up-to-date authoritative checkout preview for the selected plan
      let preview = this.checkoutPreview();
      if (
        !preview ||
        !preview.verified ||
        preview.priceId !== plan.id ||
        (appliedPromoId && preview.promoCodeId !== appliedPromoId)
      ) {
        preview = await this.refreshCheckoutPreview(plan, appliedPromoCode, Boolean(appliedPromoId));
      }

      if (!preview || !preview.verified || !preview.verificationReference) {
        this.checkoutVerificationStatus.set('unavailable');
        this.setTranslatedError('PORTAL.BILLING.ERROR_VERIFICATION_UNAVAILABLE');
        return;
      }

      let result: {
        clientSecret: string | null;
        subscriptionId: string;
        requiresSetup: boolean;
      };

      if (typeof this.stripeService.createVerifiedSubscription === 'function') {
        result = await this.stripeService.createVerifiedSubscription({
          email: user.email,
          name,
          priceId: plan.id,
          promotionCodeId: preview.promoCodeId ?? appliedPromoId ?? null,
          approvedAmountDue: preview.amountDueToday,
          approvedCurrency: preview.currency,
          verificationReference: preview.verificationReference,
          expiresAt: preview.expiresAt,
        });
      } else {
        result = await this.stripeService.createSubscription(
          user.email,
          name,
          plan.id,
          appliedPromoId ?? undefined,
        );
      }

      // Hard stop before collecting payment if approved amount is $0.00 but backend returned a chargeable PaymentIntent
      if (
        preview.amountDueToday === 0 &&
        result.clientSecret &&
        result.clientSecret.startsWith('pi_') &&
        !result.requiresSetup
      ) {
        this.checkoutVerificationStatus.set('mismatch_blocked');
        this.couponState.set('expired_or_changed');
        this.setTranslatedError('PORTAL.BILLING.ERROR_UNEXPECTED_CHARGE_FOR_FREE');
        return;
      }

      // If no clientSecret returned (e.g. verified $0.00 activation without setup requirement)
      if (!result.clientSecret) {
        if (typeof this.stripeService.recordPaymentOutcome === 'function') {
          this.stripeService.recordPaymentOutcome('succeeded', {
            priceId: plan.id,
            promotionCodeId: preview.promoCodeId ?? null,
            approvedAmount: preview.amountDueToday,
            actualAmount: preview.amountDueToday,
            currency: preview.currency,
            subscriptionId: result.subscriptionId,
          });
        }
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
          if (typeof this.stripeService.recordPaymentOutcome === 'function') {
            this.stripeService.recordPaymentOutcome('failed', {
              priceId: plan.id,
              promotionCodeId: preview.promoCodeId ?? null,
              approvedAmount: preview.amountDueToday,
              currency: preview.currency,
              subscriptionId: result.subscriptionId,
              reason: error?.code || 'payment_confirmation_failed',
            });
          }
          this.activeErrorPayload.set(null);
          this.errorMessage.set(this.errorService.toCustomerMessage(error, 'save'));
          return;
        }
        if (typeof this.stripeService.recordPaymentOutcome === 'function') {
          this.stripeService.recordPaymentOutcome('succeeded', {
            priceId: plan.id,
            promotionCodeId: preview.promoCodeId ?? null,
            approvedAmount: preview.amountDueToday,
            actualAmount: preview.amountDueToday,
            currency: preview.currency,
            subscriptionId: result.subscriptionId,
          });
        }
        await this.finalizeSubscriptionSuccess(plan);
      } else {
        this.clientSecret.set(result.clientSecret);
        this.paymentRequiresSetup.set(result.requiresSetup);
        this.paymentActive.set(true);
      }
    } catch (err: any) {
      if (err instanceof CheckoutChargeProtectionError || err?.name === 'CheckoutChargeProtectionError') {
        this.handleChargeProtectionError(err as CheckoutChargeProtectionError, plan);
        return;
      }
      this.activeErrorPayload.set(null);
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'save'));
    } finally {
      this.isProcessingPayment.set(false);
      this.paymentSubmissionInFlight = false;
    }
  }

  private handleChargeProtectionError(err: CheckoutChargeProtectionError, plan: StripePlan): void {
    this.paymentActive.set(false);
    this.clientSecret.set(null);
    const currency = err.currency || plan.currency || 'usd';
    const actualAmountFormatted =
      typeof err.actualAmount === 'number'
        ? this.formatExactPrice(err.actualAmount, currency)
        : this.formatExactPrice(plan.amount, currency);
    const approvedAmountFormatted =
      typeof err.approvedAmount === 'number'
        ? this.formatExactPrice(err.approvedAmount, currency)
        : this.formatExactPrice(0, currency);

    switch (err.code) {
      case 'UNEXPECTED_PAYMENT_INTENT_FOR_FREE_CHECKOUT':
        this.checkoutVerificationStatus.set('mismatch_blocked');
        this.couponState.set('expired_or_changed');
        this.setTranslatedError('PORTAL.BILLING.ERROR_UNEXPECTED_CHARGE_FOR_FREE');
        break;
      case 'AMOUNT_MISMATCH_BLOCKED':
        this.checkoutVerificationStatus.set('mismatch_blocked');
        if (this.promoResult()) {
          this.couponState.set('expired_or_changed');
        }
        if (err.approvedAmount === 0) {
          this.setTranslatedError('PORTAL.BILLING.ERROR_UNEXPECTED_CHARGE_FOR_FREE');
        } else {
          this.setTranslatedError('PORTAL.BILLING.ERROR_AMOUNT_MISMATCH_BLOCKED', {
            actual: actualAmountFormatted,
            approved: approvedAmountFormatted,
          });
        }
        break;
      case 'PROMO_NOT_APPLIED':
        this.checkoutVerificationStatus.set('mismatch_blocked');
        this.couponState.set('expired_or_changed');
        this.setTranslatedError('PORTAL.BILLING.ERROR_PROMO_NOT_APPLIED_BLOCKED');
        break;
      case 'CURRENCY_MISMATCH_BLOCKED':
        this.checkoutVerificationStatus.set('mismatch_blocked');
        this.setTranslatedError('PORTAL.BILLING.ERROR_AMOUNT_MISMATCH_BLOCKED', {
          actual: actualAmountFormatted,
          approved: approvedAmountFormatted,
        });
        break;
      case 'VERIFICATION_EXPIRED':
        this.checkoutVerificationStatus.set('expired');
        this.setTranslatedError('PORTAL.BILLING.ERROR_VERIFICATION_EXPIRED');
        break;
      case 'UNVERIFIED_CHECKOUT':
      case 'MISSING_INVOICE_VERIFICATION':
      default:
        this.checkoutVerificationStatus.set('unavailable');
        this.setTranslatedError('PORTAL.BILLING.ERROR_VERIFICATION_UNAVAILABLE');
        break;
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
    const plan = this.selectedPlan();
    const preview = this.checkoutPreview();
    try {
      const { error } = this.paymentRequiresSetup()
        ? await this.stripeService.confirmSetup(this.stripeInstance, this.stripeElements)
        : await this.stripeService.confirmPayment(this.stripeInstance, this.stripeElements);

      if (error) {
        if (typeof this.stripeService.recordPaymentOutcome === 'function') {
          this.stripeService.recordPaymentOutcome('failed', {
            priceId: plan?.id,
            promotionCodeId: preview?.promoCodeId ?? null,
            approvedAmount: preview?.amountDueToday,
            currency: preview?.currency,
            reason: error?.code || 'payment_confirmation_failed',
          });
        }
        this.activeErrorPayload.set(null);
        this.errorMessage.set(this.errorService.toCustomerMessage(error, 'save'));
      } else {
        if (typeof this.stripeService.recordPaymentOutcome === 'function') {
          this.stripeService.recordPaymentOutcome('succeeded', {
            priceId: plan?.id,
            promotionCodeId: preview?.promoCodeId ?? null,
            approvedAmount: preview?.amountDueToday,
            actualAmount: preview?.amountDueToday,
            currency: preview?.currency,
          });
        }
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
    this.couponState.set('not_applied');
    this.checkoutPreview.set(null);
    this.checkoutVerificationStatus.set('unverified');
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

  canConfirmPlanChange(): boolean {
    const sub = this.subscription();
    const newPlan = this.selectedPlan();
    if (!sub || !newPlan) return false;
    if (this.planChangeInFlight || this.isLoading() || this.isProcessingPayment()) return false;
    if (this.planChangeUnverified()) return false;
    if (this.isCurrentPlan(newPlan) || this.isPendingPlan(newPlan)) return false;
    return true;
  }

  async confirmChangePlan(): Promise<void> {
    if (!this.canConfirmPlanChange()) return;
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
      subscriptionId: sub.subscriptionId,
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
      } else {
        const sub = this.subscription();
        const selPlan = this.selectedPlan();
        if (selPlan && sub && !this.subscriptionLoadError()) {
          if (this.isPendingPlan(selPlan) || this.isCurrentPlan(selPlan)) {
            this.planChangeUnverified.set(false);
            this.clearError();
            this.showChangePlanSection.set(false);
            this.selectedPlan.set(null);
            this.selectedSavedMethod.set(null);
          }
        }
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  private checkLookupReportedScheduledChange(
    subscription: StripeSubscription | null | undefined,
    options?: {
      expectedSubscriptionId?: string;
      currentPriceId?: string;
      targetPriceId?: string;
      targetPlanName?: string;
      targetTier?: 'starter' | 'basic' | 'advanced' | null;
      expectedRenewalTimestamp?: number;
    },
  ): boolean {
    if (typeof this.stripeService.hasLookupReportedScheduledChange === 'function') {
      return this.stripeService.hasLookupReportedScheduledChange(subscription, options);
    }
    return StripeService.prototype.hasLookupReportedScheduledChange.call(
      this.stripeService,
      subscription,
      options,
    );
  }

  private evaluateScheduledDowngrade(
    subscription: StripeSubscription | null | undefined,
    options?: {
      expectedSubscriptionId?: string;
      currentPriceId?: string;
      targetPriceId?: string;
      targetPlanName?: string;
      targetTier?: 'starter' | 'basic' | 'advanced' | null;
      expectedRenewalTimestamp?: number;
    },
  ): ScheduledDowngradeVerification {
    if (typeof this.stripeService.evaluateScheduledDowngrade === 'function') {
      return this.stripeService.evaluateScheduledDowngrade(subscription, options);
    }
    return StripeService.prototype.evaluateScheduledDowngrade.call(
      this.stripeService,
      subscription,
      options,
    );
  }

  private async verifyAndApplyPlanChange(target: {
    subscriptionId: string;
    plan: StripePlan;
    isUpgrade: boolean;
    previousPriceId: string;
    expectedRenewalEnd: number;
  }): Promise<boolean> {
    const refreshed = this.subscription();
    if (
      this.subscriptionLoadError() ||
      !refreshed ||
      refreshed.subscriptionId !== target.subscriptionId
    ) {
      this.planChangeUnverified.set(true);
      this.setTranslatedError('PORTAL.BILLING.ERROR_PLAN_CHANGE_UNVERIFIED');
      return false;
    }

    let downgradeVerification: ScheduledDowngradeVerification = 'unverified';

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
      downgradeVerification = this.evaluateScheduledDowngrade(refreshed, {
        expectedSubscriptionId: target.subscriptionId,
        currentPriceId: target.previousPriceId,
        targetPriceId: target.plan.id,
        targetPlanName: target.plan.name,
        targetTier: target.plan.tier,
        expectedRenewalTimestamp: target.expectedRenewalEnd,
      });

      if (downgradeVerification === 'unverified') {
        this.planChangeUnverified.set(true);
        this.setTranslatedError('PORTAL.BILLING.ERROR_PLAN_CHANGE_UNVERIFIED');
        return false;
      }

      if (
        downgradeVerification === 'verified_schedule' &&
        (!refreshed.pendingPlanName || !refreshed.pendingPeriodEnd)
      ) {
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
    if (target.isUpgrade) {
      this.activeSuccessPayload.set({
        key: 'PORTAL.BILLING.SUCCESS_UPGRADED',
        params: { planKey, plan: planTitle },
      });
      this.successMessage.set(this.i18n.t('PORTAL.BILLING.SUCCESS_UPGRADED', { plan: planTitle }));
    } else if (downgradeVerification === 'verified_schedule') {
      this.activeSuccessPayload.set({
        key: 'PORTAL.BILLING.SUCCESS_DOWNGRADE_SCHEDULED',
        params: { planKey, plan: planTitle },
      });
      this.successMessage.set(
        this.i18n.t('PORTAL.BILLING.SUCCESS_DOWNGRADE_SCHEDULED', { plan: planTitle })
      );
    } else {
      const effectiveDate = refreshed.pendingPeriodEnd ?? target.expectedRenewalEnd;
      this.activeSuccessPayload.set({
        key: 'PORTAL.BILLING.PENDING_DOWNGRADE_DESC',
        params: {
          planKey,
          plan: planTitle,
          dateTimestamp: effectiveDate,
          date: this.formatDate(effectiveDate),
        },
      });
      this.successMessage.set(
        this.i18n.t('PORTAL.BILLING.PENDING_DOWNGRADE_DESC', {
          plan: planTitle,
          date: this.formatDate(effectiveDate),
        })
      );
    }
    return true;
  }

  confirmDowngradeAnyway(): void {
    if (!this.canConfirmPlanChange()) return;
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

  isVerifiedRenewalCard(pm: SavedPaymentMethod): boolean {
    if (!pm?.id) return false;
    if (this.defaultPaymentMethodVerified()) {
      return this.defaultPaymentMethodId() === pm.id;
    }
    return pm.isRenewalCard === true;
  }

  private hasActiveSubscriptionForRenewalProtection(): boolean {
    const sub = this.subscription();
    if (!sub) return false;
    return ['active', 'trialing', 'past_due'].includes(String(sub.status).toLowerCase());
  }

  isRenewalCardRemovalBlocked(pm: SavedPaymentMethod): boolean {
    return this.hasActiveSubscriptionForRenewalProtection() && this.isVerifiedRenewalCard(pm);
  }

  async openAddCard(): Promise<void> {
    if (this.cardSetupOpenInFlight || this.isOpeningCardSetup() || this.isSavingCard()) return;

    this.cardSetupOpenInFlight = true;
    this.isOpeningCardSetup.set(true);
    this.cardSetupOpen.set(true);
    this.useCardForRenewals.set(false);
    this.cardSetupReady.set(false);
    this.cardSetupClientSecret.set(null);
    this.cardSetupIntentId.set(null);
    this.clearCardSetupError();
    this.clearError();
    this.successMessage.set(null);
    this.activeSuccessPayload.set(null);

    try {
      const setup = await this.stripeService.createCardSetupIntent();
      if (!this.cardSetupOpen()) {
        return;
      }
      this.cardSetupIntentId.set(setup.setupIntentId);
      this.cardSetupClientSecret.set(setup.clientSecret);
      await Promise.resolve();
      await this.mountCardSetupElement(setup.clientSecret);
    } catch {
      this.setTranslatedCardSetupError('PORTAL.BILLING.ERROR_CARD_SETUP_FAILED');
    } finally {
      this.isOpeningCardSetup.set(false);
      this.cardSetupOpenInFlight = false;
    }
  }

  private async mountCardSetupElement(clientSecret: string): Promise<void> {
    try {
      const mountFn =
        typeof this.stripeService.mountCardSetupElement === 'function'
          ? this.stripeService.mountCardSetupElement.bind(this.stripeService)
          : this.stripeService.mountPaymentElement.bind(this.stripeService);
      const { stripe, elements } = await mountFn(clientSecret, 'portal-card-setup-element');
      if (!this.cardSetupOpen()) {
        if (typeof this.stripeService.cleanupCardSetup === 'function') {
          this.stripeService.cleanupCardSetup();
        }
        return;
      }
      this.cardSetupStripeInstance = stripe;
      this.cardSetupStripeElements = elements;
      this.cardSetupReady.set(true);
    } catch {
      this.setTranslatedCardSetupError('PORTAL.BILLING.ERROR_CARD_SETUP_FAILED');
    }
  }

  cancelAddCard(): void {
    if (this.isSavingCard()) return;
    this.closeAddCardPanel();
  }

  private closeAddCardPanel(): void {
    this.cardSetupOpen.set(false);
    this.isOpeningCardSetup.set(false);
    this.cardSetupReady.set(false);
    this.cardSetupClientSecret.set(null);
    this.cardSetupIntentId.set(null);
    this.useCardForRenewals.set(false);
    this.clearCardSetupError();
    this.cardSetupStripeInstance = null;
    this.cardSetupStripeElements = null;
    if (typeof this.stripeService.cleanupCardSetup === 'function') {
      this.stripeService.cleanupCardSetup();
    }
  }

  async saveNewCard(): Promise<void> {
    if (
      this.cardSetupSubmissionInFlight ||
      this.isSavingCard() ||
      this.isOpeningCardSetup() ||
      !this.cardSetupReady()
    ) {
      return;
    }
    if (!this.cardSetupStripeInstance || !this.cardSetupStripeElements) return;

    this.cardSetupSubmissionInFlight = true;
    this.isSavingCard.set(true);
    this.clearCardSetupError();
    this.clearError();
    this.successMessage.set(null);
    this.activeSuccessPayload.set(null);

    try {
      const shouldSetRenewal = this.useCardForRenewals();
      let returnUrl: string | undefined;
      if (typeof window !== 'undefined' && window.location?.origin) {
        const url = new URL('/app/billing', window.location.origin);
        url.searchParams.set('card_setup', '1');
        if (shouldSetRenewal) {
          url.searchParams.set('use_for_renewals', '1');
        }
        returnUrl = url.toString();
      }

      const confirmRes: any = await this.stripeService.confirmSetup(
        this.cardSetupStripeInstance,
        this.cardSetupStripeElements,
        returnUrl,
      );

      if (confirmRes?.error) {
        this.activeCardSetupErrorPayload.set(null);
        this.cardSetupError.set(this.errorService.toCustomerMessage(confirmRes.error, 'save'));
        return;
      }

      const confirmedSetupIntentId =
        (typeof confirmRes?.setupIntent?.id === 'string' && confirmRes.setupIntent.id.trim()) ||
        this.cardSetupIntentId();

      if (!confirmedSetupIntentId || !confirmedSetupIntentId.startsWith('seti_')) {
        this.setTranslatedCardSetupError('PORTAL.BILLING.ERROR_CARD_SETUP_UNVERIFIED');
        return;
      }

      await this.completeVerifiedCardSetup(confirmedSetupIntentId, shouldSetRenewal, true);
    } catch {
      this.setTranslatedCardSetupError('PORTAL.BILLING.ERROR_CARD_SETUP_FAILED');
    } finally {
      this.isSavingCard.set(false);
      this.cardSetupSubmissionInFlight = false;
    }
  }

  private async completeVerifiedCardSetup(
    setupIntentId: string,
    shouldSetRenewal: boolean,
    fromInlinePanel: boolean,
  ): Promise<void> {
    let finalized: {
      verified: boolean;
      setupIntentId: string;
      paymentMethodId: string;
      paymentMethod?: SavedPaymentMethod;
    };

    try {
      finalized = await this.stripeService.finalizeCardSetup(setupIntentId);
      if (!finalized?.verified || !finalized?.paymentMethodId) {
        throw new Error('SetupIntent verification incomplete.');
      }
    } catch {
      if (fromInlinePanel) {
        this.setTranslatedCardSetupError('PORTAL.BILLING.ERROR_CARD_SETUP_UNVERIFIED');
      } else {
        this.setTranslatedError('PORTAL.BILLING.ERROR_CARD_SETUP_UNVERIFIED');
      }
      return;
    }

    // Card setup is verified on the backend. Close the setup panel and refresh saved cards.
    this.closeAddCardPanel();

    if (finalized.paymentMethod) {
      const newCard = finalized.paymentMethod;
      this.savedMethods.update((list) => {
        const exists = list.some((m) => m.id === newCard.id);
        return exists ? list : [newCard, ...list];
      });
    }

    await this.loadSavedMethods();
    if (this.savedMethodsError() && finalized.paymentMethod) {
      this.savedMethodsError.set(false);
      this.savedMethods.set([finalized.paymentMethod]);
    }

    if (!shouldSetRenewal) {
      this.pendingRenewalRetryCardId.set(null);
      this.setTranslatedSuccess('PORTAL.BILLING.SUCCESS_CARD_SAVED');
      return;
    }

    // Attempt to set the verified card as the renewal card
    try {
      const subId = this.subscription()?.subscriptionId ?? null;
      const defaultRes = await this.stripeService.setDefaultPaymentMethod(
        finalized.paymentMethodId,
        subId,
      );
      if (!defaultRes?.updated) {
        throw new Error('Default payment method update was not confirmed.');
      }
      this.pendingRenewalRetryCardId.set(null);
      this.defaultPaymentMethodId.set(finalized.paymentMethodId);
      this.defaultPaymentMethodVerified.set(true);
      this.savedMethods.update((list) =>
        list.map((m) => ({ ...m, isRenewalCard: m.id === finalized.paymentMethodId })),
      );
      await this.loadSavedMethods();
      this.setTranslatedSuccess('PORTAL.BILLING.SUCCESS_CARD_SAVED_AND_RENEWAL');
    } catch {
      // Partial failure: keep the saved card, allow retrying default selection without repeating setup
      this.pendingRenewalRetryCardId.set(finalized.paymentMethodId);
      this.setTranslatedError('PORTAL.BILLING.WARN_CARD_SAVED_RENEWAL_FAILED');
    }
  }

  private async handleCardSetupRedirectIfPresent(): Promise<void> {
    const queryParamMap = this.route.snapshot?.queryParamMap;
    const rawParams = (this.route.snapshot as any)?.queryParams ?? {};
    const cardSetupFlag = queryParamMap?.get('card_setup') ?? rawParams['card_setup'] ?? null;
    const setupIntentParam =
      queryParamMap?.get('setup_intent') ?? rawParams['setup_intent'] ?? null;
    const redirectStatus =
      queryParamMap?.get('redirect_status') ?? rawParams['redirect_status'] ?? null;
    const useForRenewalsParam =
      queryParamMap?.get('use_for_renewals') ?? rawParams['use_for_renewals'] ?? null;

    if (!cardSetupFlag && !setupIntentParam && !redirectStatus) {
      return;
    }

    // Never trust redirect_status query param alone without verifying setup_intent on the backend
    if (!setupIntentParam || typeof setupIntentParam !== 'string' || !setupIntentParam.startsWith('seti_')) {
      if (cardSetupFlag || redirectStatus) {
        this.setTranslatedError('PORTAL.BILLING.ERROR_CARD_SETUP_UNVERIFIED');
      }
      return;
    }

    const shouldSetRenewal = useForRenewalsParam === '1' || useForRenewalsParam === 'true';
    await this.completeVerifiedCardSetup(setupIntentParam, shouldSetRenewal, false);
  }

  async setCardAsRenewal(pm: SavedPaymentMethod): Promise<void> {
    if (!pm?.id || this.settingRenewalCardId() || this.deletingMethodId()) return;
    this.settingRenewalCardId.set(pm.id);
    this.clearError();
    this.successMessage.set(null);
    this.activeSuccessPayload.set(null);

    try {
      const subId = this.subscription()?.subscriptionId ?? null;
      const res = await this.stripeService.setDefaultPaymentMethod(pm.id, subId);
      if (!res?.updated) {
        throw new Error('Could not update renewal card.');
      }
      this.pendingRenewalRetryCardId.set(null);
      this.defaultPaymentMethodId.set(pm.id);
      this.defaultPaymentMethodVerified.set(true);
      this.savedMethods.update((list) =>
        list.map((m) => ({ ...m, isRenewalCard: m.id === pm.id })),
      );
      await this.loadSavedMethods();
      this.setTranslatedSuccess('PORTAL.BILLING.SUCCESS_RENEWAL_CARD_UPDATED');
    } catch {
      this.setTranslatedError('PORTAL.BILLING.ERROR_RENEWAL_UPDATE_FAILED');
    } finally {
      this.settingRenewalCardId.set(null);
    }
  }

  async deletePaymentMethod(pm: SavedPaymentMethod): Promise<void> {
    if (!pm?.id || this.deletingMethodId()) return;
    if (this.isRenewalCardRemovalBlocked(pm)) {
      this.setTranslatedError('PORTAL.BILLING.RENEWAL_CARD_REMOVE_BLOCKED');
      return;
    }

    this.deletingMethodId.set(pm.id);
    this.clearError();
    try {
      await this.stripeService.detachPaymentMethod(pm.id);
      this.savedMethods.update((list) => list.filter((m) => m.id !== pm.id));
      if (this.selectedSavedMethod()?.id === pm.id) {
        this.selectedSavedMethod.set(null);
      }
      if (this.defaultPaymentMethodId() === pm.id) {
        this.defaultPaymentMethodId.set(null);
      }
      if (this.pendingRenewalRetryCardId() === pm.id) {
        this.pendingRenewalRetryCardId.set(null);
      }
    } catch (err: any) {
      if (err?.code === 'RENEWAL_CARD_PROTECTED') {
        this.setTranslatedError('PORTAL.BILLING.RENEWAL_CARD_REMOVE_BLOCKED');
      } else {
        this.activeErrorPayload.set(null);
        this.errorMessage.set(this.errorService.toCustomerMessage(err, 'delete'));
      }
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

  hasScheduledDowngrade(sub: StripeSubscription | null | undefined): boolean {
    if (!sub || this.subscriptionLoadError() || this.planChangeUnverified()) return false;
    if (!sub.pendingPlanName || !sub.pendingPeriodEnd) return false;

    const pendingTier = this.stripeService.tierFromProductName(sub.pendingPlanName);
    const pendingKey = this.planTitleKey(sub.pendingPlanName);
    const matchingPlan = this.plans().find(
      (p) =>
        (pendingTier && p.tier === pendingTier) ||
        (pendingKey && this.planTitleKey(p.name) === pendingKey),
    );

    if (matchingPlan) {
      const status = this.evaluateScheduledDowngrade(sub, {
        expectedSubscriptionId: sub.subscriptionId,
        currentPriceId: sub.plan?.priceId,
        targetPriceId: matchingPlan.id,
        targetPlanName: matchingPlan.name,
        targetTier: matchingPlan.tier,
        expectedRenewalTimestamp: sub.currentPeriodEnd,
      });
      return status === 'verified_schedule' || status === 'reported_by_lookup';
    }

    return this.checkLookupReportedScheduledChange(sub, {
      expectedSubscriptionId: sub.subscriptionId,
      currentPriceId: sub.plan?.priceId,
      expectedRenewalTimestamp: sub.currentPeriodEnd,
    });
  }

  isPendingPlan(plan: StripePlan): boolean {
    const sub = this.subscription();
    if (!sub || this.subscriptionLoadError() || this.isCurrentPlan(plan)) return false;
    const pendingTarget = this.pendingPlanChangeTarget();
    if (this.planChangeUnverified() && pendingTarget?.plan.id === plan.id) {
      return false;
    }
    const status = this.evaluateScheduledDowngrade(sub, {
      expectedSubscriptionId: sub.subscriptionId,
      currentPriceId: sub.plan?.priceId,
      targetPriceId: plan.id,
      targetPlanName: plan.name,
      targetTier: plan.tier,
      expectedRenewalTimestamp: sub.currentPeriodEnd,
    });
    return status === 'verified_schedule' || status === 'reported_by_lookup';
  }
}
