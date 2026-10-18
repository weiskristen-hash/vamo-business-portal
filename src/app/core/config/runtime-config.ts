import { environment } from '../../../environments/environment';

export interface RuntimeConfig {
  directusUrl: string;
  googleClientId: string;
  googleSignInFlow: string;
  appleClientId: string;
  appleSignInFlow: string;
  appleRedirectUri: string;
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
  stripeGetAddonPricesFlow: string;
  stripeCreateAddonPaymentFlow: string;
  stripeApplyAddonFlow: string;
  getBoostAvailabilityFlow: string;
  deleteAccountFlow: string;
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
  googleClientId: windowConfig.googleClientId || (environment as any).googleClientId || '654016609429-5995je1smpgrlov4uv92pn637a7dlp0t.apps.googleusercontent.com',
  googleSignInFlow: windowConfig.googleSignInFlow || (environment as any).googleSignInFlow || 'aceed368-a6ee-4c27-9fa6-fe6c8c60a1c7',
  appleClientId: windowConfig.appleClientId || (environment as any).appleClientId || 'com.vamoapp.vamomobile.signin',
  appleSignInFlow: windowConfig.appleSignInFlow || (environment as any).appleSignInFlow || '7adc18dc-af9b-43d5-a2b7-2c7770760ec8',
  appleRedirectUri: windowConfig.appleRedirectUri || (environment as any).appleRedirectUri || 'https://business.vamo-app.com/auth/callback',
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
  stripeGetAddonPricesFlow: windowConfig.stripeGetAddonPricesFlow || (environment as any).STRIPE_GET_ADDON_PRICES_FLOW || '',
  stripeCreateAddonPaymentFlow: windowConfig.stripeCreateAddonPaymentFlow || (environment as any).STRIPE_CREATE_ADDON_PAYMENT_FLOW || '',
  stripeApplyAddonFlow: windowConfig.stripeApplyAddonFlow || (environment as any).STRIPE_APPLY_ADDON_FLOW || '',
  getBoostAvailabilityFlow: windowConfig.getBoostAvailabilityFlow || (environment as any).GET_BOOST_AVAILABILITY_FLOW || '',
  deleteAccountFlow: windowConfig.deleteAccountFlow || (environment as any).DELETE_ACCOUNT_FLOW || '',
};

export const runtimeConfig = {
  get directusUrl(): string {
    return currentConfig.directusUrl;
  },
  get googleClientId(): string {
    return currentConfig.googleClientId;
  },
  get googleSignInFlow(): string {
    return currentConfig.googleSignInFlow;
  },
  get appleClientId(): string {
    return currentConfig.appleClientId;
  },
  get appleSignInFlow(): string {
    return currentConfig.appleSignInFlow;
  },
  get appleRedirectUri(): string {
    return currentConfig.appleRedirectUri;
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
  get stripeGetAddonPricesFlow(): string {
    return currentConfig.stripeGetAddonPricesFlow;
  },
  get stripeCreateAddonPaymentFlow(): string {
    return currentConfig.stripeCreateAddonPaymentFlow;
  },
  get stripeApplyAddonFlow(): string {
    return currentConfig.stripeApplyAddonFlow;
  },
  get getBoostAvailabilityFlow(): string {
    return currentConfig.getBoostAvailabilityFlow;
  },
  get deleteAccountFlow(): string {
    return currentConfig.deleteAccountFlow;
  },
  updateConfig(partial: Partial<RuntimeConfig>): void {
    currentConfig = { ...currentConfig, ...partial };
  },
  reset(): void {
    currentConfig = {
      directusUrl: stripTrailingSlash(environment.directusUrl),
      googleClientId: (environment as any).googleClientId || '654016609429-5995je1smpgrlov4uv92pn637a7dlp0t.apps.googleusercontent.com',
      googleSignInFlow: (environment as any).googleSignInFlow || 'aceed368-a6ee-4c27-9fa6-fe6c8c60a1c7',
      appleClientId: (environment as any).appleClientId || 'com.vamoapp.vamomobile.signin',
      appleSignInFlow: (environment as any).appleSignInFlow || '7adc18dc-af9b-43d5-a2b7-2c7770760ec8',
      appleRedirectUri: (environment as any).appleRedirectUri || 'https://business.vamo-app.com/auth/callback',
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
      stripeGetAddonPricesFlow: (environment as any).STRIPE_GET_ADDON_PRICES_FLOW || '',
      stripeCreateAddonPaymentFlow: (environment as any).STRIPE_CREATE_ADDON_PAYMENT_FLOW || '',
      stripeApplyAddonFlow: (environment as any).STRIPE_APPLY_ADDON_FLOW || '',
      getBoostAvailabilityFlow: (environment as any).GET_BOOST_AVAILABILITY_FLOW || '',
      deleteAccountFlow: (environment as any).DELETE_ACCOUNT_FLOW || '',
    };
  },
};
