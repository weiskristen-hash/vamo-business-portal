import { inject, Injectable } from '@angular/core';
import { loadStripe } from '@stripe/stripe-js';
import type { Stripe, StripeElements } from '@stripe/stripe-js';
import { runtimeConfig } from '../config/runtime-config';
import { AuthService } from './auth.service';
import { I18nService } from '../i18n/i18n.service';

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
  pendingPeriodEnd?: number | null;
  pendingScheduleId?: string | null;
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
      throw new Error(`Flow request failed (${response.status}): ${text.slice(0, 300)}`);
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Flow returned invalid JSON: ${text.slice(0, 200)}`);
    }
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
      return {
        mainBanner: { count: 0, limit: 5, nextAvailableDate: null },
        whatsHot: { count: 0, limit: 10, nextAvailableDate: null },
      };
    }
    const res = await this.flowPost(flowId, { areaId: areaId ?? null });
    return {
      mainBanner: {
        count: res?.mainBanner?.count ?? 0,
        limit: res?.mainBanner?.limit ?? 5,
        nextAvailableDate: res?.mainBanner?.nextAvailableDate ?? null,
      },
      whatsHot: {
        count: res?.whatsHot?.count ?? 0,
        limit: res?.whatsHot?.limit ?? 10,
        nextAvailableDate: res?.whatsHot?.nextAvailableDate ?? null,
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

  async mountPaymentElement(
    clientSecret: string,
    containerId: string,
  ): Promise<{ stripe: Stripe; elements: StripeElements }> {
    const stripe = await this.getStripe();
    if (!stripe) throw new Error('Stripe failed to initialize.');

    this.activeElements = stripe.elements({
      clientSecret,
      locale: this.i18n.lang() === 'es' ? 'es' : 'en',
      appearance: {
        theme: 'night',
        variables: {
          colorPrimary: '#FE397F',
          colorBackground: '#1c1c2e',
          colorText: '#ffffff',
          colorTextSecondary: '#a0a0b8',
          colorDanger: '#ef4444',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          borderRadius: '12px',
          spacingUnit: '5px',
        },
      },
    });

    const paymentElement = this.activeElements.create('payment');
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container #${containerId} not found.`);
    paymentElement.mount(container);

    return { stripe, elements: this.activeElements };
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
      return null;
    }
    const data = await this.flowPost(flowId, { email });
    return data?.subscription ?? null;
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

  async changeSubscriptionPlan(
    subscriptionId: string,
    subscriptionItemId: string,
    newPriceId: string,
    isUpgrade: boolean,
    newPlanName: string,
    currentPeriodStart: number,
    currentPeriodEnd: number,
    currentPriceId: string,
  ): Promise<void> {
    const flowId = runtimeConfig.stripeChangeSubscriptionFlow;
    if (!flowId) {
      throw new Error('Change subscription flow is not configured.');
    }
    await this.flowPost(flowId, {
      subscriptionId,
      subscriptionItemId,
      newPriceId,
      isUpgrade,
      newPlanName,
      currentPeriodStart,
      currentPeriodEnd,
      currentPriceId,
    });
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
      const res = await this.flowPost(flowId, {});
      return res?.paymentMethods ?? [];
    } catch {
      return [];
    }
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    const flowId = runtimeConfig.stripeDetachPaymentMethodFlow;
    if (!flowId) {
      throw new Error('Detach payment method flow is not configured.');
    }
    await this.flowPost(flowId, { paymentMethodId });
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

  tierFromProductName(productName: string): 'starter' | 'basic' | 'advanced' | null {
    const n = (productName ?? '').toLowerCase();
    if (n.includes('advanced')) return 'advanced';
    if (n.includes('basic')) return 'basic';
    if (n.includes('starter')) return 'starter';
    return null;
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
}
