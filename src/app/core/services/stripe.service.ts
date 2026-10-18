import { inject, Injectable } from '@angular/core';
import { loadStripe } from '@stripe/stripe-js';
import type { Stripe, StripeElements } from '@stripe/stripe-js';
import { runtimeConfig } from '../config/runtime-config';
import { AuthService } from './auth.service';
import { I18nService } from '../i18n/i18n.service';
import { readItems } from '@directus/sdk';
import { directusClient } from '../directus/directus-client';

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
  private stripePromise: Promise<Stripe | null> | null = null;
  private activeElements: StripeElements | null = null;
  private cardSetupElements: StripeElements | null = null;
  private cardSetupPaymentElement: any = null;

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
    const flowId = runtimeConfig.stripeValidatePromoFlow;
    if (!flowId) {
      return { valid: false };
    }
    const data = await this.flowPost(flowId, { code });
    return data?.extract_promo ?? data ?? { valid: false };
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
    const container = document.getElementById(containerId);
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

