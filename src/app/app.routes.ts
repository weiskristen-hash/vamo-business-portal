import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { noAuthGuard } from './core/guards/no-auth.guard';
import { businessGuard } from './core/guards/business.guard';

// Every page is lazy-loaded so only the code for the current route is fetched.
// Guards stay eager (they are tiny and must run before any lazy chunk loads).
export const routes: Routes = [
  // Public Auth Routes
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/auth/login/login.component').then((m) => m.LoginComponent),
    canActivate: [noAuthGuard],
  },
  {
    path: 'onboarding',
    loadComponent: () =>
      import('./pages/auth/onboarding/onboarding.component').then((m) => m.OnboardingComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./pages/auth/onboarding/onboarding.component').then((m) => m.OnboardingComponent),
  },
  {
    path: 'auth/register',
    redirectTo: 'register',
    pathMatch: 'full',
  },
  {
    path: 'auth/login',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./pages/auth/callback/sso-callback.component').then((m) => m.SsoCallbackComponent),
  },

  // Authenticated Non-Business Account Notice
  {
    path: 'no-business',
    loadComponent: () =>
      import('./pages/no-business/no-business.component').then((m) => m.NoBusinessComponent),
    canActivate: [authGuard],
  },

  // Protected Business Portal Shell
  {
    path: 'app',
    loadComponent: () =>
      import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard, businessGuard],
    children: [
      {
        path: '',
        redirectTo: 'overview',
        pathMatch: 'full',
      },
      {
        path: 'overview',
        loadComponent: () =>
          import('./pages/overview/overview.component').then((m) => m.OverviewComponent),
      },
      {
        path: 'business',
        loadComponent: () =>
          import('./pages/business/business-profile.component').then(
            (m) => m.BusinessProfileComponent
          ),
      },
      {
        path: 'listings',
        loadComponent: () =>
          import('./pages/listings/listings.component').then((m) => m.ListingsComponent),
      },
      {
        path: 'listings/create',
        loadComponent: () =>
          import('./pages/listings/listing-editor/listing-editor.component').then(
            (m) => m.ListingEditorComponent
          ),
      },
      {
        path: 'listings/edit/:id',
        loadComponent: () =>
          import('./pages/listings/listing-editor/listing-editor.component').then(
            (m) => m.ListingEditorComponent
          ),
      },
      {
        path: 'posts',
        redirectTo: 'listings',
        pathMatch: 'full',
      },
      {
        path: 'create',
        redirectTo: 'listings/create',
        pathMatch: 'full',
      },
      {
        path: 'promotions',
        loadComponent: () =>
          import('./pages/placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
        data: { module: 'promotions' },
      },
      {
        path: 'insights',
        loadComponent: () =>
          import('./pages/placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
        data: { module: 'insights' },
      },
      {
        path: 'billing',
        loadComponent: () =>
          import('./pages/billing/billing.component').then((m) => m.BillingComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
        data: { module: 'settings' },
      },
    ],
  },

  // Default Fallbacks
  {
    path: '',
    redirectTo: 'app/overview',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'app/overview',
  },
];
