import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const businessGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = await authService.waitForInitialAuth();

  if (!user) {
    return router.createUrlTree(['/login']);
  }

  // Check if provider_link exists
  if (user.provider_link && user.provider_link.id) {
    return true;
  }

  // Authenticated user with no business account
  return router.createUrlTree(['/no-business']);
};
