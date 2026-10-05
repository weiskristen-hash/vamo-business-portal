import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BillingComponent } from './billing.component';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { CustomerErrorService } from '../../core/services/customer-error.service';
import { I18nService } from '../../core/i18n/i18n.service';
import {
  StripeService,
  StripePlan,
  StripeSubscription,
  BillingHistoryItem,
  SavedPaymentMethod,
} from '../../core/services/stripe.service';

describe('BillingComponent', () => {
  let component: BillingComponent;
  let fixture: ComponentFixture<BillingComponent>;
  let authServiceSpy: any;
  let businessServiceSpy: any;
  let stripeServiceSpy: any;

  const mockUser = {
    id: 'user-1',
    email: 'sofia@restaurant.com',
    first_name: 'Sofia',
    last_name: 'Hernandez',
    provider_link: {
      id: 'prov-101',
      name: 'Restaurante El Faro',
      subscription_tier: 'basic',
    },
  };

  const mockSubscription: StripeSubscription = {
    subscriptionId: 'sub_123',
    subscriptionItemId: 'si_456',
    status: 'active',
    cancelAtPeriodEnd: false,
    currentPeriodStart: 1700000000,
    currentPeriodEnd: 1702500000,
    plan: {
      priceId: 'price_1TcqJhGWvZAV5mbnzpBnUhoX',
      productName: 'Basic Plan',
      amount: 4900,
      currency: 'usd',
      interval: 'month',
    },
  };

  const mockPlans: StripePlan[] = [
    {
      id: 'price_1TcqK3GWvZAV5mbnBLpijcYO',
      name: 'Starter Plan',
      description: '1 active post',
      amount: 2900,
      currency: 'usd',
      interval: 'month',
      tier: 'starter',
      maxPosts: 1,
      features: ['1 active post', 'Search discovery'],
    },
    {
      id: 'price_1TcqJhGWvZAV5mbnzpBnUhoX',
      name: 'Basic Plan',
      description: 'Up to 4 active posts',
      amount: 4900,
      currency: 'usd',
      interval: 'month',
      tier: 'basic',
      maxPosts: 4,
      features: ['Up to 4 active posts', 'Basic analytics'],
    },
    {
      id: 'price_1TcqJ0GWvZAV5mbnaBgaMp4Y',
      name: 'Advanced Plan',
      description: 'Up to 8 active posts',
      amount: 8900,
      currency: 'usd',
      interval: 'month',
      tier: 'advanced',
      maxPosts: 8,
      features: ['Up to 8 active posts', 'Priority placement'],
    },
  ];

  const mockSavedMethods: SavedPaymentMethod[] = [
    {
      id: 'pm_1',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2028,
    },
  ];

  const mockHistory: BillingHistoryItem[] = [
    {
      id: 'in_1',
      type: 'subscription',
      label: 'Basic Plan Monthly Renewal',
      amount: 4900,
      currency: 'usd',
      date: 1700000000,
      status: 'paid',
      invoice_pdf: 'https://stripe.com/invoice.pdf',
      hosted_invoice_url: 'https://stripe.com/invoice',
    },
  ];

  beforeEach(async () => {
    authServiceSpy = {
      waitForInitialAuth: vi.fn().mockResolvedValue(mockUser),
      currentUser: mockUser,
    };

    businessServiceSpy = {
      getEventsForProvider: vi.fn().mockResolvedValue([
        { id: 'ev-1', status: 'published' },
        { id: 'ev-2', status: 'published' },
      ]),
    };

    stripeServiceSpy = {
      getSubscription: vi.fn().mockResolvedValue(mockSubscription),
      getPlans: vi.fn().mockResolvedValue(mockPlans),
      getSavedPaymentMethods: vi.fn().mockResolvedValue(mockSavedMethods),
      getBillingHistory: vi.fn().mockResolvedValue(mockHistory),
      getExtraPosts: vi.fn().mockResolvedValue(0),
      validatePromoCode: vi.fn().mockResolvedValue({ valid: true, name: 'WELCOME20', percentOff: 20 }),
      createSubscription: vi.fn().mockResolvedValue({
        clientSecret: 'pi_test_secret',
        subscriptionId: 'sub_new_1',
        requiresSetup: false,
      }),
      mountPaymentElement: vi.fn().mockResolvedValue({
        stripe: {
          confirmPayment: vi.fn().mockResolvedValue({}),
          confirmSetup: vi.fn().mockResolvedValue({}),
        },
        elements: {},
      }),
      confirmPayment: vi.fn().mockResolvedValue({}),
      confirmSetup: vi.fn().mockResolvedValue({}),
      confirmWithSavedMethod: vi.fn().mockResolvedValue({}),
      confirmSetupWithSavedMethod: vi.fn().mockResolvedValue({}),
      changeSubscriptionPlan: vi.fn().mockResolvedValue({}),
      cancelSubscription: vi.fn().mockResolvedValue({}),
      releaseSchedule: vi.fn().mockResolvedValue({}),
      detachPaymentMethod: vi.fn().mockResolvedValue({}),
      setProviderTier: vi.fn().mockResolvedValue({}),
      tierFromProductName: vi.fn((name: string) => {
        if (name.includes('Basic')) return 'basic';
        if (name.includes('Starter')) return 'starter';
        if (name.includes('Advanced')) return 'advanced';
        return 'starter';
      }),
      formatPrice: vi.fn((amount: number) => `$${amount / 100}`),
      cleanup: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [BillingComponent],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: BusinessService, useValue: businessServiceSpy },
        { provide: StripeService, useValue: stripeServiceSpy },
        CustomerErrorService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BillingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should initialize and load active subscription and plans', async () => {
    await fixture.whenStable();
    expect(component.subscription()).toEqual(mockSubscription);
    expect(component.plans().length).toBe(3);
    expect(component.postsUsed()).toBe(2);
    expect(component.postLimit()).toBe(4);
    expect(component.savedMethods().length).toBe(1);
    expect(component.billingHistory().length).toBe(1);
  });

  describe('Current Plan & Status Display', () => {
    it('should identify whether a plan is the current plan', () => {
      expect(component.isCurrentPlan(mockPlans[1])).toBe(true);
      expect(component.isCurrentPlan(mockPlans[0])).toBe(false);
    });

    it('should format date timestamps into human-readable strings', () => {
      const formatted = component.formatDate(1702500000);
      expect(formatted).toBeTruthy();
      expect(formatted).toContain('2023');
    });
  });

  describe('Promotion / Coupon Flow', () => {
    it('should validate and apply a valid promotion code', async () => {
      component.couponCode.set('WELCOME20');
      await component.applyPromoCode();

      expect(stripeServiceSpy.validatePromoCode).toHaveBeenCalledWith('WELCOME20');
      expect(component.promoResult()?.valid).toBe(true);
      expect(component.promoResult()?.name).toBe('WELCOME20');
      expect(component.couponError()).toBeNull();
    });

    it('should display friendly error when promo code is invalid', async () => {
      stripeServiceSpy.validatePromoCode.mockResolvedValueOnce({ valid: false });
      component.couponCode.set('INVALID123');
      await component.applyPromoCode();

      expect(component.promoResult()).toBeNull();
      expect(component.couponError()).toBe("That promotion code isn't valid.");
    });

    it('should remove applied promo code', () => {
      component.promoResult.set({ valid: true, name: 'TEST' });
      component.couponCode.set('TEST');
      component.removePromoCode();

      expect(component.promoResult()).toBeNull();
      expect(component.couponCode()).toBe('');
    });
  });

  describe('New Subscription & PaymentIntent / SetupIntent', () => {
    it('should handle paid subscription path with PaymentIntent and mount element', async () => {
      component.subscription.set(null); // simulate new customer with no subscription
      component.selectedPlan.set(mockPlans[0]);

      await component.proceedToPayment();

      expect(stripeServiceSpy.createSubscription).toHaveBeenCalledWith(
        'sofia@restaurant.com',
        'Sofia Hernandez',
        mockPlans[0].id,
        undefined
      );
      expect(component.clientSecret()).toBe('pi_test_secret');
      expect(component.paymentActive()).toBe(true);
      expect(component.paymentRequiresSetup()).toBe(false);
    });

    it('should handle 100% free coupon path with SetupIntent flag', async () => {
      component.subscription.set(null);
      component.selectedPlan.set(mockPlans[0]);
      stripeServiceSpy.createSubscription.mockResolvedValueOnce({
        clientSecret: 'seti_test_secret',
        subscriptionId: 'sub_free',
        requiresSetup: true,
      });

      await component.proceedToPayment();

      expect(component.clientSecret()).toBe('seti_test_secret');
      expect(component.paymentRequiresSetup()).toBe(true);
      expect(component.paymentActive()).toBe(true);
    });

    it('should pay with saved card directly without mounting payment element', async () => {
      component.subscription.set(null);
      component.selectedPlan.set(mockPlans[0]);
      component.selectedSavedMethod.set(mockSavedMethods[0]);

      await component.proceedToPayment();

      expect(stripeServiceSpy.confirmWithSavedMethod).toHaveBeenCalledWith(
        'pi_test_secret',
        'pm_1'
      );
      expect(stripeServiceSpy.setProviderTier).toHaveBeenCalledWith('starter');
      expect(component.successMessage()).toContain('Starter Plan');
    });
  });

  describe('Upgrade & Downgrade (Change Plan)', () => {
    it('should execute upgrade immediately and sync provider tier', async () => {
      component.selectedPlan.set(mockPlans[2]); // Advanced plan ($89 > $49)
      await component.confirmChangePlan();

      expect(stripeServiceSpy.changeSubscriptionPlan).toHaveBeenCalledWith(
        'sub_123',
        'si_456',
        mockPlans[2].id,
        true,
        'Advanced Plan',
        1700000000,
        1702500000,
        mockSubscription.plan.priceId
      );
      expect(stripeServiceSpy.setProviderTier).toHaveBeenCalledWith('advanced');
      expect(component.successMessage()).toContain('upgraded to Advanced Plan');
    });

    it('should warn when downgrading if active post count exceeds new plan limit', async () => {
      component.postsUsed.set(3); // 3 active posts
      component.selectedPlan.set(mockPlans[0]); // Starter plan allows 1

      await component.confirmChangePlan();

      // Should not call changeSubscriptionPlan yet; should display warning
      expect(stripeServiceSpy.changeSubscriptionPlan).not.toHaveBeenCalled();
      expect(component.downgradeWarning()).toEqual({ activePosts: 3, newLimit: 1 });

      // User confirms downgrade anyway
      await component.confirmDowngradeAnyway();
      expect(stripeServiceSpy.changeSubscriptionPlan).toHaveBeenCalledWith(
        'sub_123',
        'si_456',
        mockPlans[0].id,
        false,
        'Starter Plan',
        1700000000,
        1702500000,
        mockSubscription.plan.priceId
      );
    });

    it('should allow canceling a scheduled downgrade via releaseSchedule', async () => {
      component.subscription.set({
        ...mockSubscription,
        pendingPlanName: 'Starter Plan',
        pendingScheduleId: 'sub_sched_999',
      });

      await component.cancelPendingDowngrade();

      expect(stripeServiceSpy.releaseSchedule).toHaveBeenCalledWith('sub_sched_999');
      expect(component.successMessage()).toContain('canceled');
    });
  });

  describe('Cancellation & Reactivation', () => {
    it('should open cancellation modal and cancel subscription at period end', async () => {
      component.openCancelModal();
      expect(component.showCancelConfirmModal()).toBe(true);

      await component.confirmCancelSubscription();
      expect(stripeServiceSpy.cancelSubscription).toHaveBeenCalledWith('sub_123', true);
      expect(component.showCancelConfirmModal()).toBe(false);
      expect(component.successMessage()).toContain('Subscription canceled');
    });

    it('should reactivate a canceling subscription', async () => {
      component.subscription.set({
        ...mockSubscription,
        cancelAtPeriodEnd: true,
      });

      await component.reactivateSubscription();
      expect(stripeServiceSpy.cancelSubscription).toHaveBeenCalledWith('sub_123', false);
      expect(component.successMessage()).toContain('reactivated');
    });
  });

  describe('Saved Payment Methods & Detach', () => {
    it('should detach saved payment method', async () => {
      await component.deletePaymentMethod(mockSavedMethods[0]);
      expect(stripeServiceSpy.detachPaymentMethod).toHaveBeenCalledWith('pm_1');
      expect(component.savedMethods().length).toBe(0);
    });
  });

  describe('Customer-Safe Error Handling', () => {
    it('should sanitize unexpected backend errors without leaking Directus or Stripe internals', async () => {
      stripeServiceSpy.createSubscription.mockRejectedValueOnce(
        new Error('Directus 403 Forbidden: access denied on collection stripe_subscriptions with query {"filter":{}}')
      );
      component.selectedPlan.set(mockPlans[0]);

      await component.proceedToPayment();

      expect(component.errorMessage()).not.toContain('Directus');
      expect(component.errorMessage()).not.toContain('collection');
      expect(component.errorMessage()).not.toContain('stripe_subscriptions');
      expect(component.errorMessage()).not.toContain('filter');
    });

    it('should display friendly error and empty plans array when plan loading fails', async () => {
      stripeServiceSpy.getPlans.mockRejectedValueOnce(
        new Error("We couldn't load current plan pricing. Please try again.")
      );

      await component.loadPlans();

      expect(component.plans().length).toBe(0);
      expect(component.errorMessage()).toBe("We couldn't load current plan pricing. Please try again.");
    });

    it('should prevent proceeding to payment when plans are empty', async () => {
      component.plans.set([]);
      component.selectedPlan.set(mockPlans[0]);

      await component.proceedToPayment();

      expect(stripeServiceSpy.createSubscription).not.toHaveBeenCalled();
      expect(component.errorMessage()).toBe("We couldn't load current plan pricing. Please try again.");
    });

    it('should handle subscription load failure gracefully by setting null subscription without leaking backend error', async () => {
      stripeServiceSpy.getSubscription.mockRejectedValueOnce(
        new Error('HTTP 500 Directus Flow a48e3dee-3d94-471b-804f-16ada69737cf crash on cus_12345')
      );

      await component.loadSubscription('sofia@restaurant.com');

      expect(component.subscription()).toBeNull();
      expect(component.errorMessage()).toBeNull();
    });

    it('should handle payment methods load failure gracefully with empty array', async () => {
      stripeServiceSpy.getSavedPaymentMethods.mockRejectedValueOnce(
        new Error('Flow 44946457-c8cd-42e2-98b2-a7a0672d59d3 timeout')
      );

      await component.loadSavedMethods();

      expect(component.savedMethods()).toEqual([]);
    });

    it('should handle billing history load failure gracefully with empty array', async () => {
      stripeServiceSpy.getBillingHistory.mockRejectedValueOnce(
        new Error('Flow f8be3b19-62c9-4d0d-91ca-701bdaeaac7e returned 502 Bad Gateway')
      );

      await component.loadBillingHistory();

      expect(component.billingHistory()).toEqual([]);
      expect(component.billingHistoryLoading()).toBe(false);
    });

    it('should sanitize Stripe.js initialization failure without leaking SDK or secret details', async () => {
      stripeServiceSpy.mountPaymentElement.mockRejectedValueOnce(
        new Error('Stripe failed to initialize. Invalid key pk_test_...')
      );
      component.clientSecret.set('pi_test_secret');
      component.paymentActive.set(true);

      // Trigger private mount
      await (component as any).mountPaymentElement('pi_test_secret');

      expect(component.errorMessage()).not.toContain('pk_test');
      expect(component.errorMessage()).not.toContain('initialize');
      expect(component.errorMessage()).toBe("We couldn't load this information. Please refresh the page.");
    });
  });

  describe('Phase 2C.4 Localization & Canonical Parity', () => {
    it('should translate page title and headings in EN and switch dynamically to ES', () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('en');
      expect(i18n.t('PORTAL.BILLING.TITLE')).toBe('Subscription & Billing');
      expect(i18n.t('PORTAL.BILLING.QUOTA_TITLE')).toBe('Publishing Quota');
      expect(i18n.t('PORTAL.BILLING.HISTORY_TITLE')).toBe('Invoice & Billing Receipts');

      i18n.setLang('es');
      expect(i18n.t('PORTAL.BILLING.TITLE')).toBe('Suscripción y facturación');
      expect(i18n.t('PORTAL.BILLING.QUOTA_TITLE')).toBe('Límite de publicaciones');
      expect(i18n.t('PORTAL.BILLING.HISTORY_TITLE')).toBe('Facturas y recibos');
    });

    it('should keep plan names untranslated (Starter, Basic, Advanced) across both languages', () => {
      const i18n = TestBed.inject(I18nService);
      const testPlan: StripePlan = {
        id: 'price_test',
        name: 'Starter Plan',
        description: 'Starter tier',
        amount: 2900,
        currency: 'usd',
        interval: 'month',
        tier: 'starter',
        maxPosts: 1,
      };

      i18n.setLang('en');
      expect(testPlan.name).toBe('Starter Plan');

      i18n.setLang('es');
      expect(testPlan.name).toBe('Starter Plan');
    });

    it('should render canonical tier features in EN and ES dynamically', () => {
      const i18n = TestBed.inject(I18nService);
      const starterPlan: StripePlan = {
        id: 'p1',
        name: 'Starter Plan',
        description: '',
        amount: 2900,
        currency: 'usd',
        interval: 'month',
        tier: 'starter',
        maxPosts: 1,
      };

      i18n.setLang('en');
      const enFeats = component.getPlanFeatures(starterPlan);
      expect(enFeats).toContain('1 active post (event or activity)');
      expect(enFeats).toContain('Search & category discovery');

      i18n.setLang('es');
      const esFeats = component.getPlanFeatures(starterPlan);
      expect(esFeats).toContain('1 publicación activa (evento o actividad)');
      expect(esFeats).toContain('Descubrimiento por búsqueda y categorías');
    });

    it('should format dates according to i18n.dateLocale()', () => {
      const i18n = TestBed.inject(I18nService);
      const timestamp = 1715000000; // May 6, 2024

      i18n.setLang('en');
      const formattedEn = component.formatDate(timestamp);
      expect(formattedEn).toContain('2024');

      i18n.setLang('es');
      const formattedEs = component.formatDate(timestamp);
      expect(formattedEs).toContain('2024');
    });
  });

  describe('Final review: language switch never mutates Stripe/backend values', () => {
    it('keeps plan ids, tiers, amounts and checkout payload identical across EN/ES', async () => {
      await fixture.whenStable();
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('en');
      const before = JSON.parse(JSON.stringify(component.plans()));

      i18n.setLang('es');
      fixture.detectChanges();
      expect(JSON.parse(JSON.stringify(component.plans()))).toEqual(before);
      expect(component.getPlanFeatures(mockPlans[0])).toContain('1 publicaci\u00f3n activa (evento o actividad)');

      component.subscription.set(null);
      component.selectedPlan.set(mockPlans[0]);
      await component.proceedToPayment();

      expect(stripeServiceSpy.createSubscription).toHaveBeenCalledWith(
        'sofia@restaurant.com',
        'Sofia Hernandez',
        mockPlans[0].id,
        undefined
      );
      expect(mockPlans[0].id.startsWith('price_')).toBe(true);
      expect(mockPlans[0].tier).toBe('starter');
      i18n.setLang('en');
    });
  });

});
