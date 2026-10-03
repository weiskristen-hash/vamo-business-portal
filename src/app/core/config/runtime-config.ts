import { environment } from '../../../environments/environment';

export interface RuntimeConfig {
  directusUrl: string;
  stripePublishableKey: string;
  stripeGetPricesFlow: string;
  stripeGetSubscriptionFlow: string;
  stripeValidatePromoFlow: string;
  stripeCreateSubscriptionFlow: string;
  stripeChangeSubscriptionFlow: string;
  stripeCancelSubscriptionFlow: string;
  stripeReleaseScheduleFlow: string;
  stripeGetPaymentMethodsFlow: string;
  stripeDetachPaymentMethodFlow: string;
  stripeGetBillingHistoryFlow: string;
  setProviderTierFlow: string;
  providerGetQuotaFlow: string;
}

export function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function isAllowedApiUrl(value: string, allowedHosts: string[] = environment.allowedHosts): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const host = url.hostname.toLowerCase();
    return allowedHosts.some((base) => host === base || host.endsWith(`.${base}`));
  } catch {
    return false;
  }
}

const windowConfig = (typeof window !== 'undefined' ? (window as any).__VAMO_CONFIG__ : null) || {};

let currentConfig: RuntimeConfig = {
  directusUrl: stripTrailingSlash(windowConfig.directusUrl || environment.directusUrl),
  stripePublishableKey: windowConfig.stripePublishableKey || environment.STRIPE_PUBLISHABLE_KEY || '',
  stripeGetPricesFlow: windowConfig.stripeGetPricesFlow || environment.STRIPE_GET_PRICES_FLOW || '',
  stripeGetSubscriptionFlow: windowConfig.stripeGetSubscriptionFlow || environment.STRIPE_GET_SUBSCRIPTION_FLOW || '',
  stripeValidatePromoFlow: windowConfig.stripeValidatePromoFlow || environment.STRIPE_VALIDATE_PROMO_FLOW || '',
  stripeCreateSubscriptionFlow: windowConfig.stripeCreateSubscriptionFlow || environment.STRIPE_CREATE_SUBSCRIPTION_FLOW || '',
  stripeChangeSubscriptionFlow: windowConfig.stripeChangeSubscriptionFlow || environment.STRIPE_CHANGE_SUBSCRIPTION_FLOW || '',
  stripeCancelSubscriptionFlow: windowConfig.stripeCancelSubscriptionFlow || environment.STRIPE_CANCEL_SUBSCRIPTION_FLOW || '',
  stripeReleaseScheduleFlow: windowConfig.stripeReleaseScheduleFlow || environment.STRIPE_RELEASE_SCHEDULE_FLOW || '',
  stripeGetPaymentMethodsFlow: windowConfig.stripeGetPaymentMethodsFlow || environment.STRIPE_GET_PAYMENT_METHODS_FLOW || '',
  stripeDetachPaymentMethodFlow: windowConfig.stripeDetachPaymentMethodFlow || environment.STRIPE_DETACH_PAYMENT_METHOD_FLOW || '',
  stripeGetBillingHistoryFlow: windowConfig.stripeGetBillingHistoryFlow || environment.STRIPE_GET_BILLING_HISTORY_FLOW || '',
  setProviderTierFlow: windowConfig.setProviderTierFlow || environment.SET_PROVIDER_TIER_FLOW || '',
  providerGetQuotaFlow: windowConfig.providerGetQuotaFlow || environment.PROVIDER_GET_QUOTA_FLOW || '',
};

export const runtimeConfig = {
  get directusUrl(): string {
    return currentConfig.directusUrl;
  },
  setDirectusUrl(url: string): void {
    if (isAllowedApiUrl(url)) {
      currentConfig.directusUrl = stripTrailingSlash(url);
    }
  },
  get stripePublishableKey(): string {
    return currentConfig.stripePublishableKey;
  },
  get stripeGetPricesFlow(): string {
    return currentConfig.stripeGetPricesFlow;
  },
  get stripeGetSubscriptionFlow(): string {
    return currentConfig.stripeGetSubscriptionFlow;
  },
  get stripeValidatePromoFlow(): string {
    return currentConfig.stripeValidatePromoFlow;
  },
  get stripeCreateSubscriptionFlow(): string {
    return currentConfig.stripeCreateSubscriptionFlow;
  },
  get stripeChangeSubscriptionFlow(): string {
    return currentConfig.stripeChangeSubscriptionFlow;
  },
  get stripeCancelSubscriptionFlow(): string {
    return currentConfig.stripeCancelSubscriptionFlow;
  },
  get stripeReleaseScheduleFlow(): string {
    return currentConfig.stripeReleaseScheduleFlow;
  },
  get stripeGetPaymentMethodsFlow(): string {
    return currentConfig.stripeGetPaymentMethodsFlow;
  },
  get stripeDetachPaymentMethodFlow(): string {
    return currentConfig.stripeDetachPaymentMethodFlow;
  },
  get stripeGetBillingHistoryFlow(): string {
    return currentConfig.stripeGetBillingHistoryFlow;
  },
  get setProviderTierFlow(): string {
    return currentConfig.setProviderTierFlow;
  },
  get providerGetQuotaFlow(): string {
    return currentConfig.providerGetQuotaFlow;
  },
  updateConfig(partial: Partial<RuntimeConfig>): void {
    currentConfig = { ...currentConfig, ...partial };
  },
  reset(): void {
    currentConfig = {
      directusUrl: stripTrailingSlash(environment.directusUrl),
      stripePublishableKey: environment.STRIPE_PUBLISHABLE_KEY || '',
      stripeGetPricesFlow: environment.STRIPE_GET_PRICES_FLOW || '',
      stripeGetSubscriptionFlow: environment.STRIPE_GET_SUBSCRIPTION_FLOW || '',
      stripeValidatePromoFlow: environment.STRIPE_VALIDATE_PROMO_FLOW || '',
      stripeCreateSubscriptionFlow: environment.STRIPE_CREATE_SUBSCRIPTION_FLOW || '',
      stripeChangeSubscriptionFlow: environment.STRIPE_CHANGE_SUBSCRIPTION_FLOW || '',
      stripeCancelSubscriptionFlow: environment.STRIPE_CANCEL_SUBSCRIPTION_FLOW || '',
      stripeReleaseScheduleFlow: environment.STRIPE_RELEASE_SCHEDULE_FLOW || '',
      stripeGetPaymentMethodsFlow: environment.STRIPE_GET_PAYMENT_METHODS_FLOW || '',
      stripeDetachPaymentMethodFlow: environment.STRIPE_DETACH_PAYMENT_METHOD_FLOW || '',
      stripeGetBillingHistoryFlow: environment.STRIPE_GET_BILLING_HISTORY_FLOW || '',
      setProviderTierFlow: environment.SET_PROVIDER_TIER_FLOW || '',
      providerGetQuotaFlow: environment.PROVIDER_GET_QUOTA_FLOW || '',
    };
  },
};
