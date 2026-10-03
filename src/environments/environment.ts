export const environment = {
  production: true,
  directusUrl: 'https://api.vamo-app.com',
  appName: 'VAMO Business Portal',
  defaultResetRedirect: 'https://business.vamo-app.com/login',
  googleLoginEnabled: false, // Phase 1A: Architected for SSO, gated until backend redirect URI allowlist configured
  allowedHosts: ['api.vamo-app.com', 'quepasa-api.c1oud7.de', 'vamo-app.com'],

  // Stripe & Billing Flow Configuration (canonical source keys from Isla-Labs-DR/vamo-app)
  STRIPE_PUBLISHABLE_KEY: 'pk_test_51TA9mfGWvZAV5mbnJOPqWhOtXQX34kOanNIKxZZSotEhpijh3eT0ASVgW7odIxmxOTjKRHm7wDH8FASnBw6AQreB00KMjL6p4M',
  STRIPE_GET_PRICES_FLOW: 'ccd7ae9c-27be-453e-94ef-db7d52be0e0a',
  STRIPE_GET_SUBSCRIPTION_FLOW: 'a48e3dee-3d94-471b-804f-16ada69737cf',
  STRIPE_VALIDATE_PROMO_FLOW: '3b580ce9-5023-446f-ad4c-55c8ee5db4fd',
  STRIPE_CREATE_SUBSCRIPTION_FLOW: '0a31e459-0909-41b0-8286-2aecc763fe29',
  STRIPE_CHANGE_SUBSCRIPTION_FLOW: '2b1a4494-8999-4c27-b70e-ddcc47bb16f3',
  STRIPE_CANCEL_SUBSCRIPTION_FLOW: '3eff0cae-6cfd-4cce-9ae9-e273295cb93c',
  STRIPE_RELEASE_SCHEDULE_FLOW: 'e456db80-8a8f-4569-aed6-b80135fc5f62',
  STRIPE_GET_PAYMENT_METHODS_FLOW: '44946457-c8cd-42e2-98b2-a7a0672d59d3',
  STRIPE_DETACH_PAYMENT_METHOD_FLOW: '9845ee00-779b-4f6b-9e07-fb8f175f945d',
  STRIPE_GET_BILLING_HISTORY_FLOW: 'f8be3b19-62c9-4d0d-91ca-701bdaeaac7e',
  SET_PROVIDER_TIER_FLOW: 'bbdfad27-9768-4b62-95d2-b319205945cf',
  PROVIDER_GET_QUOTA_FLOW: 'd89e5fbc-f47d-4927-a1ba-838a7f2d35a5',
};
