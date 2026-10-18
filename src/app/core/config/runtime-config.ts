import { environment } from '../../../environments/environment';

export interface RuntimeConfig {
  directusUrl: string;
  googleClientId: string;
  googleSignInFlow: string;
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
  stripeCreateSetupIntentFlow: string;
  stripeFinalizeSetupIntentFlow: string;
  stripeSetDefaultPaymentMethodFlow: string;
  stripeGetBillingHistoryFlow: string;
  setProviderTierFlow: string;
  providerGetQuotaFlow: string;
  stripeGetAddonPricesFlow: string;
  stripeCreateAddonPaymentFlow: string;
  stripeApplyAddonFlow: string;
  getBoostAvailabilityFlow: string;
  deleteAccountFlow: string;
}

export const DEV_DIRECTUS_HOST = 'quepasa-api.c1oud7.de';

export const DEV_DIRECTUS_CARD_FLOWS = {
  stripeGetPaymentMethodsFlow: '44946457-c8cd-42e2-98b2-a7a0672d59d3',
  stripeDetachPaymentMethodFlow: '9845ee00-779b-4f6b-9e07-fb8f175f945d',
  stripeCreateSetupIntentFlow: 'b1c4e8a2-7f3d-4e9a-8c1b-2d5f6a9e0c31',
  stripeFinalizeSetupIntentFlow: 'c2d5f9b3-8e4a-4f0b-9d2c-3e6a7b0f1d42',
  stripeSetDefaultPaymentMethodFlow: 'd3e6a0c4-9f5b-4a1c-8e3d-4f7b8c1a2e53',
} as const;

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

export function isDevelopmentDirectusUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase() === DEV_DIRECTUS_HOST;
  } catch {
    return false;
  }
}

const windowConfig = (typeof window !== 'undefined' ? (window as any).__VAMO_CONFIG__ : null) || {};

function buildInitialConfig(overrides: Record<string, any> = {}): RuntimeConfig {
  const resolvedDirectusUrl = stripTrailingSlash(overrides['directusUrl'] || environment.directusUrl);
  const isDevHost = isDevelopmentDirectusUrl(resolvedDirectusUrl);

  return {
    directusUrl: resolvedDirectusUrl,
    googleClientId:
      overrides['googleClientId'] ||
      (environment as any).googleClientId ||
      '654016609429-5995je1smpgrlov4uv92pn637a7dlp0t.apps.googleusercontent.com',
    googleSignInFlow:
      overrides['googleSignInFlow'] ||
      (environment as any).googleSignInFlow ||
      'aceed368-a6ee-4c27-9fa6-fe6c8c60a1c7',
    stripePublishableKey: overrides['stripePublishableKey'] || environment.STRIPE_PUBLISHABLE_KEY || '',
    stripeGetPricesFlow: overrides['stripeGetPricesFlow'] || environment.STRIPE_GET_PRICES_FLOW || '',
    stripeGetSubscriptionFlow: overrides['stripeGetSubscriptionFlow'] || environment.STRIPE_GET_SUBSCRIPTION_FLOW || '',
    stripeValidatePromoFlow: overrides['stripeValidatePromoFlow'] || environment.STRIPE_VALIDATE_PROMO_FLOW || '',
    stripeCreateSubscriptionFlow:
      overrides['stripeCreateSubscriptionFlow'] || environment.STRIPE_CREATE_SUBSCRIPTION_FLOW || '',
    stripeChangeSubscriptionFlow:
      overrides['stripeChangeSubscriptionFlow'] || environment.STRIPE_CHANGE_SUBSCRIPTION_FLOW || '',
    stripeCancelSubscriptionFlow:
      overrides['stripeCancelSubscriptionFlow'] || environment.STRIPE_CANCEL_SUBSCRIPTION_FLOW || '',
    stripeReleaseScheduleFlow:
      overrides['stripeReleaseScheduleFlow'] || environment.STRIPE_RELEASE_SCHEDULE_FLOW || '',
    stripeGetPaymentMethodsFlow:
      overrides['stripeGetPaymentMethodsFlow'] ||
      environment.STRIPE_GET_PAYMENT_METHODS_FLOW ||
      (isDevHost ? DEV_DIRECTUS_CARD_FLOWS.stripeGetPaymentMethodsFlow : ''),
    stripeDetachPaymentMethodFlow:
      overrides['stripeDetachPaymentMethodFlow'] ||
      environment.STRIPE_DETACH_PAYMENT_METHOD_FLOW ||
      (isDevHost ? DEV_DIRECTUS_CARD_FLOWS.stripeDetachPaymentMethodFlow : ''),
    stripeCreateSetupIntentFlow:
      overrides['stripeCreateSetupIntentFlow'] ??
      ((environment as any).STRIPE_CREATE_SETUP_INTENT_FLOW ||
        (isDevHost ? DEV_DIRECTUS_CARD_FLOWS.stripeCreateSetupIntentFlow : '')),
    stripeFinalizeSetupIntentFlow:
      overrides['stripeFinalizeSetupIntentFlow'] ??
      ((environment as any).STRIPE_FINALIZE_SETUP_INTENT_FLOW ||
        (isDevHost ? DEV_DIRECTUS_CARD_FLOWS.stripeFinalizeSetupIntentFlow : '')),
    stripeSetDefaultPaymentMethodFlow:
      overrides['stripeSetDefaultPaymentMethodFlow'] ??
      ((environment as any).STRIPE_SET_DEFAULT_PAYMENT_METHOD_FLOW ||
        (isDevHost ? DEV_DIRECTUS_CARD_FLOWS.stripeSetDefaultPaymentMethodFlow : '')),
    stripeGetBillingHistoryFlow:
      overrides['stripeGetBillingHistoryFlow'] || environment.STRIPE_GET_BILLING_HISTORY_FLOW || '',
    setProviderTierFlow: overrides['setProviderTierFlow'] || environment.SET_PROVIDER_TIER_FLOW || '',
    providerGetQuotaFlow: overrides['providerGetQuotaFlow'] || environment.PROVIDER_GET_QUOTA_FLOW || '',
    stripeGetAddonPricesFlow:
      overrides['stripeGetAddonPricesFlow'] || (environment as any).STRIPE_GET_ADDON_PRICES_FLOW || '',
    stripeCreateAddonPaymentFlow:
      overrides['stripeCreateAddonPaymentFlow'] || (environment as any).STRIPE_CREATE_ADDON_PAYMENT_FLOW || '',
    stripeApplyAddonFlow: overrides['stripeApplyAddonFlow'] || (environment as any).STRIPE_APPLY_ADDON_FLOW || '',
    getBoostAvailabilityFlow:
      overrides['getBoostAvailabilityFlow'] || (environment as any).GET_BOOST_AVAILABILITY_FLOW || '',
    deleteAccountFlow: overrides['deleteAccountFlow'] || (environment as any).DELETE_ACCOUNT_FLOW || '',
  };
}

let currentConfig: RuntimeConfig = buildInitialConfig(windowConfig);

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
  setDirectusUrl(url: string): void {
    if (isAllowedApiUrl(url)) {
      const normalized = stripTrailingSlash(url);
      currentConfig.directusUrl = normalized;
      if (isDevelopmentDirectusUrl(normalized)) {
        if (!currentConfig.stripeCreateSetupIntentFlow) {
          currentConfig.stripeCreateSetupIntentFlow = DEV_DIRECTUS_CARD_FLOWS.stripeCreateSetupIntentFlow;
        }
        if (!currentConfig.stripeFinalizeSetupIntentFlow) {
          currentConfig.stripeFinalizeSetupIntentFlow = DEV_DIRECTUS_CARD_FLOWS.stripeFinalizeSetupIntentFlow;
        }
        if (!currentConfig.stripeSetDefaultPaymentMethodFlow) {
          currentConfig.stripeSetDefaultPaymentMethodFlow = DEV_DIRECTUS_CARD_FLOWS.stripeSetDefaultPaymentMethodFlow;
        }
        if (!currentConfig.stripeGetPaymentMethodsFlow) {
          currentConfig.stripeGetPaymentMethodsFlow = DEV_DIRECTUS_CARD_FLOWS.stripeGetPaymentMethodsFlow;
        }
        if (!currentConfig.stripeDetachPaymentMethodFlow) {
          currentConfig.stripeDetachPaymentMethodFlow = DEV_DIRECTUS_CARD_FLOWS.stripeDetachPaymentMethodFlow;
        }
      } else {
        if (currentConfig.stripeCreateSetupIntentFlow === DEV_DIRECTUS_CARD_FLOWS.stripeCreateSetupIntentFlow) {
          currentConfig.stripeCreateSetupIntentFlow = (environment as any).STRIPE_CREATE_SETUP_INTENT_FLOW || '';
        }
        if (currentConfig.stripeFinalizeSetupIntentFlow === DEV_DIRECTUS_CARD_FLOWS.stripeFinalizeSetupIntentFlow) {
          currentConfig.stripeFinalizeSetupIntentFlow = (environment as any).STRIPE_FINALIZE_SETUP_INTENT_FLOW || '';
        }
        if (
          currentConfig.stripeSetDefaultPaymentMethodFlow ===
          DEV_DIRECTUS_CARD_FLOWS.stripeSetDefaultPaymentMethodFlow
        ) {
          currentConfig.stripeSetDefaultPaymentMethodFlow =
            (environment as any).STRIPE_SET_DEFAULT_PAYMENT_METHOD_FLOW || '';
        }
      }
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
  get stripeCreateSetupIntentFlow(): string {
    return currentConfig.stripeCreateSetupIntentFlow;
  },
  get stripeFinalizeSetupIntentFlow(): string {
    return currentConfig.stripeFinalizeSetupIntentFlow;
  },
  get stripeSetDefaultPaymentMethodFlow(): string {
    return currentConfig.stripeSetDefaultPaymentMethodFlow;
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
    currentConfig = buildInitialConfig();
  },
};
