import { inject, Injectable } from '@angular/core';
import { loadStripe } from '@stripe/stripe-js';
import type { Stripe, StripeElements } from '@stripe/stripe-js';
import { environment } from '../../../environments/environment';
import { runtimeConfig } from '../config/runtime-config';
import { AuthService } from './auth.service';

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

@Injectable({ providedIn: 'root' })
export class StripeService {
  private authService = inject(AuthService);
  private stripePromise: Promise<Stripe | null> | null = null;
  private activeElements: StripeElements | null = null;

  getStripe(): Promise<Stripe | null> {
    if (!this.stripePromise && environment.STRIPE_PUBLISHABLE_KEY) {
      this.stripePromise = loadStripe(environment.STRIPE_PUBLISHABLE_KEY);
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
    if (environment.STRIPE_GET_PRICES_FLOW) {
      const res = await this.flowPost(environment.STRIPE_GET_PRICES_FLOW, {});
      const stripeBody = res?.data ?? res;
      const prices = (stripeBody?.data ?? stripeBody ?? [])
        .filter((price: any) => price.active && price.unit_amount > 0)
        .sort((a: any, b: any) => a.unit_amount - b.unit_amount);

      if (prices.length > 0) {
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
    }

    // Default canonical plans representing verified VAMO plans
    return [
      {
        id: 'price_starter_plan',
        name: 'Starter Plan',
        description: 'Ideal for single-event promoters and small venues.',
        amount: 2900,
        currency: 'usd',
        interval: 'month',
        tier: 'starter',
        maxPosts: CANONICAL_TIER_FEATURES.starter.maxPosts,
        features: CANONICAL_TIER_FEATURES.starter.features,
      },
      {
        id: 'price_basic_plan',
        name: 'Basic Plan',
        description: 'For active businesses with weekly offerings.',
        amount: 4900,
        currency: 'usd',
        interval: 'month',
        tier: 'basic',
        maxPosts: CANONICAL_TIER_FEATURES.basic.maxPosts,
        features: CANONICAL_TIER_FEATURES.basic.features,
      },
      {
        id: 'price_advanced_plan',
        name: 'Advanced Plan',
        description: 'Maximum reach and high-volume scheduling.',
        amount: 8900,
        currency: 'usd',
        interval: 'month',
        tier: 'advanced',
        maxPosts: CANONICAL_TIER_FEATURES.advanced.maxPosts,
        features: CANONICAL_TIER_FEATURES.advanced.features,
      },
    ];
  }

  async validatePromoCode(code: string): Promise<PromoResult> {
    const data = await this.flowPost(environment.STRIPE_VALIDATE_PROMO_FLOW, { code });
    return data?.extract_promo ?? data ?? { valid: false };
  }

  async createSubscription(
    email: string,
    name: string,
    priceId: string,
    promotionCode?: string,
  ): Promise<{ clientSecret: string | null; subscriptionId: string; requiresSetup: boolean }> {
    const data = await this.flowPost(environment.STRIPE_CREATE_SUBSCRIPTION_FLOW, {
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
    if (!environment.STRIPE_GET_SUBSCRIPTION_FLOW) {
      return null;
    }
    const data = await this.flowPost(environment.STRIPE_GET_SUBSCRIPTION_FLOW, { email });
    return data?.subscription ?? null;
  }

  async cancelSubscription(subscriptionId: string, cancelAtPeriodEnd = true): Promise<void> {
    await this.flowPost(environment.STRIPE_CANCEL_SUBSCRIPTION_FLOW, {
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
    await this.flowPost(environment.STRIPE_CHANGE_SUBSCRIPTION_FLOW, {
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
    await this.flowPost(environment.STRIPE_RELEASE_SCHEDULE_FLOW, { scheduleId });
  }

  async getBillingHistory(): Promise<BillingHistoryItem[]> {
    if (!environment.STRIPE_GET_BILLING_HISTORY_FLOW) {
      return [];
    }
    const res = await this.flowPost(environment.STRIPE_GET_BILLING_HISTORY_FLOW, {});
    return res?.history ?? [];
  }

  async getSavedPaymentMethods(): Promise<SavedPaymentMethod[]> {
    if (!environment.STRIPE_GET_PAYMENT_METHODS_FLOW) {
      return [];
    }
    try {
      const res = await this.flowPost(environment.STRIPE_GET_PAYMENT_METHODS_FLOW, {});
      return res?.paymentMethods ?? [];
    } catch {
      return [];
    }
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    await this.flowPost(environment.STRIPE_DETACH_PAYMENT_METHOD_FLOW, { paymentMethodId });
  }

  async setProviderTier(tier: 'starter' | 'basic' | 'advanced' | null): Promise<void> {
    if (!environment.SET_PROVIDER_TIER_FLOW) return;
    await this.flowPost(environment.SET_PROVIDER_TIER_FLOW, { tier });
  }

  async getExtraPosts(): Promise<number> {
    if (!environment.PROVIDER_GET_QUOTA_FLOW) return 0;
    try {
      const res = await this.flowPost(environment.PROVIDER_GET_QUOTA_FLOW, {});
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
