import { inject, Injectable } from '@angular/core';
import { loadStripe } from '@stripe/stripe-js';
import type { Stripe, StripeElements } from '@stripe/stripe-js';
import { runtimeConfig } from '../config/runtime-config';
import { AuthService } from './auth.service';
import { I18nService } from '../i18n/i18n.service';
import { CheckoutAuditService } from './checkout-audit.service';
import { readItems } from '@directus/sdk';
import { directusClient } from '../directus/directus-client';

export type CouponVerificationState =
  | 'not_applied'
  | 'validating'
  | 'verified_applied'
  | 'invalid_or_ineligible'
  | 'expired_or_changed'
  | 'verification_unavailable';

export type CheckoutVerificationStatus =
  | 'unverified'
  | 'verifying'
  | 'verified'
  | 'expired'
  | 'mismatch_blocked'
  | 'unavailable';

export type CouponDurationType = 'once' | 'repeating' | 'forever';

export interface CheckoutPreviewRequest {
  priceId: string;
  planAmount?: number;
  planCurrency?: string;
  planInterval?: string;
  planName?: string;
  promotionCode?: string | null;
  promotionCodeId?: string | null;
  customerEmail?: string | null;
  customerRef?: string | null;
  businessRef?: string | null;
}

export interface CheckoutPreviewResult {
  verified: boolean;
  verificationStatus: CheckoutVerificationStatus;
  couponState: CouponVerificationState;
  verificationReference: string | null;
  priceId: string;
  planName: string;
  interval: string;
  currency: string;
  subtotal: number;
  discountAmount: number;
  tax: number;
  amountDueToday: number;
  renewalAmount: number | null;
  renewalInterval: string | null;
  promoCode?: string | null;
  promoCodeId?: string | null;
  promoCodeName?: string | null;
  couponDuration?: CouponDurationType | null;
  couponDurationInMonths?: number | null;
  expiresAt?: number | null;
  errorCode?: string | null;
  message?: string | null;
}

export interface VerifiedCreateSubscriptionRequest {
  email: string;
  name: string;
  priceId: string;
  promotionCodeId?: string | null;
  verificationReference: string;
  approvedAmountDue: number;
  approvedCurrency: string;
  paymentMethodId?: string | null;
  idempotencyKey?: string;
  expiresAt?: number | null;
  customerRef?: string | null;
  businessRef?: string | null;
}

export interface VerifiedCreateSubscriptionResult {
  clientSecret: string | null;
  subscriptionId: string;
  requiresSetup: boolean;
  invoiceId: string | null;
  invoiceAmountDue: number;
  invoiceSubtotal: number;
  invoiceDiscountAmount: number;
  invoiceTax: number;
  invoiceCurrency: string;
  appliedPromotionCodeId: string | null;
  verifiedByServer: boolean;
}

export type CheckoutProtectionErrorCode =
  | 'UNVERIFIED_CHECKOUT'
  | 'VERIFICATION_EXPIRED'
  | 'UNAPPLIED_COUPON_PRESENT'
  | 'PROMO_NOT_APPLIED'
  | 'AMOUNT_MISMATCH_BLOCKED'
  | 'CURRENCY_MISMATCH_BLOCKED'
  | 'UNEXPECTED_PAYMENT_INTENT_FOR_FREE_CHECKOUT'
  | 'MISSING_INVOICE_VERIFICATION';

export class CheckoutChargeProtectionError extends Error {
  readonly code: CheckoutProtectionErrorCode;
  readonly approvedAmount?: number | null;
  readonly actualAmount?: number | null;
  readonly currency?: string | null;

  constructor(
    code: CheckoutProtectionErrorCode,
    message: string,
    details?: {
      approvedAmount?: number | null;
      actualAmount?: number | null;
      currency?: string | null;
    },
  ) {
    super(message);
    this.name = 'CheckoutChargeProtectionError';
    this.code = code;
    this.approvedAmount = details?.approvedAmount ?? null;
    this.actualAmount = details?.actualAmount ?? null;
    this.currency = details?.currency ?? null;
  }
}

export interface StripeSubscriptionSchedulePhase {
  startDate?: number | null;
  endDate?: number | null;
  start_date?: number | null;
  end_date?: number | null;
  priceId?: string | null;
  price?: string | { id?: string } | null;
  items?: Array<{
    price?: string | { id?: string } | null;
    priceId?: string | null;
  }>;
}

export interface StripeSubscriptionSchedule {
  id?: string | null;
  status?: string | null;
  targetPriceId?: string | null;
  priceId?: string | null;
  renewalDate?: number | null;
  effectiveAt?: number | null;
  startDate?: number | null;
  start_date?: number | null;
  nextPhase?: {
    priceId?: string | null;
    price?: string | { id?: string } | null;
    startDate?: number | null;
    start_date?: number | null;
    endDate?: number | null;
    end_date?: number | null;
  } | null;
  phases?: StripeSubscriptionSchedulePhase[] | null;
}

export interface StripeSubscription {
  subscriptionId: string;
  subscriptionItemId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  plan: {
    priceId: string;
    productName: string;
    amount: number;
    currency: string;
    interval: string;
  };
  pendingPlanName?: string | null;
  pendingPriceId?: string | null;
  pendingPeriodEnd?: number | null;
  pendingScheduleId?: string | null;
  schedule?: StripeSubscriptionSchedule | null;
  latestInvoiceStatus?: string | null;
  paymentIntentStatus?: string | null;
  pendingUpdate?: unknown;
}

export interface BillingHistoryItem {
  id: string;
  type: 'subscription' | 'plan_change' | 'addon' | 'invoice';
  label: string;
  amount: number;
  currency: string;
  date: number; // unix timestamp
  status: string;
  invoice_pdf: string | null;
  hosted_invoice_url: string | null;
}

export interface SavedPaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isRenewalCard?: boolean;
}

export interface SavedPaymentMethodsResult {
  paymentMethods: SavedPaymentMethod[];
  defaultPaymentMethodId: string | null;
  defaultVerified: boolean;
}

export interface CardSetupIntentResult {
  setupIntentId: string;
  clientSecret: string;
}

export interface FinalizeCardSetupResult {
  verified: boolean;
  setupIntentId: string;
  paymentMethodId: string;
  paymentMethod?: SavedPaymentMethod;
}

export interface SetDefaultPaymentMethodResult {
  updated: boolean;
  defaultPaymentMethodId: string;
  customerDefaultUpdated: boolean;
  subscriptionDefaultUpdated: boolean;
  subscriptionId?: string | null;
}

export interface PromoResult {
  valid: boolean;
  promoCodeId?: string;
  name?: string;
  percentOff?: number | null;
  amountOff?: number | null;
  duration?: string | null;
  durationInMonths?: number | null;
}

export interface StripePlan {
  id: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  interval: string;
  tier: 'starter' | 'basic' | 'advanced';
  maxPosts: number;
  features: string[];
}

export type AddonType = 'main_banner' | 'whats_hot';

export interface StripeAddonPlan {
  id: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  interval: string;
}

export interface BoostAvailabilitySlot {
  count: number;
  limit: number;
  nextAvailableDate: string | null;
}

export interface BoostAvailability {
  mainBanner: BoostAvailabilitySlot;
  whatsHot: BoostAvailabilitySlot;
}

export type PlanChangeOutcomeStatus =
  | 'confirmed'
  | 'scheduled'
  | 'unverified'
  | 'pending_payment'
  | 'requires_action'
  | 'failed';

export type ScheduledDowngradeVerification =
  | 'verified_schedule'
  | 'reported_by_lookup'
  | 'unverified';

export interface PlanChangeResult {
  status: PlanChangeOutcomeStatus;
  subscriptionId?: string;
  priceId?: string;
  planName?: string;
  scheduleId?: string | null;
  pendingPlanName?: string | null;
  pendingPeriodEnd?: number | null;
  clientSecret?: string | null;
  paymentIntentStatus?: string | null;
  message?: string;
}

export const CANONICAL_TIER_FEATURES: Record<'starter' | 'basic' | 'advanced', { maxPosts: number; features: string[] }> = {
  starter: {
    maxPosts: 1,
    features: [
      '1 active post (event or activity)',
      'VAMO app, website, and social media promotion',
      'Search & category discovery',
      'Direct bookings and reservations',
    ],
  },
  basic: {
    maxPosts: 4,
    features: [
      'Up to 4 active posts (events or activities)',
      'VAMO app, website, and social media promotion',
      'Campaign appears higher in relevant categories',
      'Direct bookings and reservations',
      'Basic campaign analytics',
    ],
  },
  advanced: {
    maxPosts: 8,
    features: [
      'Up to 8 active posts (events or activities)',
      'Priority placement in search and category discovery',
      'Direct bookings and reservations',
      'Priority consideration for promotional opportunities',
      'Basic campaign analytics',
    ],
  },
};

export const CANONICAL_TIER_FEATURES_ES: Record<'starter' | 'basic' | 'advanced', { maxPosts: number; features: string[] }> = {
  starter: {
    maxPosts: 1,
    features: [
      '1 publicación activa (evento o actividad)',
      'Promoción en la app, el sitio web y las redes sociales de VAMO',
      'Descubrimiento por búsqueda y categorías',
      'Reservas y reservaciones directas',
    ],
  },
  basic: {
    maxPosts: 4,
    features: [
      'Hasta 4 publicaciones activas (eventos o actividades)',
      'Promoción en la app, el sitio web y las redes sociales de VAMO',
      'La campaña aparece más arriba en las categorías correspondientes',
      'Reservas y reservaciones directas',
      'Analíticas básicas de campaña',
    ],
  },
  advanced: {
    maxPosts: 8,
    features: [
      'Hasta 8 publicaciones activas (eventos o actividades)',
      'Promoción en la app, el sitio web y las redes sociales de VAMO',
      'Ubicación prioritaria en búsquedas y descubrimiento por categorías',
      'Reservas y reservaciones directas',
      'Consideración prioritaria para las oportunidades promocionales disponibles',
      'Analíticas básicas de campaña',
    ],
  },
};

export function getCanonicalTierFeatures(tier: 'starter' | 'basic' | 'advanced', lang: string = 'en'): string[] {
  if (lang === 'es') {
    return CANONICAL_TIER_FEATURES_ES[tier]?.features ?? CANONICAL_TIER_FEATURES[tier]?.features ?? [];
  }
  return CANONICAL_TIER_FEATURES[tier]?.features ?? [];
}

@Injectable({ providedIn: 'root' })
export class StripeService {
  private authService = inject(AuthService);
  private i18n = inject(I18nService);
  private auditService = inject(CheckoutAuditService);
  private stripePromise: Promise<Stripe | null> | null = null;
  private activeElements: StripeElements | null = null;
  private cardSetupElements: StripeElements | null = null;
  private cardSetupPaymentElement: any = null;
  private inFlightCheckoutPreviews = new Map<string, Promise<CheckoutPreviewResult>>();
  private inFlightVerifiedSubscriptions = new Map<string, Promise<VerifiedCreateSubscriptionResult>>();

  getStripe(): Promise<Stripe | null> {
    const pubKey = runtimeConfig.stripePublishableKey;
    if (!this.stripePromise && pubKey) {
      this.stripePromise = loadStripe(pubKey);
    }
    return this.stripePromise ?? Promise.resolve(null);
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.authService.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async flowPost(flowId: string, payload: object): Promise<any> {
    if (!flowId) {
      throw new Error('Flow configuration identifier is missing.');
    }
    return this.authService.safeRequest(async () => {
      const url = `${runtimeConfig.directusUrl}/flows/trigger/${flowId}`;
      const headers = {
        'Content-Type': 'application/json',
        ...(await this.authHeaders()),
      };
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      if (!response.ok) {
        const err: any = new Error(`Flow request failed (${response.status})`);
        err.status = response.status;
        try { err.errors = JSON.parse(text)?.errors; } catch { /* non-JSON API error */ }
        throw err;
      }
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        throw new Error('Flow returned invalid JSON.');
      }
    });
  }

  /**
   * Calls the isolated portal checkout backend (`/api/checkout/preview` or `/api/checkout/create-subscription`)
   * with the authenticated Directus user's Bearer token and correlation ID.
   * Never invokes or mutates shared Directus Flows.
   */
  async checkoutApiPost(
    endpoint: 'preview' | 'create-subscription',
    payload: object,
  ): Promise<any> {
    const baseUrl = runtimeConfig.checkoutApiBaseUrl;
    if (!baseUrl) {
      throw new Error('Verified checkout API is not configured.');
    }
    return this.authService.safeRequest(async () => {
      const url = `${baseUrl.replace(/\/+$/, '')}/${endpoint}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Correlation-Id': this.auditService.getCorrelationId(),
        ...(await this.authHeaders()),
      };
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      if (response.status === 401) {
        const authErr: any = new Error('Authentication expired (401)');
        authErr.status = 401;
        authErr.code = 'TOKEN_EXPIRED';
        throw authErr;
      }
      let parsed: any = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
      }
      if (!response.ok) {
        // Structured business/security rejection from the isolated checkout backend (e.g. 409 / 422 / 403)
        if (parsed && typeof parsed === 'object' && ('aborted' in parsed || 'verified' in parsed || 'code' in parsed)) {
          return parsed;
        }
        const err: any = new Error(parsed?.error || parsed?.message || `Checkout API request failed (${response.status})`);
        err.status = response.status;
        if (parsed?.code) err.code = parsed.code;
        throw err;
      }
      return parsed;
    });
  }

  async getPlans(): Promise<StripePlan[]> {
    const flowId = runtimeConfig.stripeGetPricesFlow;
    if (!flowId) {
      throw new Error("We couldn't load current plan pricing. Please try again.");
    }

    const res = await this.flowPost(flowId, {});
    const stripeBody = res?.data ?? res;
    const prices = (stripeBody?.data ?? stripeBody ?? [])
      .filter((price: any) => price.active && price.unit_amount > 0)
      .sort((a: any, b: any) => a.unit_amount - b.unit_amount);

    if (prices.length === 0) {
      throw new Error("We couldn't load current plan pricing. Please try again.");
    }

    return prices.map((price: any) => {
      const name = price.product?.name ?? price.nickname ?? 'Plan';
      const tier = this.tierFromProductName(name) ?? 'starter';
      const meta = CANONICAL_TIER_FEATURES[tier];
      return {
        id: price.id,
        name,
        description: price.product?.description ?? '',
        amount: price.unit_amount ?? 0,
        currency: price.currency ?? 'usd',
        interval: price.recurring?.interval ?? 'month',
        tier,
        maxPosts: meta.maxPosts,
        features: meta.features,
      };
    });
  }

  async getAddonPrices(): Promise<StripeAddonPlan[]> {
    const flowId = runtimeConfig.stripeGetAddonPricesFlow;
    if (!flowId) {
      throw new Error("We couldn't load promotion pricing. Please try again.");
    }
    const res = await this.flowPost(flowId, {});
    const stripeBody = res?.data ?? res;
    return (stripeBody?.data ?? stripeBody ?? [])
      .filter((price: any) => price.active && price.unit_amount > 0 && !price.recurring)
      .sort((a: any, b: any) => a.unit_amount - b.unit_amount)
      .map((price: any) => ({
        id: price.id,
        name: price.product?.name ?? 'Add-On',
        description: price.product?.description ?? '',
        amount: price.unit_amount ?? 0,
        currency: price.currency ?? 'usd',
        interval: 'one_time',
      }))
      .filter((p: StripeAddonPlan) => !!p.id);
  }

  async getBoostAvailability(areaId?: string | null): Promise<BoostAvailability> {
    const flowId = runtimeConfig.getBoostAvailabilityFlow;
    if (!flowId) {
      throw new Error('Boost availability flow is not configured.');
    }
    const cleanAreaId = typeof areaId === 'string' ? areaId.trim() : '';
    if (!cleanAreaId) {
      throw new Error('A valid area identifier is required to check boost availability.');
    }

    const res = await this.flowPost(flowId, { areaId: cleanAreaId });

    const isValidSlot = (slot: any) =>
      slot &&
      typeof slot.count === 'number' &&
      Number.isFinite(slot.count) &&
      slot.count >= 0 &&
      typeof slot.limit === 'number' &&
      Number.isFinite(slot.limit) &&
      slot.limit > 0;

    if (!isValidSlot(res?.mainBanner) || !isValidSlot(res?.whatsHot)) {
      throw new Error('Boost availability response format is invalid.');
    }

    return {
      mainBanner: {
        count: res.mainBanner.count,
        limit: res.mainBanner.limit,
        nextAvailableDate: res.mainBanner.nextAvailableDate ?? null,
      },
      whatsHot: {
        count: res.whatsHot.count,
        limit: res.whatsHot.limit,
        nextAvailableDate: res.whatsHot.nextAvailableDate ?? null,
      },
    };
  }

  async createAddonPayment(
    priceId: string,
    type: AddonType,
    providerId: string,
    eventId?: string,
    scheduledStart?: string,
    promotionCode?: string,
  ): Promise<{ clientSecret: string; paymentIntentId: string } | { free: true }> {
    const flowId = runtimeConfig.stripeCreateAddonPaymentFlow;
    if (!flowId) {
      throw new Error('Boost payment flow is not configured.');
    }
    const data = await this.flowPost(flowId, {
      priceId,
      type,
      providerId,
      eventId: eventId ?? null,
      scheduledStart: scheduledStart ?? null,
      promotionCode: promotionCode ?? null,
    });
    if (data?.return_free_addon?.free) return { free: true };
    const paid = data?.extract_cs_discounted ?? data?.extract_client_secret ?? data;
    return paid;
  }

  async applyAddon(
    type: AddonType,
    internalDataId?: string,
    eventId?: string,
    scheduledStart?: string,
  ): Promise<any> {
    const flowId = runtimeConfig.stripeApplyAddonFlow;
    if (!flowId) {
      throw new Error('Apply boost flow is not configured.');
    }
    const payload = {
      type,
      internalDataId: internalDataId ?? null,
      eventId: eventId ?? null,
      scheduledStart: scheduledStart ?? null,
    };
    return this.flowPost(flowId, payload);
  }

  async validatePromoCode(code: string): Promise<PromoResult> {
    const cleanCode = (code ?? '').trim();
    this.auditService.record('promotion_submitted', {
      promotionCode: cleanCode,
    });
    const flowId = runtimeConfig.stripeValidatePromoFlow;
    if (!flowId || !cleanCode) {
      this.auditService.record('promotion_validation_failed', {
        promotionCode: cleanCode,
        reason: !flowId ? 'PROMO_FLOW_UNCONFIGURED' : 'EMPTY_PROMO_CODE',
      });
      return { valid: false };
    }
    const data = await this.flowPost(flowId, { code: cleanCode });
    const res: PromoResult = data?.extract_promo ?? data ?? { valid: false };
    if (res?.valid) {
      this.auditService.record('promotion_validation_succeeded', {
        promotionCode: cleanCode,
        promotionCodeId: res.promoCodeId ?? null,
      });
    } else {
      this.auditService.record('promotion_validation_failed', {
        promotionCode: cleanCode,
        reason: 'INVALID_OR_INELIGIBLE',
      });
    }
    return res;
  }

  async previewSubscriptionCheckout(
    request: CheckoutPreviewRequest,
  ): Promise<CheckoutPreviewResult> {
    const cleanPriceId = (request.priceId ?? '').trim();
    const cleanPromoCode = request.promotionCode ? request.promotionCode.trim() : null;
    const defaultSubtotal =
      typeof request.planAmount === 'number' && Number.isFinite(request.planAmount) && request.planAmount >= 0
        ? request.planAmount
        : 0;
    const defaultCurrency = (request.planCurrency || 'usd').toLowerCase();
    const defaultInterval = request.planInterval || 'month';
    const defaultPlanName = request.planName || '';

    if (!cleanPriceId || !cleanPriceId.startsWith('price_')) {
      return {
        verified: false,
        verificationStatus: 'unverified',
        couponState: cleanPromoCode ? 'not_applied' : 'not_applied',
        verificationReference: null,
        priceId: cleanPriceId,
        planName: defaultPlanName,
        interval: defaultInterval,
        currency: defaultCurrency,
        subtotal: defaultSubtotal,
        discountAmount: 0,
        tax: 0,
        amountDueToday: defaultSubtotal,
        renewalAmount: null,
        renewalInterval: defaultInterval,
        promoCode: cleanPromoCode,
        promoCodeId: null,
        promoCodeName: null,
        couponDuration: null,
        couponDurationInMonths: null,
        expiresAt: null,
        errorCode: 'INVALID_PRICE_ID',
        message: 'Invalid plan selection. Please select an active plan.',
      };
    }

    const lockKey = `${cleanPriceId}:${cleanPromoCode ?? ''}:${request.customerEmail ?? ''}`;
    const existing = this.inFlightCheckoutPreviews.get(lockKey);
    if (existing) {
      return existing;
    }

    const execution = (async (): Promise<CheckoutPreviewResult> => {
      this.auditService.startNewCorrelation();
      if (cleanPromoCode) {
        this.auditService.record('promotion_submitted', {
          priceId: cleanPriceId,
          promotionCode: cleanPromoCode,
          customerRef: request.customerRef ?? null,
          businessRef: request.businessRef ?? null,
        });
      }

      if (!runtimeConfig.checkoutApiBaseUrl) {
        return this.buildUnavailablePreviewResult(request, cleanPromoCode, 'CHECKOUT_API_UNCONFIGURED');
      }

      try {
        const raw = await this.checkoutApiPost('preview', {
          priceId: cleanPriceId,
          promotionCode: cleanPromoCode,
          promotionCodeId: request.promotionCodeId ?? null,
          email: request.customerEmail ?? null,
        });
        return this.normalizeCheckoutPreviewResponse(raw, request, cleanPromoCode);
      } catch {
        if (cleanPromoCode) {
          this.auditService.record('promotion_validation_failed', {
            priceId: cleanPriceId,
            promotionCode: cleanPromoCode,
            customerRef: request.customerRef ?? null,
            businessRef: request.businessRef ?? null,
            reason: 'PREVIEW_REQUEST_FAILED',
          });
        }
        return this.buildUnavailablePreviewResult(request, cleanPromoCode, 'PREVIEW_REQUEST_FAILED');
      }
    })();

    this.inFlightCheckoutPreviews.set(lockKey, execution);
    try {
      return await execution;
    } finally {
      this.inFlightCheckoutPreviews.delete(lockKey);
    }
  }

  private buildUnavailablePreviewResult(
    request: CheckoutPreviewRequest,
    cleanPromoCode: string | null,
    errorCode: string,
    extraPromoMeta?: {
      promoCodeId?: string | null;
      promoCodeName?: string | null;
      couponDuration?: CouponDurationType | null;
      couponDurationInMonths?: number | null;
    },
  ): CheckoutPreviewResult {
    const defaultSubtotal =
      typeof request.planAmount === 'number' && Number.isFinite(request.planAmount) && request.planAmount >= 0
        ? request.planAmount
        : 0;
    const defaultCurrency = (request.planCurrency || 'usd').toLowerCase();
    const defaultInterval = request.planInterval || 'month';
    return {
      verified: false,
      verificationStatus: 'unavailable',
      couponState: cleanPromoCode ? 'verification_unavailable' : 'not_applied',
      verificationReference: null,
      priceId: (request.priceId ?? '').trim(),
      planName: request.planName || '',
      interval: defaultInterval,
      currency: defaultCurrency,
      subtotal: defaultSubtotal,
      discountAmount: 0,
      tax: 0,
      amountDueToday: defaultSubtotal,
      renewalAmount: null,
      renewalInterval: defaultInterval,
      promoCode: cleanPromoCode,
      promoCodeId: extraPromoMeta?.promoCodeId ?? null,
      promoCodeName: extraPromoMeta?.promoCodeName ?? null,
      couponDuration: extraPromoMeta?.couponDuration ?? null,
      couponDurationInMonths: extraPromoMeta?.couponDurationInMonths ?? null,
      expiresAt: null,
      errorCode,
      message: 'Authoritative Stripe price verification is currently unavailable.',
    };
  }

  private normalizeCheckoutPreviewResponse(
    raw: any,
    request: CheckoutPreviewRequest,
    cleanPromoCode: string | null,
  ): CheckoutPreviewResult {
    const cleanPriceId = (request.priceId ?? '').trim();
    const defaultSubtotal =
      typeof request.planAmount === 'number' && Number.isFinite(request.planAmount) && request.planAmount >= 0
        ? request.planAmount
        : 0;
    const defaultCurrency = (request.planCurrency || 'usd').toLowerCase();
    const defaultInterval = request.planInterval || 'month';
    const defaultPlanName = request.planName || '';

    const body =
      raw?.preview_result ??
      raw?.checkout_preview ??
      raw?.extract_preview ??
      raw?.extract_promo ??
      raw?.data ??
      raw;

    if (!body || typeof body !== 'object') {
      return this.buildUnavailablePreviewResult(request, cleanPromoCode, 'EMPTY_PREVIEW_RESPONSE');
    }

    const rawErrorCode = typeof body.errorCode === 'string'
      ? body.errorCode
      : typeof body.code === 'string'
        ? body.code
        : null;

    // Case 1: Promotion code was submitted and the server explicitly rejected it as invalid or ineligible
    const isExplicitlyInvalidPromo =
      Boolean(cleanPromoCode) &&
      (body.couponState === 'invalid_or_ineligible' ||
        body.valid === false ||
        body.promoValid === false ||
        body.couponValid === false ||
        (rawErrorCode !== null &&
          (rawErrorCode.startsWith('PROMO_') ||
            rawErrorCode.startsWith('PROMOTION_') ||
            rawErrorCode === 'STRIPE_PREVIEW_REJECTED_PROMOTION' ||
            rawErrorCode === 'COUPON_MISSING' ||
            rawErrorCode === 'COUPON_INVALID' ||
            rawErrorCode === 'COUPON_INELIGIBLE' ||
            rawErrorCode === 'COUPON_EXPIRED' ||
            rawErrorCode === 'MAX_REDEMPTIONS_REACHED' ||
            rawErrorCode === 'MINIMUM_AMOUNT_NOT_MET' ||
            rawErrorCode === 'FIRST_TIME_CUSTOMER_ONLY' ||
            rawErrorCode === 'PRODUCT_RESTRICTION_MISMATCH')));

    if (isExplicitlyInvalidPromo) {
      this.auditService.record('promotion_validation_failed', {
        priceId: cleanPriceId,
        promotionCode: cleanPromoCode,
        promotionCodeId: body.promoCodeId ?? body.promotionCodeId ?? null,
        customerRef: request.customerRef ?? null,
        businessRef: request.businessRef ?? null,
        reason: rawErrorCode || body.error || body.message || 'INVALID_OR_INELIGIBLE_PROMO',
      });
      return {
        verified: false,
        verificationStatus: 'unverified',
        couponState: 'invalid_or_ineligible',
        verificationReference: null,
        priceId: cleanPriceId,
        planName: defaultPlanName,
        interval: defaultInterval,
        currency: defaultCurrency,
        subtotal: defaultSubtotal,
        discountAmount: 0,
        tax: 0,
        amountDueToday: defaultSubtotal,
        renewalAmount: defaultSubtotal > 0 ? defaultSubtotal : null,
        renewalInterval: defaultInterval,
        promoCode: cleanPromoCode,
        promoCodeId: null,
        promoCodeName: null,
        couponDuration: null,
        couponDurationInMonths: null,
        expiresAt: null,
        errorCode: rawErrorCode || 'PROMO_INVALID_OR_INELIGIBLE',
        message: typeof (body.error ?? body.message) === 'string' ? (body.error ?? body.message) : null,
      };
    }

    // Extract authoritative Stripe invoice preview fields
    const verificationRef =
      typeof body.verificationReference === 'string' && body.verificationReference.trim()
        ? body.verificationReference.trim()
        : typeof body.verificationId === 'string' && body.verificationId.trim()
          ? body.verificationId.trim()
          : typeof body.verificationToken === 'string' && body.verificationToken.trim()
            ? body.verificationToken.trim()
            : null;

    const invoiceObj = body.invoicePreview ?? body.invoice ?? body;
    const returnedPriceId =
      typeof body.priceId === 'string' && body.priceId.trim()
        ? body.priceId.trim()
        : typeof body.price_id === 'string' && body.price_id.trim()
          ? body.price_id.trim()
          : typeof invoiceObj?.lines?.data?.[0]?.price?.id === 'string'
            ? invoiceObj.lines.data[0].price.id.trim()
            : null;

    const rawSubtotal = body.subtotal ?? invoiceObj?.subtotal;
    const rawAmountDue =
      body.amountDueToday ??
      body.amount_due_today ??
      body.amountDue ??
      invoiceObj?.amount_due;
    const rawTax = body.tax ?? invoiceObj?.tax ?? 0;
    const rawDiscount =
      body.discountAmount ??
      body.discount_amount ??
      invoiceObj?.total_discount_amounts?.[0]?.amount ??
      (typeof rawSubtotal === 'number' &&
      typeof rawAmountDue === 'number' &&
      typeof rawTax === 'number'
        ? Math.max(0, rawSubtotal + rawTax - rawAmountDue)
        : undefined);

    const promoCodeId =
      typeof body.promoCodeId === 'string' && body.promoCodeId.trim()
        ? body.promoCodeId.trim()
        : typeof body.promotionCodeId === 'string' && body.promotionCodeId.trim()
          ? body.promotionCodeId.trim()
          : null;
    const promoCodeName =
      typeof body.promoCodeName === 'string' && body.promoCodeName.trim()
        ? body.promoCodeName.trim()
        : typeof body.promotionName === 'string' && body.promotionName.trim()
          ? body.promotionName.trim()
          : typeof body.name === 'string' && body.name.trim()
            ? body.name.trim()
            : cleanPromoCode;

    const rawDuration = body.couponDuration ?? body.duration ?? null;
    const couponDuration: CouponDurationType | null =
      rawDuration === 'once' || rawDuration === 'repeating' || rawDuration === 'forever'
        ? rawDuration
        : null;
    const rawDurationMonths = body.couponDurationInMonths ?? body.durationInMonths ?? null;
    const couponDurationInMonths =
      typeof rawDurationMonths === 'number' && Number.isFinite(rawDurationMonths) && rawDurationMonths > 0
        ? rawDurationMonths
        : null;

    // CRITICAL REQUIREMENT:
    // Never treat a local calculation or a bare percentOff/amountOff response as sufficient proof of the amount due.
    const hasAuthoritativeAmounts =
      typeof rawSubtotal === 'number' &&
      Number.isFinite(rawSubtotal) &&
      rawSubtotal >= 0 &&
      typeof rawDiscount === 'number' &&
      Number.isFinite(rawDiscount) &&
      rawDiscount >= 0 &&
      typeof rawTax === 'number' &&
      Number.isFinite(rawTax) &&
      rawTax >= 0 &&
      typeof rawAmountDue === 'number' &&
      Number.isFinite(rawAmountDue) &&
      rawAmountDue >= 0;

    const expectedMathAmountDue = hasAuthoritativeAmounts
      ? Math.max(0, rawSubtotal - rawDiscount + rawTax)
      : -1;

    const isMathConsistent =
      hasAuthoritativeAmounts && Math.abs(rawAmountDue - expectedMathAmountDue) <= 1;

    const isPromoVerified = !cleanPromoCode || (
      Boolean(promoCodeId && promoCodeId.startsWith('promo_')) &&
      (rawDiscount > 0 || rawAmountDue < rawSubtotal)
    );

    if (
      body.error === true ||
      body.verified === false ||
      !verificationRef ||
      !hasAuthoritativeAmounts ||
      !isMathConsistent ||
      returnedPriceId !== cleanPriceId ||
      !isPromoVerified
    ) {
      if (cleanPromoCode) {
        this.auditService.record('promotion_validation_failed', {
          priceId: cleanPriceId,
          promotionCode: cleanPromoCode,
          promotionCodeId: promoCodeId,
          customerRef: request.customerRef ?? null,
          businessRef: request.businessRef ?? null,
          reason: 'MISSING_AUTHORITATIVE_INVOICE_PREVIEW',
        });
      }
      return this.buildUnavailablePreviewResult(
        request,
        cleanPromoCode,
        rawErrorCode || 'VERIFICATION_UNAVAILABLE',
        {
          promoCodeId,
          promoCodeName,
          couponDuration,
          couponDurationInMonths,
        },
      );
    }

    const currency = String(body.currency ?? invoiceObj?.currency ?? defaultCurrency).toLowerCase();
    const interval = String(body.interval ?? body.renewalInterval ?? defaultInterval);
    const expiresAt =
      typeof body.expiresAt === 'number' && Number.isFinite(body.expiresAt)
        ? body.expiresAt
        : Date.now() + 10 * 60 * 1000;

    // Renewal disclosure: only populate renewalAmount when authoritative billing data establishes it
    let renewalAmount: number | null = null;
    if (typeof body.renewalAmount === 'number' && Number.isFinite(body.renewalAmount) && body.renewalAmount >= 0) {
      renewalAmount = body.renewalAmount;
    } else if (!cleanPromoCode) {
      renewalAmount = rawSubtotal;
    } else if (couponDuration === 'forever') {
      renewalAmount = rawAmountDue;
    } else if (
      couponDuration === 'once' ||
      (couponDuration === 'repeating' && couponDurationInMonths !== null)
    ) {
      renewalAmount = rawSubtotal;
    }

    if (cleanPromoCode) {
      this.auditService.record('promotion_validation_succeeded', {
        priceId: cleanPriceId,
        promotionCode: cleanPromoCode,
        promotionCodeId: promoCodeId,
        verificationReference: verificationRef,
        currency,
        discountAmount: rawDiscount,
        approvedAmount: rawAmountDue,
        customerRef: request.customerRef ?? null,
        businessRef: request.businessRef ?? null,
      });
    }

    this.auditService.record('invoice_preview_created', {
      priceId: cleanPriceId,
      promotionCode: cleanPromoCode,
      promotionCodeId: promoCodeId,
      verificationReference: verificationRef,
      currency,
      approvedAmount: rawAmountDue,
      discountAmount: rawDiscount,
      customerRef: request.customerRef ?? null,
      businessRef: request.businessRef ?? null,
    });

    this.auditService.record('amount_displayed_for_approval', {
      priceId: cleanPriceId,
      promotionCode: cleanPromoCode,
      promotionCodeId: promoCodeId,
      verificationReference: verificationRef,
      currency,
      approvedAmount: rawAmountDue,
      discountAmount: rawDiscount,
      customerRef: request.customerRef ?? null,
      businessRef: request.businessRef ?? null,
    });

    return {
      verified: true,
      verificationStatus: 'verified',
      couponState: cleanPromoCode ? 'verified_applied' : 'not_applied',
      verificationReference: verificationRef,
      priceId: cleanPriceId,
      planName: String(body.planName || defaultPlanName),
      interval,
      currency,
      subtotal: rawSubtotal,
      discountAmount: rawDiscount,
      tax: rawTax,
      amountDueToday: rawAmountDue,
      renewalAmount,
      renewalInterval: interval,
      promoCode: cleanPromoCode,
      promoCodeId,
      promoCodeName: cleanPromoCode ? promoCodeName : null,
      couponDuration: cleanPromoCode ? couponDuration : null,
      couponDurationInMonths: cleanPromoCode ? couponDurationInMonths : null,
      expiresAt,
      errorCode: null,
      message: null,
    };
  }

  async createVerifiedSubscription(
    request: VerifiedCreateSubscriptionRequest,
  ): Promise<VerifiedCreateSubscriptionResult> {
    const cleanPriceId = (request.priceId ?? '').trim();
    if (!cleanPriceId || !cleanPriceId.startsWith('price_')) {
      throw new Error('Invalid plan selection. Please select an active plan.');
    }

    const verificationRef = (request.verificationReference ?? '').trim();
    const approvedCurrency = (request.approvedCurrency ?? '').trim().toLowerCase();
    const approvedAmountDue = request.approvedAmountDue;
    const cleanPromoId = request.promotionCodeId ? request.promotionCodeId.trim() : null;

    if (
      !verificationRef ||
      typeof approvedAmountDue !== 'number' ||
      !Number.isFinite(approvedAmountDue) ||
      approvedAmountDue < 0 ||
      !approvedCurrency
    ) {
      this.auditService.record('amount_mismatch_blocked', {
        priceId: cleanPriceId,
        promotionCodeId: cleanPromoId,
        verificationReference: verificationRef || null,
        approvedAmount: Number.isFinite(approvedAmountDue) ? approvedAmountDue : null,
        currency: approvedCurrency || null,
        customerRef: request.customerRef ?? null,
        businessRef: request.businessRef ?? null,
        reason: 'UNVERIFIED_CHECKOUT',
      });
      throw new CheckoutChargeProtectionError(
        'UNVERIFIED_CHECKOUT',
        'Checkout price must be verified with Stripe before creating a subscription.',
        { approvedAmount: approvedAmountDue, currency: approvedCurrency },
      );
    }

    if (
      typeof request.expiresAt === 'number' &&
      Number.isFinite(request.expiresAt) &&
      Date.now() > request.expiresAt
    ) {
      this.auditService.record('amount_mismatch_blocked', {
        priceId: cleanPriceId,
        promotionCodeId: cleanPromoId,
        verificationReference: verificationRef,
        approvedAmount: approvedAmountDue,
        currency: approvedCurrency,
        customerRef: request.customerRef ?? null,
        businessRef: request.businessRef ?? null,
        reason: 'VERIFICATION_EXPIRED',
      });
      throw new CheckoutChargeProtectionError(
        'VERIFICATION_EXPIRED',
        'Price verification has expired. Please review the updated total before continuing.',
        { approvedAmount: approvedAmountDue, currency: approvedCurrency },
      );
    }

    const checkoutApiUrl = runtimeConfig.checkoutApiBaseUrl;
    if (!checkoutApiUrl) {
      throw new Error('Verified checkout API is not configured.');
    }

    const lockKey = `${request.email}:${cleanPriceId}:${cleanPromoId ?? 'none'}:${approvedAmountDue}:${verificationRef}`;
    const existing = this.inFlightVerifiedSubscriptions.get(lockKey);
    if (existing) {
      return existing;
    }

    const idempotencyKey =
      (request.idempotencyKey && request.idempotencyKey.trim()) ||
      `sub_${verificationRef}_${cleanPriceId}_${cleanPromoId ?? 'nopromo'}_${approvedAmountDue}`;

    const execution = (async (): Promise<VerifiedCreateSubscriptionResult> => {
      this.auditService.record('subscription_creation_attempted', {
        priceId: cleanPriceId,
        promotionCodeId: cleanPromoId,
        verificationReference: verificationRef,
        approvedAmount: approvedAmountDue,
        currency: approvedCurrency,
        customerRef: request.customerRef ?? null,
        businessRef: request.businessRef ?? null,
      });

      const data = await this.checkoutApiPost('create-subscription', {
        email: request.email,
        name: request.name,
        priceId: cleanPriceId,
        promotionCode: cleanPromoId,
        promotionCodeId: cleanPromoId,
        verificationReference: verificationRef,
        approvedAmountDue,
        approvedCurrency,
        paymentMethodId: request.paymentMethodId ?? null,
        idempotencyKey,
      });

      const result =
        data?.extract_result ??
        data?.extract_result_existing ??
        data?.extract_sub_error_new ??
        data?.extract_sub_error_existing ??
        data?.data ??
        data;

      const subscriptionId =
        typeof result?.subscriptionId === 'string' && result.subscriptionId.trim()
          ? result.subscriptionId.trim()
          : '';
      const invoiceObj = result?.latestInvoice ?? result?.latest_invoice ?? result?.invoice ?? null;
      const invoiceId =
        typeof result?.invoiceId === 'string' && result.invoiceId.trim()
          ? result.invoiceId.trim()
          : typeof invoiceObj?.id === 'string' && invoiceObj.id.trim()
            ? invoiceObj.id.trim()
            : null;

      const serverCode =
        typeof result?.errorCode === 'string'
          ? result.errorCode
          : typeof result?.code === 'string'
            ? result.code
            : null;

      // Check if isolated server explicitly blocked or aborted checkout
      if (
        result?.aborted === true ||
        result?.blocked === true ||
        result?.mismatchBlocked === true ||
        serverCode === 'AMOUNT_MISMATCH_BLOCKED' ||
        serverCode === 'AMOUNT_EXCEEDS_APPROVED' ||
        serverCode === 'AMOUNT_CHANGED_AFTER_APPROVAL' ||
        serverCode === 'PRICE_CHANGED_AFTER_APPROVAL' ||
        serverCode === 'ZERO_AMOUNT_PAYMENT_INTENT_BLOCKED' ||
        serverCode === 'PROMOTION_NOT_APPLIED_ON_INVOICE' ||
        serverCode === 'PROMOTION_CHANGED_AFTER_APPROVAL' ||
        serverCode === 'PROMOTION_NO_LONGER_ELIGIBLE' ||
        serverCode === 'EXPIRED_VERIFICATION_REFERENCE' ||
        serverCode === 'TAMPERED_VERIFICATION_REFERENCE' ||
        serverCode === 'CURRENCY_MISMATCH' ||
        serverCode === 'UNVERIFIED_FIRST_INVOICE_AMOUNT'
      ) {
        const reportedActual =
          result?.actualAmountDue ?? result?.invoiceAmountDue ?? invoiceObj?.amount_due ?? null;

        let mappedProtectionCode: CheckoutProtectionErrorCode = 'AMOUNT_MISMATCH_BLOCKED';
        if (serverCode === 'ZERO_AMOUNT_PAYMENT_INTENT_BLOCKED') {
          mappedProtectionCode = 'UNEXPECTED_PAYMENT_INTENT_FOR_FREE_CHECKOUT';
        } else if (serverCode === 'EXPIRED_VERIFICATION_REFERENCE') {
          mappedProtectionCode = 'VERIFICATION_EXPIRED';
        } else if (serverCode === 'TAMPERED_VERIFICATION_REFERENCE' || serverCode === 'MISSING_VERIFICATION_FIELDS') {
          mappedProtectionCode = 'UNVERIFIED_CHECKOUT';
        } else if (
          serverCode === 'PROMOTION_NOT_APPLIED_ON_INVOICE' ||
          serverCode === 'PROMOTION_CHANGED_AFTER_APPROVAL' ||
          serverCode === 'PROMOTION_NO_LONGER_ELIGIBLE'
        ) {
          mappedProtectionCode = 'PROMO_NOT_APPLIED';
        } else if (serverCode === 'CURRENCY_MISMATCH') {
          mappedProtectionCode = 'CURRENCY_MISMATCH_BLOCKED';
        } else if (serverCode === 'UNVERIFIED_FIRST_INVOICE_AMOUNT') {
          mappedProtectionCode = 'MISSING_INVOICE_VERIFICATION';
        }

        const serverMessage =
          (typeof result?.error === 'string' && result.error) ||
          (typeof result?.message === 'string' && result.message) ||
          'The invoice total returned by Stripe did not match the approved checkout amount. No payment was collected.';

        this.auditService.record('amount_mismatch_blocked', {
          priceId: cleanPriceId,
          promotionCodeId: cleanPromoId,
          verificationReference: verificationRef,
          subscriptionId: subscriptionId || null,
          invoiceId,
          approvedAmount: approvedAmountDue,
          actualAmount: typeof reportedActual === 'number' ? reportedActual : null,
          currency: approvedCurrency,
          customerRef: request.customerRef ?? null,
          businessRef: request.businessRef ?? null,
          reason: serverCode || serverMessage,
        });

        // For non-protection business errors (like EXISTING_ACTIVE_SUBSCRIPTION or DUPLICATE_CHECKOUT_SUBMISSION), throw standard Error
        if (
          serverCode &&
          ![
            'AMOUNT_MISMATCH_BLOCKED',
            'AMOUNT_EXCEEDS_APPROVED',
            'AMOUNT_CHANGED_AFTER_APPROVAL',
            'PRICE_CHANGED_AFTER_APPROVAL',
            'ZERO_AMOUNT_PAYMENT_INTENT_BLOCKED',
            'PROMOTION_NOT_APPLIED_ON_INVOICE',
            'PROMOTION_CHANGED_AFTER_APPROVAL',
            'PROMOTION_NO_LONGER_ELIGIBLE',
            'EXPIRED_VERIFICATION_REFERENCE',
            'TAMPERED_VERIFICATION_REFERENCE',
            'MISSING_VERIFICATION_FIELDS',
            'CURRENCY_MISMATCH',
            'UNVERIFIED_FIRST_INVOICE_AMOUNT',
          ].includes(serverCode) &&
          result?.mismatchBlocked !== true
        ) {
          const businessErr: any = new Error(serverMessage);
          businessErr.code = serverCode;
          throw businessErr;
        }

        throw new CheckoutChargeProtectionError(mappedProtectionCode, serverMessage, {
          approvedAmount: approvedAmountDue,
          actualAmount: typeof reportedActual === 'number' ? reportedActual : null,
          currency: approvedCurrency,
        });
      }

      if (result?.stripeError || result?.error === true || (typeof result?.error === 'string' && result.error)) {
        throw new Error(
          result?.stripeError ||
            (typeof result?.error === 'string' ? result.error : null) ||
            result?.message ||
            'Could not create subscription.',
        );
      }

      const clientSecret =
        typeof result?.clientSecret === 'string' && result.clientSecret.trim()
          ? result.clientSecret.trim()
          : null;
      const requiresSetup = Boolean(result?.requiresSetup);

      const rawActualAmount =
        result?.invoiceAmountDue ??
        result?.amountDueToday ??
        result?.amountDue ??
        result?.amount_due ??
        invoiceObj?.amount_due ??
        result?.paymentIntentAmount ??
        result?.payment_intent?.amount;

      const actualCurrency = String(
        result?.invoiceCurrency ??
          result?.currency ??
          invoiceObj?.currency ??
          approvedCurrency,
      ).toLowerCase();

      const appliedPromoId =
        typeof result?.appliedPromotionCodeId === 'string' && result.appliedPromotionCodeId.trim()
          ? result.appliedPromotionCodeId.trim()
          : typeof result?.promotionCodeId === 'string' && result.promotionCodeId.trim()
            ? result.promotionCodeId.trim()
            : typeof invoiceObj?.discount?.promotion_code === 'string'
              ? invoiceObj.discount.promotion_code.trim()
              : null;

      const abortClientSideHardStop = async (
        code: CheckoutProtectionErrorCode,
        reason: string,
        actualAmount: number | null,
      ): Promise<never> => {
        this.auditService.record('amount_mismatch_blocked', {
          priceId: cleanPriceId,
          promotionCodeId: cleanPromoId,
          verificationReference: verificationRef,
          subscriptionId: subscriptionId || null,
          invoiceId,
          approvedAmount: approvedAmountDue,
          actualAmount,
          currency: actualCurrency,
          customerRef: request.customerRef ?? null,
          businessRef: request.businessRef ?? null,
          reason,
        });

        throw new CheckoutChargeProtectionError(
          code,
          'The invoice total returned by Stripe did not match the approved checkout amount. Checkout was stopped before collecting payment.',
          {
            approvedAmount: approvedAmountDue,
            actualAmount,
            currency: actualCurrency,
          },
        );
      };

      // HARD STOP 1: Customer approved $0.00, but backend returned a chargeable PaymentIntent (pi_...)
      // or requiresSetup === false with a non-SetupIntent secret!
      if (approvedAmountDue === 0) {
        if (
          (clientSecret && clientSecret.startsWith('pi_')) ||
          (clientSecret && !clientSecret.startsWith('seti_') && !requiresSetup)
        ) {
          const suspectedAmount =
            typeof rawActualAmount === 'number' && Number.isFinite(rawActualAmount)
              ? rawActualAmount
              : null;
          return await abortClientSideHardStop(
            'UNEXPECTED_PAYMENT_INTENT_FOR_FREE_CHECKOUT',
            'Chargeable PaymentIntent returned for a $0.00 approved checkout',
            suspectedAmount,
          );
        }
      }

      // HARD STOP 2: Require authoritative first-invoice amount from the backend
      if (typeof rawActualAmount !== 'number' || !Number.isFinite(rawActualAmount) || rawActualAmount < 0) {
        return await abortClientSideHardStop(
          'MISSING_INVOICE_VERIFICATION',
          'Subscription response omitted authoritative first-invoice amount_due verification',
          null,
        );
      }

      // HARD STOP 3: Actual first-invoice amount exceeds customer-approved amount, or > 0 when $0.00 was approved
      if (rawActualAmount > approvedAmountDue || (approvedAmountDue === 0 && rawActualAmount > 0)) {
        return await abortClientSideHardStop(
          'AMOUNT_MISMATCH_BLOCKED',
          `First invoice amount (${rawActualAmount}) exceeded customer-approved amount (${approvedAmountDue})`,
          rawActualAmount,
        );
      }

      // HARD STOP 4: Currency mismatch
      if (actualCurrency !== approvedCurrency) {
        return await abortClientSideHardStop(
          'CURRENCY_MISMATCH_BLOCKED',
          `Invoice currency (${actualCurrency}) did not match approved currency (${approvedCurrency})`,
          rawActualAmount,
        );
      }

      // HARD STOP 5: Promotion code was approved, but backend indicates discount was not applied or applied a different promo
      if (cleanPromoId) {
        if (
          result?.discountApplied === false ||
          !appliedPromoId ||
          appliedPromoId !== cleanPromoId
        ) {
          return await abortClientSideHardStop(
            'PROMO_NOT_APPLIED',
            `Expected promotion code ${cleanPromoId} was not verified on the first invoice`,
            rawActualAmount,
          );
        }
      }

      const invoiceSubtotal =
        typeof result?.invoiceSubtotal === 'number' && Number.isFinite(result.invoiceSubtotal)
          ? result.invoiceSubtotal
          : typeof invoiceObj?.subtotal === 'number'
            ? invoiceObj.subtotal
            : rawActualAmount;
      const invoiceDiscountAmount =
        typeof result?.invoiceDiscountAmount === 'number' && Number.isFinite(result.invoiceDiscountAmount)
          ? result.invoiceDiscountAmount
          : typeof invoiceObj?.total_discount_amounts?.[0]?.amount === 'number'
            ? invoiceObj.total_discount_amounts[0].amount
            : Math.max(0, invoiceSubtotal - rawActualAmount);
      const invoiceTax =
        typeof result?.invoiceTax === 'number' && Number.isFinite(result.invoiceTax)
          ? result.invoiceTax
          : typeof invoiceObj?.tax === 'number'
            ? invoiceObj.tax
            : 0;

      this.auditService.record('first_invoice_verified', {
        priceId: cleanPriceId,
        promotionCodeId: cleanPromoId,
        verificationReference: verificationRef,
        subscriptionId: subscriptionId || null,
        invoiceId,
        approvedAmount: approvedAmountDue,
        actualAmount: rawActualAmount,
        discountAmount: invoiceDiscountAmount,
        currency: actualCurrency,
        customerRef: request.customerRef ?? null,
        businessRef: request.businessRef ?? null,
      });

      return {
        clientSecret,
        subscriptionId,
        requiresSetup,
        invoiceId,
        invoiceAmountDue: rawActualAmount,
        invoiceSubtotal,
        invoiceDiscountAmount,
        invoiceTax,
        invoiceCurrency: actualCurrency,
        appliedPromotionCodeId: appliedPromoId,
        verifiedByServer: true,
      };
    })();

    this.inFlightVerifiedSubscriptions.set(lockKey, execution);
    try {
      return await execution;
    } finally {
      this.inFlightVerifiedSubscriptions.delete(lockKey);
    }
  }

  recordPaymentOutcome(
    outcome: 'succeeded' | 'failed',
    details: {
      priceId?: string | null;
      promotionCodeId?: string | null;
      verificationReference?: string | null;
      subscriptionId?: string | null;
      invoiceId?: string | null;
      approvedAmount?: number | null;
      actualAmount?: number | null;
      currency?: string | null;
      customerRef?: string | null;
      businessRef?: string | null;
      reason?: string | null;
    },
  ): void {
    this.auditService.record(
      outcome === 'succeeded' ? 'payment_succeeded' : 'payment_failed',
      details,
    );
  }

  async createSubscription(
    email: string,
    name: string,
    priceId: string,
    promotionCode?: string,
  ): Promise<{ clientSecret: string | null; subscriptionId: string; requiresSetup: boolean }> {
    if (!priceId || !priceId.startsWith('price_')) {
      throw new Error('Invalid plan selection. Please select an active plan.');
    }
    const flowId = runtimeConfig.stripeCreateSubscriptionFlow;
    if (!flowId) {
      throw new Error('Subscription creation flow is not configured.');
    }
    const data = await this.flowPost(flowId, {
      email,
      name,
      priceId,
      promotionCode: promotionCode ?? null,
    });
    const result =
      data?.extract_result ??
      data?.extract_result_existing ??
      data?.extract_sub_error_new ??
      data?.extract_sub_error_existing ??
      data;
    if (result?.stripeError) {
      throw new Error(result.stripeError);
    }
    return { requiresSetup: false, ...result };
  }

  private createElementsInstance(stripe: Stripe, clientSecret: string): StripeElements {
    return stripe.elements({
      clientSecret,
      locale: this.i18n.lang() === 'es' ? 'es' : 'en',
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#8070C0',
          colorBackground: '#ffffff',
          colorText: '#0f172a',
          colorTextSecondary: '#64748b',
          colorDanger: '#ef4444',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          borderRadius: '10px',
          spacingUnit: '4px',
        },
        rules: {
          '.Input': {
            borderColor: '#e2e8f0',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          },
          '.Input:focus': {
            borderColor: '#8070C0',
            boxShadow: '0 0 0 2px rgba(128, 112, 192, 0.2)',
          },
          '.Label': {
            color: '#334155',
            fontWeight: '500',
            fontSize: '13px',
            marginBottom: '4px',
          },
        },
      },
    });
  }

  async mountPaymentElement(
    clientSecret: string,
    containerId: string,
  ): Promise<{ stripe: Stripe; elements: StripeElements }> {
    const stripe = await this.getStripe();
    if (!stripe) throw new Error('Stripe failed to initialize.');

    this.activeElements = this.createElementsInstance(stripe, clientSecret);

    const paymentElement = this.activeElements.create('payment');
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container #${containerId} not found.`);
    paymentElement.mount(container);

    return { stripe, elements: this.activeElements };
  }

  async mountCardSetupElement(
    clientSecret: string,
    containerId: string,
  ): Promise<{ stripe: Stripe; elements: StripeElements }> {
    const stripe = await this.getStripe();
    if (!stripe) throw new Error('Stripe failed to initialize.');

    this.cleanupCardSetup();
    this.cardSetupElements = this.createElementsInstance(stripe, clientSecret);

    const paymentElement = this.cardSetupElements.create('payment');
    let container = document.getElementById(containerId);
    if (!container) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      container = document.getElementById(containerId);
    }
    if (!container) throw new Error(`Container #${containerId} not found.`);
    paymentElement.mount(container);
    this.cardSetupPaymentElement = paymentElement;

    return { stripe, elements: this.cardSetupElements };
  }

  async confirmPayment(
    stripe: Stripe,
    elements: StripeElements,
    returnUrl?: string,
  ): Promise<{ error?: any }> {
    return stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: returnUrl ? { return_url: returnUrl } : undefined,
    });
  }

  async confirmSetup(
    stripe: Stripe,
    elements: StripeElements,
    returnUrl?: string,
  ): Promise<{ error?: any }> {
    return stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: returnUrl ? { return_url: returnUrl } : undefined,
    });
  }

  async confirmWithSavedMethod(
    clientSecret: string,
    paymentMethodId: string,
  ): Promise<{ error?: any }> {
    const stripe = await this.getStripe();
    if (!stripe) throw new Error('Stripe failed to initialize.');
    return stripe.confirmCardPayment(clientSecret, { payment_method: paymentMethodId });
  }

  async confirmSetupWithSavedMethod(
    clientSecret: string,
    paymentMethodId: string,
  ): Promise<{ error?: any }> {
    const stripe = await this.getStripe();
    if (!stripe) throw new Error('Stripe failed to initialize.');
    return stripe.confirmCardSetup(clientSecret, { payment_method: paymentMethodId });
  }

  async getSubscription(email: string): Promise<StripeSubscription | null> {
    const flowId = runtimeConfig.stripeGetSubscriptionFlow;
    if (!flowId) {
      throw new Error('Subscription lookup is not configured.');
    }
    const data = await this.flowPost(flowId, { email });
    const sub = data?.subscription ?? null;
    if (sub && data?.schedule && sub.schedule === undefined) {
      return { ...sub, schedule: data.schedule };
    }
    return sub;
  }

  async getPlanLimits(): Promise<{ productName: string; max_posts: number }[]> {
    return this.authService.safeRequest(async () => {
      const result = await directusClient.request(readItems('settings' as any, {
        limit: 1,
        fields: ['plan_limits'],
        sort: ['id'],
      } as any));
      const row = Array.isArray(result) ? result[0] : result;
      return (row as any)?.plan_limits ?? [];
    });
  }

  async cancelSubscription(subscriptionId: string, cancelAtPeriodEnd = true): Promise<void> {
    const flowId = runtimeConfig.stripeCancelSubscriptionFlow;
    if (!flowId) {
      throw new Error('Cancel subscription flow is not configured.');
    }
    await this.flowPost(flowId, {
      subscriptionId,
      cancelAtPeriodEnd,
    });
  }

  private inFlightPlanChanges = new Map<string, Promise<PlanChangeResult>>();

  async changeSubscriptionPlan(
    subscriptionId: string,
    subscriptionItemId: string,
    newPriceId: string,
    isUpgrade: boolean,
    newPlanName: string,
    currentPeriodStart: number,
    currentPeriodEnd: number,
    currentPriceId: string,
  ): Promise<PlanChangeResult> {
    const flowId = runtimeConfig.stripeChangeSubscriptionFlow;
    if (!flowId) {
      throw new Error('Change subscription flow is not configured.');
    }

    const lockKey = `${subscriptionId}:${subscriptionItemId}:${newPriceId}:${isUpgrade ? 'upgrade' : 'downgrade'}:${currentPeriodEnd}`;
    const existing = this.inFlightPlanChanges.get(lockKey);
    if (existing) {
      return existing;
    }

    const payload = {
      subscriptionId,
      subscriptionItemId,
      newPriceId,
      isUpgrade,
      newPlanName,
      currentPeriodStart,
      currentPeriodEnd,
      currentPriceId,
    };

    const execution = (async (): Promise<PlanChangeResult> => {
      const raw = await this.flowPost(flowId, payload);
      return this.normalizePlanChangeResponse(
        raw,
        isUpgrade,
        subscriptionId,
        newPriceId,
        newPlanName,
        currentPeriodEnd,
      );
    })();

    this.inFlightPlanChanges.set(lockKey, execution);
    try {
      return await execution;
    } finally {
      this.inFlightPlanChanges.delete(lockKey);
    }
  }

  hasVerifiedRenewalSchedule(
    schedule: StripeSubscriptionSchedule | null | undefined,
    targetPriceId: string,
    expectedRenewalTimestamp: number,
  ): boolean {
    if (
      !schedule ||
      typeof schedule !== 'object' ||
      !targetPriceId ||
      !Number.isFinite(expectedRenewalTimestamp) ||
      expectedRenewalTimestamp <= 0
    ) {
      return false;
    }

    if (
      schedule.status &&
      ['canceled', 'released', 'completed'].includes(String(schedule.status).toLowerCase())
    ) {
      return false;
    }

    if (Array.isArray(schedule.phases)) {
      const matchesPhase = schedule.phases.some((phase) => {
        const phaseStart = phase?.start_date ?? phase?.startDate;
        if (phaseStart !== expectedRenewalTimestamp) return false;
        const directPhasePrice =
          phase?.priceId ??
          (typeof phase?.price === 'string' ? phase.price : phase?.price?.id);
        if (directPhasePrice === targetPriceId) return true;
        if (Array.isArray(phase?.items)) {
          return phase.items.some((item) => {
            const itemPrice =
              item?.priceId ??
              (typeof item?.price === 'string' ? item.price : item?.price?.id);
            return itemPrice === targetPriceId;
          });
        }
        return false;
      });
      if (matchesPhase) return true;
    }

    if (schedule.nextPhase && typeof schedule.nextPhase === 'object') {
      const nextStart = schedule.nextPhase.startDate ?? schedule.nextPhase.start_date;
      const nextPrice =
        schedule.nextPhase.priceId ??
        (typeof schedule.nextPhase.price === 'string'
          ? schedule.nextPhase.price
          : schedule.nextPhase.price?.id);
      if (nextStart === expectedRenewalTimestamp && nextPrice === targetPriceId) {
        return true;
      }
    }

    const directStart =
      schedule.renewalDate ??
      schedule.effectiveAt ??
      schedule.startDate ??
      schedule.start_date;
    const directPrice = schedule.targetPriceId ?? schedule.priceId;
    if (directStart === expectedRenewalTimestamp && directPrice === targetPriceId) {
      return true;
    }

    return false;
  }

  hasContradictoryScheduleEvidence(
    schedule: StripeSubscriptionSchedule | null | undefined,
    pendingScheduleId: string,
    pendingPeriodEnd: number,
    currentPriceId: string,
    targetPriceId?: string,
  ): boolean {
    if (!schedule || typeof schedule !== 'object') {
      return false;
    }

    if (
      schedule.status &&
      ['canceled', 'released', 'completed', 'inactive'].includes(
        String(schedule.status).toLowerCase(),
      )
    ) {
      return true;
    }

    if (
      typeof schedule.id === 'string' &&
      schedule.id.trim().length > 0 &&
      schedule.id.trim() !== pendingScheduleId.trim()
    ) {
      return true;
    }

    const directStart =
      schedule.renewalDate ??
      schedule.effectiveAt ??
      schedule.startDate ??
      schedule.start_date;
    if (directStart !== undefined && directStart !== null && directStart !== pendingPeriodEnd) {
      return true;
    }

    const directPrice = schedule.targetPriceId ?? schedule.priceId;
    if (typeof directPrice === 'string' && directPrice.trim().length > 0) {
      if (directPrice === currentPriceId) return true;
      if (targetPriceId && directPrice !== targetPriceId) return true;
    }

    if (schedule.nextPhase && typeof schedule.nextPhase === 'object') {
      const nextStart = schedule.nextPhase.startDate ?? schedule.nextPhase.start_date;
      if (nextStart !== undefined && nextStart !== null && nextStart !== pendingPeriodEnd) {
        return true;
      }
      const nextPrice =
        schedule.nextPhase.priceId ??
        (typeof schedule.nextPhase.price === 'string'
          ? schedule.nextPhase.price
          : schedule.nextPhase.price?.id);
      if (typeof nextPrice === 'string' && nextPrice.trim().length > 0) {
        if (nextPrice === currentPriceId) return true;
        if (targetPriceId && nextPrice !== targetPriceId) return true;
      }
    }

    if (Array.isArray(schedule.phases)) {
      if (schedule.phases.length === 0) {
        return true;
      }
      if (targetPriceId) {
        if (!this.hasVerifiedRenewalSchedule(schedule, targetPriceId, pendingPeriodEnd)) {
          return true;
        }
      } else {
        const renewalPhases = schedule.phases.filter(
          (phase) => (phase?.start_date ?? phase?.startDate) === pendingPeriodEnd,
        );
        if (renewalPhases.length === 0) {
          return true;
        }
        const pointsOnlyToCurrent = renewalPhases.every((phase) => {
          const directPhasePrice =
            phase?.priceId ??
            (typeof phase?.price === 'string' ? phase.price : phase?.price?.id);
          if (directPhasePrice) return directPhasePrice === currentPriceId;
          if (Array.isArray(phase?.items) && phase.items.length > 0) {
            return phase.items.every((item) => {
              const itemPrice =
                item?.priceId ??
                (typeof item?.price === 'string' ? item.price : item?.price?.id);
              return itemPrice === currentPriceId;
            });
          }
          return false;
        });
        if (pointsOnlyToCurrent) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Recognizes a scheduled downgrade as reported by the billing lookup when full
   * Stripe schedule phase details are not exposed by the unchanged backend flow.
   * This is distinct from independent Stripe schedule phase verification.
   */
  hasLookupReportedScheduledChange(
    subscription: StripeSubscription | null | undefined,
    options?: {
      expectedSubscriptionId?: string;
      currentPriceId?: string;
      targetPriceId?: string;
      targetPlanName?: string;
      targetTier?: 'starter' | 'basic' | 'advanced' | null;
      expectedRenewalTimestamp?: number;
      nowSeconds?: number;
    },
  ): boolean {
    if (!subscription || typeof subscription !== 'object') {
      return false;
    }

    const subId =
      typeof subscription.subscriptionId === 'string' ? subscription.subscriptionId.trim() : '';
    if (!subId) {
      return false;
    }
    if (options?.expectedSubscriptionId && subId !== options.expectedSubscriptionId) {
      return false;
    }

    if (!['active', 'trialing'].includes(subscription.status)) {
      return false;
    }

    const currentPriceId =
      typeof subscription.plan?.priceId === 'string' ? subscription.plan.priceId.trim() : '';
    if (!currentPriceId) {
      return false;
    }
    if (options?.currentPriceId && currentPriceId !== options.currentPriceId) {
      return false;
    }

    const pendingScheduleId =
      typeof subscription.pendingScheduleId === 'string'
        ? subscription.pendingScheduleId.trim()
        : '';
    if (!pendingScheduleId) {
      return false;
    }

    const pendingPlanName =
      typeof subscription.pendingPlanName === 'string' ? subscription.pendingPlanName.trim() : '';
    if (!pendingPlanName) {
      return false;
    }

    const pendingTier = this.tierFromProductName(pendingPlanName);
    const pendingTitleKey = this.planTitleKey(pendingPlanName);
    if (!pendingTier || !pendingTitleKey) {
      return false;
    }

    const currentTier = this.tierFromProductName(subscription.plan?.productName);
    const currentTitleKey = this.planTitleKey(subscription.plan?.productName);
    if (
      (currentTier && pendingTier === currentTier) ||
      (currentTitleKey && pendingTitleKey === currentTitleKey)
    ) {
      return false;
    }

    if (options?.targetPriceId && options.targetPriceId === currentPriceId) {
      return false;
    }

    if (options?.targetPlanName !== undefined || options?.targetTier !== undefined) {
      const expectedTier = options.targetTier ?? this.tierFromProductName(options.targetPlanName);
      const expectedTitleKey = options.targetPlanName
        ? this.planTitleKey(options.targetPlanName)
        : null;
      if (!expectedTier || pendingTier !== expectedTier) {
        return false;
      }
      if (expectedTitleKey && pendingTitleKey !== expectedTitleKey) {
        return false;
      }
    }

    const pendingPeriodEnd = subscription.pendingPeriodEnd;
    const currentPeriodEnd = subscription.currentPeriodEnd;
    if (
      typeof pendingPeriodEnd !== 'number' ||
      !Number.isFinite(pendingPeriodEnd) ||
      typeof currentPeriodEnd !== 'number' ||
      !Number.isFinite(currentPeriodEnd) ||
      pendingPeriodEnd !== currentPeriodEnd
    ) {
      return false;
    }

    if (
      options?.expectedRenewalTimestamp !== undefined &&
      pendingPeriodEnd !== options.expectedRenewalTimestamp
    ) {
      return false;
    }

    const nowSec = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (pendingPeriodEnd <= nowSec) {
      return false;
    }

    if (
      this.hasContradictoryScheduleEvidence(
        subscription.schedule,
        pendingScheduleId,
        pendingPeriodEnd,
        currentPriceId,
        options?.targetPriceId,
      )
    ) {
      return false;
    }

    return true;
  }

  evaluateScheduledDowngrade(
    subscription: StripeSubscription | null | undefined,
    options?: {
      expectedSubscriptionId?: string;
      currentPriceId?: string;
      targetPriceId?: string;
      targetPlanName?: string;
      targetTier?: 'starter' | 'basic' | 'advanced' | null;
      expectedRenewalTimestamp?: number;
      nowSeconds?: number;
    },
  ): ScheduledDowngradeVerification {
    if (!subscription || typeof subscription !== 'object') {
      return 'unverified';
    }

    const subId =
      typeof subscription.subscriptionId === 'string' ? subscription.subscriptionId.trim() : '';
    if (!subId) {
      return 'unverified';
    }
    if (options?.expectedSubscriptionId && subId !== options.expectedSubscriptionId) {
      return 'unverified';
    }

    if (!['active', 'trialing'].includes(subscription.status)) {
      return 'unverified';
    }

    const currentPriceId =
      typeof subscription.plan?.priceId === 'string' ? subscription.plan.priceId.trim() : '';
    if (!currentPriceId) {
      return 'unverified';
    }
    if (options?.currentPriceId && currentPriceId !== options.currentPriceId) {
      return 'unverified';
    }

    if (options?.targetPriceId && options.targetPriceId === currentPriceId) {
      return 'unverified';
    }

    const renewalTimestamp = options?.expectedRenewalTimestamp ?? subscription.currentPeriodEnd;
    if (
      options?.targetPriceId &&
      this.hasVerifiedRenewalSchedule(
        subscription.schedule,
        options.targetPriceId,
        renewalTimestamp,
      )
    ) {
      if (
        typeof subscription.pendingScheduleId === 'string' &&
        subscription.pendingScheduleId.trim().length > 0 &&
        typeof subscription.schedule?.id === 'string' &&
        subscription.schedule.id.trim().length > 0 &&
        subscription.pendingScheduleId.trim() !== subscription.schedule.id.trim()
      ) {
        return 'unverified';
      }
      if (
        subscription.pendingPeriodEnd !== undefined &&
        subscription.pendingPeriodEnd !== null &&
        subscription.pendingPeriodEnd !== renewalTimestamp
      ) {
        return 'unverified';
      }
      if (
        typeof subscription.pendingPlanName === 'string' &&
        subscription.pendingPlanName.trim().length > 0 &&
        (options.targetPlanName !== undefined || options.targetTier !== undefined)
      ) {
        const pTier = this.tierFromProductName(subscription.pendingPlanName);
        const tTier = options.targetTier ?? this.tierFromProductName(options.targetPlanName);
        if (!pTier || !tTier || pTier !== tTier) {
          return 'unverified';
        }
      }
      return 'verified_schedule';
    }

    if (this.hasLookupReportedScheduledChange(subscription, options)) {
      return 'reported_by_lookup';
    }

    return 'unverified';
  }

  normalizePlanChangeResponse(
    raw: any,
    isUpgrade: boolean,
    subscriptionId: string,
    newPriceId: string,
    newPlanName: string,
    currentPeriodEnd: number,
  ): PlanChangeResult {
    const body = raw?.change_result ?? raw?.extract_result ?? raw?.result ?? raw?.data ?? raw;
    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      return { status: 'unverified' };
    }

    if (body?.stripeError || body?.error || body?.status === 'failed') {
      return {
        status: 'failed',
        message:
          typeof body?.error === 'string'
            ? body.error
            : (body?.error?.message ?? body?.stripeError ?? body?.message),
      };
    }

    const piStatus =
      body?.paymentIntentStatus ??
      body?.latest_invoice?.payment_intent?.status ??
      body?.payment_intent?.status ??
      null;
    const clientSecret =
      body?.clientSecret ??
      body?.latest_invoice?.payment_intent?.client_secret ??
      body?.payment_intent?.client_secret ??
      null;

    if (
      body?.status === 'requires_action' ||
      body?.requiresAction === true ||
      piStatus === 'requires_action'
    ) {
      return {
        status: 'requires_action',
        clientSecret,
        paymentIntentStatus: 'requires_action',
        message: body?.message,
      };
    }

    const subStatus =
      body?.subscriptionStatus ?? body?.subscription?.status ?? body?.status ?? null;
    const invStatus =
      body?.invoiceStatus ?? body?.latestInvoiceStatus ?? body?.latest_invoice?.status ?? null;
    const pendingUpdate =
      body?.pendingUpdate ?? body?.pending_update ?? body?.subscription?.pending_update ?? null;

    if (
      subStatus === 'pending_payment' ||
      subStatus === 'incomplete' ||
      subStatus === 'incomplete_expired' ||
      subStatus === 'past_due' ||
      subStatus === 'unpaid' ||
      body?.paymentPending === true ||
      Boolean(pendingUpdate) ||
      piStatus === 'processing' ||
      piStatus === 'requires_payment_method' ||
      piStatus === 'requires_confirmation' ||
      piStatus === 'canceled' ||
      (isUpgrade && invStatus && invStatus !== 'paid' && piStatus !== 'succeeded')
    ) {
      return {
        status: 'pending_payment',
        clientSecret,
        paymentIntentStatus: piStatus,
        message: body?.message,
      };
    }

    if (!isUpgrade) {
      const scheduleCandidate: StripeSubscriptionSchedule | null =
        body?.schedule ??
        (body?.object === 'subscription_schedule' || Array.isArray(body?.phases) || body?.nextPhase
          ? body
          : null);
      if (this.hasVerifiedRenewalSchedule(scheduleCandidate, newPriceId, currentPeriodEnd)) {
        return {
          status: 'scheduled',
          scheduleId:
            scheduleCandidate?.id ??
            body?.scheduleId ??
            body?.pendingScheduleId ??
            (typeof body?.id === 'string' && body.id.startsWith('sub_sched_') ? body.id : null),
          priceId: newPriceId,
          pendingPlanName: body?.pendingPlanName ?? newPlanName,
          pendingPeriodEnd: currentPeriodEnd,
        };
      }
      return { status: 'unverified' };
    }

    const observedPriceId =
      body?.priceId ??
      body?.plan?.priceId ??
      body?.subscription?.plan?.priceId ??
      body?.items?.data?.[0]?.price?.id ??
      body?.subscription?.items?.data?.[0]?.price?.id ??
      null;
    const isSubActive = subStatus === 'active' || subStatus === 'trialing';
    const isPaymentConfirmed =
      piStatus === 'succeeded' ||
      invStatus === 'paid' ||
      body?.paymentVerified === true ||
      (body?.status === 'confirmed' && !invStatus && !piStatus);

    if (observedPriceId === newPriceId && isSubActive && isPaymentConfirmed) {
      return {
        status: 'confirmed',
        subscriptionId:
          body?.subscriptionId ??
          body?.subscription?.id ??
          (typeof body?.id === 'string' && body.id.startsWith('sub_') ? body.id : subscriptionId),
        priceId: newPriceId,
        planName: body?.planName ?? newPlanName,
      };
    }

    return { status: 'unverified' };
  }

  async releaseSchedule(scheduleId: string): Promise<void> {
    const flowId = runtimeConfig.stripeReleaseScheduleFlow;
    if (!flowId) {
      throw new Error('Release schedule flow is not configured.');
    }
    await this.flowPost(flowId, { scheduleId });
  }

  async getBillingHistory(): Promise<BillingHistoryItem[]> {
    const flowId = runtimeConfig.stripeGetBillingHistoryFlow;
    if (!flowId) {
      return [];
    }
    const res = await this.flowPost(flowId, {});
    return res?.history ?? [];
  }

  async getSavedPaymentMethods(): Promise<SavedPaymentMethod[]> {
    const flowId = runtimeConfig.stripeGetPaymentMethodsFlow;
    if (!flowId) {
      return [];
    }
    try {
      const result = await this.loadSavedPaymentMethods();
      return result.paymentMethods;
    } catch {
      return [];
    }
  }

  async loadSavedPaymentMethods(): Promise<SavedPaymentMethodsResult> {
    const flowId = runtimeConfig.stripeGetPaymentMethodsFlow;
    if (!flowId) {
      throw new Error('Get payment methods flow is not configured.');
    }
    const res = await this.flowPost(flowId, {});
    const body = res?.data ?? res ?? {};
    const rawMethods = Array.isArray(body?.paymentMethods) ? body.paymentMethods : [];

    const hasExplicitDefaultField =
      Boolean(body && typeof body === 'object') &&
      ('defaultPaymentMethodId' in body ||
        'renewalPaymentMethodId' in body ||
        'subscriptionDefaultPaymentMethodId' in body ||
        'customerDefaultPaymentMethodId' in body);

    const rawDefaultId =
      body?.defaultPaymentMethodId ??
      body?.renewalPaymentMethodId ??
      body?.subscriptionDefaultPaymentMethodId ??
      body?.customerDefaultPaymentMethodId ??
      null;

    const itemLevelDefault = rawMethods.find(
      (pm: any) => pm && (pm.isRenewalCard === true || pm.isDefault === true),
    );

    const hasItemExplicitFlag = rawMethods.some(
      (pm: any) =>
        pm &&
        (typeof pm.isRenewalCard === 'boolean' || typeof pm.isDefault === 'boolean'),
    );

    const defaultVerified = hasExplicitDefaultField || hasItemExplicitFlag;
    const verifiedDefaultId: string | null = defaultVerified
      ? typeof rawDefaultId === 'string' && rawDefaultId.trim().startsWith('pm_')
        ? rawDefaultId.trim()
        : typeof itemLevelDefault?.id === 'string' && itemLevelDefault.id.trim().startsWith('pm_')
          ? itemLevelDefault.id.trim()
          : null
      : null;

    const paymentMethods: SavedPaymentMethod[] = rawMethods
      .filter((pm: any) => pm && typeof pm.id === 'string' && pm.id.trim().length > 0)
      .map((pm: any) => {
        const id = pm.id.trim();
        const isRenewalCard =
          defaultVerified && verifiedDefaultId !== null && id === verifiedDefaultId;
        return {
          id,
          brand: String(pm.brand || 'card'),
          last4: String(pm.last4 || '****'),
          expMonth: Number(pm.expMonth) || 0,
          expYear: Number(pm.expYear) || 0,
          ...(defaultVerified ? { isRenewalCard } : {}),
        };
      });

    return {
      paymentMethods,
      defaultPaymentMethodId: verifiedDefaultId,
      defaultVerified,
    };
  }

  private inFlightCardSetupIntent: Promise<CardSetupIntentResult> | null = null;

  async createCardSetupIntent(): Promise<CardSetupIntentResult> {
    const flowId = runtimeConfig.stripeCreateSetupIntentFlow;
    if (!flowId) {
      throw new Error('Card setup flow is not configured.');
    }
    if (this.inFlightCardSetupIntent) {
      return this.inFlightCardSetupIntent;
    }

    const execution = (async (): Promise<CardSetupIntentResult> => {
      // Server resolves authenticated user and Stripe customer from $accountability.user.
      const res = await this.flowPost(flowId, {});
      const body = res?.data ?? res?.format_setup_intent ?? res;
      if (body?.error === true || body?.stripeError) {
        throw new Error(body?.message || body?.stripeError || 'Could not start card setup.');
      }
      const clientSecret =
        typeof body?.clientSecret === 'string'
          ? body.clientSecret.trim()
          : typeof body?.client_secret === 'string'
            ? body.client_secret.trim()
            : '';
      if (!clientSecret || !clientSecret.startsWith('seti_')) {
        throw new Error('Invalid SetupIntent response from server.');
      }
      const rawSetupId =
        typeof body?.setupIntentId === 'string' && body.setupIntentId.trim().startsWith('seti_')
          ? body.setupIntentId.trim()
          : typeof body?.id === 'string' && body.id.trim().startsWith('seti_')
            ? body.id.trim()
            : clientSecret.split('_secret_')[0];
      if (!rawSetupId || !rawSetupId.startsWith('seti_')) {
        throw new Error('Invalid SetupIntent identifier from server.');
      }
      return {
        setupIntentId: rawSetupId,
        clientSecret,
      };
    })();

    this.inFlightCardSetupIntent = execution;
    try {
      return await execution;
    } finally {
      this.inFlightCardSetupIntent = null;
    }
  }

  private inFlightFinalizeSetup = new Map<string, Promise<FinalizeCardSetupResult>>();

  async finalizeCardSetup(setupIntentId: string): Promise<FinalizeCardSetupResult> {
    const cleanId = typeof setupIntentId === 'string' ? setupIntentId.trim() : '';
    if (!cleanId || !cleanId.startsWith('seti_')) {
      throw new Error('A valid SetupIntent identifier is required.');
    }
    const flowId = runtimeConfig.stripeFinalizeSetupIntentFlow;
    if (!flowId) {
      throw new Error('Finalize card setup flow is not configured.');
    }

    const existing = this.inFlightFinalizeSetup.get(cleanId);
    if (existing) {
      return existing;
    }

    const execution = (async (): Promise<FinalizeCardSetupResult> => {
      const res = await this.flowPost(flowId, { setupIntentId: cleanId });
      const body = res?.data ?? res?.verify_setup ?? res;
      const status = body?.status ?? body?.setupIntent?.status ?? null;
      const isVerified =
        body?.error !== true &&
        (body?.verified === true || status === 'succeeded') &&
        status !== 'requires_payment_method' &&
        status !== 'requires_action' &&
        status !== 'requires_confirmation' &&
        status !== 'canceled';

      const rawPm = body?.paymentMethod ?? body?.payment_method ?? null;
      const paymentMethodId =
        typeof body?.paymentMethodId === 'string' && body.paymentMethodId.trim().startsWith('pm_')
          ? body.paymentMethodId.trim()
          : typeof rawPm?.id === 'string' && rawPm.id.trim().startsWith('pm_')
            ? rawPm.id.trim()
            : typeof rawPm === 'string' && rawPm.trim().startsWith('pm_')
              ? rawPm.trim()
              : '';

      if (!isVerified || !paymentMethodId) {
        const err: any = new Error(body?.message || 'Card setup could not be verified.');
        if (body?.code) err.code = body.code;
        throw err;
      }

      let paymentMethod: SavedPaymentMethod | undefined;
      if (rawPm && typeof rawPm === 'object' && typeof rawPm.id === 'string') {
        const cardObj = rawPm.card ?? rawPm;
        paymentMethod = {
          id: paymentMethodId,
          brand: String(cardObj.brand || 'card'),
          last4: String(cardObj.last4 || '****'),
          expMonth: Number(cardObj.expMonth ?? cardObj.exp_month) || 0,
          expYear: Number(cardObj.expYear ?? cardObj.exp_year) || 0,
        };
      }

      return {
        verified: true,
        setupIntentId: cleanId,
        paymentMethodId,
        ...(paymentMethod ? { paymentMethod } : {}),
      };
    })();

    this.inFlightFinalizeSetup.set(cleanId, execution);
    try {
      return await execution;
    } finally {
      this.inFlightFinalizeSetup.delete(cleanId);
    }
  }

  private inFlightSetDefault = new Map<string, Promise<SetDefaultPaymentMethodResult>>();

  async setDefaultPaymentMethod(
    paymentMethodId: string,
    subscriptionId?: string | null,
  ): Promise<SetDefaultPaymentMethodResult> {
    const cleanPmId = typeof paymentMethodId === 'string' ? paymentMethodId.trim() : '';
    if (!cleanPmId || !cleanPmId.startsWith('pm_')) {
      throw new Error('A valid payment method identifier is required.');
    }
    const flowId = runtimeConfig.stripeSetDefaultPaymentMethodFlow;
    if (!flowId) {
      throw new Error('Set default payment method flow is not configured.');
    }
    const cleanSubId =
      typeof subscriptionId === 'string' && subscriptionId.trim().startsWith('sub_')
        ? subscriptionId.trim()
        : null;
    const lockKey = `${cleanPmId}:${cleanSubId ?? ''}`;
    const existing = this.inFlightSetDefault.get(lockKey);
    if (existing) {
      return existing;
    }

    const payload: Record<string, string> = { paymentMethodId: cleanPmId };
    if (cleanSubId) {
      payload['subscriptionId'] = cleanSubId;
    }

    const execution = (async (): Promise<SetDefaultPaymentMethodResult> => {
      const res = await this.flowPost(flowId, payload);
      const body = res?.data ?? res?.format_response ?? res;
      const returnedDefaultId =
        body?.defaultPaymentMethodId ??
        body?.paymentMethodId ??
        body?.invoice_settings?.default_payment_method ??
        null;

      const customerDefaultUpdated = body?.customerDefaultUpdated !== false;
      const subscriptionDefaultUpdated = cleanSubId
        ? body?.subscriptionDefaultUpdated !== false
        : Boolean(body?.subscriptionDefaultUpdated ?? true);

      if (
        body?.error === true ||
        body?.updated === false ||
        !customerDefaultUpdated ||
        (cleanSubId && !subscriptionDefaultUpdated) ||
        (returnedDefaultId && returnedDefaultId !== cleanPmId)
      ) {
        const err: any = new Error(body?.message || 'Could not update renewal card.');
        if (body?.code) err.code = body.code;
        throw err;
      }

      return {
        updated: true,
        defaultPaymentMethodId: cleanPmId,
        customerDefaultUpdated,
        subscriptionDefaultUpdated,
        subscriptionId: body?.subscriptionId ?? cleanSubId,
      };
    })();

    this.inFlightSetDefault.set(lockKey, execution);
    try {
      return await execution;
    } finally {
      this.inFlightSetDefault.delete(lockKey);
    }
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    const flowId = runtimeConfig.stripeDetachPaymentMethodFlow;
    if (!flowId) {
      throw new Error('Detach payment method flow is not configured.');
    }
    const res = await this.flowPost(flowId, { paymentMethodId });
    const body = res?.data ?? res;
    if (body?.error === true || body?.detached === false) {
      const err: any = new Error(body?.message || 'Could not remove payment method.');
      if (body?.code) err.code = body.code;
      throw err;
    }
  }

  async setProviderTier(tier: 'starter' | 'basic' | 'advanced' | null): Promise<void> {
    const flowId = runtimeConfig.setProviderTierFlow;
    if (!flowId) return;
    await this.flowPost(flowId, { tier });
  }

  async getExtraPosts(): Promise<number> {
    const flowId = runtimeConfig.providerGetQuotaFlow;
    if (!flowId) return 0;
    try {
      const res = await this.flowPost(flowId, {});
      return res?.extra_posts ?? 0;
    } catch {
      return 0;
    }
  }

  tierFromProductName(productName: string | null | undefined): 'starter' | 'basic' | 'advanced' | null {
    const n = (productName ?? '').trim().toLowerCase();
    if (!n) return null;
    const matches: Array<'starter' | 'basic' | 'advanced'> = [];
    if (/\b(advanced|avanzado)\b/.test(n)) matches.push('advanced');
    if (/\b(basic|b[aá]sico)\b/.test(n)) matches.push('basic');
    if (/\b(starter|inicial)\b/.test(n)) matches.push('starter');
    return matches.length === 1 ? matches[0] : null;
  }

  /**
   * Returns translation key for a Stripe product name.
   * Starter/Basic/Advanced map to existing EN/ES plan keys ('PAYMENT.PLANS.*.TITLE').
   * Unknown names pass through unchanged.
   * Null/undefined or empty string produce an empty string.
   * Never defaults an unknown name to Starter.
   */
  planTitleKey(productName: string | null | undefined): string {
    if (!productName || !productName.trim()) return '';
    const tier = this.tierFromProductName(productName);
    if (tier === 'starter') return 'PAYMENT.PLANS.STARTER.TITLE';
    if (tier === 'basic') return 'PAYMENT.PLANS.BASIC.TITLE';
    if (tier === 'advanced') return 'PAYMENT.PLANS.ADVANCED.TITLE';
    return productName;
  }

  /**
   * Returns localized plan display title.
   * Tracks reactive language signal so language changes update displayed names.
   * Unknown names pass through unchanged; null/undefined produce an empty string.
   */
  getPlanTitle(productName: string | null | undefined): string {
    this.i18n.lang();
    if (!productName || !productName.trim()) return '';
    const key = this.planTitleKey(productName);
    return this.i18n.t(key);
  }

  formatPrice(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'usd').toUpperCase(),
      minimumFractionDigits: 0,
    }).format(amount / 100);
  }

  formatExactPrice(amount: number, currency: string): string {
    const safeAmount = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'usd').toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount / 100);
  }

  cleanup(): void {
    this.activeElements = null;
  }

  cleanupCardSetup(): void {
    if (this.cardSetupPaymentElement) {
      try {
        if (typeof this.cardSetupPaymentElement.destroy === 'function') {
          this.cardSetupPaymentElement.destroy();
        } else if (typeof this.cardSetupPaymentElement.unmount === 'function') {
          this.cardSetupPaymentElement.unmount();
        }
      } catch {
        // Ignore unmount errors when container is already removed
      }
    }
    this.cardSetupPaymentElement = null;
    this.cardSetupElements = null;
  }
}

