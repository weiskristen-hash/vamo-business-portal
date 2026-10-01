import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const noAuthGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = await authService.waitForInitialAuth();

  if (!user) {
    return true;
  }

  // Logged-in user trying to access /login: redirect away
  if (user.provider_link) {
    return router.createUrlTree(['/app/overview']);
  } else {
    return router.createUrlTree(['/no-business']);
  }
};
