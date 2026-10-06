import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PromotionsComponent } from './promotions.component';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import {
  StripeService,
  StripeAddonPlan,
  SavedPaymentMethod,
  BoostAvailability,
} from '../../core/services/stripe.service';
import { CustomerErrorService } from '../../core/services/customer-error.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { VamoEvent } from '../../core/models/event.model';
import { ActivatedRoute, RouterLink, provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';

describe('PromotionsComponent', () => {
  let component: PromotionsComponent;
  let fixture: ComponentFixture<PromotionsComponent>;
  let authServiceSpy: any;
  let businessServiceSpy: any;
  let stripeServiceSpy: any;
  let errorService: CustomerErrorService;
  let i18nService: I18nService;
  let mockActivatedRoute: any;

  const mockProvider = {
    id: 'prov-101',
    name: 'Bavaro Beach Adventures',
    business_type: 'tour_operator',
  };

  const mockEvents: VamoEvent[] = [
    {
      id: 'ev-1',
      name: 'Sunset Catamaran Tour',
      status: 'published',
      startDate: '2026-10-15T18:00:00Z',
      is_main_banner: false,
      is_whats_hot: false,
      areas: [{ areas_id: 'area-uuid-1' }],
    },
    {
      id: 'ev-2',
      name: 'Punta Cana Zip Line',
      status: 'published',
      startDate: '2026-10-16T10:00:00Z',
      is_main_banner: true,
      is_whats_hot: false,
      areas: [
        {
          areas_id: {
            id: 'area-uuid-2',
            name: 'Punta Cana',
            slug: 'punta-cana',
            emoji: '🌴',
            latitude: 18.5,
            longitude: -68.3,
          },
        },
      ],
    },
    {
      id: 'ev-3',
      name: 'Draft Beach Party',
      status: 'draft',
      is_main_banner: false,
      is_whats_hot: false,
      areas: [{ areas_id: 'area-uuid-1' }],
    },
    {
      id: 'ev-no-area',
      name: 'Floating Bar Chill',
      status: 'published',
      is_main_banner: false,
      is_whats_hot: false,
      areas: [],
    },
  ];

  const mockAddonPrices: StripeAddonPlan[] = [
    {
      id: 'price_whats_hot_test',
      name: 'What’s Hot',
      description: 'Hot highlight section',
      amount: 1500,
      currency: 'usd',
      interval: 'one_time',
    },
    {
      id: 'price_main_banner_test',
      name: 'Main Banner',
      description: 'Top of discovery home banner',
      amount: 3000,
      currency: 'usd',
      interval: 'one_time',
    },
  ];

  const mockAvailability: BoostAvailability = {
    mainBanner: { count: 1, limit: 5, nextAvailableDate: null },
    whatsHot: { count: 3, limit: 10, nextAvailableDate: null },
  };

  const mockSavedCards: SavedPaymentMethod[] = [
    { id: 'pm_card_visa', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2028 },
    { id: 'pm_card_mc', brand: 'mastercard', last4: '5555', expMonth: 8, expYear: 2029 },
  ];

  async function createComponent(queryEventId: string | null = null) {
    mockActivatedRoute = {
      snapshot: {
        queryParamMap: {
          get: vi.fn((key: string) => (key === 'eventId' ? queryEventId : null)),
        },
      },
      queryParamMap: of({
        get: (key: string) => (key === 'eventId' ? queryEventId : null),
      }),
    };

    authServiceSpy = {
      currentUser: {
        id: 'usr-1',
        email: 'host@bavaro.com',
        provider_link: mockProvider,
      },
    };

    businessServiceSpy = {
      getEventsForProvider: vi.fn().mockResolvedValue(JSON.parse(JSON.stringify(mockEvents))),
      updateEvent: vi.fn(),
    };

    stripeServiceSpy = {
      getAddonPrices: vi.fn().mockResolvedValue([...mockAddonPrices]),
      getBoostAvailability: vi.fn().mockResolvedValue({ ...mockAvailability }),
      getSavedPaymentMethods: vi.fn().mockResolvedValue([...mockSavedCards]),
      createAddonPayment: vi.fn().mockResolvedValue({
        clientSecret: 'pi_test_secret_123',
        paymentIntentId: 'pi_123',
      }),
      applyAddon: vi.fn().mockResolvedValue({ success: true }),
      confirmWithSavedMethod: vi.fn().mockResolvedValue({}),
      mountPaymentElement: vi.fn().mockResolvedValue({
        stripe: { confirmPayment: vi.fn().mockResolvedValue({}) },
        elements: {},
      }),
      confirmPayment: vi.fn().mockResolvedValue({}),
      cleanup: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [PromotionsComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: BusinessService, useValue: businessServiceSpy },
        { provide: StripeService, useValue: stripeServiceSpy },
        CustomerErrorService,
        I18nService,
      ],
    }).compileComponents();

    errorService = TestBed.inject(CustomerErrorService);
    i18nService = TestBed.inject(I18nService);
    i18nService.setLang('en');

    fixture = TestBed.createComponent(PromotionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await component.loadData();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Page Rendering & Initialization', () => {
    beforeEach(async () => {
      await createComponent(null);
    });

    it('should create and render page title, subtitle, and load prices & saved methods', () => {
      expect(component).toBeTruthy();
      expect(businessServiceSpy.getEventsForProvider).toHaveBeenCalledWith('prov-101');
      expect(stripeServiceSpy.getAddonPrices).toHaveBeenCalled();
      expect(stripeServiceSpy.getSavedPaymentMethods).toHaveBeenCalled();
      // Should NOT call getBoostAvailability on initial load without event selection
      expect(stripeServiceSpy.getBoostAvailability).not.toHaveBeenCalled();
      expect(component.isLoading()).toBe(false);

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.page-title')?.textContent).toContain('VAMO Promotions & Placements');
      expect(compiled.querySelector('.page-subtitle')?.textContent).toContain('Supercharge your visibility');
    });

    it('should render active placements for events with is_main_banner or is_whats_hot', () => {
      expect(component.activeEvents().length).toBe(1);
      expect(component.activeEvents()[0].name).toBe('Punta Cana Zip Line');

      const compiled = fixture.nativeElement as HTMLElement;
      const activeSection = compiled.querySelector('.active-placements-card');
      expect(activeSection).toBeTruthy();
      expect(activeSection?.textContent).toContain('Punta Cana Zip Line');
      expect(activeSection?.textContent).toContain('Main Banner');
    });

    it('should filter only published events in the event select dropdown', () => {
      // 3 published events: ev-1, ev-2, ev-no-area (ev-3 is draft)
      expect(component.publishedEvents().length).toBe(3);
      expect(component.publishedEvents().map((e) => e.id)).toEqual(['ev-1', 'ev-2', 'ev-no-area']);
      expect(component.publishedEvents().some((e) => e.status === 'draft')).toBe(false);
    });
  });

  describe('Event Preselection via Query Param (Phase 1C.2)', () => {
    it('should preselect published event and fetch area availability when valid eventId is provided', async () => {
      await createComponent('ev-1');

      expect(component.selectedEventId()).toBe('ev-1');
      expect(component.selectedEvent()?.name).toBe('Sunset Catamaran Tour');
      expect(stripeServiceSpy.getBoostAvailability).toHaveBeenCalledWith('area-uuid-1');
      expect(component.hasNoAreaError()).toBe(false);
      expect(component.errorMessage()).toBeNull();
    });

    it('should safely reject invalid or draft eventId without crashing and display error', async () => {
      await createComponent('ev-3'); // ev-3 is draft

      expect(component.selectedEventId()).toBeNull();
      expect(component.errorMessage()).toBe(
        'The requested listing could not be found or is not eligible for promotion.'
      );
    });

    it('should safely reject non-existent eventId and display customer-safe error', async () => {
      await createComponent('ev-nonexistent');

      expect(component.selectedEventId()).toBeNull();
      expect(component.errorMessage()).toBe(
        'The requested listing could not be found or is not eligible for promotion.'
      );
    });
  });

  describe('Area Availability & Validation (Phase 1C.2)', () => {
    beforeEach(async () => {
      await createComponent(null);
    });

    it('should extract string areaId and call getBoostAvailability', async () => {
      await component.onEventSelected('ev-1');

      expect(stripeServiceSpy.getBoostAvailability).toHaveBeenCalledWith('area-uuid-1');
      expect(component.hasNoAreaError()).toBe(false);
    });

    it('should extract nested Area object id and call getBoostAvailability', async () => {
      await component.onEventSelected('ev-2');

      expect(stripeServiceSpy.getBoostAvailability).toHaveBeenCalledWith('area-uuid-2');
      expect(component.hasNoAreaError()).toBe(false);
    });

    it('should block checkout, show error, NOT call getBoostAvailability, and render correct edit route /app/listings/edit/:id when event has no area', async () => {
      await component.onEventSelected('ev-no-area');
      fixture.detectChanges();

      expect(component.hasNoAreaError()).toBe(true);
      expect(component.boostAvailability()).toBeNull();
      expect(stripeServiceSpy.getBoostAvailability).not.toHaveBeenCalled();

      // Placements must be disabled
      expect(component.isMainBannerDisabled()).toBe(true);
      expect(component.isWhatsHotDisabled()).toBe(true);

      // Warning alert with edit listing link targeting /app/listings/edit/ev-no-area
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('This listing needs a destination before it can be promoted.');

      const editLinkDe = fixture.debugElement.query(By.css('.edit-listing-btn'));
      expect(editLinkDe).toBeTruthy();
      expect(editLinkDe.nativeElement.getAttribute('href')).toBe('/app/listings/edit/ev-no-area');

      // Attempting proceedToPayment should be blocked
      component.selectedPlacements.set(new Set(['main_banner']));
      await component.proceedToPayment();
      expect(stripeServiceSpy.createAddonPayment).not.toHaveBeenCalled();
    });

    it('should clear previous availability immediately, set availabilityLoading, and disable placement selection while loading', async () => {
      let resolveAvailability!: (val: any) => void;
      stripeServiceSpy.getBoostAvailability.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveAvailability = resolve;
        })
      );

      // Trigger selection
      const selectPromise = component.onEventSelected('ev-1');

      // Immediately before resolution:
      expect(component.boostAvailability()).toBeNull();
      expect(component.availabilityLoading()).toBe(true);
      expect(component.isMainBannerDisabled()).toBe(true);
      expect(component.isWhatsHotDisabled()).toBe(true);

      // Resolving request updates availability and completes loading
      resolveAvailability(mockAvailability);
      await selectPromise;

      expect(component.availabilityLoading()).toBe(false);
      expect(component.boostAvailability()).toEqual(mockAvailability);
      expect(component.isMainBannerDisabled()).toBe(false);
    });

    it('should handle getBoostAvailability rejection safely, clear availability, show customer-safe error, and block payment', async () => {
      stripeServiceSpy.getBoostAvailability.mockRejectedValueOnce(
        new Error('Directus internal 500 network error')
      );

      await component.onEventSelected('ev-1');
      fixture.detectChanges();

      expect(component.boostAvailability()).toBeNull();
      expect(component.hasAvailabilityError()).toBe(true);
      expect(component.availabilityLoading()).toBe(false);
      expect(component.errorMessage()).toBe(
        "We couldn't confirm promotion availability. Please try again."
      );
      expect(component.isMainBannerDisabled()).toBe(true);
      expect(component.isWhatsHotDisabled()).toBe(true);

      // Attempting purchase must be blocked
      component.selectedPlacements.set(new Set(['main_banner']));
      await component.proceedToPayment();
      expect(stripeServiceSpy.createAddonPayment).not.toHaveBeenCalled();
    });

    it('should prevent late availability response from previous event from overwriting current event availability', async () => {
      let resolveFirst!: (val: any) => void;
      let resolveSecond!: (val: any) => void;

      stripeServiceSpy.getBoostAvailability
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
        )
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveSecond = resolve;
          })
        );

      // Select Event 1 (area 1)
      const p1 = component.onEventSelected('ev-1');

      // Quickly select Event 2 (area 2)
      const p2 = component.onEventSelected('ev-2');

      const availEvent2: BoostAvailability = {
        mainBanner: { count: 4, limit: 5, nextAvailableDate: null },
        whatsHot: { count: 9, limit: 10, nextAvailableDate: null },
      };

      const availEvent1Stale: BoostAvailability = {
        mainBanner: { count: 0, limit: 5, nextAvailableDate: null },
        whatsHot: { count: 0, limit: 10, nextAvailableDate: null },
      };

      // Event 2 finishes first
      resolveSecond(availEvent2);
      await p2;
      expect(component.boostAvailability()).toEqual(availEvent2);

      // Event 1 finishes late
      resolveFirst(availEvent1Stale);
      await p1;

      // Stale Event 1 response must NOT overwrite Event 2 availability
      expect(component.boostAvailability()).toEqual(availEvent2);
      expect(component.selectedEventId()).toBe('ev-2');
    });
  });

  describe('Placement Selection & Availability Rules', () => {
    beforeEach(async () => {
      await createComponent(null);
      await component.onEventSelected('ev-1');
    });

    it('should disable Main Banner selection if the selected event already has active Main Banner', async () => {
      await component.onEventSelected('ev-2'); // ev-2 has is_main_banner: true
      fixture.detectChanges();

      expect(component.selectedEventHasMainBanner()).toBe(true);
      expect(component.isMainBannerDisabled()).toBe(true);

      // Attempting to toggle Main Banner should be ignored
      component.togglePlacement('main_banner');
      expect(component.selectedPlacements().has('main_banner')).toBe(false);

      // What's hot is still available
      expect(component.isWhatsHotDisabled()).toBe(false);
      component.togglePlacement('whats_hot');
      expect(component.selectedPlacements().has('whats_hot')).toBe(true);
    });

    it('should disable placement selection if slots are sold out', () => {
      component.boostAvailability.set({
        mainBanner: { count: 5, limit: 5, nextAvailableDate: '2026-10-22T00:00:00Z' },
        whatsHot: { count: 2, limit: 10, nextAvailableDate: null },
      });
      fixture.detectChanges();

      expect(component.mainBannerFull()).toBe(true);
      expect(component.isMainBannerDisabled()).toBe(true);

      component.togglePlacement('main_banner');
      expect(component.selectedPlacements().has('main_banner')).toBe(false);
    });

    it('should calculate total amount dynamically and show separate charges note for multiple placements', () => {
      component.togglePlacement('main_banner');
      expect(component.totalAmount()).toBe(3000);
      expect(component.formattedTotal()).toContain('$30');

      component.togglePlacement('whats_hot');
      expect(component.totalAmount()).toBe(4500);
      expect(component.formattedTotal()).toContain('$45');
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.separate-charges-note')).toBeTruthy();
      expect(compiled.querySelector('.separate-charges-note')?.textContent).toContain(
        'Selected placements are processed as separate individual transactions.'
      );
    });
  });

  describe('Purchase Flow Execution & Immediate Placement (Phase 1C.2)', () => {
    beforeEach(async () => {
      await createComponent(null);
      await component.onEventSelected('ev-1');
    });

    it('should complete purchase via saved card method and pass undefined scheduledStart', async () => {
      component.togglePlacement('main_banner');
      component.selectSavedCard(mockSavedCards[0]);

      await component.proceedToPayment();

      // 1. Creates addon payment with scheduledStart: undefined
      expect(stripeServiceSpy.createAddonPayment).toHaveBeenCalledWith(
        'price_main_banner_test',
        'main_banner',
        'prov-101',
        'ev-1',
        undefined
      );

      // 2. Confirms card with saved method
      expect(stripeServiceSpy.confirmWithSavedMethod).toHaveBeenCalledWith(
        'pi_test_secret_123',
        'pm_card_visa'
      );

      // 3. Calls applyAddon flow with scheduledStart: undefined
      expect(stripeServiceSpy.applyAddon).toHaveBeenCalledWith(
        'main_banner',
        undefined,
        'ev-1',
        undefined
      );

      // 4. Browser must NEVER call updateEvent directly
      expect(businessServiceSpy.updateEvent).not.toHaveBeenCalled();

      // 5. Shows success notification
      expect(component.successMessage()).toBe(
        'Your placement has been successfully applied and is now visible to customers.'
      );
    });

    it('should mount Stripe PaymentElement and show current placement amount only on confirmation button', async () => {
      vi.useFakeTimers();
      component.togglePlacement('main_banner');
      component.togglePlacement('whats_hot');
      component.selectUseNewCard();

      // Before payment active: Order summary shows combined total ($45)
      expect(component.formattedTotal()).toContain('$45');
      fixture.detectChanges();

      const proceedPromise = component.proceedToPayment();
      await proceedPromise;

      vi.advanceTimersByTime(200);
      fixture.detectChanges();

      expect(component.paymentActive()).toBe(true);
      expect(stripeServiceSpy.mountPaymentElement).toHaveBeenCalledWith(
        'pi_test_secret_123',
        'boost-payment-element'
      );

      // First PaymentElement confirmation button shows FIRST placement price only ($30 for Main Banner), NOT $45
      const confirmBtn = fixture.nativeElement.querySelector('.checkout-actions .btn-primary');
      expect(confirmBtn.textContent.trim()).toBe('Pay $30 for Main Banner');

      vi.useRealTimers();
    });

    it('should show Go Back (PORTAL.PROMOTIONS.CANCEL_PAYMENT) on cancel button instead of Cancel Downgrade', () => {
      component.togglePlacement('main_banner');
      component.paymentActive.set(true);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const cancelBtn = compiled.querySelector('.checkout-actions .btn-secondary');
      expect(cancelBtn).toBeTruthy();
      expect(cancelBtn?.textContent?.trim()).toBe('Go back');
    });
  });

  describe('Duplicate Charge Protection & State Machine (Phase 1C.2)', () => {
    beforeEach(async () => {
      await createComponent(null);
      await component.onEventSelected('ev-1');
    });

    it('should record completed placement, report partial success, and on retry ONLY charge the remaining placement', async () => {
      component.togglePlacement('main_banner');
      component.togglePlacement('whats_hot');
      component.selectSavedCard(mockSavedCards[0]);

      // Main banner succeeds, but what's hot fails
      stripeServiceSpy.confirmWithSavedMethod
        .mockResolvedValueOnce({}) // 1st call (main_banner): success
        .mockResolvedValueOnce({
          error: {
            type: 'card_error',
            message: 'Card declined for secondary transaction',
          },
        }); // 2nd call (whats_hot): failure

      await component.proceedToPayment();

      // Main banner was completed & applied
      expect(stripeServiceSpy.applyAddon).toHaveBeenCalledTimes(1);
      expect(stripeServiceSpy.applyAddon).toHaveBeenCalledWith('main_banner', undefined, 'ev-1', undefined);
      expect(component.completedAddons()).toEqual(['main_banner']);

      // Main banner removed from selection, only whats_hot remains
      expect(component.selectedPlacements().has('main_banner')).toBe(false);
      expect(component.selectedPlacements().has('whats_hot')).toBe(true);

      // Partial success warning is displayed
      expect(component.partialSuccessMessage()).toContain('Main Banner was activated successfully');
      expect(component.errorMessage()).toBeTruthy();

      // Retry button label is shown
      expect(component.getPayButtonLabel()).toBe("Retry What's Hot");

      // User retries payment for the remaining placement
      stripeServiceSpy.confirmWithSavedMethod.mockResolvedValueOnce({});
      await component.proceedToPayment();

      // CRITICAL: createAddonPayment for main_banner must NOT have been called a second time
      // Exactly 1 for main_banner, 2 for whats_hot (initial failure + retry)
      expect(
        stripeServiceSpy.createAddonPayment.mock.calls.filter((c: any) => c[1] === 'main_banner').length
      ).toBe(1);
      expect(
        stripeServiceSpy.createAddonPayment.mock.calls.filter((c: any) => c[1] === 'whats_hot').length
      ).toBe(2);

      // confirmWithSavedMethod and applyAddon called exactly once for main_banner
      expect(
        stripeServiceSpy.applyAddon.mock.calls.filter((c: any) => c[0] === 'main_banner').length
      ).toBe(1);
      expect(
        stripeServiceSpy.applyAddon.mock.calls.filter((c: any) => c[0] === 'whats_hot').length
      ).toBe(1);

      // Both placements now succeeded
      expect(component.successMessage()).toBeTruthy();
    });
  });

  describe('Localization Parity & Live Translation Reactivity (EN & ES)', () => {
    beforeEach(async () => {
      await createComponent('ev-1');
    });

    it('should translate page titles, badges, and CTAs in Spanish', () => {
      i18nService.setLang('es');
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.page-title')?.textContent).toContain('Promociones y Posicionamiento VAMO');
      expect(compiled.querySelector('.page-subtitle')?.textContent).toContain('Aumenta tu visibilidad');

      component.togglePlacement('main_banner');
      fixture.detectChanges();

      const text = compiled.textContent;
      expect(text).toContain('Banner Principal');
      expect(text).toContain('Lo Más Caliente');
      expect(text).toContain('Resumen del Pedido');
    });

    it('should reactively update error messages when language changes', () => {
      component.errorDescriptor.set({ key: 'PORTAL.PROMOTIONS.ERROR_SELECT_EVENT' });
      i18nService.setLang('en');
      expect(component.errorMessage()).toBe('Please select a listing to promote.');

      i18nService.setLang('es');
      expect(component.errorMessage()).toBe('Por favor selecciona una publicación para promocionar.');
    });

    it('should reactively re-translate partial success message including placement names when language switches live without repeated action', async () => {
      component.togglePlacement('main_banner');
      component.togglePlacement('whats_hot');
      component.selectSavedCard(mockSavedCards[0]);

      i18nService.setLang('en');

      // Main banner succeeds, whats_hot fails
      stripeServiceSpy.confirmWithSavedMethod
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          error: { type: 'card_error', message: 'Card declined' },
        });

      await component.proceedToPayment();

      // 1. Partial success in English contains English placement names
      expect(component.partialSuccessMessage()).toBe(
        "Main Banner was activated successfully. What's Hot was not completed. You can retry the remaining placement."
      );

      // 2. Switch live to Spanish
      i18nService.setLang('es');

      // 3. Same state reactively displays Spanish sentence AND Spanish placement names
      expect(component.partialSuccessMessage()).toBe(
        'Banner Principal se activó correctamente. Lo Más Caliente no se completó. Puedes volver a intentar únicamente el posicionamiento pendiente.'
      );

      // 4. Switch back to English
      i18nService.setLang('en');
      expect(component.partialSuccessMessage()).toBe(
        "Main Banner was activated successfully. What's Hot was not completed. You can retry the remaining placement."
      );
    });
  });

  describe('Payment Confirmed / Activation Failed Safety (Phase 1C.2 Hardening)', () => {
    beforeEach(async () => {
      await createComponent('ev-1');
    });

    it('should protect against double-charging when saved card payment succeeds but applyAddon fails', async () => {
      component.togglePlacement('main_banner');
      component.selectSavedCard(mockSavedCards[0]);

      // Stripe confirmation succeeds, applyAddon rejects
      stripeServiceSpy.confirmWithSavedMethod.mockResolvedValueOnce({});
      stripeServiceSpy.applyAddon.mockRejectedValueOnce(new Error('Directus apply error'));

      await component.proceedToPayment();

      // 1. Stripe confirmation happened exactly once
      expect(stripeServiceSpy.confirmWithSavedMethod).toHaveBeenCalledTimes(1);

      // 2. createAddonPayment happened exactly once
      expect(stripeServiceSpy.createAddonPayment).toHaveBeenCalledTimes(1);

      // 3. applyAddon happened exactly once
      expect(stripeServiceSpy.applyAddon).toHaveBeenCalledTimes(1);

      // 4. Main Banner is NOT marked active
      const ev = component.events().find((e) => e.id === 'ev-1');
      expect(ev?.is_main_banner).toBeFalsy();
      expect(component.selectedEventHasMainBanner()).toBe(false);

      // 5. Customer sees dedicated activation-pending message (NOT "Payment failed")
      expect(component.hasActivationPending()).toBe(true);
      expect(component.isActivationPending('main_banner')).toBe(true);
      expect(component.isPaymentConfirmed('main_banner')).toBe(true);
      expect(component.getPlacementState('main_banner')).toBe('activation_pending');
      expect(component.activationPendingMessage()).toContain(
        "Your payment was completed, but we couldn't confirm activation of this placement."
      );
      expect(component.errorMessage()).toBeNull();

      // 6. Normal retry payment CTA for Main Banner is NOT available
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('Retry Main Banner');
      expect(component.getPayButtonLabel()).not.toContain('Retry');
      expect(component.isMainBannerDisabled()).toBe(true);

      // 7. Clicking/proceeding again CANNOT call createAddonPayment for Main Banner a second time
      await component.proceedToPayment();
      expect(stripeServiceSpy.createAddonPayment).toHaveBeenCalledTimes(1);
    });

    it('should protect against double-charging when PaymentElement payment succeeds but applyAddon fails', async () => {
      vi.useFakeTimers();
      component.togglePlacement('main_banner');
      component.selectUseNewCard();

      const mockConfirmPayment = vi.fn().mockResolvedValueOnce({ error: undefined });
      stripeServiceSpy.mountPaymentElement.mockResolvedValueOnce({
        stripe: { confirmPayment: mockConfirmPayment },
        elements: {},
      });
      stripeServiceSpy.applyAddon.mockRejectedValueOnce(new Error('Network timeout during applyAddon'));

      const proceedPromise = component.proceedToPayment();
      await proceedPromise;

      vi.advanceTimersByTime(200);
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();

      // User confirms inline PaymentElement
      await component.confirmInlinePayment();

      vi.useRealTimers();

      // 1. ConfirmPayment called once
      expect(mockConfirmPayment).toHaveBeenCalledTimes(1);
      // 2. applyAddon called once
      expect(stripeServiceSpy.applyAddon).toHaveBeenCalledTimes(1);

      // 3. Main banner NOT marked active
      expect(component.selectedEvent()?.is_main_banner).toBeFalsy();
      expect(component.selectedEventHasMainBanner()).toBe(false);

      // 4. Activation pending message shown, no generic payment retry
      expect(component.hasActivationPending()).toBe(true);
      expect(component.activationPendingMessage()).toContain(
        "Your payment was completed, but we couldn't confirm activation of this placement."
      );
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('Retry Main Banner');

      // 5. No second createAddonPayment
      await component.proceedToPayment();
      expect(stripeServiceSpy.createAddonPayment).toHaveBeenCalledTimes(1);
    });

    it('should keep payment retryable when Stripe confirmation fails BEFORE payment succeeds (saved card decline)', async () => {
      component.togglePlacement('main_banner');
      component.selectSavedCard(mockSavedCards[0]);

      stripeServiceSpy.confirmWithSavedMethod.mockResolvedValueOnce({
        error: { type: 'card_error', message: 'Card declined' },
      });

      await component.proceedToPayment();

      // Activation-pending is FALSE
      expect(component.hasActivationPending()).toBe(false);
      expect(component.isActivationPending('main_banner')).toBe(false);
      expect(component.isPaymentConfirmed('main_banner')).toBe(false);
      expect(component.activationPendingMessage()).toBeNull();

      // Generic error shown & placement remains selectable for retry
      expect(component.errorMessage()).toBeTruthy();
      expect(component.selectedPlacements().has('main_banner')).toBe(true);
      expect(component.isMainBannerDisabled()).toBe(false);
    });

    it('should keep payment retryable when PaymentElement confirmation returns error', async () => {
      vi.useFakeTimers();
      component.togglePlacement('main_banner');
      component.selectUseNewCard();

      const mockConfirmPayment = vi.fn().mockResolvedValueOnce({
        error: { message: 'Insufficient funds' },
      });
      stripeServiceSpy.mountPaymentElement.mockResolvedValueOnce({
        stripe: { confirmPayment: mockConfirmPayment },
        elements: {},
      });

      await component.proceedToPayment();
      vi.advanceTimersByTime(200);
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();

      await component.confirmInlinePayment();
      vi.useRealTimers();

      expect(mockConfirmPayment).toHaveBeenCalledTimes(1);

      // Activation-pending is FALSE
      expect(component.hasActivationPending()).toBe(false);
      expect(component.isActivationPending('main_banner')).toBe(false);
      expect(component.isPaymentConfirmed('main_banner')).toBe(false);
      expect(component.activationPendingMessage()).toBeNull();

      // Payment retry remains possible
      expect(component.selectedPlacements().has('main_banner')).toBe(true);
      expect(component.isMainBannerDisabled()).toBe(false);
    });

    it('should allow normal retry on free transactions if applyAddon fails without marking payment-confirmed', async () => {
      component.togglePlacement('main_banner');
      component.selectSavedCard(mockSavedCards[0]);

      stripeServiceSpy.createAddonPayment.mockResolvedValueOnce({ free: true });
      stripeServiceSpy.applyAddon.mockRejectedValueOnce(new Error('Apply failed on promo code'));

      await component.proceedToPayment();

      // No Stripe payment occurred: do not mark payment-confirmed or activation-pending
      expect(component.isPaymentConfirmed('main_banner')).toBe(false);
      expect(component.hasActivationPending()).toBe(false);
      expect(component.activationPendingMessage()).toBeNull();

      // Placement not falsely marked active
      expect(component.selectedEvent()?.is_main_banner).toBeFalsy();

      // Normal safe retry is allowed
      expect(component.selectedPlacements().has('main_banner')).toBe(true);
      expect(component.isMainBannerDisabled()).toBe(false);
    });

    it('should reactively translate activation-pending message live between EN and ES without rerunning calls', async () => {
      component.togglePlacement('main_banner');
      component.selectSavedCard(mockSavedCards[0]);

      stripeServiceSpy.confirmWithSavedMethod.mockResolvedValueOnce({});
      stripeServiceSpy.applyAddon.mockRejectedValueOnce(new Error('apply error'));

      i18nService.setLang('en');
      await component.proceedToPayment();

      // 1. English activation pending message
      expect(component.activationPendingMessage()).toBe(
        "Your payment was completed, but we couldn't confirm activation of this placement. Please do not pay again. Contact VAMO support for assistance."
      );

      // 2. Switch live to Spanish
      i18nService.setLang('es');
      expect(component.activationPendingMessage()).toBe(
        'Tu pago se completó, pero no pudimos confirmar la activación de este posicionamiento. No vuelvas a realizar el pago. Contacta al soporte de VAMO para recibir ayuda.'
      );

      // 3. Switch back to English
      i18nService.setLang('en');
      expect(component.activationPendingMessage()).toBe(
        "Your payment was completed, but we couldn't confirm activation of this placement. Please do not pay again. Contact VAMO support for assistance."
      );

      // Calls were made exactly once and NOT re-run
      expect(stripeServiceSpy.createAddonPayment).toHaveBeenCalledTimes(1);
      expect(stripeServiceSpy.confirmWithSavedMethod).toHaveBeenCalledTimes(1);
      expect(stripeServiceSpy.applyAddon).toHaveBeenCalledTimes(1);
    });

    it('should immediately stop queue processing when a placement activation fails and not charge remaining placements', async () => {
      component.togglePlacement('main_banner');
      component.togglePlacement('whats_hot');
      component.selectSavedCard(mockSavedCards[0]);

      // Main banner: payment succeeds, but apply fails
      stripeServiceSpy.confirmWithSavedMethod.mockResolvedValueOnce({});
      stripeServiceSpy.applyAddon.mockRejectedValueOnce(new Error('apply error on main banner'));

      await component.proceedToPayment();

      // Main banner was charged once and apply was attempted once
      expect(
        stripeServiceSpy.createAddonPayment.mock.calls.filter((c: any) => c[1] === 'main_banner').length
      ).toBe(1);
      expect(
        stripeServiceSpy.applyAddon.mock.calls.filter((c: any) => c[0] === 'main_banner').length
      ).toBe(1);

      // CRITICAL: What's Hot was NEVER charged or created because queue stopped
      expect(
        stripeServiceSpy.createAddonPayment.mock.calls.filter((c: any) => c[1] === 'whats_hot').length
      ).toBe(0);
      expect(
        stripeServiceSpy.applyAddon.mock.calls.filter((c: any) => c[0] === 'whats_hot').length
      ).toBe(0);

      // Main banner is in activation-pending
      expect(component.isActivationPending('main_banner')).toBe(true);
      expect(component.hasActivationPending()).toBe(true);
    });
  });
});
