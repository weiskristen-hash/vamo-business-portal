import { Component, OnInit, OnDestroy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { CustomerErrorService } from '../../core/services/customer-error.service';
import {
  StripeService,
  StripePlan,
  StripeSubscription,
  BillingHistoryItem,
  SavedPaymentMethod,
  PromoResult,
} from '../../core/services/stripe.service';
import type { Stripe, StripeElements } from '@stripe/stripe-js';

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="billing-page">
  <!-- Header -->
  <header class="page-header">
    <div class="header-titles">
      <h1 class="page-title">Subscription & Billing</h1>
      <p class="page-subtitle">Manage your VAMO business tier, publishing quotas, and invoice receipts.</p>
    </div>
  </header>

  <!-- Global Feedback Banners -->
  <div *ngIf="errorMessage()" class="alert alert-danger" role="alert">
    <span class="alert-icon">⚠️</span>
    <span class="alert-text">{{ errorMessage() }}</span>
    <button type="button" class="alert-close" (click)="errorMessage.set(null)" aria-label="Dismiss">✕</button>
  </div>

  <div *ngIf="successMessage()" class="alert alert-success" role="alert">
    <span class="alert-icon">✓</span>
    <span class="alert-text">{{ successMessage() }}</span>
    <button type="button" class="alert-close" (click)="successMessage.set(null)" aria-label="Dismiss">✕</button>
  </div>

  <!-- Loading State -->
  <div *ngIf="isLoading() && subscription() === undefined" class="loading-container">
    <div class="spinner"></div>
    <p>Loading subscription details…</p>
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
            {{ sub.cancelAtPeriodEnd ? 'Cancels at Period End' : 'Active Subscription' }}
          </span>
        </div>
        <div class="status-date">
          <span *ngIf="sub.cancelAtPeriodEnd">
            Access until <strong>{{ formatDate(sub.currentPeriodEnd) }}</strong>
          </span>
          <span *ngIf="!sub.cancelAtPeriodEnd">
            Renews on <strong>{{ formatDate(sub.currentPeriodEnd) }}</strong>
          </span>
        </div>
      </div>

      <!-- Pending Downgrade Alert -->
      <div *ngIf="sub.pendingPlanName && sub.pendingPeriodEnd" class="pending-downgrade-banner">
        <div class="pending-info">
          <span class="pending-icon">⏳</span>
          <div class="pending-text">
            <strong>Scheduled Plan Change:</strong>
            <span>Downgrade to {{ sub.pendingPlanName }} will take effect on {{ formatDate(sub.pendingPeriodEnd) }}.</span>
          </div>
        </div>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          [disabled]="isLoading()"
          (click)="cancelPendingDowngrade()"
        >
          Cancel Downgrade
        </button>
      </div>

      <!-- Plan & Quota Cards Grid -->
      <div class="overview-grid">
        <!-- Current Plan Card -->
        <div class="card current-plan-card">
          <div class="card-header">
            <span class="card-eyebrow">Current Plan</span>
            <span class="tier-pill">{{ sub.plan.productName }}</span>
          </div>
          <div class="card-body">
            <div class="plan-price-display">
              <span class="price-val">{{ formatPrice(sub.plan.amount, sub.plan.currency) }}</span>
              <span class="price-interval">/ {{ sub.plan.interval }}</span>
            </div>
            <p class="plan-note">
              Billed through Stripe. Manage your active events and campaign tier below.
            </p>
          </div>
          <div class="card-footer actions-row">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              *ngIf="!showChangePlanSection()"
              (click)="openChangePlan()"
            >
              Change Plan
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              *ngIf="showChangePlanSection()"
              (click)="closeChangePlan()"
            >
              Keep Current Plan
            </button>
            
            <!-- Cancel / Reactivate -->
            <button
              type="button"
              class="btn btn-outline-danger btn-sm"
              *ngIf="!sub.cancelAtPeriodEnd"
              (click)="openCancelModal()"
            >
              Cancel Subscription
            </button>
            <button
              type="button"
              class="btn btn-outline-success btn-sm"
              *ngIf="sub.cancelAtPeriodEnd"
              [disabled]="isLoading()"
              (click)="reactivateSubscription()"
            >
              Reactivate Subscription
            </button>
          </div>
        </div>

        <!-- Publishing Quota Card -->
        <div class="card quota-card">
          <div class="card-header">
            <span class="card-eyebrow">Publishing Quota</span>
            <span class="quota-count font-mono">{{ postsUsed() }} / {{ postLimit() }} Posts</span>
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
              {{ postsUsed() }} active listing(s) published on VAMO discovery. Upgrade your plan to increase your active post capacity.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── CHANGE PLAN SECTION OR NEW SUBSCRIPTION SELECTION ─────────── -->
    <section
      *ngIf="subscription() === null || showChangePlanSection()"
      class="plans-selection-section"
      aria-labelledby="plans-heading"
    >
      <div class="section-header">
        <h2 id="plans-heading" class="section-title">
          {{ subscription() === null ? 'Choose Your Business Plan' : 'Select a New Plan' }}
        </h2>
        <p class="section-subtitle">
          Select the option that matches your event calendar and promotion frequency.
        </p>
      </div>

      <!-- Plan Cards Grid -->
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
              <h3 class="plan-name">{{ plan.name }}</h3>
              <span *ngIf="isCurrentPlan(plan)" class="badge badge-current">Current Plan</span>
              <span *ngIf="isPendingPlan(plan)" class="badge badge-scheduled">Scheduled</span>
            </div>
            <div class="plan-price">
              <span class="currency-amount">{{ formatPrice(plan.amount, plan.currency) }}</span>
              <span class="interval-text">/ {{ plan.interval }}</span>
            </div>
            <p class="plan-description">{{ plan.description }}</p>
          </div>

          <div class="plan-card-body">
            <span class="features-label">Included Entitlements:</span>
            <ul class="features-list">
              <li *ngFor="let feat of plan.features" class="feature-item">
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
              <span *ngIf="isCurrentPlan(plan)">Active</span>
              <span *ngIf="isPendingPlan(plan)">Scheduled</span>
              <span *ngIf="!isCurrentPlan(plan) && !isPendingPlan(plan)">
                {{ selectedPlan()?.id === plan.id ? 'Selected' : 'Select Plan' }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- Empty Plans Fallback Notice -->
      <div *ngIf="plans().length === 0" class="alert alert-warning empty-plans-alert">
        <span class="alert-icon">⚠️</span>
        <span class="alert-text">We couldn't load current plan pricing. Please try again later.</span>
      </div>

      <!-- Downgrade Warning Notice -->
      <div *ngIf="downgradeWarning() as dw" class="alert alert-warning downgrade-warning-box">
        <span class="alert-icon">⚠️</span>
        <div class="alert-body">
          <strong>Notice: Some posts will be moved to drafts</strong>
          <p>
            You currently have {{ dw.activePosts }} active post(s), but your new plan only allows {{ dw.newLimit }}.
            The excess posts will be moved to drafts automatically when your new plan activates.
          </p>
          <div class="warning-actions">
            <button
              type="button"
              class="btn btn-warning btn-sm"
              [disabled]="isLoading()"
              (click)="confirmDowngradeAnyway()"
            >
              Downgrade Anyway
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              (click)="dismissDowngradeWarning()"
            >
              Keep Current Plan
            </button>
          </div>
        </div>
      </div>

      <!-- Action Panel for Selected Plan (Subscribe / Change) -->
      <div *ngIf="selectedPlan() as selPlan" class="card checkout-panel">
        <div class="checkout-header">
          <h3>
            {{ subscription() === null ? 'Complete Your Subscription' : 'Confirm Plan Change' }}
          </h3>
          <p>
            Upgrading or changing to <strong>{{ selPlan.name }}</strong> ({{ formatPrice(selPlan.amount, selPlan.currency) }} / {{ selPlan.interval }}).
          </p>
        </div>

        <!-- Coupon Row (for new subscriptions) -->
        <div *ngIf="subscription() === null" class="coupon-section">
          <div *ngIf="promoResult() as promo" class="applied-promo-chip">
            <span class="promo-tag">🎟 {{ promo.name || 'Promo Code' }}</span>
            <span *ngIf="promo.percentOff === 100" class="promo-badge">100% Free Period</span>
            <span *ngIf="promo.percentOff && promo.percentOff < 100" class="promo-badge">{{ promo.percentOff }}% off</span>
            <button type="button" class="promo-remove-btn" (click)="removePromoCode()" title="Remove code">✕</button>
          </div>

          <div *ngIf="!promoResult()" class="coupon-input-group">
            <input
              type="text"
              class="form-control coupon-input"
              placeholder="Have a promotion code?"
              aria-label="Promotion code"
              [ngModel]="couponCode()"
              (ngModelChange)="couponCode.set($event)"
              [disabled]="couponLoading()"
            />
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              [disabled]="couponLoading() || !couponCode().trim()"
              (click)="applyPromoCode()"
            >
              {{ couponLoading() ? 'Applying…' : 'Apply' }}
            </button>
          </div>
          <span *ngIf="couponError()" class="form-error">{{ couponError() }}</span>
        </div>

        <!-- Saved Payment Method Selection (if any exist) -->
        <div *ngIf="savedMethods().length > 0 && !paymentActive()" class="saved-methods-selection">
          <label class="section-label">Select Payment Method:</label>
          <div class="saved-methods-radios">
            <div
              *ngFor="let pm of savedMethods()"
              class="saved-card-radio-item"
              [class.saved-card-radio-item--selected]="selectedSavedMethod()?.id === pm.id"
              (click)="selectedSavedMethod.set(selectedSavedMethod()?.id === pm.id ? null : pm)"
            >
              <input
                type="radio"
                name="savedMethodChoice"
                [checked]="selectedSavedMethod()?.id === pm.id"
              />
              <span class="card-brand">{{ pm.brand | uppercase }}</span>
              <span class="card-last4">•••• {{ pm.last4 }}</span>
              <span class="card-exp">Exp {{ pm.expMonth }}/{{ pm.expYear }}</span>
            </div>
            <div
              class="saved-card-radio-item"
              [class.saved-card-radio-item--selected]="selectedSavedMethod() === null"
              (click)="selectedSavedMethod.set(null)"
            >
              <input type="radio" name="savedMethodChoice" [checked]="selectedSavedMethod() === null" />
              <span>Use a new card</span>
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
              {{ isProcessingPayment() ? 'Processing…' : (paymentRequiresSetup() ? 'Save Card & Activate' : 'Pay & Subscribe') }}
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              [disabled]="isProcessingPayment()"
              (click)="cancelPayment()"
            >
              Cancel
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
              <span *ngIf="isProcessingPayment()">Processing…</span>
              <span *ngIf="!isProcessingPayment()">
                {{ selectedSavedMethod() ? 'Pay with Saved Card' : 'Continue to Payment' }}
              </span>
            </button>

            <button
              type="button"
              class="btn btn-primary"
              *ngIf="subscription() !== null"
              [disabled]="isLoading()"
              (click)="confirmChangePlan()"
            >
              {{ isLoading() ? 'Updating Plan…' : 'Confirm Plan Change' }}
            </button>

            <button
              type="button"
              class="btn btn-secondary"
              (click)="selectedPlan.set(null); showChangePlanSection.set(false)"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ── SAVED PAYMENT METHODS SECTION ─────────────────────────────── -->
    <section *ngIf="savedMethods().length > 0" class="saved-methods-section card">
      <div class="card-header">
        <h3 class="card-title">Saved Payment Methods</h3>
      </div>
      <div class="card-body">
        <div class="saved-cards-list">
          <div *ngFor="let card of savedMethods()" class="saved-card-row">
            <div class="saved-card-meta">
              <span class="brand-badge">{{ card.brand | uppercase }}</span>
              <span class="card-digits font-mono">•••• •••• •••• {{ card.last4 }}</span>
              <span class="card-expiry">Expires {{ card.expMonth }}/{{ card.expYear }}</span>
            </div>
            <button
              type="button"
              class="btn btn-outline-danger btn-sm"
              [disabled]="deletingMethodId() === card.id"
              (click)="deletePaymentMethod(card)"
            >
              {{ deletingMethodId() === card.id ? 'Removing…' : 'Remove' }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ── BILLING & INVOICE HISTORY SECTION ─────────────────────────── -->
    <section class="billing-history-section card">
      <div class="card-header">
        <h3 class="card-title">Invoice & Billing Receipts</h3>
      </div>
      <div class="card-body">
        <div *ngIf="billingHistoryLoading()" class="history-loading">
          <div class="spinner-sm"></div>
          <span>Loading invoices…</span>
        </div>

        <div *ngIf="!billingHistoryLoading() && billingHistory().length === 0" class="empty-history">
          <p>No billing invoices recorded yet.</p>
        </div>

        <div *ngIf="!billingHistoryLoading() && billingHistory().length > 0" class="table-responsive">
          <table class="table billing-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Status</th>
                <th class="text-right">Receipt</th>
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
                    title="View official receipt"
                  >
                    View Receipt ↗
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
        <h3 id="cancel-modal-title" class="modal-title">Cancel Subscription?</h3>
        <button type="button" class="modal-close" (click)="closeCancelModal()" aria-label="Close cancel dialog">✕</button>
      </div>
      <div class="modal-body">
        <p>
          Are you sure you want to cancel your VAMO Business subscription?
        </p>
        <p class="modal-subtext">
          You will continue to keep full access to your plan and published listings until the end of your current billing period.
        </p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" (click)="closeCancelModal()">
          Keep Subscription
        </button>
        <button
          type="button"
          class="btn btn-danger"
          [disabled]="isLoading()"
          (click)="confirmCancelSubscription()"
        >
          {{ isLoading() ? 'Canceling…' : 'Confirm Cancellation' }}
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
    border: 3px solid rgba(124, 58, 237, 0.2);
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
  border: 2px solid rgba(124, 58, 237, 0.2);
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
      background: rgba(124, 58, 237, 0.1);
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
    box-shadow: 0 6px 16px rgba(124, 58, 237, 0.08);
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
    background: rgba(124, 58, 237, 0.1);
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
  background: #1c1c2e;
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
      background: rgba(124, 58, 237, 0.08);
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

  // Core State Signals
  subscription = signal<StripeSubscription | null | undefined>(undefined);
  plans = signal<StripePlan[]>([]);
  selectedPlan = signal<StripePlan | null>(null);
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

  // Saved Payment Methods
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

  // Inline Payment Element
  clientSecret = signal<string | null>(null);
  stripeReady = signal(false);
  paymentActive = signal(false);
  paymentRequiresSetup = signal(false);
  isProcessingPayment = signal(false);

  private stripeInstance: Stripe | null = null;
  private stripeElements: StripeElements | null = null;

  constructor() {
    effect(() => {
      const secret = this.clientSecret();
      const active = this.paymentActive();
      if (active && secret) {
        setTimeout(() => this.mountPaymentElement(secret), 100);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadInitialData();
  }

  ngOnDestroy(): void {
    this.stripeService.cleanup();
  }

  async loadInitialData(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
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
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'load'));
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadSubscription(email: string): Promise<void> {
    try {
      const sub = await this.stripeService.getSubscription(email);
      this.subscription.set(sub);
      if (sub) {
        await this.loadPostUsage(sub);
      }
    } catch {
      this.subscription.set(null);
    }
  }

  async loadPlans(): Promise<void> {
    try {
      const plans = await this.stripeService.getPlans();
      this.plans.set(plans);
    } catch {
      this.plans.set([]);
      this.errorMessage.set("We couldn't load current plan pricing. Please try again.");
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
        this.couponError.set("That promotion code isn't valid.");
      }
    } catch {
      this.couponError.set('Could not validate promotion code. Please try again.');
    } finally {
      this.couponLoading.set(false);
    }
  }

  removePromoCode(): void {
    this.promoResult.set(null);
    this.couponCode.set('');
    this.couponError.set(null);
  }

  // ─── Plan Selection & Subscribe Flow ─────────────────────────────

  selectPlan(plan: StripePlan): void {
    if (this.isCurrentPlan(plan) || this.isPendingPlan(plan)) return;
    this.selectedPlan.set(this.selectedPlan()?.id === plan.id ? null : plan);
    this.errorMessage.set(null);
  }

  async proceedToPayment(): Promise<void> {
    const plan = this.selectedPlan();
    const user = this.authService.currentUser;
    if (!plan || !user?.email) return;
    if (this.plans().length === 0) {
      this.errorMessage.set("We couldn't load current plan pricing. Please try again.");
      return;
    }

    this.isProcessingPayment.set(true);
    this.errorMessage.set(null);
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
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'save'));
    } finally {
      this.isProcessingPayment.set(false);
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
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'load'));
    }
  }

  async confirmPayment(): Promise<void> {
    if (!this.stripeInstance || !this.stripeElements) return;
    this.isProcessingPayment.set(true);
    this.errorMessage.set(null);
    try {
      const { error } = this.paymentRequiresSetup()
        ? await this.stripeService.confirmSetup(this.stripeInstance, this.stripeElements)
        : await this.stripeService.confirmPayment(this.stripeInstance, this.stripeElements);

      if (error) {
        this.errorMessage.set(this.errorService.toCustomerMessage(error, 'save'));
      } else {
        const plan = this.selectedPlan();
        if (plan) {
          await this.finalizeSubscriptionSuccess(plan);
        }
      }
    } catch (err: any) {
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'save'));
    } finally {
      this.isProcessingPayment.set(false);
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
    await this.stripeService.setProviderTier(plan.tier).catch(() => {});
    this.paymentActive.set(false);
    this.clientSecret.set(null);
    this.paymentRequiresSetup.set(false);
    this.stripeReady.set(false);
    this.selectedPlan.set(null);
    this.selectedSavedMethod.set(null);
    this.showChangePlanSection.set(false);
    this.successMessage.set(`Success! Your account is now active on the ${plan.name}.`);

    // Reload state
    const user = this.authService.currentUser;
    if (user?.email) {
      await this.loadSubscription(user.email);
      await this.loadBillingHistory();
      await this.loadSavedMethods();
    }
  }

  // ─── Upgrade & Downgrade (Change Plan) ────────────────────────────

  openChangePlan(): void {
    this.showChangePlanSection.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  closeChangePlan(): void {
    this.showChangePlanSection.set(false);
    this.selectedPlan.set(null);
    this.downgradeWarning.set(null);
    this.bypassDowngradeCheck = false;
  }

  async confirmChangePlan(): Promise<void> {
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

    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      await this.stripeService.changeSubscriptionPlan(
        sub.subscriptionId,
        sub.subscriptionItemId,
        newPlan.id,
        isUpgrade,
        newPlan.name,
        sub.currentPeriodStart,
        sub.currentPeriodEnd,
        sub.plan.priceId
      );

      // If upgrade, sync immediately
      if (isUpgrade) {
        await this.stripeService.setProviderTier(newPlan.tier).catch(() => {});
      }

      this.showChangePlanSection.set(false);
      this.selectedPlan.set(null);
      this.successMessage.set(
        isUpgrade
          ? `Your plan has been upgraded to ${newPlan.name}.`
          : `Your downgrade to ${newPlan.name} is scheduled for the end of your billing cycle.`
      );

      const user = this.authService.currentUser;
      if (user?.email) {
        await this.loadSubscription(user.email);
      }
    } catch (err: any) {
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'save'));
    } finally {
      this.isLoading.set(false);
    }
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
    this.errorMessage.set(null);
    try {
      await this.stripeService.releaseSchedule(sub.pendingScheduleId);
      this.successMessage.set('Scheduled downgrade has been canceled. Your current plan remains active.');
      const user = this.authService.currentUser;
      if (user?.email) {
        await this.loadSubscription(user.email);
      }
    } catch (err: any) {
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
    this.errorMessage.set(null);
    try {
      await this.stripeService.cancelSubscription(sub.subscriptionId, true);
      this.showCancelConfirmModal.set(false);
      this.successMessage.set(
        `Subscription canceled. You will continue to have access until ${this.formatDate(sub.currentPeriodEnd)}.`
      );
      const user = this.authService.currentUser;
      if (user?.email) {
        await this.loadSubscription(user.email);
      }
    } catch (err: any) {
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'save'));
    } finally {
      this.isLoading.set(false);
    }
  }

  async reactivateSubscription(): Promise<void> {
    const sub = this.subscription();
    if (!sub) return;
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      await this.stripeService.cancelSubscription(sub.subscriptionId, false);
      this.successMessage.set('Welcome back! Your subscription renewal has been reactivated.');
      const user = this.authService.currentUser;
      if (user?.email) {
        await this.loadSubscription(user.email);
      }
    } catch (err: any) {
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'save'));
    } finally {
      this.isLoading.set(false);
    }
  }

  // ─── Payment Methods ─────────────────────────────────────────────

  async deletePaymentMethod(pm: SavedPaymentMethod): Promise<void> {
    this.deletingMethodId.set(pm.id);
    this.errorMessage.set(null);
    try {
      await this.stripeService.detachPaymentMethod(pm.id);
      this.savedMethods.update((list) => list.filter((m) => m.id !== pm.id));
      if (this.selectedSavedMethod()?.id === pm.id) {
        this.selectedSavedMethod.set(null);
      }
    } catch (err: any) {
      this.errorMessage.set(this.errorService.toCustomerMessage(err, 'delete'));
    } finally {
      this.deletingMethodId.set(null);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  formatPrice(amount: number, currency: string): string {
    return this.stripeService.formatPrice(amount, currency);
  }

  formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
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
    if (!sub?.pendingPlanName) return false;
    return plan.name.toLowerCase() === sub.pendingPlanName.toLowerCase();
  }
}
