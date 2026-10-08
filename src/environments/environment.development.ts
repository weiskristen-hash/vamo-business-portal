export const environment = {
  production: false,
  directusUrl: 'https://api.vamo-app.com', // Phase 1A: uses production directus per prompt
  stagingDirectusUrl: 'https://quepasa-api.c1oud7.de',
  appName: 'VAMO Business Portal (Dev)',
  defaultResetRedirect: 'http://localhost:4200/login',
  googleLoginEnabled: true,
  googleClientId: '654016609429-5995je1smpgrlov4uv92pn637a7dlp0t.apps.googleusercontent.com',
  googleSignInFlow: 'aceed368-a6ee-4c27-9fa6-fe6c8c60a1c7',
  allowedHosts: ['api.vamo-app.com', 'quepasa-api.c1oud7.de', 'vamo-app.com', 'localhost'],
  DELETE_ACCOUNT_FLOW: 'c5d846fb-ab3a-443f-b652-9eee5f2671bd',
};
