import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListingEditorComponent } from './listing-editor.component';
import { AuthService } from '../../../core/services/auth.service';
import { BusinessService } from '../../../core/services/business.service';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { VamoEvent } from '../../../core/models/event.model';
import { I18nService } from '../../../core/i18n/i18n.service';

describe('ListingEditorComponent', () => {
  let component: ListingEditorComponent;
  let fixture: ComponentFixture<ListingEditorComponent>;
  let authServiceSpy: any;
  let businessServiceSpy: any;
  let router: Router;
  let i18nService: I18nService;

  const mockUser = {
    id: 'user-1',
    email: 'host@beachbar.com',
    provider_link: {
      id: 'provider-999',
      name: 'Cabarete Beach Lounge',
      address: 'Calle Principal 10',
      location: {
        type: 'Point',
        coordinates: [-70.4074, 19.7521],
      },
    },
  };

  const mockAreas = [
    { id: 'area-1', name: 'Cabarete', slug: 'cabarete', emoji: '🏊', latitude: 19.75, longitude: -70.40 },
    { id: 'area-2', name: 'Las Terrenas', slug: 'las_terrenas', emoji: '🏖️', latitude: 19.31, longitude: -69.54 },
  ];

  const mockExistingEvent: VamoEvent = {
    id: 'ev-existing-1',
    name: 'Sunset Cocktail Happy Hour',
    status: 'published',
    category: 'food',
    description: 'Enjoy 2-for-1 cocktails by the beach with live lounge music.',
    mode: 'recurring',
    recurring: { days: ['wed', 'fri'] },
    from: '17:00',
    to: '20:00',
    allDay: false,
    openEnd: false,
    isFree: false,
    contactForPrice: false,
    price: 12,
    currency: 'USD',
    hasPromotion: true,
    promoText: '2-for-1 drinks before 7 PM',
    address: 'Playa Cabarete 42',
    startDate: '2026-11-01',
    location_point: {
      type: 'Point',
      coordinates: [-70.4074, 19.7521],
    },
    images: [
      { id: 101, directus_files_id: 'file-cocktails-1' },
    ],
    areas: [
      { id: 201, areas_id: 'area-1' },
    ],
  };

  let mockParamId: string | null = null;
  let mockQueryEventId: string | null = null;

  beforeEach(async () => {
    mockParamId = null;
    mockQueryEventId = null;

    authServiceSpy = {
      currentUser: mockUser,
      safeRequest: vi.fn((fn) => fn()),
    };

    businessServiceSpy = {
      drTodayStr: vi.fn().mockReturnValue('2026-10-01'),
      getAreas: vi.fn().mockResolvedValue([...mockAreas]),
      getEventById: vi.fn().mockResolvedValue({ ...mockExistingEvent }),
      getAssetUrl: vi.fn((id: string) => `https://api.vamo-app.com/assets/${id}`),
      createEvent: vi.fn().mockResolvedValue({ id: 'ev-new-created', ...mockExistingEvent }),
      updateEvent: vi.fn().mockResolvedValue({ ...mockExistingEvent }),
    };

    await TestBed.configureTestingModule({
      imports: [ListingEditorComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceSpy },
        { provide: BusinessService, useValue: businessServiceSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'id' ? mockParamId : null),
              },
              queryParamMap: {
                get: (key: string) => (key === 'eventId' ? mockQueryEventId : null),
              },
            },
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    i18nService = TestBed.inject(I18nService);
    i18nService.setLang('en');
  });

  it('should initialize in create mode with provider defaults', async () => {
    fixture = TestBed.createComponent(ListingEditorComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();

    expect(component.isEditMode).toBe(false);
    expect(component.draft.startDate).toBe('2026-10-01');
    expect(component.draft.address).toBe('Calle Principal 10');
    expect(component.lat).toBe(19.7521);
    expect(component.lng).toBe(-70.4074);
    expect(component.selectedAreaId).toBe('area-1');
  });

  it('should initialize in edit mode and populate existing data', async () => {
    mockParamId = 'ev-existing-1';

    fixture = TestBed.createComponent(ListingEditorComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();

    expect(component.isEditMode).toBe(true);
    expect(businessServiceSpy.getEventById).toHaveBeenCalledWith('ev-existing-1');
    expect(component.draft.name).toBe('Sunset Cocktail Happy Hour');
    expect(component.draft.category).toBe('food');
    expect(component.draft.price).toBe(12);
    expect(component.draft.hasPromotion).toBe(true);
    expect(component.existingImages.length).toBe(1);
    expect(component.existingImages[0].junctionId).toBe(101);
  });

  it('should lock schedule if published event start date is in less than 24 hours', async () => {
    mockParamId = 'ev-existing-1';

    // Event starts 4 hours from now
    const startingSoonEvent = {
      ...mockExistingEvent,
      startDate: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
    };
    businessServiceSpy.getEventById.mockResolvedValueOnce(startingSoonEvent);

    fixture = TestBed.createComponent(ListingEditorComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();

    expect(component.datesLocked).toBe(true);
  });

  it('should validate required fields before publishing', async () => {
    fixture = TestBed.createComponent(ListingEditorComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();

    // Empty name
    component.draft.name = '';
    expect(component.validateForm(true)).toBe(false);
    expect(component.errorMessage).toContain('listing title');

    // Name filled, short description
    component.draft.name = 'Valid Event Title';
    component.draft.description = 'Short';
    expect(component.validateForm(true)).toBe(false);
    expect(component.errorMessage).toContain('at least 10 characters');

    // No photos
    component.draft.description = 'A fully detailed event description for VAMO.';
    expect(component.validateForm(true)).toBe(false);
    expect(component.errorMessage).toContain('at least one photo');
  });

  it('should save a valid draft without image requirement', async () => {
    fixture = TestBed.createComponent(ListingEditorComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();

    component.draft.name = 'Work-in-progress Draft';
    component.draft.category = 'sports';
    component.draft.description = 'Drafting a new volleyball game for the weekend.';

    await component.saveDraft();

    expect(businessServiceSpy.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Work-in-progress Draft',
        status: 'draft',
      }),
      [],
      ['area-1']
    );
    expect(router.navigate).toHaveBeenCalledWith(['/app/listings']);
  });

  it('should publish a valid listing when all fields are complete', async () => {
    fixture = TestBed.createComponent(ListingEditorComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();

    component.draft.name = 'Live Ocean Music Session';
    component.draft.category = 'live';
    component.draft.description = 'Full oceanfront musical performance with international guests.';
    component.draft.address = 'Beach Boulevard 5';
    component.draft.startDate = '2026-10-30';
    component.draft.from = '20:00';
    component.draft.to = '23:00';
    component.existingImages = [{ junctionId: 55, url: 'https://api.vamo-app.com/assets/img-1' }];

    await component.publishListing();

    expect(businessServiceSpy.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Live Ocean Music Session',
        status: 'published',
      }),
      [],
      ['area-1']
    );
    expect(router.navigate).toHaveBeenCalledWith(['/app/listings']);
  });

  it('should show cancel modal if form has dirty edits', async () => {
    fixture = TestBed.createComponent(ListingEditorComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();

    component.markDirty();
    component.onCancel();

    expect(component.showCancelConfirmModal).toBe(true);

    component.confirmDiscardAndExit();
    expect(router.navigate).toHaveBeenCalledWith(['/app/listings']);
  });

  it('should copy business coordinates and address when useBusinessLocation is called', async () => {
    fixture = TestBed.createComponent(ListingEditorComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();

    // Reset coordinates first
    component.clearLocation();
    expect(component.lat).toBeNull();
    expect(component.lng).toBeNull();
    expect(component.draft.location_point).toBeNull();

    component.useBusinessLocation();
    expect(component.lat).toBe(19.7521);
    expect(component.lng).toBe(-70.4074);
    expect(component.draft.location_point?.coordinates).toEqual([-70.4074, 19.7521]);
    expect(component.draft.address).toBe('Calle Principal 10');
  });

  it('should clear coordinates and reset location_point when clearLocation is called', async () => {
    fixture = TestBed.createComponent(ListingEditorComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();

    component.setCoordinates(18.5, -69.9);
    expect(component.lat).toBe(18.5);
    expect(component.draft.location_point?.coordinates).toEqual([-69.9, 18.5]);

    component.clearLocation();
    expect(component.lat).toBeNull();
    expect(component.lng).toBeNull();
    expect(component.draft.location_point).toBeNull();
  });

  it('should update location_point coordinates on manual coordinate change', async () => {
    fixture = TestBed.createComponent(ListingEditorComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();

    component.lat = 19.318554;
    component.lng = -69.539809;
    component.onCoordChange();

    expect(component.draft.location_point?.coordinates).toEqual([-69.539809, 19.318554]);
  });

  it('should render synchronized bottom action buttons and wire click events', async () => {
    fixture = TestBed.createComponent(ListingEditorComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();

    const bottomActionsEl = fixture.nativeElement.querySelector('.bottom-actions');
    expect(bottomActionsEl).toBeTruthy();

    const bottomButtons = bottomActionsEl.querySelectorAll('button');
    expect(bottomButtons.length).toBe(3); // Cancel, Save as Draft, Publish

    const cancelSpy = vi.spyOn(component, 'onCancel');
    bottomButtons[0].click();
    expect(cancelSpy).toHaveBeenCalled();

    const draftSpy = vi.spyOn(component, 'saveDraft').mockImplementation(async () => {});
    bottomButtons[1].click();
    expect(draftSpy).toHaveBeenCalled();

    const publishSpy = vi.spyOn(component, 'publishListing').mockImplementation(async () => {});
    bottomButtons[2].click();
    expect(publishSpy).toHaveBeenCalled();
  });

  it('should display customer-safe error without leaking Directus details when save fails', async () => {
    fixture = TestBed.createComponent(ListingEditorComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();

    businessServiceSpy.createEvent.mockRejectedValueOnce(
      new Error("You don't have permission to access fields 'boost_expires_at' in collection 'events'")
    );

    component.draft.name = 'Test Name';
    component.draft.category = 'sports';
    component.draft.description = 'Test Description for Volleyball';

    await component.saveDraft();

    expect(component.errorMessage).not.toContain('Directus');
    expect(component.errorMessage).not.toContain('collection');
    expect(component.errorMessage).not.toContain('events');
    expect(component.errorMessage).not.toContain('boost_expires_at');
    expect(component.errorMessage).toBe("We couldn't make that change. This action is not available for your account.");
  });

  describe('Phase 2C.3 Event Editor UI Localization', () => {
    beforeEach(async () => {
      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();
      fixture.detectChanges();
    });

    it('11. should translate editor page title in create and edit modes', () => {
      component.isEditMode = false;
      i18nService.setLang('en');
      fixture.detectChanges();
      let titleEl = fixture.nativeElement.querySelector('.page-title');
      expect(titleEl.textContent.trim()).toBe('Create New Listing');

      i18nService.setLang('es');
      fixture.detectChanges();
      titleEl = fixture.nativeElement.querySelector('.page-title');
      expect(titleEl.textContent.trim()).toBe('Crear Nueva Publicación');

      // Edit mode
      component.isEditMode = true;
      i18nService.setLang('en');
      fixture.detectChanges();
      titleEl = fixture.nativeElement.querySelector('.page-title');
      expect(titleEl.textContent.trim()).toBe('Edit Listing');

      i18nService.setLang('es');
      fixture.detectChanges();
      titleEl = fixture.nativeElement.querySelector('.page-title');
      expect(titleEl.textContent.trim()).toBe('Editar Publicación');
    });

    it('12. should translate step/section titles (1 through 5)', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      let titles = Array.from(fixture.nativeElement.querySelectorAll('.section-title'))
        .map((el: any) => el.textContent.trim());
      expect(titles).toContain('Basics');
      expect(titles).toContain('Media & Photos');
      expect(titles).toContain('Schedule & Timing');
      expect(titles).toContain('Location & Area');
      expect(titles).toContain('Pricing & Promotion');

      i18nService.setLang('es');
      fixture.detectChanges();
      titles = Array.from(fixture.nativeElement.querySelectorAll('.section-title'))
        .map((el: any) => el.textContent.trim());
      expect(titles).toContain('Información básica');
      expect(titles).toContain('Fotos y Multimedia');
      expect(titles).toContain('Horario y Fechas');
      expect(titles).toContain('Ubicación y Zona');
      expect(titles).toContain('Precios y Promoción');
    });

    it('13. should translate section descriptions', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      let descs = Array.from(fixture.nativeElement.querySelectorAll('.section-desc'))
        .map((el: any) => el.textContent.trim());
      expect(descs[0]).toBe('Define the title, category, and a compelling description for your listing.');

      i18nService.setLang('es');
      fixture.detectChanges();
      descs = Array.from(fixture.nativeElement.querySelectorAll('.section-desc'))
        .map((el: any) => el.textContent.trim());
      expect(descs[0]).toBe('Define el título, la categoría y una descripción atractiva para tu publicación.');
    });

    it('14. should translate form field labels', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      let labels = Array.from(fixture.nativeElement.querySelectorAll('.form-label'))
        .map((el: any) => el.textContent.trim());
      expect(labels.some((l) => l.includes('Listing Title'))).toBe(true);
      expect(labels.some((l) => l.includes('Category'))).toBe(true);
      expect(labels.some((l) => l.includes('Description'))).toBe(true);
      expect(labels.some((l) => l.includes('Destination Area'))).toBe(true);

      i18nService.setLang('es');
      fixture.detectChanges();
      labels = Array.from(fixture.nativeElement.querySelectorAll('.form-label'))
        .map((el: any) => el.textContent.trim());
      expect(labels.some((l) => l.includes('Título de la publicación'))).toBe(true);
      expect(labels.some((l) => l.includes('Categoría'))).toBe(true);
      expect(labels.some((l) => l.includes('Descripción'))).toBe(true);
      expect(labels.some((l) => l.includes('Zona de destino'))).toBe(true);
    });

    it('15. should translate placeholders', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      const titleInput = fixture.nativeElement.querySelector('#event-name');
      expect(titleInput.getAttribute('placeholder')).toBe('e.g. Sunset Salsa Night, Samaná Whale Watching Expedition');

      i18nService.setLang('es');
      fixture.detectChanges();
      expect(titleInput.getAttribute('placeholder')).toBe('Ej. Noche de Salsa al Atardecer, Expedición de Ballenas en Samaná');
    });

    it('16. should translate form hint texts', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      let hints = Array.from(fixture.nativeElement.querySelectorAll('.form-hint'))
        .map((el: any) => el.textContent.trim());
      expect(hints.some((h) => h.includes('Make it clear, catchy, and descriptive.'))).toBe(true);

      i18nService.setLang('es');
      fixture.detectChanges();
      hints = Array.from(fixture.nativeElement.querySelectorAll('.form-hint'))
        .map((el: any) => el.textContent.trim());
      expect(hints.some((h) => h.includes('Hazlo claro, llamativo y descriptivo.'))).toBe(true);
    });

    it('17. should format character counts', () => {
      component.draft.name = 'Beach Party';
      fixture.detectChanges();
      const countEl = fixture.nativeElement.querySelector('.char-count');
      expect(countEl.textContent.trim()).toBe('11/100');
    });

    it('18. should translate validation error messages', () => {
      i18nService.setLang('en');
      component.draft.name = '';
      expect(component.validateForm(false)).toBe(false);
      expect(component.errorMessage).toBe('Please provide a listing title.');

      i18nService.setLang('es');
      expect(component.validateForm(false)).toBe(false);
      expect(component.errorMessage).toBe('Por favor ingresa un título para la publicación.');
    });

    it('19. should translate schedule type tabs', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      let modeTabs = Array.from(fixture.nativeElement.querySelectorAll('.schedule-type-toggle .type-tab-btn'))
        .map((b: any) => b.textContent.trim());
      expect(modeTabs.some((t) => t.includes('Specific Date'))).toBe(true);
      expect(modeTabs.some((t) => t.includes('Weekly Recurring'))).toBe(true);

      i18nService.setLang('es');
      fixture.detectChanges();
      modeTabs = Array.from(fixture.nativeElement.querySelectorAll('.schedule-type-toggle .type-tab-btn'))
        .map((b: any) => b.textContent.trim());
      expect(modeTabs.some((t) => t.includes('Fecha específica'))).toBe(true);
      expect(modeTabs.some((t) => t.includes('Recurrente semanal'))).toBe(true);
    });

    it('20. should translate multi-day checkbox label', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      let labels = Array.from(fixture.nativeElement.querySelectorAll('.toggle-control .toggle-text'))
        .map((s: any) => s.textContent.trim());
      expect(labels.some((l) => l.includes('Multi-day event'))).toBe(true);

      i18nService.setLang('es');
      fixture.detectChanges();
      labels = Array.from(fixture.nativeElement.querySelectorAll('.toggle-control .toggle-text'))
        .map((s: any) => s.textContent.trim());
      expect(labels.some((l) => l.includes('Evento de varios días'))).toBe(true);
    });

    it('21. should translate all-day checkbox label', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      let labels = Array.from(fixture.nativeElement.querySelectorAll('.toggle-control .toggle-text'))
        .map((s: any) => s.textContent.trim());
      expect(labels.some((l) => l.includes('All Day event'))).toBe(true);

      i18nService.setLang('es');
      fixture.detectChanges();
      labels = Array.from(fixture.nativeElement.querySelectorAll('.toggle-control .toggle-text'))
        .map((s: any) => s.textContent.trim());
      expect(labels.some((l) => l.includes('Evento de todo el día'))).toBe(true);
    });

    it('22. should translate open-end checkbox label', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      let labels = Array.from(fixture.nativeElement.querySelectorAll('.toggle-control .toggle-text'))
        .map((s: any) => s.textContent.trim());
      expect(labels.some((l) => l.includes('Open End'))).toBe(true);

      i18nService.setLang('es');
      fixture.detectChanges();
      labels = Array.from(fixture.nativeElement.querySelectorAll('.toggle-control .toggle-text'))
        .map((s: any) => s.textContent.trim());
      expect(labels.some((l) => l.includes('Sin hora fija'))).toBe(true);
    });

    it('23. should translate canonical category chips using canonical categories', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      let catBtns = Array.from(fixture.nativeElement.querySelectorAll('.category-grid .cat-label'))
        .map((el: any) => el.textContent.trim());
      expect(catBtns).toContain('Live Music & Nightlife');
      expect(catBtns).toContain('Food & Drink');

      i18nService.setLang('es');
      fixture.detectChanges();
      catBtns = Array.from(fixture.nativeElement.querySelectorAll('.category-grid .cat-label'))
        .map((el: any) => el.textContent.trim());
      expect(catBtns).toContain('Música en Vivo y Vida Nocturna');
      expect(catBtns).toContain('Comida y Bebida');
    });

    it('24. should translate weekday selector labels', () => {
      component.draft.mode = 'recurring';
      i18nService.setLang('en');
      fixture.detectChanges();
      let dayChips = Array.from(fixture.nativeElement.querySelectorAll('.weekday-pill-grid .weekday-pill-btn'))
        .map((el: any) => el.textContent.trim());
      expect(dayChips).toContain('Mon');
      expect(dayChips).toContain('Fri');

      i18nService.setLang('es');
      fixture.detectChanges();
      dayChips = Array.from(fixture.nativeElement.querySelectorAll('.weekday-pill-grid .weekday-pill-btn'))
        .map((el: any) => el.textContent.trim());
      expect(dayChips).toContain('Lun');
      expect(dayChips).toContain('Vie');
    });

    it('25. should translate pricing model tabs', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      let priceTabs = Array.from(fixture.nativeElement.querySelectorAll('.pricing-model-selector .pricing-tab-btn'))
        .map((b: any) => b.textContent.trim());
      expect(priceTabs.some((t) => t.includes('Free Admission'))).toBe(true);
      expect(priceTabs.some((t) => t.includes('Fixed Price / Tickets'))).toBe(true);
      expect(priceTabs.some((t) => t.includes('Contact for Price'))).toBe(true);

      i18nService.setLang('es');
      fixture.detectChanges();
      priceTabs = Array.from(fixture.nativeElement.querySelectorAll('.pricing-model-selector .pricing-tab-btn'))
        .map((b: any) => b.textContent.trim());
      expect(priceTabs.some((t) => t.includes('Entrada gratuita'))).toBe(true);
      expect(priceTabs.some((t) => t.includes('Precio fijo / Boletas'))).toBe(true);
      expect(priceTabs.some((t) => t.includes('Consultar precio'))).toBe(true);
    });

    it('26. should translate promotion toggle and promo text labels', () => {
      component.draft.hasPromotion = true;
      i18nService.setLang('en');
      fixture.detectChanges();
      let promoLabel = fixture.nativeElement.querySelector('.promotion-box .toggle-text');
      expect(promoLabel.textContent.trim()).toBe('Highlight a Special Promotion or Deal');

      i18nService.setLang('es');
      fixture.detectChanges();
      promoLabel = fixture.nativeElement.querySelector('.promotion-box .toggle-text');
      expect(promoLabel.textContent.trim()).toBe('Destacar una oferta o promoción especial');
    });

    it('27. should translate image upload dropzone copy', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      let dropzoneLabel = fixture.nativeElement.querySelector('.upload-dropzone-btn .dropzone-label');
      let formats = fixture.nativeElement.querySelector('.upload-dropzone-btn .dropzone-hint');
      expect(dropzoneLabel.textContent.trim()).toBe('+ Add Photos');
      expect(formats.textContent.trim()).toBe('JPEG, PNG, WebP');

      i18nService.setLang('es');
      fixture.detectChanges();
      dropzoneLabel = fixture.nativeElement.querySelector('.upload-dropzone-btn .dropzone-label');
      formats = fixture.nativeElement.querySelector('.upload-dropzone-btn .dropzone-hint');
      expect(dropzoneLabel.textContent.trim()).toBe('+ Agregar fotos');
      expect(formats.textContent.trim()).toBe('JPEG, PNG, WebP');
    });

    it('28. should translate map pin helper copy', () => {
      component.providerLat = 19.75;
      component.providerLng = -70.40;
      i18nService.setLang('en');
      fixture.detectChanges();
      let pinBtn = fixture.nativeElement.querySelector('.lp-quick-actions button');
      expect(pinBtn.textContent.trim()).toContain('Use Business Location');

      i18nService.setLang('es');
      fixture.detectChanges();
      pinBtn = fixture.nativeElement.querySelector('.lp-quick-actions button');
      expect(pinBtn.textContent.trim()).toContain('Usar ubicación del negocio');
    });

    it('29. should translate manual coordinates toggle copy', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      let coordToggle = fixture.nativeElement.querySelector('.coords-toggle-btn');
      expect(coordToggle.textContent.trim()).toBe('Manual Coordinates');

      i18nService.setLang('es');
      fixture.detectChanges();
      coordToggle = fixture.nativeElement.querySelector('.coords-toggle-btn');
      expect(coordToggle.textContent.trim()).toBe('Coordenadas manuales');
    });

    it('30. should translate discard changes dialog copy', () => {
      component.showCancelConfirmModal = true;
      i18nService.setLang('en');
      fixture.detectChanges();
      let modalTitle = fixture.nativeElement.querySelector('.modal-title');
      let keepBtn = fixture.nativeElement.querySelector('.modal-footer .btn-secondary');
      let discardBtn = fixture.nativeElement.querySelector('.modal-footer .btn-danger');
      expect(modalTitle.textContent.trim()).toBe('Discard Unsaved Changes?');
      expect(keepBtn.textContent.trim()).toBe('Keep Editing');
      expect(discardBtn.textContent.trim()).toBe('Discard Changes');

      i18nService.setLang('es');
      fixture.detectChanges();
      modalTitle = fixture.nativeElement.querySelector('.modal-title');
      keepBtn = fixture.nativeElement.querySelector('.modal-footer .btn-secondary');
      discardBtn = fixture.nativeElement.querySelector('.modal-footer .btn-danger');
      expect(modalTitle.textContent.trim()).toBe('¿Descartar cambios no guardados?');
      expect(keepBtn.textContent.trim()).toBe('Seguir editando');
      expect(discardBtn.textContent.trim()).toBe('Descartar cambios');
    });

    it('31. should translate app preview panel header and tags', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      let previewTitle = fixture.nativeElement.querySelector('.preview-header-bar .preview-title');
      let liveSync = fixture.nativeElement.querySelector('.preview-header-bar .live-pill');
      expect(previewTitle.textContent.trim()).toBe('VAMO App Preview');
      expect(liveSync.textContent.trim()).toBe('Live Sync');

      i18nService.setLang('es');
      fixture.detectChanges();
      previewTitle = fixture.nativeElement.querySelector('.preview-header-bar .preview-title');
      liveSync = fixture.nativeElement.querySelector('.preview-header-bar .live-pill');
      expect(previewTitle.textContent.trim()).toBe('Vista previa en VAMO');
      expect(liveSync.textContent.trim()).toBe('En vivo');
    });

    it('32. should translate button labels', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      let backBtn = fixture.nativeElement.querySelector('.back-btn span');
      let draftBtn = fixture.nativeElement.querySelector('.header-actions .btn-secondary:nth-child(2)');
      let publishBtn = fixture.nativeElement.querySelector('.header-actions .btn-primary');
      expect(backBtn.textContent.trim()).toBe('Back to Listings');
      expect(draftBtn.textContent.trim()).toBe('Save as Draft');
      expect(publishBtn.textContent.trim()).toBe('Publish Listing');

      i18nService.setLang('es');
      fixture.detectChanges();
      backBtn = fixture.nativeElement.querySelector('.back-btn span');
      draftBtn = fixture.nativeElement.querySelector('.header-actions .btn-secondary:nth-child(2)');
      publishBtn = fixture.nativeElement.querySelector('.header-actions .btn-primary');
      expect(backBtn.textContent.trim()).toBe('Volver a publicaciones');
      expect(draftBtn.textContent.trim()).toBe('Guardar como borrador');
      expect(publishBtn.textContent.trim()).toBe('Publicar publicación');
    });

    it('33. should translate aria-labels', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      let backBtn = fixture.nativeElement.querySelector('.back-btn');
      expect(backBtn.getAttribute('aria-label')).toBe('Back to Listings');

      i18nService.setLang('es');
      fixture.detectChanges();
      backBtn = fixture.nativeElement.querySelector('.back-btn');
      expect(backBtn.getAttribute('aria-label')).toBe('Volver a publicaciones');
    });

    it('34. should NOT reset form fields when switching language while editing', () => {
      component.draft.name = 'VIP Rooftop Party';
      component.draft.description = 'Exclusive sunset cocktail party with panoramic ocean views.';
      component.draft.price = 45;
      component.draft.address = 'Calle del Sol 21';

      i18nService.setLang('es');
      fixture.detectChanges();

      expect(component.draft.name).toBe('VIP Rooftop Party');
      expect(component.draft.description).toBe('Exclusive sunset cocktail party with panoramic ocean views.');
      expect(component.draft.price).toBe(45);
      expect(component.draft.address).toBe('Calle del Sol 21');

      i18nService.setLang('en');
      fixture.detectChanges();

      expect(component.draft.name).toBe('VIP Rooftop Party');
      expect(component.draft.description).toBe('Exclusive sunset cocktail party with panoramic ocean views.');
    });

    it('35. should preserve dirty state when switching language while editing', () => {
      expect(component.isDirty).toBe(false);
      component.markDirty();
      expect(component.isDirty).toBe(true);

      i18nService.setLang('es');
      fixture.detectChanges();
      expect(component.isDirty).toBe(true);

      i18nService.setLang('en');
      fixture.detectChanges();
      expect(component.isDirty).toBe(true);
    });

    it('36. should preserve selected images when switching language while editing', () => {
      component.newFilePreviews = ['blob:http://localhost/image-test-1'];
      component.selectedNewFiles = [new File([''], 'test.png')];

      i18nService.setLang('es');
      fixture.detectChanges();

      expect(component.newFilePreviews.length).toBe(1);
      expect(component.selectedNewFiles.length).toBe(1);
    });

    it('37. should keep executeSave() payload Phase 2A canonical (promotionStart on create only, no translation JSON)', async () => {
      // 1. Create Mode
      component.isEditMode = false;
      component.draft.name = 'Canonical Create Event';
      component.draft.category = 'sports';
      component.draft.description = 'A detailed description for sports event.';
      component.draft.address = 'Beach court 1';
      component.draft.startDate = '2026-11-15';
      component.existingImages = [{ junctionId: 99, url: 'img.jpg' }];

      await component.publishListing();

      expect(businessServiceSpy.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Canonical Create Event',
          promotionStart: expect.any(String),
          status: 'published',
        }),
        expect.anything(),
        expect.anything()
      );
      const createPayload = businessServiceSpy.createEvent.mock.calls[0][0];
      expect(createPayload.translations).toBeUndefined();

      // 2. Edit Mode
      businessServiceSpy.updateEvent.mockClear();
      component.isEditMode = true;
      component.eventId = 'ev-existing-1';
      component.draft.promotionStart = '2026-11-01T00:00:00Z';

      await component.publishListing();

      expect(businessServiceSpy.updateEvent).toHaveBeenCalled();
      const updatePayload = businessServiceSpy.updateEvent.mock.calls[0][1];
      expect(updatePayload.promotionStart).toBeUndefined();
      expect(updatePayload.translations).toBeUndefined();
    });

    it('38. should keep owner-entered content strictly untranslated on language switch', () => {
      component.draft.name = 'Live Jazz & Tapas';
      component.draft.promoText = 'Free Sangria with every 2 tapas';

      i18nService.setLang('es');
      fixture.detectChanges();

      expect(component.draft.name).toBe('Live Jazz & Tapas');
      expect(component.draft.promoText).toBe('Free Sangria with every 2 tapas');

      i18nService.setLang('en');
      fixture.detectChanges();

      expect(component.draft.name).toBe('Live Jazz & Tapas');
      expect(component.draft.promoText).toBe('Free Sangria with every 2 tapas');
    });
  });
});
