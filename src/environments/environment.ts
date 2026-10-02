export const environment = {
  production: true,
  directusUrl: 'https://api.vamo-app.com',
  appName: 'VAMO Business Portal',
  defaultResetRedirect: 'https://business.vamo-app.com/login',
  googleLoginEnabled: false, // Phase 1A: Architected for SSO, gated until backend redirect URI allowlist configured
  allowedHosts: ['api.vamo-app.com', 'quepasa-api.c1oud7.de', 'vamo-app.com'],

  // Stripe & Billing Flow Configuration (canonical source keys from Isla-Labs-DR/vamo-app)
  STRIPE_PUBLISHABLE_KEY: '',
  STRIPE_GET_PRICES_FLOW: '',
  STRIPE_GET_SUBSCRIPTION_FLOW: '',
  STRIPE_VALIDATE_PROMO_FLOW: '',
  STRIPE_CREATE_SUBSCRIPTION_FLOW: '',
  STRIPE_CHANGE_SUBSCRIPTION_FLOW: '',
  STRIPE_CANCEL_SUBSCRIPTION_FLOW: '',
  STRIPE_RELEASE_SCHEDULE_FLOW: '',
  STRIPE_GET_PAYMENT_METHODS_FLOW: '',
  STRIPE_DETACH_PAYMENT_METHOD_FLOW: '',
  STRIPE_GET_BILLING_HISTORY_FLOW: '',
  SET_PROVIDER_TIER_FLOW: '',
  PROVIDER_GET_QUOTA_FLOW: '',
};
