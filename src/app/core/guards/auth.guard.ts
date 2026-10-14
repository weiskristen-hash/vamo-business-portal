import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { capturePromoCode, extractPromoFromUrl } from '../utils/promo-code.util';

export const authGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const promo = capturePromoCode(route?.queryParamMap?.get('promo') ?? extractPromoFromUrl(state?.url));
  const user = await authService.waitForInitialAuth();

  if (user) {
    return true;
  }

  // Not logged in -> redirect to login with returnUrl (and preserve promo if present)
  const queryParams: Record<string, string> = { returnUrl: state.url };
  if (promo) {
    queryParams['promo'] = promo;
  }
  return router.createUrlTree(['/login'], { queryParams });
};
