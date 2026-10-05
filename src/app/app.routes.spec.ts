import { routes } from './app.routes';
import { authGuard } from './core/guards/auth.guard';
import { noAuthGuard } from './core/guards/no-auth.guard';
import { businessGuard } from './core/guards/business.guard';
import type { Route } from '@angular/router';

describe('App routes (Phase 2D lazy loading contract)', () => {
  const top = (path: string): Route => {
    const r = routes.find((x) => x.path === path);
    if (!r) throw new Error(`Missing top-level route: ${path}`);
    return r;
  };
  const appRoute = top('app');
  const child = (path: string): Route => {
    const r = appRoute.children?.find((x) => x.path === path);
    if (!r) throw new Error(`Missing child route: ${path}`);
    return r;
  };

  it('keeps all public and authenticated URLs', () => {
    const topPaths = routes.map((r) => r.path);
    for (const p of ['login', 'onboarding', 'register', 'auth/register', 'auth/login', 'auth/callback', 'no-business', 'app', '', '**']) {
      expect(topPaths).toContain(p);
    }
    const childPaths = (appRoute.children ?? []).map((r) => r.path);
    for (const p of ['', 'overview', 'business', 'listings', 'listings/create', 'listings/edit/:id', 'posts', 'create', 'promotions', 'insights', 'billing', 'settings']) {
      expect(childPaths).toContain(p);
    }
  });

  it('preserves route guards', () => {
    expect(top('login').canActivate).toEqual([noAuthGuard]);
    expect(top('no-business').canActivate).toEqual([authGuard]);
    expect(appRoute.canActivate).toEqual([authGuard, businessGuard]);
  });

  it('preserves redirects and placeholder module data', () => {
    expect(top('auth/register').redirectTo).toBe('register');
    expect(top('auth/login').redirectTo).toBe('login');
    expect(top('').redirectTo).toBe('app/overview');
    expect(top('**').redirectTo).toBe('app/overview');
    expect(child('').redirectTo).toBe('overview');
    expect(child('posts').redirectTo).toBe('listings');
    expect(child('create').redirectTo).toBe('listings/create');
    expect(child('promotions').data).toEqual({ module: 'promotions' });
    expect(child('insights').data).toEqual({ module: 'insights' });
    expect(child('settings').data).toEqual({ module: 'settings' });
  });

  it('lazy-loads every page and each loader resolves to a component', async () => {
    const pages: Route[] = [
      top('login'), top('onboarding'), top('register'), top('auth/callback'), top('no-business'), appRoute,
      ...['overview', 'business', 'listings', 'listings/create', 'listings/edit/:id', 'promotions', 'insights', 'billing', 'settings'].map(child),
    ];
    for (const r of pages) {
      expect(r.component).toBeUndefined();
      expect(typeof r.loadComponent).toBe('function');
      const cmp = await (r.loadComponent as () => Promise<unknown>)();
      expect(typeof cmp).toBe('function');
    }
  });
});
