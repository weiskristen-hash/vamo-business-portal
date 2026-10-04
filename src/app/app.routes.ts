import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { noAuthGuard } from './core/guards/no-auth.guard';
import { businessGuard } from './core/guards/business.guard';
import { ShellComponent } from './layout/shell/shell.component';
import { LoginComponent } from './pages/auth/login/login.component';
import { RegisterComponent } from './pages/auth/register/register.component';
import { SsoCallbackComponent } from './pages/auth/callback/sso-callback.component';
import { NoBusinessComponent } from './pages/no-business/no-business.component';
import { OverviewComponent } from './pages/overview/overview.component';
import { PlaceholderComponent } from './pages/placeholder/placeholder.component';
import { BusinessProfileComponent } from './pages/business/business-profile.component';
import { ListingsComponent } from './pages/listings/listings.component';
import { ListingEditorComponent } from './pages/listings/listing-editor/listing-editor.component';
import { BillingComponent } from './pages/billing/billing.component';

export const routes: Routes = [
  // Public Auth Routes
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [noAuthGuard],
  },
  {
    path: 'register',
    component: RegisterComponent,
    canActivate: [noAuthGuard],
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
    component: SsoCallbackComponent,
  },

  // Authenticated Non-Business Account Notice
  {
    path: 'no-business',
    component: NoBusinessComponent,
    canActivate: [authGuard],
  },

  // Protected Business Portal Shell
  {
    path: 'app',
    component: ShellComponent,
    canActivate: [authGuard, businessGuard],
    children: [
      {
        path: '',
        redirectTo: 'overview',
        pathMatch: 'full',
      },
      {
        path: 'overview',
        component: OverviewComponent,
      },
      {
        path: 'business',
        component: BusinessProfileComponent,
      },
      {
        path: 'listings',
        component: ListingsComponent,
      },
      {
        path: 'listings/create',
        component: ListingEditorComponent,
      },
      {
        path: 'listings/edit/:id',
        component: ListingEditorComponent,
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
        component: PlaceholderComponent,
        data: { module: 'promotions' },
      },
      {
        path: 'insights',
        component: PlaceholderComponent,
        data: { module: 'insights' },
      },
      {
        path: 'billing',
        component: BillingComponent,
      },
      {
        path: 'settings',
        component: PlaceholderComponent,
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
