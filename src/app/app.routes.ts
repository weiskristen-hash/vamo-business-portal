import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { noAuthGuard } from './core/guards/no-auth.guard';
import { businessGuard } from './core/guards/business.guard';
import { ShellComponent } from './layout/shell/shell.component';
import { LoginComponent } from './pages/auth/login/login.component';
import { SsoCallbackComponent } from './pages/auth/callback/sso-callback.component';
import { NoBusinessComponent } from './pages/no-business/no-business.component';
import { OverviewComponent } from './pages/overview/overview.component';
import { PlaceholderComponent } from './pages/placeholder/placeholder.component';
import { BusinessProfileComponent } from './pages/business/business-profile.component';

export const routes: Routes = [
  // Public Auth Routes
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [noAuthGuard],
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
        path: 'posts',
        component: PlaceholderComponent,
        data: { module: 'posts' },
      },
      {
        path: 'create',
        component: PlaceholderComponent,
        data: { module: 'create' },
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
        component: PlaceholderComponent,
        data: { module: 'billing' },
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
