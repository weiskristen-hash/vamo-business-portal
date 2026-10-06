import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PromotionsComponent } from './promotions.component';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { StripeService, StripeAddonPlan, SavedPaymentMethod, BoostAvailability } from '../../core/services/stripe.service';
import { CustomerErrorService } from '../../core/services/customer-error.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { VamoEvent } from '../../core/models/event.model';
import { provideRouter } from '@angular/router';

describe('PromotionsComponent', () => {
  let component: PromotionsComponent;
  let fixture: ComponentFixture<PromotionsComponent>;
  let authServiceSpy: any;
  let businessServiceSpy: any;
  let stripeServiceSpy: any;
  let errorService: CustomerErrorService;
  let i18nService: I18nService;

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
    },
    {
      id: 'ev-2',
      name: 'Punta Cana Zip Line',
      status: 'published',
      startDate: '2026-10-16T10:00:00Z',
      is_main_banner: true,
      is_whats_hot: false,
    },
    {
      id: 'ev-3',
      name: 'Draft Beach Party',
      status: 'draft',
      is_main_banner: false,
      is_whats_hot: false,
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

  beforeEach(async () => {
    authServiceSpy = {
      currentUser: {
        id: 'usr-1',
        email: 'host@bavaro.com',
        provider_link: mockProvider,
      },
    };

    businessServiceSpy = {
      getEventsForProvider: vi.fn().mockResolvedValue([...mockEvents]),
      updateEvent: vi.fn(), // Should NEVER be called for boost fields
    };

    stripeServiceSpy = {
      getAddonPrices: vi.fn().mockResolvedValue([...mockAddonPrices]),
      getBoostAvailability: vi.fn().mockResolvedValue(mockAvailability),
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Page Rendering & Initialization', () => {
    it('should create and render page title, subtitle, and load canonical data', () => {
      expect(component).toBeTruthy();
      expect(businessServiceSpy.getEventsForProvider).toHaveBeenCalledWith('prov-101');
      expect(stripeServiceSpy.getAddonPrices).toHaveBeenCalled();
      expect(stripeServiceSpy.getBoostAvailability).toHaveBeenCalled();
      expect(stripeServiceSpy.getSavedPaymentMethods).toHaveBeenCalled();
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

    it('should render dynamic prices for Main Banner ($30) and What’s Hot ($15)', () => {
      expect(component.mainBannerPrice()?.amount).toBe(3000);
      expect(component.whatsHotPrice()?.amount).toBe(1500);

      // Select an event to reveal options
      component.onEventSelected('ev-1');
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const text = compiled.textContent;
      expect(text).toContain('Main Banner');
      expect(text).toContain('$30');
      expect(text).toContain('What’s Hot');
      expect(text).toContain('$15');
    });

    it('should filter only published events in the event select dropdown', () => {
      expect(component.publishedEvents().length).toBe(2);
      expect(component.publishedEvents().map(e => e.id)).toEqual(['ev-1', 'ev-2']);
      expect(component.publishedEvents().some(e => e.status === 'draft')).toBe(false);
    });
  });

  describe('Placement Selection & Availability Rules', () => {
    it('should disable Main Banner selection if the selected event already has active Main Banner', () => {
      component.onEventSelected('ev-2'); // ev-2 has is_main_banner: true
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
      component.onEventSelected('ev-1');
      fixture.detectChanges();

      expect(component.mainBannerFull()).toBe(true);
      expect(component.isMainBannerDisabled()).toBe(true);

      component.togglePlacement('main_banner');
      expect(component.selectedPlacements().has('main_banner')).toBe(false);
    });

    it('should calculate total amount dynamically for single and combined placements', () => {
      component.onEventSelected('ev-1');
      component.togglePlacement('main_banner');
      expect(component.totalAmount()).toBe(3000);
      expect(component.formattedTotal()).toContain('$30');

      component.togglePlacement('whats_hot');
      expect(component.totalAmount()).toBe(4500);
      expect(component.formattedTotal()).toContain('$45');

      component.togglePlacement('main_banner');
      expect(component.totalAmount()).toBe(1500);
      expect(component.formattedTotal()).toContain('$15');
    });
  });

  describe('Purchase Flow Validation & Execution', () => {
    it('should prevent purchase when no event is selected and show customer-safe error', async () => {
      component.selectedEventId.set(null);
      component.selectedPlacements.set(new Set(['main_banner']));

      await component.proceedToPayment();

      expect(stripeServiceSpy.createAddonPayment).not.toHaveBeenCalled();
      expect(component.errorMessage()).toBe('Please select a listing to promote.');
    });

    it('should prevent purchase when no placement is selected', async () => {
      component.selectedEventId.set('ev-1');
      component.selectedPlacements.set(new Set());

      await component.proceedToPayment();

      expect(stripeServiceSpy.createAddonPayment).not.toHaveBeenCalled();
      expect(component.errorMessage()).toBe('Please select at least one placement option.');
    });

    it('should complete purchase via saved card method and call applyAddon with correct backend payload', async () => {
      component.onEventSelected('ev-1');
      component.togglePlacement('main_banner');
      component.selectSavedCard(mockSavedCards[0]);

      await component.proceedToPayment();

      // 1. Creates addon payment
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

      // 3. Calls applyAddon flow (server-side elevates permissions)
      expect(stripeServiceSpy.applyAddon).toHaveBeenCalledWith(
        'main_banner',
        undefined,
        'ev-1',
        undefined
      );

      // 4. CRITICAL: Browser must NEVER call updateEvent or write boost fields directly to Directus
      expect(businessServiceSpy.updateEvent).not.toHaveBeenCalled();

      // 5. Shows success notification
      expect(component.successMessage()).toBe(
        'Your placement has been successfully applied and is now visible to customers.'
      );
    });

    it('should handle scheduled start dates and pass ISO string in payload', async () => {
      component.onEventSelected('ev-1');
      component.togglePlacement('whats_hot');
      component.selectSavedCard(mockSavedCards[0]);
      component.scheduleMode.set('future');
      component.scheduledDate.set('2026-11-01');

      await component.proceedToPayment();

      expect(stripeServiceSpy.createAddonPayment).toHaveBeenCalledWith(
        'price_whats_hot_test',
        'whats_hot',
        'prov-101',
        'ev-1',
        expect.stringContaining('2026-11-01')
      );

      expect(stripeServiceSpy.applyAddon).toHaveBeenCalledWith(
        'whats_hot',
        undefined,
        'ev-1',
        expect.stringContaining('2026-11-01')
      );
      expect(component.isLastScheduled()).toBe(true);
      expect(component.successMessage()).toContain('2026-11-01');
    });

    it('should mount Stripe PaymentElement when user selects new card option', async () => {
      vi.useFakeTimers();
      component.onEventSelected('ev-1');
      component.togglePlacement('main_banner');
      component.selectUseNewCard();

      const proceedPromise = component.proceedToPayment();
      await proceedPromise;

      vi.advanceTimersByTime(200);

      expect(component.paymentActive()).toBe(true);
      expect(stripeServiceSpy.mountPaymentElement).toHaveBeenCalledWith(
        'pi_test_secret_123',
        'boost-payment-element'
      );
      vi.useRealTimers();
    });

    it('should sanitize technical errors into customer-safe messages on failed payment', async () => {
      component.onEventSelected('ev-1');
      component.togglePlacement('main_banner');
      component.selectSavedCard(mockSavedCards[0]);

      stripeServiceSpy.confirmWithSavedMethod.mockResolvedValueOnce({
        error: {
          type: 'card_error',
          code: 'card_declined',
          message: 'Your card was declined by Directus/Stripe internal code 400',
        },
      });

      await component.proceedToPayment();

      expect(component.errorMessage()).toBeTruthy();
      expect(component.errorMessage()).not.toContain('Directus');
      expect(component.errorMessage()).not.toContain('internal code 400');
      expect(stripeServiceSpy.applyAddon).not.toHaveBeenCalled();
    });
  });

  describe('Localization Parity (EN & ES)', () => {
    it('should translate page titles, badges, and CTAs in Spanish', () => {
      i18nService.setLang('es');
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.page-title')?.textContent).toContain('Promociones y Posicionamiento VAMO');
      expect(compiled.querySelector('.page-subtitle')?.textContent).toContain('Aumenta tu visibilidad');

      component.onEventSelected('ev-1');
      component.togglePlacement('main_banner');
      fixture.detectChanges();

      const text = compiled.textContent;
      expect(text).toContain('Banner Principal');
      expect(text).toContain('Lo Más Caliente');
      expect(text).toContain('Resumen del Pedido');
    });
  });
});
