export const environment = {
  production: false,
  directusUrl: 'https://api.vamo-app.com', // Phase 1A: uses production directus per prompt
  stagingDirectusUrl: 'https://quepasa-api.c1oud7.de',
  appName: 'VAMO Business Portal (Dev)',
  defaultResetRedirect: 'http://localhost:4200/login',
  googleLoginEnabled: false, // Phase 1A: gated until backend redirect URI allowlist configured
  allowedHosts: ['api.vamo-app.com', 'quepasa-api.c1oud7.de', 'vamo-app.com', 'localhost'],
};
