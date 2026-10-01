export const environment = {
  production: true,
  directusUrl: 'https://api.vamo-app.com',
  appName: 'VAMO Business Portal',
  defaultResetRedirect: 'https://business.vamo-app.com/login',
  googleLoginEnabled: false, // Phase 1A: Architected for SSO, gated until backend redirect URI allowlist configured
  allowedHosts: ['api.vamo-app.com', 'quepasa-api.c1oud7.de', 'vamo-app.com'],
};
