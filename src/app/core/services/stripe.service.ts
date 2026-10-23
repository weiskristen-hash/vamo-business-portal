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
  | 'entered_not_applied'
  | 'validating'
  | 'verified_applied'
  | 'invalid_or_ineligible'
  | 'expired_or_changed'
  | 'verification_unavailable'
  | 'changed_after_init';

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
  productId?: string | null;
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
  isEstimated?: boolean;
  amountSource?: 'client_estimate' | 'server_invoice_preview' | 'unavailable';
  eligibilityVerified?: boolean;
  serverAuthenticatedReference?: boolean;
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
  setupIntentId?: string | null;
  paymentIntentId?: string | null;
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
  | 'UNEXPECTED_PRE_VERIFICATION_CHARGE'
  | 'MISSING_INVOICE_VERIFICATION';

export class CheckoutChargeProtectionError extends Error {
  readonly code: CheckoutProtectionErrorCode;
  readonly approvedAmount?: number | null;
  readonly actualAmount?: number | null;
  readonly currency?: string | null;
  readonly subscriptionId?: string | null;
  readonly existingSubscription?: StripeSubscription | null;

  constructor(
    code: CheckoutProtectionErrorCode,
    message: string,
    details?: {
      approvedAmount?: number | null;
      actualAmount?: number | null;
      currency?: string | null;
      subscriptionId?: string | null;
      existingSubscription?: StripeSubscription | null;
    },
  ) {
    super(message);
    this.name = 'CheckoutChargeProtectionError';
    this.code = code;
    this.approvedAmount = details?.approvedAmount ?? null;
    this.actualAmount = details?.actualAmount ?? null;
    this.currency = details?.currency ?? null;
    this.subscriptionId = details?.subscriptionId ?? null;
    this.existingSubscription = details?.existingSubscription ?? null;
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

interface VerifiedPreviewSnapshot {
  priceId: string;
  subtotal: number;
  discountAmount: number;
  amountDueToday: number;
  currency: string;
  promoCode: string | null;
  promoCodeId: string | null;
  couponDuration: CouponDurationType | null;
  couponDurationInMonths: number | null;
  expiresAt: number;
  isEstimated: boolean;
  amountSource: 'client_estimate' | 'server_invoice_preview';
  eligibilityVerified: boolean;
  serverAuthenticatedReference: boolean;
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
  private inFlightSetupSubscriptions = new Map<string, Promise<{ subscriptionId: string }>>();
  private completedSetupSubscriptions = new Map<string, { subscriptionId: string }>();
  private uncertainSubscriptionCreationEmails = new Set<string>();
  private uncertainSetupIntentIds = new Map<string, string>();
  private verifiedPreviewsByRef = new Map<string, VerifiedPreviewSnapshot>();

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
        couponState: 'not_applied',
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

      if (!runtimeConfig.directusUrl || !runtimeConfig.stripeCreateSubscriptionFlow) {
        return this.buildUnavailablePreviewResult(request, cleanPromoCode, 'DIRECTUS_FLOW_UNCONFIGURED');
      }

      // Resolve authoritative plan pricing from the selected plan (or STRIPE_GET_PRICES_FLOW if not provided)
      let resolvedSubtotal = defaultSubtotal;
      let resolvedCurrency = defaultCurrency;
      let resolvedInterval = defaultInterval;
      let resolvedPlanName = defaultPlanName;

      if (resolvedSubtotal <= 0 && runtimeConfig.stripeGetPricesFlow) {
        try {
          const plans = await this.getPlans();
          const matchedPlan = plans.find((p) => p.id === cleanPriceId);
          if (matchedPlan && matchedPlan.amount > 0) {
            resolvedSubtotal = matchedPlan.amount;
            resolvedCurrency = (matchedPlan.currency || defaultCurrency).toLowerCase();
            resolvedInterval = matchedPlan.interval || defaultInterval;
            resolvedPlanName = matchedPlan.name || defaultPlanName;
          }
        } catch {
          return this.buildUnavailablePreviewResult(request, cleanPromoCode, 'PLAN_PRICING_UNAVAILABLE');
        }
      }

      if (resolvedSubtotal <= 0) {
        return this.buildUnavailablePreviewResult(request, cleanPromoCode, 'PLAN_PRICING_UNAVAILABLE');
      }

      const enrichedRequest: CheckoutPreviewRequest = {
        ...request,
        planAmount: resolvedSubtotal,
        planCurrency: resolvedCurrency,
        planInterval: resolvedInterval,
        planName: resolvedPlanName,
      };

      // Case A: Standard checkout without promotion code (client-side plan total prior to Stripe PaymentIntent creation)
      if (!cleanPromoCode) {
        const expiresAt = Date.now() + 10 * 60 * 1000;
        const verificationRef = `dref_${cleanPriceId}_nopromo_${resolvedSubtotal}_${resolvedCurrency}_${expiresAt}`;
        this.verifiedPreviewsByRef.set(verificationRef, {
          priceId: cleanPriceId,
          subtotal: resolvedSubtotal,
          discountAmount: 0,
          amountDueToday: resolvedSubtotal,
          currency: resolvedCurrency,
          promoCode: null,
          promoCodeId: null,
          couponDuration: null,
          couponDurationInMonths: null,
          expiresAt,
          isEstimated: true,
          amountSource: 'client_estimate',
          eligibilityVerified: true,
          serverAuthenticatedReference: false,
        });

        this.auditService.record('amount_displayed_for_approval', {
          priceId: cleanPriceId,
          promotionCode: null,
          promotionCodeId: null,
          verificationReference: verificationRef,
          currency: resolvedCurrency,
          approvedAmount: resolvedSubtotal,
          discountAmount: 0,
          customerRef: request.customerRef ?? null,
          businessRef: request.businessRef ?? null,
          reason: 'CLIENT_ESTIMATED_PRE_CHECKOUT_TOTAL',
        });

        return {
          verified: true,
          verificationStatus: 'verified',
          couponState: 'not_applied',
          verificationReference: verificationRef,
          priceId: cleanPriceId,
          planName: resolvedPlanName,
          interval: resolvedInterval,
          currency: resolvedCurrency,
          subtotal: resolvedSubtotal,
          discountAmount: 0,
          tax: 0,
          amountDueToday: resolvedSubtotal,
          renewalAmount: resolvedSubtotal,
          renewalInterval: resolvedInterval,
          promoCode: null,
          promoCodeId: null,
          promoCodeName: null,
          couponDuration: null,
          couponDurationInMonths: null,
          expiresAt,
          isEstimated: true,
          amountSource: 'client_estimate',
          eligibilityVerified: true,
          serverAuthenticatedReference: false,
          errorCode: null,
          message: null,
        };
      }

      // Case B: Promotion code provided -> Validate through shared Directus STRIPE_VALIDATE_PROMO_FLOW (3b580ce9...)
      const promoFlowId = runtimeConfig.stripeValidatePromoFlow;
      if (!promoFlowId) {
        return this.buildUnavailablePreviewResult(enrichedRequest, cleanPromoCode, 'PROMO_FLOW_UNCONFIGURED');
      }

      try {
        const raw = await this.flowPost(promoFlowId, { code: cleanPromoCode });
        return this.normalizeCheckoutPreviewResponse(raw, enrichedRequest, cleanPromoCode);
      } catch {
        this.auditService.record('promotion_validation_failed', {
          priceId: cleanPriceId,
          promotionCode: cleanPromoCode,
          customerRef: request.customerRef ?? null,
          businessRef: request.businessRef ?? null,
          errorCode: 'PREVIEW_REQUEST_FAILED',
          reason: 'PREVIEW_REQUEST_FAILED',
        });
        return this.buildUnavailablePreviewResult(enrichedRequest, cleanPromoCode, 'PREVIEW_REQUEST_FAILED');
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
      isEstimated: false,
      amountSource: 'unavailable',
      eligibilityVerified: false,
      serverAuthenticatedReference: false,
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
      raw?.extract_promo ??
      raw?.preview_result ??
      raw?.checkout_preview ??
      raw?.extract_preview ??
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

    // Check plan/currency/minimum-amount/redemption/customer restrictions if present in response.
    // Missing eligibility inputs (such as missing request.productId when appliesToProducts is present)
    // must never be treated as proof that restrictions are satisfied.
    let restrictionViolationCode: string | null = null;
    if (Boolean(cleanPromoCode)) {
      const minAmount =
        typeof body.minimumAmount === 'number'
          ? body.minimumAmount
          : typeof body.restrictions?.minimum_amount === 'number'
            ? body.restrictions.minimum_amount
            : null;
      const minAmountCurrency =
        body.minimumAmountCurrency ?? body.restrictions?.minimum_amount_currency ?? null;
      const applicablePriceIds = Array.isArray(body.applicablePriceIds)
        ? body.applicablePriceIds
        : Array.isArray(body.restrictions?.applicablePriceIds)
          ? body.restrictions.applicablePriceIds
          : null;
      const appliesToProducts = Array.isArray(body.appliesToProducts)
        ? body.appliesToProducts
        : Array.isArray(body.applies_to?.products)
          ? body.applies_to.products
          : Array.isArray(body.coupon?.applies_to?.products)
            ? body.coupon.applies_to.products
            : null;
      const restrictedCustomer =
        typeof body.customer === 'string' && body.customer.trim()
          ? body.customer.trim()
          : typeof body.restrictions?.customer === 'string' && body.restrictions.customer.trim()
            ? body.restrictions.customer.trim()
            : null;
      const requiresFirstTime =
        body.firstTimeTransaction === true || body.restrictions?.first_time_transaction === true;

      if (
        minAmount !== null &&
        Number.isFinite(minAmount) &&
        minAmount > 0 &&
        (defaultSubtotal < minAmount ||
          (typeof minAmountCurrency === 'string' &&
            minAmountCurrency.trim() &&
            minAmountCurrency.trim().toLowerCase() !== defaultCurrency))
      ) {
        restrictionViolationCode = 'MINIMUM_AMOUNT_NOT_MET';
      } else if (applicablePriceIds && applicablePriceIds.length > 0 && !applicablePriceIds.includes(cleanPriceId)) {
        restrictionViolationCode = 'PRODUCT_RESTRICTION_MISMATCH';
      } else if (
        appliesToProducts &&
        appliesToProducts.length > 0 &&
        (!request.productId || !appliesToProducts.includes(request.productId))
      ) {
        restrictionViolationCode = 'PRODUCT_RESTRICTION_MISMATCH';
      } else if (
        typeof body.amountOff === 'number' &&
        body.amountOff > 0 &&
        typeof body.currency === 'string' &&
        body.currency.trim().toLowerCase() !== defaultCurrency
      ) {
        restrictionViolationCode = 'PRODUCT_RESTRICTION_MISMATCH';
      } else if (
        typeof body.maxRedemptions === 'number' &&
        typeof body.timesRedeemed === 'number' &&
        body.timesRedeemed >= body.maxRedemptions
      ) {
        restrictionViolationCode = 'MAX_REDEMPTIONS_REACHED';
      } else if (body.expired === true || body.active === false) {
        restrictionViolationCode = 'COUPON_EXPIRED';
      } else if (restrictedCustomer && (!request.customerRef || restrictedCustomer !== request.customerRef)) {
        restrictionViolationCode = 'COUPON_INELIGIBLE';
      } else if (requiresFirstTime && body.firstTimeTransactionEligible !== true) {
        restrictionViolationCode = 'FIRST_TIME_CUSTOMER_ONLY';
      } else if (body.eligible === false || body.firstTimeTransactionEligible === false) {
        restrictionViolationCode = 'COUPON_INELIGIBLE';
      }
    }

    const effectiveErrorCode = restrictionViolationCode ?? rawErrorCode;

    // Case 1: Promotion code was submitted and rejected as invalid or ineligible
    const isExplicitlyInvalidPromo =
      Boolean(cleanPromoCode) &&
      (body.couponState === 'invalid_or_ineligible' ||
        body.valid === false ||
        body.promoValid === false ||
        body.couponValid === false ||
        restrictionViolationCode !== null ||
        (effectiveErrorCode !== null &&
          (effectiveErrorCode.startsWith('PROMO_') ||
            effectiveErrorCode.startsWith('PROMOTION_') ||
            effectiveErrorCode === 'STRIPE_PREVIEW_REJECTED_PROMOTION' ||
            effectiveErrorCode === 'COUPON_MISSING' ||
            effectiveErrorCode === 'COUPON_INVALID' ||
            effectiveErrorCode === 'COUPON_INELIGIBLE' ||
            effectiveErrorCode === 'COUPON_EXPIRED' ||
            effectiveErrorCode === 'MAX_REDEMPTIONS_REACHED' ||
            effectiveErrorCode === 'MINIMUM_AMOUNT_NOT_MET' ||
            effectiveErrorCode === 'FIRST_TIME_CUSTOMER_ONLY' ||
            effectiveErrorCode === 'PRODUCT_RESTRICTION_MISMATCH')));

    if (isExplicitlyInvalidPromo) {
      this.auditService.record('promotion_validation_failed', {
        priceId: cleanPriceId,
        promotionCode: cleanPromoCode,
        promotionCodeId: body.promoCodeId ?? body.promotionCodeId ?? null,
        customerRef: request.customerRef ?? null,
        businessRef: request.businessRef ?? null,
        errorCode: effectiveErrorCode || 'PROMO_INVALID_OR_INELIGIBLE',
        reason: effectiveErrorCode || body.error || body.message || 'INVALID_OR_INELIGIBLE_PROMO',
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
        isEstimated: false,
        amountSource: 'unavailable',
        eligibilityVerified: false,
        serverAuthenticatedReference: false,
        errorCode: effectiveErrorCode || 'PROMO_INVALID_OR_INELIGIBLE',
        message: typeof (body.error ?? body.message) === 'string' ? (body.error ?? body.message) : null,
      };
    }

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

    const invoiceObj = body.invoicePreview ?? body.invoice ?? body;
    const returnedPriceId =
      typeof body.priceId === 'string' && body.priceId.trim()
        ? body.priceId.trim()
        : typeof body.price_id === 'string' && body.price_id.trim()
          ? body.price_id.trim()
          : typeof invoiceObj?.lines?.data?.[0]?.price?.id === 'string'
            ? invoiceObj.lines.data[0].price.id.trim()
            : cleanPriceId;

    const rawSubtotal =
      typeof (body.subtotal ?? invoiceObj?.subtotal) === 'number' &&
      Number.isFinite(body.subtotal ?? invoiceObj?.subtotal) &&
      (body.subtotal ?? invoiceObj?.subtotal) > 0
        ? (body.subtotal ?? invoiceObj?.subtotal)
        : defaultSubtotal;

    const rawTax =
      typeof (body.tax ?? invoiceObj?.tax) === 'number' &&
      Number.isFinite(body.tax ?? invoiceObj?.tax) &&
      (body.tax ?? invoiceObj?.tax) >= 0
        ? (body.tax ?? invoiceObj?.tax)
        : 0;

    const percentOff =
      typeof body.percentOff === 'number' &&
      Number.isFinite(body.percentOff) &&
      body.percentOff > 0 &&
      body.percentOff <= 100
        ? body.percentOff
        : null;
    const amountOff =
      typeof body.amountOff === 'number' &&
      Number.isFinite(body.amountOff) &&
      body.amountOff > 0
        ? Math.round(body.amountOff)
        : null;

    let computedDiscount: number | undefined;
    if (percentOff !== null && rawSubtotal > 0) {
      computedDiscount =
        percentOff >= 100
          ? rawSubtotal
          : Math.min(rawSubtotal, Math.round(rawSubtotal * (percentOff / 100)));
    } else if (amountOff !== null && rawSubtotal > 0) {
      computedDiscount = Math.min(rawSubtotal, amountOff);
    }

    const explicitDiscount =
      body.discountAmount ??
      body.discount_amount ??
      invoiceObj?.total_discount_amounts?.[0]?.amount;

    const rawDiscount =
      typeof explicitDiscount === 'number' && Number.isFinite(explicitDiscount) && explicitDiscount >= 0
        ? explicitDiscount
        : computedDiscount;

    const explicitAmountDue =
      body.amountDueToday ??
      body.amount_due_today ??
      body.amountDue ??
      invoiceObj?.amount_due;

    const rawAmountDue =
      typeof explicitAmountDue === 'number' && Number.isFinite(explicitAmountDue) && explicitAmountDue >= 0
        ? explicitAmountDue
        : typeof rawDiscount === 'number' && rawSubtotal > 0
          ? Math.max(0, rawSubtotal - rawDiscount + rawTax)
          : undefined;

    const serverProvidedRef =
      typeof body.verificationReference === 'string' && body.verificationReference.trim()
        ? body.verificationReference.trim()
        : typeof body.verificationId === 'string' && body.verificationId.trim()
          ? body.verificationId.trim()
          : typeof body.verificationToken === 'string' && body.verificationToken.trim()
            ? body.verificationToken.trim()
            : null;

    const hasExplicitInvoicePreview =
      typeof explicitAmountDue === 'number' &&
      Number.isFinite(explicitAmountDue) &&
      (serverProvidedRef !== null || Boolean(body.invoicePreview));

    const isServerConfirmedPreview = Boolean(hasExplicitInvoicePreview && serverProvidedRef !== null);

    const hasAuthoritativeAmounts =
      typeof rawSubtotal === 'number' &&
      Number.isFinite(rawSubtotal) &&
      rawSubtotal > 0 &&
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
      hasAuthoritativeAmounts &&
      Math.abs(rawAmountDue! - expectedMathAmountDue) <= 1 &&
      (computedDiscount === undefined || Math.abs(rawDiscount! - computedDiscount) <= 1);

    const hasValidDurationMetadata =
      hasExplicitInvoicePreview ||
      (couponDuration !== null &&
        (couponDuration !== 'repeating' || couponDurationInMonths !== null));

    const isPromoVerified =
      !cleanPromoCode ||
      (body.valid !== false &&
        (body.valid === true || hasExplicitInvoicePreview) &&
        Boolean(promoCodeId && promoCodeId.startsWith('promo_')) &&
        hasAuthoritativeAmounts &&
        (rawDiscount! > 0 || rawAmountDue! < rawSubtotal) &&
        hasValidDurationMetadata);

    if (
      body.error === true ||
      body.verified === false ||
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
          errorCode: effectiveErrorCode || 'MISSING_AUTHORITATIVE_DISCOUNT_EVIDENCE',
          reason: 'MISSING_AUTHORITATIVE_INVOICE_PREVIEW',
        });
      }
      return this.buildUnavailablePreviewResult(
        request,
        cleanPromoCode,
        effectiveErrorCode || 'VERIFICATION_UNAVAILABLE',
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

    const verificationRef =
      serverProvidedRef ??
      `dref_${cleanPriceId}_${promoCodeId ?? 'nopromo'}_${rawAmountDue}_${currency}_${expiresAt}`;

    const isEstimated = !isServerConfirmedPreview;
    const amountSource: 'client_estimate' | 'server_invoice_preview' = isServerConfirmedPreview
      ? 'server_invoice_preview'
      : 'client_estimate';
    const eligibilityVerified = !cleanPromoCode || isServerConfirmedPreview || body.eligible === true;

    this.verifiedPreviewsByRef.set(verificationRef, {
      priceId: cleanPriceId,
      subtotal: rawSubtotal,
      discountAmount: rawDiscount!,
      amountDueToday: rawAmountDue!,
      currency,
      promoCode: cleanPromoCode,
      promoCodeId,
      couponDuration: cleanPromoCode ? couponDuration : null,
      couponDurationInMonths: cleanPromoCode ? couponDurationInMonths : null,
      expiresAt,
      isEstimated,
      amountSource,
      eligibilityVerified,
      serverAuthenticatedReference: isServerConfirmedPreview,
    });

    // Renewal disclosure: only populate renewalAmount when authoritative billing data establishes it
    let renewalAmount: number | null = null;
    if (typeof body.renewalAmount === 'number' && Number.isFinite(body.renewalAmount) && body.renewalAmount >= 0) {
      renewalAmount = body.renewalAmount;
    } else if (!cleanPromoCode) {
      renewalAmount = rawSubtotal;
    } else if (couponDuration === 'forever') {
      renewalAmount = rawAmountDue!;
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
        discountAmount: rawDiscount!,
        approvedAmount: rawAmountDue!,
        customerRef: request.customerRef ?? null,
        businessRef: request.businessRef ?? null,
      });
    }

    if (isServerConfirmedPreview) {
      this.auditService.record('invoice_preview_created', {
        priceId: cleanPriceId,
        promotionCode: cleanPromoCode,
        promotionCodeId: promoCodeId,
        verificationReference: verificationRef,
        currency,
        approvedAmount: rawAmountDue!,
        discountAmount: rawDiscount!,
        customerRef: request.customerRef ?? null,
        businessRef: request.businessRef ?? null,
      });
    }

    this.auditService.record('amount_displayed_for_approval', {
      priceId: cleanPriceId,
      promotionCode: cleanPromoCode,
      promotionCodeId: promoCodeId,
      verificationReference: verificationRef,
      currency,
      approvedAmount: rawAmountDue!,
      discountAmount: rawDiscount!,
      customerRef: request.customerRef ?? null,
      businessRef: request.businessRef ?? null,
      reason: isServerConfirmedPreview
        ? 'SERVER_CONFIRMED_INVOICE_PREVIEW'
        : 'CLIENT_ESTIMATED_PRE_CHECKOUT_TOTAL',
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
      discountAmount: rawDiscount!,
      tax: rawTax,
      amountDueToday: rawAmountDue!,
      renewalAmount,
      renewalInterval: interval,
      promoCode: cleanPromoCode,
      promoCodeId,
      promoCodeName: cleanPromoCode ? promoCodeName : null,
      couponDuration: cleanPromoCode ? couponDuration : null,
      couponDurationInMonths: cleanPromoCode ? couponDurationInMonths : null,
      expiresAt,
      isEstimated,
      amountSource,
      eligibilityVerified,
      serverAuthenticatedReference: isServerConfirmedPreview,
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
    const cachedPreview = verificationRef ? this.verifiedPreviewsByRef.get(verificationRef) : undefined;

    // A client-generated verification reference ('dref_...' or 'local_est_...') is never server-authenticated
    // evidence on its own and must match an active in-memory preview snapshot recorded in this session.
    const isClientGeneratedRef =
      verificationRef.startsWith('dref_') || verificationRef.startsWith('local_est_');
    const unrecordedClientRef = isClientGeneratedRef && cachedPreview === undefined;

    const snapshotMismatch =
      cachedPreview !== undefined &&
      (cachedPreview.priceId !== cleanPriceId ||
        (cachedPreview.promoCodeId ?? null) !== (cleanPromoId ?? null) ||
        cachedPreview.amountDueToday !== approvedAmountDue ||
        cachedPreview.currency.toLowerCase() !== approvedCurrency);

    if (
      !verificationRef ||
      unrecordedClientRef ||
      typeof approvedAmountDue !== 'number' ||
      !Number.isFinite(approvedAmountDue) ||
      approvedAmountDue < 0 ||
      !approvedCurrency ||
      snapshotMismatch
    ) {
      this.auditService.record('amount_mismatch_blocked', {
        priceId: cleanPriceId,
        promotionCodeId: cleanPromoId,
        verificationReference: verificationRef || null,
        approvedAmount: Number.isFinite(approvedAmountDue) ? approvedAmountDue : null,
        currency: approvedCurrency || null,
        customerRef: request.customerRef ?? null,
        businessRef: request.businessRef ?? null,
        errorCode: 'UNVERIFIED_CHECKOUT',
        reason: snapshotMismatch
          ? 'PREVIEW_SNAPSHOT_MISMATCH'
          : unrecordedClientRef
            ? 'FORGED_OR_UNRECORDED_CLIENT_REFERENCE'
            : 'UNVERIFIED_CHECKOUT',
      });
      throw new CheckoutChargeProtectionError(
        'UNVERIFIED_CHECKOUT',
        'Checkout price must be verified with Stripe before creating a subscription.',
        { approvedAmount: approvedAmountDue, currency: approvedCurrency },
      );
    }

    if (cleanPromoId && cachedPreview && cachedPreview.subtotal > 0 && approvedAmountDue >= cachedPreview.subtotal) {
      this.auditService.record('amount_mismatch_blocked', {
        priceId: cleanPriceId,
        promotionCodeId: cleanPromoId,
        verificationReference: verificationRef,
        approvedAmount: approvedAmountDue,
        actualAmount: cachedPreview.subtotal,
        currency: approvedCurrency,
        customerRef: request.customerRef ?? null,
        businessRef: request.businessRef ?? null,
        errorCode: 'PROMO_NOT_APPLIED',
        reason: 'PROMO_CODE_DID_NOT_REDUCE_AMOUNT',
      });
      throw new CheckoutChargeProtectionError(
        'PROMO_NOT_APPLIED',
        'Promotion code did not reduce the payable total. Checkout was stopped before collecting payment.',
        { approvedAmount: approvedAmountDue, actualAmount: cachedPreview.subtotal, currency: approvedCurrency },
      );
    }

    const effectiveExpiresAt = request.expiresAt ?? cachedPreview?.expiresAt ?? null;
    if (
      typeof effectiveExpiresAt === 'number' &&
      Number.isFinite(effectiveExpiresAt) &&
      Date.now() > effectiveExpiresAt
    ) {
      this.auditService.record('amount_mismatch_blocked', {
        priceId: cleanPriceId,
        promotionCodeId: cleanPromoId,
        verificationReference: verificationRef,
        approvedAmount: approvedAmountDue,
        currency: approvedCurrency,
        customerRef: request.customerRef ?? null,
        businessRef: request.businessRef ?? null,
        errorCode: 'VERIFICATION_EXPIRED',
        reason: 'VERIFICATION_EXPIRED',
      });
      throw new CheckoutChargeProtectionError(
        'VERIFICATION_EXPIRED',
        'Price verification has expired. Please review the updated total before continuing.',
        { approvedAmount: approvedAmountDue, currency: approvedCurrency },
      );
    }

    // A $0.00 checkout is never valid without a verified promotionCodeId ('promo_...')
    if (approvedAmountDue === 0 && (!cleanPromoId || !cleanPromoId.startsWith('promo_'))) {
      this.auditService.record('amount_mismatch_blocked', {
        priceId: cleanPriceId,
        promotionCodeId: cleanPromoId,
        verificationReference: verificationRef,
        approvedAmount: approvedAmountDue,
        currency: approvedCurrency,
        customerRef: request.customerRef ?? null,
        businessRef: request.businessRef ?? null,
        errorCode: 'PROMO_NOT_APPLIED',
        reason: 'FREE_CHECKOUT_WITHOUT_VERIFIED_PROMO_ID',
      });
      throw new CheckoutChargeProtectionError(
        'PROMO_NOT_APPLIED',
        'A $0.00 checkout requires a verified 100% promotion code.',
        { approvedAmount: approvedAmountDue, currency: approvedCurrency },
      );
    }

    const createSubFlowId = runtimeConfig.stripeCreateSubscriptionFlow;
    if (!createSubFlowId) {
      throw new Error('Subscription creation flow is not configured.');
    }
    if (approvedAmountDue === 0 && !runtimeConfig.stripeCreateSubscriptionFromSetupFlow) {
      throw new Error('Subscription setup completion flow is not configured.');
    }

    const cleanEmail = (request.email ?? '').trim().toLowerCase();
    const lockKey = `${cleanEmail}:${cleanPriceId}:${cleanPromoId ?? 'none'}:${approvedAmountDue}:${verificationRef}`;
    const existing = this.inFlightVerifiedSubscriptions.get(lockKey);
    if (existing) {
      return existing;
    }

    const execution = (async (): Promise<VerifiedCreateSubscriptionResult> => {
      // Section 4: When a prior subscription creation call for this customer had an uncertain outcome,
      // reconcile subscription status via STRIPE_GET_SUBSCRIPTION_FLOW before permitting another creation request.
      if (cleanEmail && this.uncertainSubscriptionCreationEmails.has(cleanEmail)) {
        let existingSub: StripeSubscription | null = null;
        try {
          existingSub = await this.getSubscription(request.email);
        } catch {
          this.auditService.record('amount_mismatch_blocked', {
            priceId: cleanPriceId,
            promotionCodeId: cleanPromoId,
            verificationReference: verificationRef,
            approvedAmount: approvedAmountDue,
            currency: approvedCurrency,
            customerRef: request.customerRef ?? null,
            businessRef: request.businessRef ?? null,
            errorCode: 'UNEXPECTED_PRE_VERIFICATION_CHARGE',
            reason: 'UNCERTAIN_SUBSCRIPTION_OUTCOME_RECONCILIATION_FAILED',
          });
          throw new CheckoutChargeProtectionError(
            'UNEXPECTED_PRE_VERIFICATION_CHARGE',
            'Previous subscription request had an uncertain outcome and current subscription status could not be verified. Duplicate subscription creation was blocked.',
            { approvedAmount: approvedAmountDue, currency: approvedCurrency },
          );
        }

        if (existingSub && existingSub.subscriptionId) {
          this.uncertainSubscriptionCreationEmails.delete(cleanEmail);
          this.auditService.record('amount_mismatch_blocked', {
            priceId: cleanPriceId,
            promotionCodeId: cleanPromoId,
            verificationReference: verificationRef,
            subscriptionId: existingSub.subscriptionId,
            approvedAmount: approvedAmountDue,
            currency: approvedCurrency,
            customerRef: request.customerRef ?? null,
            businessRef: request.businessRef ?? null,
            errorCode: 'UNEXPECTED_PRE_VERIFICATION_CHARGE',
            reason: 'DUPLICATE_SUBSCRIPTION_PREVENTED_AFTER_UNCERTAIN_RESPONSE',
          });
          const dupErr = new CheckoutChargeProtectionError(
            'UNEXPECTED_PRE_VERIFICATION_CHARGE',
            'An active or pending subscription already exists for this account after a previous interrupted request. Duplicate subscription creation was blocked.',
            { approvedAmount: approvedAmountDue, currency: approvedCurrency },
          );
          (dupErr as any).existingSubscription = existingSub;
          throw dupErr;
        }

        this.uncertainSubscriptionCreationEmails.delete(cleanEmail);
      }

      this.auditService.record('subscription_creation_attempted', {
        priceId: cleanPriceId,
        promotionCodeId: cleanPromoId,
        verificationReference: verificationRef,
        approvedAmount: approvedAmountDue,
        currency: approvedCurrency,
        customerRef: request.customerRef ?? null,
        businessRef: request.businessRef ?? null,
      });

      let data: any;
      try {
        data = await this.flowPost(createSubFlowId, {
          email: request.email,
          name: request.name,
          priceId: cleanPriceId,
          promotionCode: cleanPromoId ?? null,
        });
      } catch (flowErr) {
        if (cleanEmail) {
          this.uncertainSubscriptionCreationEmails.add(cleanEmail);
        }
        throw flowErr;
      }

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
      const setupIntentId =
        typeof result?.setupIntentId === 'string' && result.setupIntentId.trim()
          ? result.setupIntentId.trim()
          : null;
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

      // Handle structured server/flow rejections
      if (
        result?.aborted === true ||
        result?.blocked === true ||
        result?.mismatchBlocked === true ||
        serverCode === 'AMOUNT_MISMATCH_BLOCKED' ||
        serverCode === 'AMOUNT_EXCEEDS_APPROVED' ||
        serverCode === 'AMOUNT_CHANGED_AFTER_APPROVAL' ||
        serverCode === 'PRICE_CHANGED_AFTER_APPROVAL' ||
        serverCode === 'ZERO_AMOUNT_PAYMENT_INTENT_BLOCKED' ||
        serverCode === 'UNEXPECTED_PRE_VERIFICATION_CHARGE' ||
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
        if (serverCode === 'UNEXPECTED_PRE_VERIFICATION_CHARGE') {
          mappedProtectionCode = 'UNEXPECTED_PRE_VERIFICATION_CHARGE';
        } else if (serverCode === 'ZERO_AMOUNT_PAYMENT_INTENT_BLOCKED') {
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
          (serverCode === 'UNEXPECTED_PRE_VERIFICATION_CHARGE'
            ? 'We detected an unexpected payment state while verifying your subscription. Please do not submit payment again — contact VAMO support so our team can review your billing account.'
            : 'The invoice total returned by Stripe did not match the approved checkout amount. No payment was collected.');

        this.auditService.record('amount_mismatch_blocked', {
          priceId: cleanPriceId,
          promotionCodeId: cleanPromoId,
          verificationReference: verificationRef,
          subscriptionId: subscriptionId || null,
          setupIntentId,
          invoiceId,
          approvedAmount: approvedAmountDue,
          actualAmount: typeof reportedActual === 'number' ? reportedActual : null,
          currency: approvedCurrency,
          customerRef: request.customerRef ?? null,
          businessRef: request.businessRef ?? null,
          errorCode: mappedProtectionCode,
          reason: serverCode || serverMessage,
        });

        if (
          serverCode &&
          ![
            'AMOUNT_MISMATCH_BLOCKED',
            'AMOUNT_EXCEEDS_APPROVED',
            'AMOUNT_CHANGED_AFTER_APPROVAL',
            'PRICE_CHANGED_AFTER_APPROVAL',
            'ZERO_AMOUNT_PAYMENT_INTENT_BLOCKED',
            'UNEXPECTED_PRE_VERIFICATION_CHARGE',
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
        overrideCurrency?: string,
      ): Promise<never> => {
        this.auditService.record('amount_mismatch_blocked', {
          priceId: cleanPriceId,
          promotionCodeId: cleanPromoId,
          verificationReference: verificationRef,
          subscriptionId: subscriptionId || null,
          setupIntentId,
          invoiceId,
          approvedAmount: approvedAmountDue,
          actualAmount,
          currency: overrideCurrency ?? actualCurrency,
          customerRef: request.customerRef ?? null,
          businessRef: request.businessRef ?? null,
          errorCode: code,
          reason,
        });

        throw new CheckoutChargeProtectionError(
          code,
          'The invoice total returned by Stripe did not match the approved checkout amount. Checkout was stopped before collecting payment.',
          {
            approvedAmount: approvedAmountDue,
            actualAmount,
            currency: overrideCurrency ?? actualCurrency,
          },
        );
      };

      // ─── PATH A: Zero-Dollar / 100%-Discount SetupIntent Flow (approvedAmountDue === 0) ───
      if (approvedAmountDue === 0) {
        if (
          (clientSecret && clientSecret.startsWith('pi_')) ||
          !requiresSetup
        ) {
          const suspectedAmount =
            typeof rawActualAmount === 'number' && Number.isFinite(rawActualAmount)
              ? rawActualAmount
              : null;
          return await abortClientSideHardStop(
            'UNEXPECTED_PAYMENT_INTENT_FOR_FREE_CHECKOUT',
            'Chargeable PaymentIntent or non-setup response returned for a $0.00 approved checkout',
            suspectedAmount,
          );
        }

        if (typeof rawActualAmount === 'number' && Number.isFinite(rawActualAmount) && rawActualAmount > 0) {
          return await abortClientSideHardStop(
            'AMOUNT_MISMATCH_BLOCKED',
            `First invoice amount (${rawActualAmount}) exceeded customer-approved amount (0)`,
            rawActualAmount,
          );
        }

        if (actualCurrency !== approvedCurrency) {
          return await abortClientSideHardStop(
            'CURRENCY_MISMATCH_BLOCKED',
            `Invoice currency (${actualCurrency}) did not match approved currency (${approvedCurrency})`,
            0,
          );
        }

        if (
          result?.discountApplied === false ||
          (appliedPromoId !== null && appliedPromoId !== cleanPromoId)
        ) {
          return await abortClientSideHardStop(
            'PROMO_NOT_APPLIED',
            `Expected promotion code ${cleanPromoId} was not verified on the SetupIntent checkout`,
            0,
          );
        }

        // Verify no subscription was created prematurely before card setup succeeds
        if (subscriptionId) {
          return await abortClientSideHardStop(
            'UNEXPECTED_PRE_VERIFICATION_CHARGE',
            'Subscription was unexpectedly created before SetupIntent card confirmation',
            0,
          );
        }

        const isSecretMatchingSetupIntent =
          Boolean(clientSecret && clientSecret.startsWith('seti_')) &&
          Boolean(setupIntentId && setupIntentId.startsWith('seti_')) &&
          (!clientSecret!.includes('_secret_') || clientSecret!.startsWith(`${setupIntentId}_secret_`));

        if (!isSecretMatchingSetupIntent) {
          return await abortClientSideHardStop(
            'MISSING_INVOICE_VERIFICATION',
            'SetupIntent checkout response is missing a valid setupIntentId or seti_ clientSecret',
            null,
          );
        }

        const invoiceSubtotal = cachedPreview?.subtotal ?? 0;
        const invoiceDiscountAmount = cachedPreview?.discountAmount ?? invoiceSubtotal;

        this.auditService.record('first_invoice_verified', {
          priceId: cleanPriceId,
          promotionCodeId: cleanPromoId,
          verificationReference: verificationRef,
          subscriptionId: null,
          setupIntentId,
          invoiceId: null,
          approvedAmount: 0,
          actualAmount: 0,
          discountAmount: invoiceDiscountAmount,
          currency: actualCurrency,
          customerRef: request.customerRef ?? null,
          businessRef: request.businessRef ?? null,
        });

        return {
          clientSecret,
          subscriptionId: '',
          setupIntentId,
          paymentIntentId: null,
          requiresSetup: true,
          invoiceId: null,
          invoiceAmountDue: 0,
          invoiceSubtotal,
          invoiceDiscountAmount,
          invoiceTax: 0,
          invoiceCurrency: actualCurrency,
          appliedPromotionCodeId: cleanPromoId,
          verifiedByServer: true,
        };
      }

      // ─── PATH B: Paid / Partial-Discount PaymentIntent Flow (approvedAmountDue > 0) ───
      if (
        requiresSetup ||
        !clientSecret ||
        !clientSecret.startsWith('pi_') ||
        !subscriptionId ||
        !subscriptionId.startsWith('sub_')
      ) {
        return await abortClientSideHardStop(
          'MISSING_INVOICE_VERIFICATION',
          'Paid subscription response is missing a valid sub_ subscriptionId or pi_ clientSecret',
          typeof rawActualAmount === 'number' ? rawActualAmount : null,
        );
      }

      if (
        result?.discountApplied === false ||
        (cleanPromoId && appliedPromoId !== null && appliedPromoId !== cleanPromoId)
      ) {
        return await abortClientSideHardStop(
          'PROMO_NOT_APPLIED',
          `Expected promotion code ${cleanPromoId} was not applied to the first invoice`,
          typeof rawActualAmount === 'number' ? rawActualAmount : null,
        );
      }

      if (actualCurrency !== approvedCurrency) {
        return await abortClientSideHardStop(
          'CURRENCY_MISMATCH_BLOCKED',
          `Invoice currency (${actualCurrency}) did not match approved currency (${approvedCurrency})`,
          typeof rawActualAmount === 'number' ? rawActualAmount : null,
        );
      }

      if (
        typeof rawActualAmount === 'number' &&
        Number.isFinite(rawActualAmount) &&
        rawActualAmount !== approvedAmountDue
      ) {
        return await abortClientSideHardStop(
          'AMOUNT_MISMATCH_BLOCKED',
          `First invoice amount (${rawActualAmount}) did not match customer-approved amount (${approvedAmountDue})`,
          rawActualAmount,
        );
      }

      // Pre-Confirmation Stripe.js PaymentIntent Verification:
      // Retrieve the PaymentIntent from Stripe using the clientSecret and verify its exact amount, currency, and status
      // BEFORE any card confirmation or mount can occur.
      let verifiedActualAmount: number | null = null;
      let verifiedCurrency = actualCurrency;
      let verifiedPaymentIntentId: string | null = clientSecret.split('_secret_')[0] || null;

      const stripe = await this.getStripe();
      if (stripe && typeof stripe.retrievePaymentIntent === 'function') {
        let piLookup: { paymentIntent?: any; error?: any } | null = null;
        try {
          piLookup = await stripe.retrievePaymentIntent(clientSecret);
        } catch {
          return await abortClientSideHardStop(
            'MISSING_INVOICE_VERIFICATION',
            'Stripe retrievePaymentIntent threw an error during pre-confirmation verification',
            null,
          );
        }

        const pi = piLookup?.paymentIntent;
        if (piLookup?.error || !pi || typeof pi !== 'object') {
          return await abortClientSideHardStop(
            'MISSING_INVOICE_VERIFICATION',
            piLookup?.error?.message || 'Could not retrieve PaymentIntent from Stripe for pre-confirmation verification',
            null,
          );
        }

        const piId = typeof pi.id === 'string' ? pi.id.trim() : '';
        const piAmount = pi.amount;
        const piCurrency = typeof pi.currency === 'string' ? pi.currency.trim().toLowerCase() : '';
        const piStatus = typeof pi.status === 'string' ? pi.status.trim() : '';

        if (
          !piId.startsWith('pi_') ||
          typeof piAmount !== 'number' ||
          !Number.isFinite(piAmount) ||
          piAmount <= 0 ||
          !piCurrency
        ) {
          return await abortClientSideHardStop(
            'MISSING_INVOICE_VERIFICATION',
            'Retrieved PaymentIntent is missing authoritative id, amount, or currency',
            null,
          );
        }

        if (piStatus === 'succeeded' || piStatus === 'processing' || piStatus === 'requires_capture') {
          return await abortClientSideHardStop(
            'UNEXPECTED_PRE_VERIFICATION_CHARGE',
            `PaymentIntent ${piId} was already in status ${piStatus} before customer confirmation`,
            piAmount,
            piCurrency,
          );
        }

        if (piStatus === 'canceled') {
          return await abortClientSideHardStop(
            'MISSING_INVOICE_VERIFICATION',
            `PaymentIntent ${piId} is canceled and cannot be confirmed`,
            piAmount,
            piCurrency,
          );
        }

        if (piCurrency !== approvedCurrency) {
          return await abortClientSideHardStop(
            'CURRENCY_MISMATCH_BLOCKED',
            `PaymentIntent currency (${piCurrency}) did not match approved currency (${approvedCurrency})`,
            piAmount,
            piCurrency,
          );
        }

        if (piAmount !== approvedAmountDue) {
          return await abortClientSideHardStop(
            'AMOUNT_MISMATCH_BLOCKED',
            `PaymentIntent amount (${piAmount}) did not match customer-approved amount (${approvedAmountDue})`,
            piAmount,
            piCurrency,
          );
        }

        verifiedActualAmount = piAmount;
        verifiedCurrency = piCurrency;
        verifiedPaymentIntentId = piId;
      } else if (
        typeof rawActualAmount === 'number' &&
        Number.isFinite(rawActualAmount) &&
        rawActualAmount > 0
      ) {
        if (cleanPromoId && (result?.discountApplied === false || !appliedPromoId || appliedPromoId !== cleanPromoId)) {
          return await abortClientSideHardStop(
            'PROMO_NOT_APPLIED',
            `Expected promotion code ${cleanPromoId} was not verified on the first invoice`,
            rawActualAmount,
          );
        }
        verifiedActualAmount = rawActualAmount;
      } else {
        return await abortClientSideHardStop(
          'MISSING_INVOICE_VERIFICATION',
          'Unable to verify PaymentIntent amount prior to confirmation',
          null,
        );
      }

      const invoiceSubtotal =
        typeof result?.invoiceSubtotal === 'number' && Number.isFinite(result.invoiceSubtotal)
          ? result.invoiceSubtotal
          : typeof invoiceObj?.subtotal === 'number'
            ? invoiceObj.subtotal
            : cachedPreview?.subtotal ?? verifiedActualAmount;
      const invoiceDiscountAmount =
        typeof result?.invoiceDiscountAmount === 'number' && Number.isFinite(result.invoiceDiscountAmount)
          ? result.invoiceDiscountAmount
          : typeof invoiceObj?.total_discount_amounts?.[0]?.amount === 'number'
            ? invoiceObj.total_discount_amounts[0].amount
            : cachedPreview?.discountAmount ?? Math.max(0, invoiceSubtotal - verifiedActualAmount);
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
        subscriptionId,
        paymentIntentId: verifiedPaymentIntentId,
        invoiceId,
        approvedAmount: approvedAmountDue,
        actualAmount: verifiedActualAmount,
        discountAmount: invoiceDiscountAmount,
        currency: verifiedCurrency,
        customerRef: request.customerRef ?? null,
        businessRef: request.businessRef ?? null,
      });

      return {
        clientSecret,
        subscriptionId,
        setupIntentId: null,
        paymentIntentId: verifiedPaymentIntentId,
        requiresSetup: false,
        invoiceId,
        invoiceAmountDue: verifiedActualAmount,
        invoiceSubtotal,
        invoiceDiscountAmount,
        invoiceTax,
        invoiceCurrency: verifiedCurrency,
        appliedPromotionCodeId: appliedPromoId ?? cleanPromoId,
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
      setupIntentId?: string | null;
      paymentIntentId?: string | null;
      invoiceId?: string | null;
      approvedAmount?: number | null;
      actualAmount?: number | null;
      currency?: string | null;
      customerRef?: string | null;
      businessRef?: string | null;
      errorCode?: string | null;
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
  ): Promise<{ clientSecret: string | null; subscriptionId: string | null; setupIntentId?: string | null; requiresSetup: boolean }> {
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

  async createSubscriptionFromSetup(
    setupIntentId: string,
    customerEmail?: string,
  ): Promise<{ subscriptionId: string }> {
    const cleanSetupIntentId = (setupIntentId ?? '').trim();
    if (!cleanSetupIntentId || !cleanSetupIntentId.startsWith('seti_')) {
      this.auditService.record('checkout_failed', {
        setupIntentId: cleanSetupIntentId || null,
        errorCode: 'INVALID_SETUP_INTENT_ID',
        reason: 'Missing or invalid setupIntentId for createSubscriptionFromSetup',
      });
      throw new Error('Invalid SetupIntent identifier. Cannot start subscription without a verified card setup.');
    }

    const completed = this.completedSetupSubscriptions.get(cleanSetupIntentId);
    if (completed) {
      return completed;
    }

    const flowId = runtimeConfig.stripeCreateSubscriptionFromSetupFlow;
    if (!flowId) {
      throw new Error('Subscription setup completion flow is not configured.');
    }

    const existing = this.inFlightSetupSubscriptions.get(cleanSetupIntentId);
    if (existing) {
      return existing;
    }

    const execution = (async (): Promise<{ subscriptionId: string }> => {
      const resolvedEmail = (
        customerEmail ||
        this.uncertainSetupIntentIds.get(cleanSetupIntentId) ||
        this.authService.currentUser?.email ||
        ''
      ).trim();

      // Section 4: When a prior SetupIntent completion call had an uncertain outcome, reconcile subscription status
      // via STRIPE_GET_SUBSCRIPTION_FLOW before permitting another completion call.
      if (this.uncertainSetupIntentIds.has(cleanSetupIntentId)) {
        if (!resolvedEmail) {
          throw new Error(
            'Previous subscription activation had an uncertain outcome and customer email is unavailable for status reconciliation.',
          );
        }
        let existingSub: StripeSubscription | null = null;
        try {
          existingSub = await this.getSubscription(resolvedEmail);
        } catch {
          throw new Error(
            'Previous subscription activation had an uncertain outcome and current subscription status could not be verified. Duplicate subscription creation was blocked.',
          );
        }
        if (existingSub && existingSub.subscriptionId) {
          const reconciled = { subscriptionId: existingSub.subscriptionId };
          this.completedSetupSubscriptions.set(cleanSetupIntentId, reconciled);
          this.uncertainSetupIntentIds.delete(cleanSetupIntentId);
          this.auditService.record('subscription_created_from_setup', {
            setupIntentId: cleanSetupIntentId,
            subscriptionId: existingSub.subscriptionId,
            reason: 'RECONCILED_EXISTING_SUBSCRIPTION_AFTER_UNCERTAIN_SETUP_COMPLETION',
          });
          return reconciled;
        }
        this.uncertainSetupIntentIds.delete(cleanSetupIntentId);
      }

      let data: any;
      try {
        data = await this.flowPost(flowId, { setupIntentId: cleanSetupIntentId });
      } catch (flowErr) {
        this.uncertainSetupIntentIds.set(cleanSetupIntentId, resolvedEmail);
        throw flowErr;
      }

      const result =
        data?.extract_result ??
        data?.extract_sub_error ??
        data?.data ??
        data;

      if (result?.stripeError || result?.error === true || (typeof result?.error === 'string' && result.error)) {
        const msg =
          result?.stripeError ||
          (typeof result?.error === 'string' ? result.error : null) ||
          result?.message ||
          'Could not start subscription after card setup.';
        this.auditService.record('checkout_failed', {
          setupIntentId: cleanSetupIntentId,
          errorCode: 'SETUP_SUBSCRIPTION_FLOW_ERROR',
          reason: msg,
        });
        throw new Error(msg);
      }

      const subscriptionId =
        typeof result?.subscriptionId === 'string' && result.subscriptionId.trim()
          ? result.subscriptionId.trim()
          : '';

      if (!subscriptionId || !subscriptionId.startsWith('sub_')) {
        this.auditService.record('checkout_failed', {
          setupIntentId: cleanSetupIntentId,
          errorCode: 'MISSING_SUBSCRIPTION_ID_FROM_SETUP',
          reason: 'SetupIntent subscription creation flow did not return a valid sub_ subscriptionId',
        });
        throw new Error('Subscription activation could not be verified: missing subscriptionId from SetupIntent flow.');
      }

      const finalResult = { subscriptionId };
      this.completedSetupSubscriptions.set(cleanSetupIntentId, finalResult);

      this.auditService.record('subscription_created_from_setup', {
        setupIntentId: cleanSetupIntentId,
        subscriptionId,
      });

      return finalResult;
    })();

    this.inFlightSetupSubscriptions.set(cleanSetupIntentId, execution);
    try {
      return await execution;
    } finally {
      this.inFlightSetupSubscriptions.delete(cleanSetupIntentId);
    }
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

