import { TestBed } from '@angular/core/testing';
import {
  SubscriptionStatusService,
  buildSubscriptionViewModel,
  evaluateSubscriptionAccess,
  cleanTierName,
  resolveTierFromProductName,
} from './subscription-status.service';
import { AuthService } from './auth.service';
import { StripeService, StripeSubscription } from './stripe.service';
import { I18nService } from '../i18n/i18n.service';
import { BehaviorSubject } from 'rxjs';

describe('SubscriptionStatusService & Shared Resolver', () => {
  let service: SubscriptionStatusService;
  let authServiceMock: any;
  let stripeServiceMock: any;
  let i18nService: I18nService;
  let userSubject: BehaviorSubject<any>;

  const mockActiveStarterSub: StripeSubscription = {
    subscriptionId: 'sub_123',
    subscriptionItemId: 'si_123',
    status: 'active',
    cancelAtPeriodEnd: false,
    currentPeriodStart: 1700000000,
    currentPeriodEnd: 2000000000,
    plan: {
      priceId: 'price_starter',
      productName: 'Starter Plan',
      amount: 1900,
      currency: 'usd',
      interval: 'month',
    },
  };

  const mockActiveBasicSub: StripeSubscription = {
    ...mockActiveStarterSub,
    plan: {
      ...mockActiveStarterSub.plan,
      priceId: 'price_basic',
      productName: 'Basic Subscription',
    },
  };

  const mockActiveAdvancedSub: StripeSubscription = {
    ...mockActiveStarterSub,
    plan: {
      ...mockActiveStarterSub.plan,
      priceId: 'price_adv',
      productName: 'Advanced Subscription',
    },
  };

  beforeEach(() => {
    userSubject = new BehaviorSubject<any>({
      id: 'usr-1',
      email: 'owner@beachclub.com',
      provider_link: {
        id: 'prov-1',
        name: 'LT Beach Club',
        verified: true, // verified flag present
        subscription_tier: 'starter', // stale stored Directus field
      },
    });

    authServiceMock = {
      currentUser: userSubject.value,
      user$: userSubject.asObservable(),
    };

    stripeServiceMock = {
      getSubscription: vi.fn().mockResolvedValue(mockActiveStarterSub),
    };

    TestBed.configureTestingModule({
      providers: [
        I18nService,
        SubscriptionStatusService,
        { provide: AuthService, useValue: authServiceMock },
        { provide: StripeService, useValue: stripeServiceMock },
      ],
    });

    i18nService = TestBed.inject(I18nService);
    i18nService.setLang('en');
    service = TestBed.inject(SubscriptionStatusService);
  });

  describe('Pure Resolver & Entitlement Evaluation', () => {
    it('1. correctly evaluates active plans (Starter, Basic, Advanced)', () => {
      const starterEval = evaluateSubscriptionAccess(mockActiveStarterSub, 1750000000);
      expect(starterEval.state).toBe('active');
      expect(starterEval.tier).toBe('starter');
      expect(starterEval.tierName).toBe('Starter');

      const basicEval = evaluateSubscriptionAccess(mockActiveBasicSub, 1750000000);
      expect(basicEval.state).toBe('active');
      expect(basicEval.tier).toBe('basic');
      expect(basicEval.tierName).toBe('Basic');

      const advEval = evaluateSubscriptionAccess(mockActiveAdvancedSub, 1750000000);
      expect(advEval.state).toBe('active');
      expect(advEval.tier).toBe('advanced');
      expect(advEval.tierName).toBe('Advanced');
    });

    it('2. keeps access for cancel_at_period_end while current period is in the future', () => {
      const cancelingSub: StripeSubscription = {
        ...mockActiveStarterSub,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: 2000000000,
      };

      // Before period ends
      const beforeEval = evaluateSubscriptionAccess(cancelingSub, 1999999999);
      expect(beforeEval.state).toBe('active');
      expect(beforeEval.tierName).toBe('Starter');

      // After period ends
      const afterEval = evaluateSubscriptionAccess(cancelingSub, 2000000001);
      expect(afterEval.state).toBe('inactive');
      expect(afterEval.tierName).toBe('');
    });

    it('3. labels trial clearly and provides access according to policy', () => {
      const trialSub: StripeSubscription = {
        ...mockActiveStarterSub,
        status: 'trialing',
      };

      const trialEval = evaluateSubscriptionAccess(trialSub, 1750000000);
      expect(trialEval.state).toBe('trialing');
      expect(trialEval.tierName).toBe('Starter');
    });

    it('4. marks non-access statuses (canceled, past_due, unpaid, paused, incomplete) as inactive', () => {
      const inactiveStatuses = ['canceled', 'past_due', 'unpaid', 'paused', 'incomplete', 'incomplete_expired'];

      for (const status of inactiveStatuses) {
        const sub: StripeSubscription = {
          ...mockActiveStarterSub,
          status,
        };
        const evaluation = evaluateSubscriptionAccess(sub, 1750000000);
        expect(evaluation.state).toBe('inactive');
        expect(evaluation.tierName).toBe('');
      }
    });

    it('5. builds correct view model in EN and ES for active Starter', () => {
      const t = (k: string) => i18nService.t(k);

      // English
      i18nService.setLang('en');
      const vmEn = buildSubscriptionViewModel({ state: 'active', sub: mockActiveStarterSub }, 'en', t);
      expect(vmEn.cardTierDisplay).toBe('STARTER');
      expect(vmEn.cardStatusDisplay).toBe('Active subscription');
      expect(vmEn.topbarStatusDisplay).toBe('Starter · Active');
      expect(vmEn.statusClass).toBe('is-active');

      // Spanish
      i18nService.setLang('es');
      const vmEs = buildSubscriptionViewModel({ state: 'active', sub: mockActiveStarterSub }, 'es', t);
      expect(vmEs.cardTierDisplay).toBe('STARTER');
      expect(vmEs.cardStatusDisplay).toBe('Suscripción activa');
      expect(vmEs.topbarStatusDisplay).toBe('Starter · Activa');
      expect(vmEs.statusClass).toBe('is-active');

      i18nService.setLang('en');
    });

    it('6. builds correct view model in EN and ES for inactive subscription', () => {
      const t = (k: string) => i18nService.t(k);

      // English
      i18nService.setLang('en');
      const vmEn = buildSubscriptionViewModel({ state: 'inactive', sub: null }, 'en', t);
      expect(vmEn.cardTierDisplay).toBe('INACTIVE');
      expect(vmEn.cardStatusDisplay).toBe('No active subscription');
      expect(vmEn.topbarStatusDisplay).toBe('Inactive');
      expect(vmEn.statusClass).toBe('is-inactive');

      // Spanish
      i18nService.setLang('es');
      const vmEs = buildSubscriptionViewModel({ state: 'inactive', sub: null }, 'es', t);
      expect(vmEs.cardTierDisplay).toBe('INACTIVA');
      expect(vmEs.cardStatusDisplay).toBe('Sin suscripción activa');
      expect(vmEs.topbarStatusDisplay).toBe('Inactiva');
      expect(vmEs.statusClass).toBe('is-inactive');

      i18nService.setLang('en');
    });

    it('7. builds neutral loading placeholder and unavailable error state', () => {
      const t = (k: string) => i18nService.t(k);

      // Loading
      const vmLoading = buildSubscriptionViewModel({ state: 'loading', sub: null }, 'en', t);
      expect(vmLoading.cardTierDisplay).toBe('···');
      expect(vmLoading.topbarStatusDisplay).toBe('···');
      expect(vmLoading.statusClass).toBe('is-loading');

      // Error / Unavailable
      const vmError = buildSubscriptionViewModel({ state: 'error', sub: null }, 'en', t);
      expect(vmError.cardTierDisplay).toBe('UNAVAILABLE');
      expect(vmError.topbarStatusDisplay).toBe('Unavailable');
      expect(vmError.statusClass).toBe('is-error');

      // Error in Spanish
      i18nService.setLang('es');
      const vmErrorEs = buildSubscriptionViewModel({ state: 'error', sub: null }, 'es', t);
      expect(vmErrorEs.cardTierDisplay).toBe('NO DISPONIBLE');
      expect(vmErrorEs.topbarStatusDisplay).toBe('No disponible');
      expect(vmErrorEs.cardStatusDisplay).toBe('Suscripción no disponible');
      i18nService.setLang('en');
    });
  });

  describe('Service Integration & Business Switching', () => {
    it('8. loads authoritative active subscription for selected business', async () => {
      stripeServiceMock.getSubscription.mockResolvedValue(mockActiveStarterSub);
      await service.refresh();

      const vm = service.status();
      expect(vm.state).toBe('active');
      expect(vm.cardTierDisplay).toBe('STARTER');
      expect(vm.cardStatusDisplay).toBe('Active subscription');
      expect(vm.topbarStatusDisplay).toBe('Starter · Active');
    });

    it('9. ignores verified flag and Directus tier when Stripe reports no active subscription', async () => {
      stripeServiceMock.getSubscription.mockResolvedValue(null);
      await service.refresh();

      const vm = service.status();
      expect(vm.state).toBe('inactive');
      expect(vm.cardTierDisplay).toBe('INACTIVE');
      expect(vm.cardStatusDisplay).toBe('No active subscription');
      expect(vm.topbarStatusDisplay).toBe('Inactive');
    });

    it('10. prevents cached state leakage when switching business', async () => {
      // Business A: Active Advanced
      stripeServiceMock.getSubscription.mockResolvedValue(mockActiveAdvancedSub);
      userSubject.next({
        id: 'usr-1',
        email: 'bizA@example.com',
        provider_link: { id: 'prov-A', name: 'Business A' },
      });
      await service.refresh();
      expect(service.status().cardTierDisplay).toBe('ADVANCED');
      expect(service.status().topbarStatusDisplay).toBe('Advanced · Active');

      // Switch to Business B: No active subscription
      stripeServiceMock.getSubscription.mockResolvedValue(null);
      userSubject.next({
        id: 'usr-2',
        email: 'bizB@example.com',
        provider_link: { id: 'prov-B', name: 'Business B' },
      });
      await service.refresh();
      expect(service.status().cardTierDisplay).toBe('INACTIVE');
      expect(service.status().topbarStatusDisplay).toBe('Inactive');
    });

    it('11. displays unavailable when subscription request fails without asserting active or inactive', async () => {
      stripeServiceMock.getSubscription.mockRejectedValue(new Error('Network offline'));
      await service.refresh();

      const vm = service.status();
      expect(vm.state).toBe('error');
      expect(vm.cardTierDisplay).toBe('UNAVAILABLE');
      expect(vm.topbarStatusDisplay).toBe('Unavailable');
    });

    it('12. reactively updates EN and ES labels live without repeated API calls', async () => {
      stripeServiceMock.getSubscription.mockResolvedValue(mockActiveStarterSub);
      stripeServiceMock.getSubscription.mockClear();
      await service.refresh();
      expect(stripeServiceMock.getSubscription).toHaveBeenCalledTimes(1);

      // Initially EN
      expect(service.status().topbarStatusDisplay).toBe('Starter · Active');
      expect(service.status().cardStatusDisplay).toBe('Active subscription');

      // Switch to Spanish
      i18nService.setLang('es');
      expect(service.status().topbarStatusDisplay).toBe('Starter · Activa');
      expect(service.status().cardStatusDisplay).toBe('Suscripción activa');
      expect(service.status().cardTierDisplay).toBe('STARTER'); // Product name stays in uppercase

      // No new API call occurred
      expect(stripeServiceMock.getSubscription).toHaveBeenCalledTimes(1);

      i18nService.setLang('en');
    });
  });
});
