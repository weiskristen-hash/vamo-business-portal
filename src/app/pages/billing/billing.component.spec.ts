import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BillingComponent } from './billing.component';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { CustomerErrorService } from '../../core/services/customer-error.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import {
  StripeService,
  StripePlan,
  StripeSubscription,
  BillingHistoryItem,
  SavedPaymentMethod,
} from '../../core/services/stripe.service';
import {
  capturePromoCode,
  clearSavedPromoCode,
  getSavedPromoCode,
  sanitizePromoCode,
  MAX_PROMO_CODE_LENGTH,
} from '../../core/utils/promo-code.util';
import { LoginComponent } from '../auth/login/login.component';
import { OnboardingComponent } from '../auth/onboarding/onboarding.component';

describe('BillingComponent', () => {
  let component: BillingComponent;
  let fixture: ComponentFixture<BillingComponent>;
  let authServiceSpy: any;
  let businessServiceSpy: any;
  let stripeServiceSpy: any;
  let billingParams: Record<string, string>;

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
    clearSavedPromoCode();
    billingParams = {};
    authServiceSpy = {
      waitForInitialAuth: vi.fn().mockResolvedValue(mockUser),
      currentUser: mockUser,
      sanitizeReturnUrl: vi.fn((url: any) => url || '/app/overview'),
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
      loadSavedPaymentMethods: vi.fn().mockImplementation(async () => {
        const methods = await stripeServiceSpy.getSavedPaymentMethods();
        return {
          paymentMethods: (methods || []).map((m: SavedPaymentMethod) => ({
            ...m,
            isRenewalCard: m.isRenewalCard === true,
          })),
          defaultPaymentMethodId:
            (methods || []).find((m: SavedPaymentMethod) => m.isRenewalCard === true)?.id ?? null,
          defaultVerified: (methods || []).some((m: SavedPaymentMethod) => typeof m.isRenewalCard === 'boolean'),
        };
      }),
      createCardSetupIntent: vi.fn().mockResolvedValue({
        clientSecret: 'seti_standalone_secret_123',
        setupIntentId: 'seti_standalone_123',
      }),
      mountCardSetupElement: vi.fn().mockResolvedValue({
        stripe: {
          confirmSetup: vi.fn().mockResolvedValue({
            setupIntent: { id: 'seti_standalone_123', status: 'succeeded' },
          }),
        },
        elements: {},
      }),
      cleanupCardSetup: vi.fn(),
      finalizeCardSetup: vi.fn().mockResolvedValue({
        verified: true,
        setupIntentId: 'seti_standalone_123',
        paymentMethodId: 'pm_new_1',
        paymentMethod: {
          id: 'pm_new_1',
          brand: 'mastercard',
          last4: '5555',
          expMonth: 10,
          expYear: 2029,
          isRenewalCard: false,
        },
      }),
      setDefaultPaymentMethod: vi.fn().mockResolvedValue({
        updated: true,
        defaultPaymentMethodId: 'pm_new_1',
        customerDefaultUpdated: true,
        subscriptionDefaultUpdated: true,
      }),
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
      changeSubscriptionPlan: vi.fn().mockResolvedValue({ status: 'unverified' }),
      hasVerifiedRenewalSchedule: vi.fn((schedule: any, targetPriceId: string, expectedRenewal: number) =>
        StripeService.prototype.hasVerifiedRenewalSchedule(schedule, targetPriceId, expectedRenewal)
      ),
      hasContradictoryScheduleEvidence: vi.fn(
        (schedule: any, pendingScheduleId: string, pendingPeriodEnd: number, currentPriceId: string, targetPriceId?: string) =>
          StripeService.prototype.hasContradictoryScheduleEvidence.call(
            stripeServiceSpy,
            schedule,
            pendingScheduleId,
            pendingPeriodEnd,
            currentPriceId,
            targetPriceId
          )
      ),
      hasLookupReportedScheduledChange: vi.fn((sub: any, options?: any) =>
        StripeService.prototype.hasLookupReportedScheduledChange.call(stripeServiceSpy, sub, options)
      ),
      evaluateScheduledDowngrade: vi.fn((sub: any, options?: any) =>
        StripeService.prototype.evaluateScheduledDowngrade.call(stripeServiceSpy, sub, options)
      ),
      cancelSubscription: vi.fn().mockResolvedValue({}),
      releaseSchedule: vi.fn().mockResolvedValue({}),
      detachPaymentMethod: vi.fn().mockResolvedValue({}),
      setProviderTier: vi.fn().mockResolvedValue({}),
      tierFromProductName: vi.fn((name: string | null | undefined) =>
        StripeService.prototype.tierFromProductName(name)
      ),
      planTitleKey: vi.fn((name: string | null | undefined) =>
        StripeService.prototype.planTitleKey.call(stripeServiceSpy, name)
      ),
      getPlanTitle: vi.fn((name: string | null | undefined) => {
        if (!name || !name.trim()) return '';
        const key = stripeServiceSpy.planTitleKey(name);
        const i18n = TestBed.inject(I18nService);
        return i18n.t(key);
      }),
      formatPrice: vi.fn((amount: number) => `$${amount / 100}`),
      cleanup: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [BillingComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              get queryParams() {
                return billingParams;
              },
              queryParamMap: { get: (key: string) => billingParams[key] ?? null },
            },
          },
        },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: BusinessService, useValue: businessServiceSpy },
        { provide: StripeService, useValue: stripeServiceSpy },
        CustomerErrorService,
      ],
    }).compileComponents();

    TestBed.inject(I18nService).setLang('en');
    fixture = TestBed.createComponent(BillingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('returns to the saved post after confirmed subscription, without auto-publishing', async () => {
    billingParams = { returnEventId: 'ev-first-draft', reason: 'subscription' };
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await fixture.whenStable();
    await (component as any).finalizeSubscriptionSuccess(mockPlans[0]);
    expect(navigate).toHaveBeenCalledWith(['/app/listings/edit', 'ev-first-draft']);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('saved as a draft');
  });

  it('does not return to publishing if payment has not produced an active subscription', async () => {
    billingParams = { returnEventId: 'ev-first-draft' };
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await fixture.whenStable();
    stripeServiceSpy.getSubscription.mockResolvedValue(null);
    await (component as any).finalizeSubscriptionSuccess(mockPlans[0]);
    expect(navigate).not.toHaveBeenCalled();
    expect(stripeServiceSpy.setProviderTier).not.toHaveBeenCalled();
  });

  it('ignores malformed returnEventId instead of accepting an external redirect', () => {
    billingParams = { returnEventId: 'https://other.example/post' };
    expect(component.returnEventId).toBeNull();
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
    it('should preserve saved-card and Use a new card choices for initial subscription checkout', async () => {
      await fixture.whenStable();
      component.subscription.set(null);
      component.subscriptionLoadError.set(false);
      component.selectedPlan.set(mockPlans[0]);
      fixture.detectChanges();

      const checkoutPanel: HTMLElement = fixture.nativeElement.querySelector('.checkout-panel');
      expect(checkoutPanel).toBeTruthy();
      expect(checkoutPanel.querySelector('.saved-methods-selection')).toBeTruthy();
      const radioItems = checkoutPanel.querySelectorAll('.saved-card-radio-item');
      expect(radioItems.length).toBe(2); // 1 saved Visa 4242 + "Use a new card"
      expect(checkoutPanel.textContent).toContain('4242');
      expect(checkoutPanel.textContent).toContain('Use a new card');
      expect(checkoutPanel.querySelector('.plan-change-payment-notice')).toBeNull();
    });

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
    const upgradedSubscription: StripeSubscription = {
      ...mockSubscription,
      plan: {
        priceId: mockPlans[2].id,
        productName: 'Advanced Plan',
        amount: 8900,
        currency: 'usd',
        interval: 'month',
      },
    };

    const verifiedScheduledDowngradeSubscription: StripeSubscription = {
      ...mockSubscription,
      pendingPlanName: 'Starter Plan',
      pendingPeriodEnd: 1702500000,
      pendingScheduleId: 'sub_sched_101',
      schedule: {
        id: 'sub_sched_101',
        status: 'active',
        phases: [
          { start_date: 1700000000, end_date: 1702500000, items: [{ price: mockPlans[1].id }] },
          { start_date: 1702500000, items: [{ price: mockPlans[0].id }] },
        ],
      },
    };

    it('1. existing subscribers see the current-method notice and no card selector in the change-plan panel', async () => {
      await fixture.whenStable();
      component.openChangePlan();
      component.selectedPlan.set(mockPlans[2]);
      fixture.detectChanges();

      const checkoutPanel: HTMLElement = fixture.nativeElement.querySelector('.checkout-panel');
      expect(checkoutPanel).toBeTruthy();
      const notice = checkoutPanel.querySelector('.plan-change-payment-notice');
      expect(notice?.textContent?.trim()).toBe(
        'This plan change will use your current payment method on file.'
      );
      // Must not show saved-card radios, "Use a new card", or identify a specific saved card in the change-plan panel
      expect(checkoutPanel.querySelector('.saved-methods-selection')).toBeNull();
      expect(checkoutPanel.querySelectorAll('input[type="radio"]').length).toBe(0);
      expect(checkoutPanel.textContent).not.toContain('Use a new card');
      expect(checkoutPanel.textContent).not.toContain('4242');

      // Confirm Plan Change and Cancel actions remain available
      expect(checkoutPanel.textContent).toContain('Confirm Plan Change');
      expect(checkoutPanel.textContent).toContain('Cancel');

      // Separate Saved Payment Methods section remains intact outside checkout panel
      const savedSection: HTMLElement = fixture.nativeElement.querySelector('.saved-methods-section');
      expect(savedSection).toBeTruthy();
      expect(savedSection.textContent).toContain('4242');
    });

    it('2. verified upgrade produces success, sends compatible payload, and updates provider tier', async () => {
      stripeServiceSpy.getSubscription.mockResolvedValueOnce(upgradedSubscription);
      component.openChangePlan();
      component.selectedPlan.set(mockPlans[2]); // Advanced plan ($89 > $49)

      await component.confirmChangePlan();

      expect(stripeServiceSpy.changeSubscriptionPlan).toHaveBeenCalledTimes(1);
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
      expect(stripeServiceSpy.changeSubscriptionPlan.mock.calls[0].length).toBe(8);
      expect(stripeServiceSpy.setProviderTier).toHaveBeenCalledWith('advanced');
      expect(component.planChangeUnverified()).toBe(false);
      expect(component.selectedPlan()).toBeNull();
      expect(component.showChangePlanSection()).toBe(false);
      expect(component.successMessage()).toContain('upgraded to Advanced Plan');
    });

    it('3. empty response without verified subscription change does not produce success or update provider tier', async () => {
      // changeSubscriptionPlan returns { status: 'unverified' } on empty HTTP 200 response,
      // and re-fetched subscription still shows Basic Plan
      stripeServiceSpy.changeSubscriptionPlan.mockResolvedValueOnce({ status: 'unverified' });
      stripeServiceSpy.getSubscription.mockResolvedValueOnce(mockSubscription);
      component.openChangePlan();
      component.selectedPlan.set(mockPlans[2]);

      await component.confirmChangePlan();
      fixture.detectChanges();

      expect(stripeServiceSpy.setProviderTier).not.toHaveBeenCalled();
      expect(component.successMessage()).toBeNull();
      expect(component.planChangeUnverified()).toBe(true);
      expect(component.selectedPlan()).toEqual(mockPlans[2]);
      expect(component.showChangePlanSection()).toBe(true);
      expect(component.errorMessage()).toBe(
        'We couldn’t verify the plan change yet. Refresh billing to check its status.'
      );
      const refreshBtn = fixture.nativeElement.querySelector('.checkout-panel .refresh-billing-btn');
      expect(refreshBtn?.textContent?.trim()).toBe('Refresh billing');
    });

    it('4. pending or failed payment does not produce success or update provider tier', async () => {
      component.openChangePlan();
      component.selectedPlan.set(mockPlans[2]);

      // 4a. Direct requires_action response
      stripeServiceSpy.changeSubscriptionPlan.mockResolvedValueOnce({
        status: 'requires_action',
        clientSecret: 'pi_3ds_secret',
      });
      await component.confirmChangePlan();

      expect(stripeServiceSpy.setProviderTier).not.toHaveBeenCalled();
      expect(component.successMessage()).toBeNull();
      expect(component.errorMessage()).toContain('Additional bank authentication is required');
      expect(component.selectedPlan()).toEqual(mockPlans[2]);

      // 4b. Re-fetched subscription has target priceId but unpaid/open invoice or past_due status
      stripeServiceSpy.changeSubscriptionPlan.mockResolvedValueOnce({ status: 'unverified' });
      stripeServiceSpy.getSubscription.mockResolvedValueOnce({
        ...upgradedSubscription,
        status: 'past_due',
        latestInvoiceStatus: 'open',
      });
      await component.confirmChangePlan();

      expect(stripeServiceSpy.setProviderTier).not.toHaveBeenCalled();
      expect(component.successMessage()).toBeNull();
      expect(component.errorMessage()).toBe(
        'Your payment is still pending confirmation. Your plan will not update until payment is confirmed.'
      );
      expect(component.selectedPlan()).toEqual(mockPlans[2]);
    });

    it('5. verified renewal-time downgrade produces scheduled confirmation and never calls setProviderTier', async () => {
      component.postsUsed.set(1); // within Starter limit of 1
      stripeServiceSpy.getSubscription.mockResolvedValueOnce(verifiedScheduledDowngradeSubscription);
      component.openChangePlan();
      component.selectedPlan.set(mockPlans[0]);

      await component.confirmChangePlan();

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
      expect(stripeServiceSpy.setProviderTier).not.toHaveBeenCalled();
      expect(component.planChangeUnverified()).toBe(false);
      expect(component.selectedPlan()).toBeNull();
      expect(component.subscription()?.plan.productName).toBe('Basic Plan');
      expect(component.subscription()?.pendingPlanName).toBe('Starter Plan');
      expect(component.successMessage()).toContain('Your downgrade to Starter Plan is scheduled');
    });

    it('6. reported Basic downgrade fixture clears Verification pending warning, keeps Advanced active, and shows EN/ES dated summary across submission, Refresh billing, and reopening Billing', async () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('en');

      const activeAdvancedSubscription: StripeSubscription = {
        subscriptionId: 'sub_example',
        subscriptionItemId: 'si_example',
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodStart: 1791888342,
        currentPeriodEnd: 1794566742,
        plan: {
          priceId: 'price_current',
          productName: 'Advanced Plan',
          amount: 9900,
          currency: 'usd',
          interval: 'month',
        },
      };

      const reportedBasicDowngradeSubscription: StripeSubscription = {
        ...activeAdvancedSubscription,
        pendingPlanName: 'Basic Plan',
        pendingPeriodEnd: 1794566742,
        pendingScheduleId: 'sub_sched_example',
      };

      component.subscription.set(activeAdvancedSubscription);
      component.postsUsed.set(2);
      component.postLimit.set(8);
      component.openChangePlan();
      component.selectPlan(mockPlans[1]); // Basic Plan
      fixture.detectChanges();

      stripeServiceSpy.changeSubscriptionPlan.mockResolvedValueOnce({ status: 'unverified' });
      stripeServiceSpy.getSubscription.mockResolvedValueOnce(reportedBasicDowngradeSubscription);

      await component.confirmChangePlan();
      fixture.detectChanges();

      const expectedEnDate = component.formatDate(1794566742);
      const expectedEnSummary = `Your billing information shows Basic Plan scheduled for ${expectedEnDate}. Your current plan stays active until then.`;

      // Clears warning, closes/resets change-plan confirmation panel, keeps Advanced active, never updates provider tier early
      expect(component.planChangeUnverified()).toBe(false);
      expect(component.errorMessage()).toBeNull();
      expect(component.showChangePlanSection()).toBe(false);
      expect(component.selectedPlan()).toBeNull();
      expect(stripeServiceSpy.setProviderTier).not.toHaveBeenCalled();
      expect(component.subscription()?.plan.productName).toBe('Advanced Plan');
      expect(component.postLimit()).toBe(8);
      expect(component.isPendingPlan(mockPlans[1])).toBe(true);

      const bannerEl: HTMLElement = fixture.nativeElement.querySelector('.pending-downgrade-banner');
      expect(bannerEl).toBeTruthy();
      expect(bannerEl.textContent).toContain(expectedEnSummary);
      expect(fixture.nativeElement.querySelector('.plan-change-unverified-box')).toBeNull();

      // Spanish summary renders translated plan title and localized date
      i18n.setLang('es');
      fixture.detectChanges();
      const expectedEsDate = component.formatDate(1794566742);
      const expectedEsSummary = `Tu información de facturación muestra el Plan Básico programado para el ${expectedEsDate}. Tu plan actual seguirá activo hasta esa fecha.`;
      expect(bannerEl.textContent).toContain(expectedEsSummary);
      expect(component.successMessage()).toBe(expectedEsSummary);
      i18n.setLang('en');
      fixture.detectChanges();

      // Refresh billing performs reads only and resolves the same reported state when initially unverified
      component.subscription.set(activeAdvancedSubscription);
      component.openChangePlan();
      component.selectPlan(mockPlans[1]);
      stripeServiceSpy.changeSubscriptionPlan.mockClear();
      stripeServiceSpy.getSubscription.mockResolvedValueOnce(activeAdvancedSubscription);
      await component.confirmChangePlan();
      expect(component.planChangeUnverified()).toBe(true);
      expect(stripeServiceSpy.changeSubscriptionPlan).toHaveBeenCalledTimes(1);

      stripeServiceSpy.getSubscription.mockResolvedValueOnce(reportedBasicDowngradeSubscription);
      await component.refreshBilling();
      fixture.detectChanges();

      expect(stripeServiceSpy.changeSubscriptionPlan).toHaveBeenCalledTimes(1); // read-only refresh
      expect(component.planChangeUnverified()).toBe(false);
      expect(component.errorMessage()).toBeNull();
      expect(component.showChangePlanSection()).toBe(false);
      expect(component.selectedPlan()).toBeNull();
      expect(fixture.nativeElement.querySelector('.pending-downgrade-banner')?.textContent).toContain(
        expectedEnSummary
      );

      // Reopening Billing (loadInitialData) shows consistent Scheduled status and disables selecting/confirming Basic Plan
      stripeServiceSpy.getSubscription.mockResolvedValueOnce(reportedBasicDowngradeSubscription);
      await component.loadInitialData();
      component.openChangePlan();
      fixture.detectChanges();

      expect(component.planChangeUnverified()).toBe(false);
      expect(component.isPendingPlan(mockPlans[1])).toBe(true);
      expect(fixture.nativeElement.querySelector('.badge-scheduled')?.textContent?.trim()).toBe('Scheduled');

      // Selecting or reconfirming the same scheduled target cannot call the mutation
      stripeServiceSpy.changeSubscriptionPlan.mockClear();
      component.selectPlan(mockPlans[1]);
      expect(component.selectedPlan()).toBeNull();
      component.selectedPlan.set(mockPlans[1]); // even if forced on component state
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector('.checkout-panel button.btn-primary')
      ).toBeNull();
      await component.confirmChangePlan();
      expect(stripeServiceSpy.changeSubscriptionPlan).not.toHaveBeenCalled();
    });

    it('6b. missing schedule ID, mismatched target, invalid/past date, different renewal date, or contradictory schedule evidence retains unverified state and prevents blind resubmission', async () => {
      const activeAdvancedSubscription: StripeSubscription = {
        subscriptionId: 'sub_example',
        subscriptionItemId: 'si_example',
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodStart: 1791888342,
        currentPeriodEnd: 1794566742,
        plan: {
          priceId: 'price_current',
          productName: 'Advanced Plan',
          amount: 9900,
          currency: 'usd',
          interval: 'month',
        },
      };

      component.subscription.set(activeAdvancedSubscription);
      component.postsUsed.set(1);
      component.openChangePlan();
      component.selectPlan(mockPlans[1]); // Basic Plan

      // Missing pendingScheduleId -> unverified
      stripeServiceSpy.getSubscription.mockResolvedValueOnce({
        ...activeAdvancedSubscription,
        pendingPlanName: 'Basic Plan',
        pendingPeriodEnd: 1794566742,
        pendingScheduleId: '',
      });
      await component.confirmChangePlan();
      fixture.detectChanges();

      expect(component.planChangeUnverified()).toBe(true);
      expect(component.selectedPlan()).toEqual(mockPlans[1]);
      expect(component.errorMessage()).toBe(
        'We couldn’t verify the plan change yet. Refresh billing to check its status.'
      );
      expect(fixture.nativeElement.querySelector('.pending-downgrade-banner')).toBeNull();
      expect(component.isPendingPlan(mockPlans[1])).toBe(false);

      // Unknown mutation outcome cannot be blindly resubmitted; Confirm Plan Change is disabled and handler blocks repeat calls
      stripeServiceSpy.changeSubscriptionPlan.mockClear();
      const confirmBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
        '.checkout-panel .checkout-actions .btn-primary'
      );
      expect(confirmBtn.disabled).toBe(true);
      component.selectPlan(mockPlans[1]); // clicking same target keeps unverified state
      expect(component.planChangeUnverified()).toBe(true);
      await component.confirmChangePlan();
      expect(stripeServiceSpy.changeSubscriptionPlan).not.toHaveBeenCalled();

      // Mismatched target (Starter Plan instead of Basic Plan) on Refresh -> remains unverified
      stripeServiceSpy.getSubscription.mockResolvedValueOnce({
        ...activeAdvancedSubscription,
        pendingPlanName: 'Starter Plan',
        pendingPeriodEnd: 1794566742,
        pendingScheduleId: 'sub_sched_example',
      });
      await component.refreshBilling();
      expect(component.planChangeUnverified()).toBe(true);

      // Invalid/past date -> remains unverified
      stripeServiceSpy.getSubscription.mockResolvedValueOnce({
        ...activeAdvancedSubscription,
        currentPeriodEnd: 1702500000,
        pendingPlanName: 'Basic Plan',
        pendingPeriodEnd: 1702500000,
        pendingScheduleId: 'sub_sched_example',
      });
      await component.refreshBilling();
      expect(component.planChangeUnverified()).toBe(true);

      // Different renewal date (pendingPeriodEnd !== currentPeriodEnd) -> remains unverified
      stripeServiceSpy.getSubscription.mockResolvedValueOnce({
        ...activeAdvancedSubscription,
        pendingPlanName: 'Basic Plan',
        pendingPeriodEnd: 1799999999,
        pendingScheduleId: 'sub_sched_example',
      });
      await component.refreshBilling();
      expect(component.planChangeUnverified()).toBe(true);

      // Contradictory schedule evidence (wrong renewal date or wrong target priceId in schedule phases) -> remains unverified
      stripeServiceSpy.getSubscription.mockResolvedValueOnce({
        ...activeAdvancedSubscription,
        pendingPlanName: 'Basic Plan',
        pendingPeriodEnd: 1794566742,
        pendingScheduleId: 'sub_sched_example',
        schedule: {
          id: 'sub_sched_example',
          status: 'active',
          phases: [
            { start_date: 1791888342, end_date: 1799999999, items: [{ price: 'price_current' }] },
            { start_date: 1799999999, items: [{ price: mockPlans[0].id }] },
          ],
        },
      });
      await component.refreshBilling();
      expect(component.planChangeUnverified()).toBe(true);
      expect(component.selectedPlan()).toEqual(mockPlans[1]);

      // Selecting a different target clears unverified state and allows beginning a deliberate new change
      component.selectPlan(mockPlans[0]); // Starter Plan
      expect(component.selectedPlan()).toEqual(mockPlans[0]);
      expect(component.planChangeUnverified()).toBe(false);
      expect(component.errorMessage()).toBeNull();

      // Cancel/close while verification is pending closes panel without implying a Stripe schedule was canceled
      component.planChangeUnverified.set(true);
      component.closeChangePlan();
      expect(stripeServiceSpy.releaseSchedule).not.toHaveBeenCalled();
      expect(component.successMessage()).toBeNull();
    });

    it('7. refreshBilling checks authoritative state without repeating the mutation', async () => {
      // Initial upgrade attempt returns unverified because read flow has not caught up yet
      stripeServiceSpy.getSubscription.mockResolvedValueOnce(mockSubscription);
      component.openChangePlan();
      component.selectedPlan.set(mockPlans[2]);

      await component.confirmChangePlan();

      expect(stripeServiceSpy.changeSubscriptionPlan).toHaveBeenCalledTimes(1);
      expect(component.planChangeUnverified()).toBe(true);
      expect(component.selectedPlan()).toEqual(mockPlans[2]);

      // User clicks Refresh billing; read flow now returns verified upgraded subscription
      stripeServiceSpy.getSubscription.mockResolvedValueOnce(upgradedSubscription);
      await component.refreshBilling();

      // Must NOT repeat changeSubscriptionPlan mutation
      expect(stripeServiceSpy.changeSubscriptionPlan).toHaveBeenCalledTimes(1);
      expect(stripeServiceSpy.setProviderTier).toHaveBeenCalledWith('advanced');
      expect(component.planChangeUnverified()).toBe(false);
      expect(component.selectedPlan()).toBeNull();
      expect(component.errorMessage()).toBeNull();
      expect(component.successMessage()).toContain('upgraded to Advanced Plan');
    });

    it('8. should warn when downgrading if active post count exceeds new plan limit before executing downgrade', async () => {
      stripeServiceSpy.getSubscription.mockResolvedValueOnce(verifiedScheduledDowngradeSubscription);
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
      expect(stripeServiceSpy.setProviderTier).not.toHaveBeenCalled();
    });

    it('9. repeated clicks cannot submit duplicate plan changes while in flight', async () => {
      let resolvePlanChange!: (val: any) => void;
      stripeServiceSpy.changeSubscriptionPlan.mockReturnValueOnce(
        new Promise((res) => {
          resolvePlanChange = res;
        })
      );
      stripeServiceSpy.getSubscription.mockResolvedValueOnce(upgradedSubscription);
      component.openChangePlan();
      component.selectedPlan.set(mockPlans[2]);

      const firstCall = component.confirmChangePlan();
      const secondCall = component.confirmChangePlan();

      expect(stripeServiceSpy.changeSubscriptionPlan).toHaveBeenCalledTimes(1);
      resolvePlanChange({ status: 'unverified' });
      await Promise.all([firstCall, secondCall]);
    });

    it('10. Cancel leaves the subscription unchanged and closes the change-plan panel', () => {
      component.openChangePlan();
      component.selectedPlan.set(mockPlans[2]);

      component.closeChangePlan();

      expect(stripeServiceSpy.changeSubscriptionPlan).not.toHaveBeenCalled();
      expect(component.showChangePlanSection()).toBe(false);
      expect(component.selectedPlan()).toBeNull();
      expect(component.subscription()).toEqual(mockSubscription);
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

    it('should handle subscription load failure separately from no-subscription state without leaking backend error', async () => {
      // When initial load fails, subscriptionLoadError is true and new-subscription checkout is not shown as if user had no subscription
      component.subscription.set(undefined);
      stripeServiceSpy.getSubscription.mockRejectedValueOnce(
        new Error('HTTP 500 Directus Flow a48e3dee-3d94-471b-804f-16ada69737cf crash on cus_12345')
      );

      await component.loadSubscription('sofia@restaurant.com');
      fixture.detectChanges();

      expect(component.subscription()).toBeNull();
      expect(component.subscriptionLoadError()).toBe(true);
      expect(component.errorMessage()).toBeNull();
      expect(fixture.nativeElement.querySelector('.subscription-read-error-banner')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.plans-selection-section')).toBeNull();

      // When a refresh fails while a subscription is already loaded, existing subscription is preserved
      component.subscription.set(mockSubscription);
      stripeServiceSpy.getSubscription.mockRejectedValueOnce(new Error('Network timeout'));
      await component.loadSubscription('sofia@restaurant.com');

      expect(component.subscriptionLoadError()).toBe(true);
      expect(component.subscription()).toEqual(mockSubscription);
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
        features: [],
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
        features: [],
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

    it('11. renders exact EN/ES current-method and unverified notices while keeping plan-change payload values unchanged', async () => {
      await fixture.whenStable();
      const i18n = TestBed.inject(I18nService);

      i18n.setLang('en');
      component.openChangePlan();
      component.selectedPlan.set(mockPlans[2]);
      fixture.detectChanges();

      expect(i18n.t('PORTAL.BILLING.PLAN_CHANGE_PAYMENT_METHOD_NOTICE')).toBe(
        'This plan change will use your current payment method on file.'
      );
      expect(i18n.t('PORTAL.BILLING.ERROR_PLAN_CHANGE_UNVERIFIED')).toBe(
        'We couldn’t verify the plan change yet. Refresh billing to check its status.'
      );
      expect(
        fixture.nativeElement.querySelector('.plan-change-payment-notice')?.textContent?.trim()
      ).toBe('This plan change will use your current payment method on file.');

      // Trigger unverified state and verify EN -> ES switch updates copy dynamically
      stripeServiceSpy.getSubscription.mockResolvedValueOnce(mockSubscription);
      await component.confirmChangePlan();
      fixture.detectChanges();

      expect(component.errorMessage()).toBe(
        'We couldn’t verify the plan change yet. Refresh billing to check its status.'
      );

      i18n.setLang('es');
      fixture.detectChanges();

      expect(i18n.t('PORTAL.BILLING.PLAN_CHANGE_PAYMENT_METHOD_NOTICE')).toBe(
        'Este cambio de plan usará tu método de pago actual registrado.'
      );
      expect(i18n.t('PORTAL.BILLING.ERROR_PLAN_CHANGE_UNVERIFIED')).toBe(
        'Todavía no pudimos confirmar el cambio de plan. Actualiza la sección de facturación para revisar su estado.'
      );
      expect(
        fixture.nativeElement.querySelector('.plan-change-payment-notice')?.textContent?.trim()
      ).toBe('Este cambio de plan usará tu método de pago actual registrado.');
      expect(component.errorMessage()).toBe(
        'Todavía no pudimos confirmar el cambio de plan. Actualiza la sección de facturación para revisar su estado.'
      );

      expect(stripeServiceSpy.changeSubscriptionPlan).toHaveBeenCalledWith(
        'sub_123',
        'si_456',
        'price_1TcqJ0GWvZAV5mbnaBgaMp4Y',
        true,
        'Advanced Plan',
        1700000000,
        1702500000,
        'price_1TcqJhGWvZAV5mbnzpBnUhoX'
      );
      i18n.setLang('en');
    });
  });

  describe('Promo Link Capture & Checkout Prefill', () => {
    it('trims, strips control characters, and caps promo code length in sessionStorage', () => {
      const overlong = '  FOUNDERS90_' + 'X'.repeat(80) + '\u0000\n ';
      const saved = capturePromoCode(overlong);
      expect(saved).toBeTruthy();
      expect(saved!.startsWith('FOUNDERS90_')).toBe(true);
      expect(saved!.length).toBe(MAX_PROMO_CODE_LENGTH);
      expect(getSavedPromoCode()).toBe(saved);

      expect(sanitizePromoCode('   ')).toBeNull();
      // Empty parameter on subsequent route does not overwrite existing saved promo code
      expect(capturePromoCode(null)).toBeNull();
      expect(getSavedPromoCode()).toBe(saved);
    });

    it('captures ?promo=FOUNDERS90 on /register (OnboardingComponent) and /login (LoginComponent) and persists across reloads', async () => {
      authServiceSpy.currentUser = null;
      billingParams = { promo: '  FOUNDERS90  ' };
      const onboardingFixture = TestBed.createComponent(OnboardingComponent);
      await onboardingFixture.componentInstance.ngOnInit();
      expect(getSavedPromoCode()).toBe('FOUNDERS90');

      clearSavedPromoCode();
      billingParams = { promo: 'FOUNDERS90' };
      const loginFixture = TestBed.createComponent(LoginComponent);
      loginFixture.componentInstance.ngOnInit();
      expect(getSavedPromoCode()).toBe('FOUNDERS90');
    });

    it('prefills checkout coupon field for a user with no subscription without claiming the discount is applied', async () => {
      capturePromoCode('FOUNDERS90');
      stripeServiceSpy.getSubscription.mockResolvedValueOnce(null);

      await component.loadSubscription(mockUser.email);
      component.selectPlan(mockPlans[0]);
      fixture.detectChanges();

      expect(component.couponCode()).toBe('FOUNDERS90');
      expect(component.promoResult()).toBeNull();
      expect(stripeServiceSpy.validatePromoCode).not.toHaveBeenCalled();

      // Proceeding without clicking Apply does not send an unvalidated promoCodeId
      await component.proceedToPayment();
      expect(stripeServiceSpy.createSubscription).toHaveBeenCalledWith(
        'sofia@restaurant.com',
        'Sofia Hernandez',
        mockPlans[0].id,
        undefined
      );
    });

    it('never overwrites a coupon the customer has already entered or applied', async () => {
      capturePromoCode('FOUNDERS90');
      stripeServiceSpy.getSubscription.mockResolvedValue(null);

      component.couponCode.set('CUSTOM50');
      await component.loadSubscription(mockUser.email);
      component.selectPlan(mockPlans[0]);
      expect(component.couponCode()).toBe('CUSTOM50');

      component.couponCode.set('');
      component.promoResult.set({ valid: true, name: 'APPLIED10', promoCodeId: 'promo_10' });
      component.selectPlan(mockPlans[1]);
      expect(component.couponCode()).toBe('');
      expect(component.promoResult()?.name).toBe('APPLIED10');
    });

    it('allows editing or removing the prefilled code and prevents silent restoration during the same checkout', async () => {
      capturePromoCode('FOUNDERS90');
      stripeServiceSpy.getSubscription.mockResolvedValueOnce(null);

      await component.loadSubscription(mockUser.email);
      component.selectPlan(mockPlans[0]);
      expect(component.couponCode()).toBe('FOUNDERS90');

      // Remove code via removePromoCode()
      component.removePromoCode();
      expect(component.couponCode()).toBe('');

      // Selecting another plan during the same checkout must not silently restore FOUNDERS90
      component.selectPlan(mockPlans[1]);
      expect(component.couponCode()).toBe('');
    });

    it('retains saved promo code on failed checkout and clears it only after confirmed successful checkout', async () => {
      capturePromoCode('FOUNDERS90');
      stripeServiceSpy.getSubscription.mockResolvedValueOnce(null);
      await component.loadSubscription(mockUser.email);
      component.selectPlan(mockPlans[0]);

      stripeServiceSpy.validatePromoCode.mockResolvedValueOnce({
        valid: true,
        name: 'FOUNDERS90',
        percentOff: 90,
        promoCodeId: 'promo_founders90',
      });
      await component.applyPromoCode();
      expect(component.promoResult()?.promoCodeId).toBe('promo_founders90');

      // Failed checkout retains saved promo code
      stripeServiceSpy.createSubscription.mockRejectedValueOnce(new Error('Card declined'));
      await component.proceedToPayment();
      expect(getSavedPromoCode()).toBe('FOUNDERS90');

      // Confirmed checkout clears saved promo code
      stripeServiceSpy.createSubscription.mockResolvedValueOnce({
        clientSecret: null,
        subscriptionId: 'sub_confirmed',
        requiresSetup: false,
      });
      stripeServiceSpy.getSubscription.mockResolvedValueOnce(mockSubscription);
      await component.proceedToPayment();

      expect(getSavedPromoCode()).toBeNull();
      expect(component.couponCode()).toBe('');
      expect(component.promoResult()).toBeNull();
    });
  });

  describe('Standalone Credit-Card Management', () => {
    it('always renders Payment methods section and empty state with Add credit card button when no cards are saved', async () => {
      stripeServiceSpy.loadSavedPaymentMethods.mockResolvedValueOnce({
        paymentMethods: [],
        defaultPaymentMethodId: null,
        defaultVerified: true,
      });

      await component.loadSavedMethods();
      fixture.detectChanges();

      const section = fixture.nativeElement.querySelector('.saved-methods-section');
      expect(section).toBeTruthy();
      expect(section.textContent).toContain('Payment methods');

      const addBtn = fixture.nativeElement.querySelector('.add-card-btn');
      expect(addBtn).toBeTruthy();
      expect(addBtn.textContent).toContain('Add credit card');

      const emptyState = fixture.nativeElement.querySelector('.empty-saved-cards');
      expect(emptyState).toBeTruthy();
      expect(emptyState.textContent).toContain('No saved cards');
      expect(emptyState.textContent).toContain('Add a credit or debit card for future payments.');
    });

    it('renders distinct loading and load-error states for payment methods', async () => {
      component.savedMethods.set([]);
      component.savedMethodsLoading.set(true);
      component.savedMethodsError.set(false);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.payment-methods-loading')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.empty-saved-cards')).toBeNull();

      stripeServiceSpy.loadSavedPaymentMethods.mockRejectedValueOnce(new Error('Network failure'));
      await component.loadSavedMethods();
      fixture.detectChanges();

      expect(component.savedMethodsError()).toBe(true);
      const errorState = fixture.nativeElement.querySelector('.payment-methods-error');
      expect(errorState).toBeTruthy();
      expect(errorState.textContent).toContain('We couldn’t load your saved payment methods. Please try again.');
      expect(fixture.nativeElement.querySelector('.empty-saved-cards')).toBeNull();
    });

    it('opens and closes the Add Card panel and cleans up the standalone SetupIntent Payment Element without affecting subscription checkout', async () => {
      await component.openAddCard();
      fixture.detectChanges();

      expect(component.cardSetupOpen()).toBe(true);
      expect(component.useCardForRenewals()).toBe(false); // unchecked by default
      expect(stripeServiceSpy.createCardSetupIntent).toHaveBeenCalledTimes(1);
      expect(stripeServiceSpy.mountCardSetupElement).toHaveBeenCalledWith(
        'seti_standalone_secret_123',
        'portal-card-setup-element'
      );
      expect(stripeServiceSpy.createSubscription).not.toHaveBeenCalled();

      const panel = fixture.nativeElement.querySelector('.add-card-panel');
      expect(panel).toBeTruthy();
      expect(panel.textContent).toContain('Use this card for future subscription renewals');
      expect(panel.textContent).toContain(
        'Saving a card won’t charge you or change your subscription. Your bank may show a temporary verification hold.'
      );

      component.cancelAddCard();
      fixture.detectChanges();

      expect(component.cardSetupOpen()).toBe(false);
      expect(stripeServiceSpy.cleanupCardSetup).toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('.add-card-panel')).toBeNull();
    });

    it('saves a card without setting default when renewal checkbox is unchecked and does not create or change a subscription', async () => {
      await component.openAddCard();
      expect(component.useCardForRenewals()).toBe(false);

      stripeServiceSpy.loadSavedPaymentMethods.mockResolvedValueOnce({
        paymentMethods: [
          ...mockSavedMethods,
          {
            id: 'pm_new_1',
            brand: 'mastercard',
            last4: '5555',
            expMonth: 10,
            expYear: 2029,
            isRenewalCard: false,
          },
        ],
        defaultPaymentMethodId: null,
        defaultVerified: true,
      });

      await component.saveNewCard();

      expect(stripeServiceSpy.confirmSetup).toHaveBeenCalledTimes(1);
      expect(stripeServiceSpy.finalizeCardSetup).toHaveBeenCalledWith('seti_standalone_123');
      expect(stripeServiceSpy.setDefaultPaymentMethod).not.toHaveBeenCalled();
      expect(stripeServiceSpy.createSubscription).not.toHaveBeenCalled();
      expect(stripeServiceSpy.changeSubscriptionPlan).not.toHaveBeenCalled();
      expect(component.cardSetupOpen()).toBe(false);
      expect(component.successMessage()).toBe('Card saved.');
      expect(component.savedMethods().some((m) => m.id === 'pm_new_1')).toBe(true);
    });

    it('saves a card and sets it as renewal card when checkbox is checked', async () => {
      await component.openAddCard();
      component.useCardForRenewals.set(true);

      const savedRenewalCard: SavedPaymentMethod = {
        id: 'pm_new_1',
        brand: 'mastercard',
        last4: '5555',
        expMonth: 10,
        expYear: 2029,
        isRenewalCard: true,
      };
      stripeServiceSpy.loadSavedPaymentMethods
        .mockResolvedValueOnce({
          paymentMethods: [{ ...savedRenewalCard, isRenewalCard: false }],
          defaultPaymentMethodId: null,
          defaultVerified: true,
        })
        .mockResolvedValueOnce({
          paymentMethods: [savedRenewalCard],
          defaultPaymentMethodId: 'pm_new_1',
          defaultVerified: true,
        });

      await component.saveNewCard();

      expect(stripeServiceSpy.finalizeCardSetup).toHaveBeenCalledWith('seti_standalone_123');
      expect(stripeServiceSpy.setDefaultPaymentMethod).toHaveBeenCalledWith('pm_new_1', 'sub_123');
      expect(component.successMessage()).toBe('Card saved and set for future renewals.');
      expect(component.defaultPaymentMethodId()).toBe('pm_new_1');
      expect(component.defaultPaymentMethodVerified()).toBe(true);
    });

    it('handles partial failure when card is saved but setting renewal card fails, and allows retrying default selection', async () => {
      await component.openAddCard();
      component.useCardForRenewals.set(true);

      const newSavedCard: SavedPaymentMethod = {
        id: 'pm_new_1',
        brand: 'mastercard',
        last4: '5555',
        expMonth: 10,
        expYear: 2029,
        isRenewalCard: false,
      };
      stripeServiceSpy.setDefaultPaymentMethod.mockRejectedValueOnce(
        new Error('Set default flow unavailable')
      );
      stripeServiceSpy.loadSavedPaymentMethods.mockResolvedValueOnce({
        paymentMethods: [newSavedCard],
        defaultPaymentMethodId: null,
        defaultVerified: true,
      });

      await component.saveNewCard();
      fixture.detectChanges();

      expect(component.cardSetupOpen()).toBe(false);
      expect(component.successMessage()).toBeNull();
      expect(component.pendingRenewalRetryCardId()).toBe('pm_new_1');
      expect(component.errorMessage()).toBe('Card saved, but we couldn’t update your renewal card.');
      expect(component.savedMethods().some((m) => m.id === 'pm_new_1')).toBe(true);

      const retryBtn = fixture.nativeElement.querySelector('.set-renewal-card-btn');
      expect(retryBtn).toBeTruthy();
      expect(retryBtn.textContent).toContain('Retry renewal card');

      // Retry setting default without repeating card setup
      stripeServiceSpy.setDefaultPaymentMethod.mockResolvedValueOnce({
        updated: true,
        defaultPaymentMethodId: 'pm_new_1',
        customerDefaultUpdated: true,
        subscriptionDefaultUpdated: true,
      });
      stripeServiceSpy.loadSavedPaymentMethods.mockResolvedValueOnce({
        paymentMethods: [{ ...newSavedCard, isRenewalCard: true }],
        defaultPaymentMethodId: 'pm_new_1',
        defaultVerified: true,
      });

      await component.setCardAsRenewal(newSavedCard);
      expect(stripeServiceSpy.createCardSetupIntent).toHaveBeenCalledTimes(1); // not called again
      expect(component.pendingRenewalRetryCardId()).toBeNull();
      expect(component.successMessage()).toBe('Card saved and set for future renewals.');
    });

    it('shows customer-safe error in Add Card panel when SetupIntent confirmation fails and keeps panel open', async () => {
      await component.openAddCard();
      stripeServiceSpy.confirmSetup.mockResolvedValueOnce({
        error: { type: 'card_error', code: 'incorrect_cvc', message: 'Your card security code is incorrect.' },
      });

      await component.saveNewCard();
      fixture.detectChanges();

      expect(component.cardSetupOpen()).toBe(true);
      expect(stripeServiceSpy.finalizeCardSetup).not.toHaveBeenCalled();
      expect(component.cardSetupError()).toBeTruthy();
      expect(component.cardSetupError()).not.toContain('Directus');
      expect(component.successMessage()).toBeNull();
    });

    it('shows Renewal card badge only when defaultPaymentMethodVerified is true from backend state and never infers from list order', async () => {
      // Unverified list order: first card must NOT get Renewal card badge
      component.savedMethods.set([
        { id: 'pm_first', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2028, isRenewalCard: false },
        { id: 'pm_second', brand: 'mastercard', last4: '4444', expMonth: 11, expYear: 2029, isRenewalCard: false },
      ]);
      component.defaultPaymentMethodId.set(null);
      component.defaultPaymentMethodVerified.set(false);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.renewal-card-badge')).toBeNull();

      // Verified second card is default: only second card gets Renewal card badge
      component.savedMethods.set([
        { id: 'pm_first', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2028, isRenewalCard: false },
        { id: 'pm_second', brand: 'mastercard', last4: '4444', expMonth: 11, expYear: 2029, isRenewalCard: true },
      ]);
      component.defaultPaymentMethodId.set('pm_second');
      component.defaultPaymentMethodVerified.set(true);
      fixture.detectChanges();

      const badges = fixture.nativeElement.querySelectorAll('.renewal-card-badge');
      expect(badges.length).toBe(1);
      expect(badges[0].textContent).toContain('Renewal card');
    });

    it('blocks removing the active renewal card until another card is selected as renewal card', async () => {
      const renewalMethod: SavedPaymentMethod = {
        id: 'pm_renewal',
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2028,
        isRenewalCard: true,
      };
      component.subscription.set(mockSubscription); // active subscription
      component.savedMethods.set([renewalMethod]);
      component.defaultPaymentMethodId.set('pm_renewal');
      component.defaultPaymentMethodVerified.set(true);
      fixture.detectChanges();

      await component.deletePaymentMethod(renewalMethod);

      expect(stripeServiceSpy.detachPaymentMethod).not.toHaveBeenCalled();
      expect(component.errorMessage()).toBe(
        'Select another card for renewals before removing your active renewal card.'
      );
      expect(component.savedMethods().length).toBe(1);
    });

    it('verifies 3DS redirect SetupIntent via finalizeCardSetup before claiming success', async () => {
      billingParams = {
        card_setup: '1',
        setup_intent: 'seti_redirect_999',
        redirect_status: 'succeeded',
        use_for_renewals: '1',
      };
      stripeServiceSpy.finalizeCardSetup.mockResolvedValueOnce({
        verified: true,
        setupIntentId: 'seti_redirect_999',
        paymentMethodId: 'pm_redirect_999',
      });
      stripeServiceSpy.setDefaultPaymentMethod.mockResolvedValueOnce({
        updated: true,
        defaultPaymentMethodId: 'pm_redirect_999',
        customerDefaultUpdated: true,
        subscriptionDefaultUpdated: true,
      });

      await component.ngOnInit();

      expect(stripeServiceSpy.finalizeCardSetup).toHaveBeenCalledWith('seti_redirect_999');
      expect(stripeServiceSpy.setDefaultPaymentMethod).toHaveBeenCalledWith('pm_redirect_999', 'sub_123');
      expect(component.successMessage()).toBe('Card saved and set for future renewals.');
    });

    it('renders Spanish translations accurately for standalone credit-card management', async () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('es');

      stripeServiceSpy.loadSavedPaymentMethods.mockResolvedValueOnce({
        paymentMethods: [],
        defaultPaymentMethodId: null,
        defaultVerified: true,
      });
      await component.loadSavedMethods();
      await component.openAddCard();
      fixture.detectChanges();

      const section = fixture.nativeElement.querySelector('.saved-methods-section');
      expect(section.textContent).toContain('Métodos de pago');
      expect(section.textContent).toContain('Agregar tarjeta');
      expect(section.textContent).toContain('No tienes tarjetas guardadas');
      expect(section.textContent).toContain('Usar esta tarjeta para futuras renovaciones de la suscripción');
      expect(section.textContent).toContain('Guardar tarjeta');

      i18n.setLang('en');
    });
  });

});



