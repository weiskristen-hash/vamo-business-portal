import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OverviewComponent } from './overview.component';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { provideRouter } from '@angular/router';

describe('OverviewComponent', () => {
  let component: OverviewComponent;
  let fixture: ComponentFixture<OverviewComponent>;
  let authServiceSpy: any;
  let businessServiceSpy: any;

  const mockUser = {
    id: 'user-1',
    first_name: 'Alejandro',
    last_name: 'Morales',
    email: 'alejandro@samanaecolodge.com',
    provider_link: {
      id: 'prov-444',
      name: 'Samaná Eco Lodge',
      city: 'Samaná',
      business_type: 'Hotel & Eco Tourism',
      subscription_tier: 'advanced',
      logo: { id: 'file-logo-1' },
    },
  };

  const mockEvents = [
    {
      id: 'ev-1',
      name: 'Whale Watching Sunrise Tour',
      status: 'published' as const,
      startDate: '2026-10-10',
      from: '06:30',
    },
    {
      id: 'ev-2',
      name: 'Waterfall Horseback Expedition',
      status: 'draft' as const,
      startDate: '2026-10-12',
      from: '09:00',
    },
  ];

  beforeEach(async () => {
    authServiceSpy = {
      currentUser: mockUser,
      loadCurrentUser: vi.fn().mockResolvedValue(mockUser),
    };

    businessServiceSpy = {
      getAssetUrl: vi.fn((file, params) => `https://api.vamo-app.com/assets/${file.id || file}?${params}`),
      getEventsForProvider: vi.fn().mockResolvedValue(mockEvents),
      calculateStats: vi.fn().mockReturnValue({
        total: 2,
        published: 1,
        draft: 1,
        archived: 0,
      }),
      getRecentEvents: vi.fn().mockReturnValue(mockEvents),
    };

    await TestBed.configureTestingModule({
      imports: [OverviewComponent],
      providers: [
        provideRouter([]),
        I18nService,
        { provide: AuthService, useValue: authServiceSpy },
        { provide: BusinessService, useValue: businessServiceSpy },
      ],
    }).compileComponents();
  });

  it('should create the overview component', () => {
    fixture = TestBed.createComponent(OverviewComponent);
    component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should load provider identity and display greeting with business name', async () => {
    fixture = TestBed.createComponent(OverviewComponent);
    component = fixture.componentInstance;
    await component.loadData();
    fixture.detectChanges();

    expect(businessServiceSpy.getEventsForProvider).toHaveBeenCalledWith('prov-444');
    expect(component.provider?.name).toBe('Samaná Eco Lodge');
    expect(component.user?.first_name).toBe('Alejandro');
    expect(component.loading).toBe(false);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.overview-content')).toBeTruthy();
    expect(compiled.querySelector('.greeting-title')?.textContent).toContain('Alejandro');
    expect(compiled.querySelector('.business-name-badge')?.textContent).toContain('Samaná Eco Lodge');
  });

  it('should display calculated stats in summary cards', async () => {
    fixture = TestBed.createComponent(OverviewComponent);
    component = fixture.componentInstance;
    await component.loadData();
    fixture.detectChanges();

    expect(component.stats.published).toBe(1);
    expect(component.stats.draft).toBe(1);
    expect(component.stats.total).toBe(2);

    const compiled = fixture.nativeElement as HTMLElement;
    const cards = compiled.querySelectorAll('.summary-card');
    expect(cards.length).toBe(4);
  });

  it('should render recent posts list', async () => {
    fixture = TestBed.createComponent(OverviewComponent);
    component = fixture.componentInstance;
    await component.loadData();
    fixture.detectChanges();

    expect(component.recentEvents.length).toBe(2);
    const postRows = fixture.nativeElement.querySelectorAll('.post-row');
    expect(postRows.length).toBe(2);
    expect(postRows[0].textContent).toContain('Whale Watching Sunrise Tour');
  });

  it('should render empty state when provider has zero posts', async () => {
    businessServiceSpy.getEventsForProvider.mockResolvedValue([]);
    businessServiceSpy.calculateStats.mockReturnValue({ total: 0, published: 0, draft: 0, archived: 0 });
    businessServiceSpy.getRecentEvents.mockReturnValue([]);

    fixture = TestBed.createComponent(OverviewComponent);
    component = fixture.componentInstance;
    await component.loadData();
    fixture.detectChanges();

    const emptyCard = fixture.nativeElement.querySelector('.empty-posts-card');
    expect(emptyCard).toBeTruthy();
    expect(emptyCard.textContent).toContain('No posts published yet');
  });

  it('should handle backend error and show customer-safe error message and retry button', async () => {
    businessServiceSpy.getEventsForProvider.mockRejectedValue(new Error('Directus Network Error'));

    fixture = TestBed.createComponent(OverviewComponent);
    component = fixture.componentInstance;
    await component.loadData();
    fixture.detectChanges();

    // Verify raw Directus/backend internals are NEVER exposed to customer
    expect(component.error).not.toContain('Directus');
    expect(component.error).not.toContain('backend');
    expect(component.error).toBe("We're having trouble connecting. Check your connection and try again.");

    const errorState = fixture.nativeElement.querySelector('.state-error');
    expect(errorState).toBeTruthy();
    expect(errorState.textContent).toContain('Unable to load dashboard');
    expect(errorState.textContent).not.toContain('Directus');
  });

  describe('Overview Localization & Parity', () => {
    it('should translate headings, greeting, cards, and quick actions into Spanish', async () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('es');

      fixture = TestBed.createComponent(OverviewComponent);
      component = fixture.componentInstance;
      await component.loadData();
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;

      // Card metric labels in Spanish
      expect(compiled.textContent).toContain('Publicaciones activas');
      expect(compiled.textContent).toContain('Borradores');
      expect(compiled.textContent).toContain('Total de publicaciones');
      expect(compiled.textContent).toContain('Nivel de negocio');

      // Quick Actions heading in Spanish
      expect(compiled.textContent).toContain('Acciones rápidas');
      expect(compiled.textContent).toContain('Editar perfil del negocio');
      expect(compiled.textContent).toContain('Gestionar publicaciones');

      // Recent posts section in Spanish
      expect(compiled.textContent).toContain('Publicaciones recientes');
      expect(compiled.textContent).toContain('Crear publicación');

      i18n.setLang('en');
    });

    it('should translate loading and empty states into Spanish', async () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('es');

      businessServiceSpy.getEventsForProvider.mockResolvedValue([]);
      businessServiceSpy.calculateStats.mockReturnValue({ total: 0, published: 0, draft: 0, archived: 0 });
      businessServiceSpy.getRecentEvents.mockReturnValue([]);

      fixture = TestBed.createComponent(OverviewComponent);
      component = fixture.componentInstance;

      // Verify loading state translation before loadData resolves
      component.loading = true;
      fixture.detectChanges();
      const loadingState = fixture.nativeElement.querySelector('.state-loading');
      expect(loadingState.textContent).toContain('Cargando tu espacio de negocio…');

      // Complete loading and verify empty state in Spanish
      await component.loadData();
      fixture.detectChanges();
      const emptyCard = fixture.nativeElement.querySelector('.empty-posts-card');
      expect(emptyCard.textContent).toContain('Aún no hay publicaciones');
      expect(emptyCard.textContent).toContain('✦ Crea tu primera publicación');

      i18n.setLang('en');
    });

    it('should preserve canonical English business type labels even when UI language is Spanish', async () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('es');

      // Provider with canonical business_type 'restaurant_and_bar'
      component.provider = {
        ...mockUser.provider_link,
        business_type: 'restaurant_and_bar',
      } as any;

      const label = component.getBusinessTypeLabel(component.provider?.business_type);
      // Canonical VAMO renders type.label directly in English without inventing Spanish translations
      expect(label).toBe('Restaurant & Bar');
      expect(label).not.toBe('Restaurante y Bar');

      i18n.setLang('en');
    });

    it('should protect owner-entered content from translation substitution (Part 10 regression protection)', async () => {
      const i18n = TestBed.inject(I18nService);

      // Event with owner-entered content and mock Directus server translations JSON
      const eventWithOwnerContent: any = {
        id: 'ev-owner',
        name: 'Owner Original Sunset Cruise',
        description: 'Original English description entered by the business owner.',
        promo_text: 'Buy 1 get 1 free rum punch',
        status: 'published',
        startDate: '2026-11-01',
        translations: [
          {
            language_code: 'es',
            name: 'Crucero al atardecer traducido',
            description: 'Descripción en español traducida por backend',
            promo_text: 'Compre 1 y obtenga 1 gratis',
          },
        ],
      };

      businessServiceSpy.getEventsForProvider.mockResolvedValue([eventWithOwnerContent]);
      businessServiceSpy.getRecentEvents.mockReturnValue([eventWithOwnerContent]);

      // When language is Spanish, owner portal MUST continue showing original content
      i18n.setLang('es');
      fixture = TestBed.createComponent(OverviewComponent);
      component = fixture.componentInstance;
      await component.loadData();
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;

      // Event title must display original owner text, NEVER the backend translations JSON
      expect(compiled.querySelector('.post-title')?.textContent).toBe('Owner Original Sunset Cruise');
      expect(compiled.querySelector('.post-title')?.textContent).not.toBe('Crucero al atardecer traducido');
      expect(eventWithOwnerContent.name).toBe('Owner Original Sunset Cruise');
      expect(eventWithOwnerContent.description).toBe('Original English description entered by the business owner.');
      expect(eventWithOwnerContent.promo_text).toBe('Buy 1 get 1 free rum punch');

      i18n.setLang('en');
    });

    it('should format dates according to active dateLocale', () => {
      fixture = TestBed.createComponent(OverviewComponent);
      component = fixture.componentInstance;
      const i18n = TestBed.inject(I18nService);

      i18n.setLang('en');
      expect(i18n.dateLocale()).toBe('en-US');
      const enFormatted = component.formatDate('2026-10-15T14:00:00Z');
      expect(enFormatted).toContain('Oct');

      i18n.setLang('es');
      expect(i18n.dateLocale()).toBe('es');
      const esFormatted = component.formatDate('2026-10-15T14:00:00Z');
      expect(esFormatted).toContain('oct');

      i18n.setLang('en');
    });
  });
});
