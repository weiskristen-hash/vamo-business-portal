import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { authGuard } from './auth.guard';
import { noAuthGuard } from './no-auth.guard';
import { businessGuard } from './business.guard';
import { AuthService } from '../services/auth.service';
import { VamoUser } from '../models/user.model';

describe('Route Guards', () => {
  let authServiceSpy: any;
  let routerSpy: any;

  const mockBusinessUser: VamoUser = {
    id: 'user-123',
    email: 'business@vamo-app.com',
    first_name: 'Carlos',
    last_name: 'Perez',
    provider_link: {
      id: 'provider-999',
      name: 'Punta Cana Surf Club',
      city: 'Las Terrenas',
      business_type: 'Activities',
      subscription_tier: 'basic',
    },
  };

  const mockConsumerUser: VamoUser = {
    id: 'user-456',
    email: 'traveler@gmail.com',
    first_name: 'Maria',
    last_name: 'Santos',
    provider_link: null,
  };

  beforeEach(() => {
    authServiceSpy = {
      waitForInitialAuth: vi.fn(),
    };

    routerSpy = {
      createUrlTree: vi.fn((commands, extras) => ({
        toString: () => commands.join('/'),
        commands,
        extras,
      })),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
      ],
    });
  });

  describe('authGuard', () => {
    it('should permit access when user is authenticated', async () => {
      authServiceSpy.waitForInitialAuth.mockResolvedValue(mockBusinessUser);

      const result = await TestBed.runInInjectionContext(() =>
        authGuard({} as any, { url: '/app/overview' } as any)
      );

      expect(result).toBe(true);
    });

    it('should redirect unauthenticated users to /login with returnUrl', async () => {
      authServiceSpy.waitForInitialAuth.mockResolvedValue(null);

      const result = await TestBed.runInInjectionContext(() =>
        authGuard({} as any, { url: '/app/overview' } as any)
      );

      expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/app/overview' },
      });
      expect(result).toBeTruthy();
    });
  });

  describe('noAuthGuard', () => {
    it('should permit access to login when user is NOT logged in', async () => {
      authServiceSpy.waitForInitialAuth.mockResolvedValue(null);

      const result = await TestBed.runInInjectionContext(() =>
        noAuthGuard({} as any, {} as any)
      );

      expect(result).toBe(true);
    });

    it('should redirect logged-in business user away from login to /app/overview', async () => {
      authServiceSpy.waitForInitialAuth.mockResolvedValue(mockBusinessUser);

      const result = await TestBed.runInInjectionContext(() =>
        noAuthGuard({} as any, {} as any)
      );

      expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/app/overview']);
      expect(result).toBeTruthy();
    });

    it('should redirect logged-in consumer user away from login to /no-business', async () => {
      authServiceSpy.waitForInitialAuth.mockResolvedValue(mockConsumerUser);

      const result = await TestBed.runInInjectionContext(() =>
        noAuthGuard({} as any, {} as any)
      );

      expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/no-business']);
      expect(result).toBeTruthy();
    });
  });

  describe('businessGuard', () => {
    it('should permit business user with valid provider_link', async () => {
      authServiceSpy.waitForInitialAuth.mockResolvedValue(mockBusinessUser);

      const result = await TestBed.runInInjectionContext(() =>
        businessGuard({} as any, {} as any)
      );

      expect(result).toBe(true);
    });

    it('should redirect consumer user without provider_link to /no-business', async () => {
      authServiceSpy.waitForInitialAuth.mockResolvedValue(mockConsumerUser);

      const result = await TestBed.runInInjectionContext(() =>
        businessGuard({} as any, {} as any)
      );

      expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/no-business']);
      expect(result).toBeTruthy();
    });

    it('should redirect unauthenticated user to /login', async () => {
      authServiceSpy.waitForInitialAuth.mockResolvedValue(null);

      const result = await TestBed.runInInjectionContext(() =>
        businessGuard({} as any, {} as any)
      );

      expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/login']);
      expect(result).toBeTruthy();
    });
  });
});
