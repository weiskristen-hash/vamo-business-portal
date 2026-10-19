import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListingEditorComponent } from './listing-editor.component';
import { AuthService } from '../../../core/services/auth.service';
import { BusinessService } from '../../../core/services/business.service';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { VamoEvent } from '../../../core/models/event.model';
import { I18nService } from '../../../core/i18n/i18n.service';
import { PublishingAccessService } from '../../../core/services/publishing-access.service';

describe('ListingEditorComponent', () => {
  let component: ListingEditorComponent;
  let fixture: ComponentFixture<ListingEditorComponent>;
  let authServiceSpy: any;
  let businessServiceSpy: any;
  let router: Router;
  let i18nService: I18nService;
  let publishingAccessSpy: any;

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
    publishingAccessSpy = { check: vi.fn().mockResolvedValue({ allowed: true, usesAddonSlot: false }) };

    authServiceSpy = {
      currentUser: mockUser,
      safeRequest: vi.fn((fn) => fn()),
    };

    businessServiceSpy = {
      drTodayStr: vi.fn().mockReturnValue('2026-10-01'),
      isEventUpcomingOrOngoing: vi.fn((ev: any) => {
        const last = ev.endDate || ev.startDate;
        const lastStr = typeof last === 'string' ? last.split('T')[0] : last?.toISOString()?.split('T')[0];
        return !!lastStr && lastStr >= '2026-10-01';
      }),
      getAreas: vi.fn().mockResolvedValue([...mockAreas]),
      getEventById: vi.fn().mockResolvedValue({ ...mockExistingEvent }),
      getAssetUrl: vi.fn((id: string) => `https://api.vamo-app.com/assets/${id}`),
      createEvent: vi.fn().mockResolvedValue({ id: 'ev-new-created', ...mockExistingEvent }),
      updateEvent: vi.fn().mockResolvedValue({ ...mockExistingEvent }),
      duplicateEventAsDraft: vi.fn().mockResolvedValue('ev-dup-new'),
    };

    await TestBed.configureTestingModule({
      imports: [ListingEditorComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceSpy },
        { provide: BusinessService, useValue: businessServiceSpy },
        { provide: PublishingAccessService, useValue: publishingAccessSpy },
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
    sessionStorage.clear();
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
    expect(component.errorMessage).toContain('post title');

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

  describe('Subscription-gated publishing', () => {
    async function prepareNewPost() {
      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();
      component.draft.name = 'First Business Event';
      component.draft.description = 'A complete description for the first event.';
      component.draft.startDate = '2026-11-20';
      component.draft.address = 'Beach Road 1';
      component.existingImages = [{ junctionId: 55, url: 'image.jpg' }];
      businessServiceSpy.createEvent.mockImplementation(async (payload: any) => ({ ...mockExistingEvent, ...payload, id: 'ev-first-draft' }));
    }

    it('saves the first post as a draft and redirects to subscribe with its ID', async () => {
      await prepareNewPost();
      const file = new File(['image'], 'event.png');
      component.selectedNewFiles = [file];
      publishingAccessSpy.check.mockResolvedValue({ allowed: false, reason: 'subscription' });
      await component.publishListing();
      expect(publishingAccessSpy.check).toHaveBeenCalledWith(mockUser.email, mockUser.provider_link.id);
      expect(businessServiceSpy.createEvent).toHaveBeenCalledOnce();
      expect(businessServiceSpy.createEvent).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft', name: 'First Business Event' }), [file], ['area-1']);
      expect(router.navigate).toHaveBeenCalledWith(['/app/billing'], { queryParams: { returnEventId: 'ev-first-draft', reason: 'subscription' } });
      expect(component.isDirty).toBe(false);
    });

    it('routes exhausted quota through a retained draft without publishing', async () => {
      await prepareNewPost();
      publishingAccessSpy.check.mockResolvedValue({ allowed: false, reason: 'quota' });
      await component.publishListing();
      expect(businessServiceSpy.createEvent.mock.calls[0][0].status).toBe('draft');
      expect(router.navigate).toHaveBeenCalledWith(['/app/billing'], { queryParams: { returnEventId: 'ev-first-draft', reason: 'quota' } });
    });

    it('preserves unsaved content and does not write or redirect if subscription lookup fails', async () => {
      await prepareNewPost();
      component.isDirty = true;
      publishingAccessSpy.check.mockRejectedValue(new TypeError('Failed to fetch'));
      await component.publishListing();
      expect(businessServiceSpy.createEvent).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
      expect(component.isDirty).toBe(true);
      expect(component.errorMessage).toBeTruthy();
    });

    it('does not require a subscription to save a draft', async () => {
      await prepareNewPost();
      await component.saveDraft();
      expect(publishingAccessSpy.check).not.toHaveBeenCalled();
    });

    it('checks subscription again when publishing a saved draft and reuses its ID', async () => {
      await prepareNewPost();
      component.isEditMode = true;
      component.eventId = 'ev-saved-draft';
      businessServiceSpy.getEventById.mockResolvedValue({ ...mockExistingEvent, id: 'ev-saved-draft', status: 'draft' });
      await component.publishListing();
      expect(publishingAccessSpy.check).toHaveBeenCalledOnce();
      expect(businessServiceSpy.createEvent).not.toHaveBeenCalled();
      expect(businessServiceSpy.updateEvent).toHaveBeenCalledWith('ev-saved-draft', expect.objectContaining({ status: 'published' }), [], [], ['area-1'], [], undefined);
    });

    it('does not consume a new publishing slot when editing an already published post', async () => {
      await prepareNewPost();
      component.isEditMode = true;
      component.eventId = mockExistingEvent.id;
      await component.publishListing();
      expect(publishingAccessSpy.check).not.toHaveBeenCalled();
      expect(businessServiceSpy.updateEvent).toHaveBeenCalled();
    });

    it('sets the canonical 30-day expiry for an additional-post slot', async () => {
      await prepareNewPost();
      publishingAccessSpy.check.mockResolvedValue({ allowed: true, usesAddonSlot: true });
      const before = Date.now();
      await component.publishListing();
      const expires = Date.parse(businessServiceSpy.createEvent.mock.calls[0][0].addon_expires_at);
      expect(expires).toBeGreaterThanOrEqual(before + 30 * 86400000);
      expect(expires).toBeLessThanOrEqual(Date.now() + 30 * 86400000);
    });
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

  describe('Promote Post Shortcut', () => {
    it('should determine eligibility correctly via canPromotePost', () => {
      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;

      // In create mode (default): ineligible
      expect(component.canPromotePost).toBe(false);

      // Draft mode: ineligible
      component.isEditMode = true;
      component.isDraft = true;
      component.eventId = 'event-123';
      component.isPastEvent = false;
      expect(component.canPromotePost).toBe(false);

      // Past event: ineligible
      component.isDraft = false;
      component.isPastEvent = true;
      expect(component.canPromotePost).toBe(false);

      // Missing eventId: ineligible
      component.isPastEvent = false;
      component.eventId = null;
      expect(component.canPromotePost).toBe(false);

      // Eligible: published edit mode event with valid eventId and not past
      component.eventId = 'event-123';
      expect(component.canPromotePost).toBe(true);
    });

    it('should navigate directly to promotions when form is clean', () => {
      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;
      component.isEditMode = true;
      component.isDraft = false;
      component.eventId = 'event-123';
      component.isDirty = false;

      component.onPromotePost();

      expect(router.navigate).toHaveBeenCalledWith(['/app/promotions'], {
        queryParams: { eventId: 'event-123' },
      });
      expect(component.showCancelConfirmModal).toBe(false);
    });

    it('should show discard modal with pendingExitTarget = promotions when form is dirty, then route to promotions on discard', () => {
      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;
      component.isEditMode = true;
      component.isDraft = false;
      component.eventId = 'event-123';
      component.markDirty();

      component.onPromotePost();

      expect(component.showCancelConfirmModal).toBe(true);
      expect(component.pendingExitTarget).toBe('promotions');

      component.confirmDiscardAndExit();

      expect(component.isDirty).toBe(false);
      expect(component.showCancelConfirmModal).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(['/app/promotions'], {
        queryParams: { eventId: 'event-123' },
      });
    });
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
      expect(titleEl.textContent.trim()).toBe('Create New Post');

      i18nService.setLang('es');
      fixture.detectChanges();
      titleEl = fixture.nativeElement.querySelector('.page-title');
      expect(titleEl.textContent.trim()).toBe('Crear Nueva Publicación');

      // Edit mode
      component.isEditMode = true;
      i18nService.setLang('en');
      fixture.detectChanges();
      titleEl = fixture.nativeElement.querySelector('.page-title');
      expect(titleEl.textContent.trim()).toBe('Edit Post');

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
      expect(descs[0]).toBe('Define the title, category, and a compelling description for your post.');

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
      expect(labels.some((l) => l.includes('Post Title'))).toBe(true);
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
      expect(component.errorMessage).toBe('Please provide a post title.');

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
      expect(backBtn.textContent.trim()).toBe('Back to Posts');
      expect(draftBtn.textContent.trim()).toBe('Save as Draft');
      expect(publishBtn.textContent.trim()).toBe('Publish Post');

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
      expect(backBtn.getAttribute('aria-label')).toBe('Back to Posts');

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

  describe('Final review: localized geolocation feedback', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('shows localized EN/ES geolocation failure without raw browser error text', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubGlobal('navigator', {
        geolocation: {
          getCurrentPosition: (_ok: any, fail: any) => fail({ code: 1, message: 'User denied Geolocation' }),
        },
      });

      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;
      i18nService.setLang('en');
      component.detectCurrentLocation();
      expect(component.locationError).toBe(
        'Could not detect your device location. Please check location permissions and try again.'
      );

      i18nService.setLang('es');
      component.detectCurrentLocation();
      expect(component.locationError).toBe(i18nService.t('PORTAL.EVENT_EDITOR.VALIDATION.GEO_FAILED'));
      expect(component.locationError).not.toContain('User denied');
      expect(component.locationError).not.toMatch(/:\s*$/);
    });
  });

  describe('Scheduling, Past Events, and Image Requirement', () => {
    it('should calculate minStartDate from drTodayStr() on new listing', () => {
      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;
      businessServiceSpy.drTodayStr.mockReturnValue('2026-10-15');

      expect(component.minStartDate).toBe('2026-10-15');
    });

    it('should reject start date in the past with inline error and error message', () => {
      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;
      businessServiceSpy.drTodayStr.mockReturnValue('2026-10-15');

      component.draft.name = 'Test Event';
      component.draft.category = 'sports';
      component.draft.description = 'Valid Description of 10+ characters';
      component.draft.startDate = '2026-10-10'; // In the past
      component.onStartDateChange();

      expect(component.scheduleErrors['startDate']).toBe('PORTAL.LISTINGS.ERRORS.START_DATE_PAST');
      expect(component.validateForm(false)).toBe(false);
      expect(component.errorMessage).toBe('Start date cannot be in the past.');
    });

    it('should validate end date and time together (same-day end time cannot precede start time)', () => {
      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;
      businessServiceSpy.drTodayStr.mockReturnValue('2026-10-15');

      component.draft.startDate = '2026-10-20';
      component.draft.allDay = false;
      component.draft.openEnd = false;
      component.draft.from = '22:00';
      component.draft.to = '02:00';
      component.multiDay = false;

      component.onTimeChange();

      expect(component.scheduleErrors['to']).toBe('PORTAL.LISTINGS.ERRORS.END_TIME_BEFORE_START');
      expect(component.validateCurrentSchedule(false)).toBe(false);
    });

    it('should allow earlier end clock time when end date is greater than start date', () => {
      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;
      businessServiceSpy.drTodayStr.mockReturnValue('2026-10-15');

      component.draft.startDate = '2026-10-20';
      component.multiDay = true;
      component.draft.endDate = '2026-10-21';
      component.draft.allDay = false;
      component.draft.openEnd = false;
      component.draft.from = '22:00';
      component.draft.to = '02:00'; // Overnight to next day

      component.onTimeChange();

      expect(component.scheduleErrors['to']).toBeUndefined();
      expect(component.validateCurrentSchedule(false)).toBe(true);
    });

    it('should display required star beside media section title and dropzone button', async () => {
      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();
      fixture.detectChanges();

      const stars = fixture.nativeElement.querySelectorAll('.required-star');
      expect(stars.length).toBeGreaterThanOrEqual(2);

      const sectionTitle = fixture.nativeElement.querySelector('.section-header .section-title');
      expect(sectionTitle).toBeTruthy();
    });

    it('should detect past event, lock dates, show read-only banner, and block edits', async () => {
      businessServiceSpy.drTodayStr.mockReturnValue('2026-10-15');
      const pastEvent: VamoEvent = {
        id: 'past-123',
        name: 'Old Beach Party',
        status: 'published',
        startDate: '2026-09-01',
        endDate: '2026-09-02',
      };
      businessServiceSpy.getEventById.mockResolvedValue(pastEvent);

      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;
      component.eventId = 'past-123';
      component.isEditMode = true;

      await component.loadExistingEvent('past-123');
      fixture.detectChanges();

      expect(component.isPastEvent).toBe(true);
      expect(component.datesLocked).toBe(true);

      const pastAlert = fixture.nativeElement.querySelector('.alert-warning');
      expect(pastAlert).toBeTruthy();
      expect(pastAlert.textContent).toContain('Past Event');

      expect(component.validateForm(false)).toBe(false);
      expect(component.errorMessage).toBe('Past events cannot be edited. Please copy as a new post instead.');
    });

    it('should copy past event as new draft and navigate to editor', async () => {
      businessServiceSpy.drTodayStr.mockReturnValue('2026-10-15');
      const pastEvent: VamoEvent = {
        id: 'past-123',
        name: 'Old Beach Party',
        status: 'published',
        startDate: '2026-09-01',
      };
      businessServiceSpy.getEventById.mockResolvedValue(pastEvent);
      businessServiceSpy.duplicateEventAsDraft.mockResolvedValue('new-copy-id');

      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;
      component.eventId = 'past-123';
      component.isEditMode = true;

      await component.loadExistingEvent('past-123');
      await component.copyPastEvent();

      expect(businessServiceSpy.duplicateEventAsDraft).toHaveBeenCalledWith(pastEvent);
      expect(router.navigate).toHaveBeenCalledWith(['/app/listings/edit', 'new-copy-id']);
    });
  });

  describe('Draft Minimal Validation & Session Recovery', () => {
    it('should allow saving a draft with only name filled (no category, no description)', async () => {
      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();

      component.draft.name = 'Minimal Draft Title';
      component.draft.category = undefined as any;
      component.draft.description = '';

      expect(component.validateForm(false)).toBe(true);

      await component.saveDraft();
      expect(businessServiceSpy.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Minimal Draft Title',
          status: 'draft',
        }),
        [],
        ['area-1']
      );
    });

    it('should persist draft recovery data to sessionStorage on edit without credentials', () => {
      sessionStorage.clear();
      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;

      component.draft.name = 'Unsaved In-Progress Post';
      component.draft.description = 'Typing some details before session times out';
      component.markDirty();

      const stored = sessionStorage.getItem('vamo_editor_recovery_new');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.name).toBe('Unsaved In-Progress Post');
      expect(parsed.description).toBe('Typing some details before session times out');
      // Must NEVER contain passwords, tokens, or credentials
      expect(parsed.password).toBeUndefined();
      expect(parsed.token).toBeUndefined();
      expect(parsed.access_token).toBeUndefined();
      expect(parsed.refresh_token).toBeUndefined();
    });

    it('should restore draft recovery data on reload', async () => {
      sessionStorage.setItem('vamo_editor_recovery_new', JSON.stringify({
        name: 'Recovered Draft',
        description: 'Recovered description text',
        mode: 'single',
      }));

      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();

      expect(component.draft.name).toBe('Recovered Draft');
      expect(component.draft.description).toBe('Recovered description text');
      expect(component.isDirty).toBe(true);
      sessionStorage.clear();
    });

    it('should clear draft recovery data on successful save', async () => {
      sessionStorage.setItem('vamo_editor_recovery_new', JSON.stringify({
        name: 'Draft to Save',
      }));

      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();

      component.draft.name = 'Draft to Save';
      await component.saveDraft();

      expect(sessionStorage.getItem('vamo_editor_recovery_new')).toBeNull();
    });
  });

  describe('Drag-and-Drop Image Uploads & Event Description Paragraph Preservation', () => {
    const MULTILINE_FIXTURE =
      'First paragraph, first line.\nSecond line.\n\nSecond paragraph with accents: República Dominicana 🌴';

    beforeEach(async () => {
      sessionStorage.clear();
      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('highlights dropzone on file dragenter/dragover, handles nested dragenter/dragleave without flickering, and resets on drop', () => {
      const fileDragEvent = () => {
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        return {
          preventDefault,
          stopPropagation,
          dataTransfer: {
            types: ['Files'],
            files: [new File(['img'], 'flyer.jpg', { type: 'image/jpeg' })] as unknown as FileList,
            dropEffect: 'none',
          },
        } as unknown as DragEvent;
      };

      const enterOuter = fileDragEvent();
      component.onPhotoDragEnter(enterOuter);
      expect(enterOuter.preventDefault).toHaveBeenCalled();
      expect(component.isPhotoDragOver).toBe(true);

      // Nested child dragenter increments depth to 2
      const enterInner = fileDragEvent();
      component.onPhotoDragEnter(enterInner);
      expect(component.isPhotoDragOver).toBe(true);

      // Leaving inner child decrements depth to 1 -> highlight stays true (no flicker)
      const leaveInner = fileDragEvent();
      component.onPhotoDragLeave(leaveInner);
      expect(component.isPhotoDragOver).toBe(true);

      // Leaving outer container decrements depth to 0 -> highlight resets
      const leaveOuter = fileDragEvent();
      component.onPhotoDragLeave(leaveOuter);
      expect(component.isPhotoDragOver).toBe(false);

      // Dragover sets copy dropEffect and active state
      const overEvt = fileDragEvent();
      component.onPhotoDragOver(overEvt);
      expect(overEvt.preventDefault).toHaveBeenCalled();
      expect(overEvt.dataTransfer!.dropEffect).toBe('copy');
      expect(component.isPhotoDragOver).toBe(true);
      fixture.detectChanges();

      const dropzoneEl = fixture.nativeElement.querySelector('.upload-dropzone-btn');
      expect(dropzoneEl.classList.contains('drag-over')).toBe(true);

      // Drop resets highlight, prevents browser navigation, and adds file to selectedNewFiles
      const dropEvt = fileDragEvent();
      component.onPhotoDrop(dropEvt);
      expect(dropEvt.preventDefault).toHaveBeenCalled();
      expect(dropEvt.stopPropagation).toHaveBeenCalled();
      expect(component.isPhotoDragOver).toBe(false);
      expect(component.selectedNewFiles.length).toBe(1);
      expect(component.selectedNewFiles[0].name).toBe('flyer.jpg');
      expect(component.isDirty).toBe(true);
    });

    it('rejects unsupported file types and oversized files (>10MB) on drop with localized EN/ES validation error', () => {
      i18nService.setLang('en');
      fixture.detectChanges();

      const badTypeDrop = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          types: ['Files'],
          files: [new File(['pdf'], 'flyer.pdf', { type: 'application/pdf' })] as unknown as FileList,
        },
      } as unknown as DragEvent;

      component.onPhotoDrop(badTypeDrop);
      expect(component.selectedNewFiles.length).toBe(0);
      expect(component.errorMessage).toBe('Unsupported image format. Please use JPG, PNG, or WebP.');

      i18nService.setLang('es');
      const oversizedFile = new File(['x'], 'huge.png', { type: 'image/png' });
      Object.defineProperty(oversizedFile, 'size', { value: 11 * 1024 * 1024 });
      const oversizedDrop = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          types: ['Files'],
          files: [oversizedFile] as unknown as FileList,
        },
      } as unknown as DragEvent;

      component.onPhotoDrop(oversizedDrop);
      expect(component.selectedNewFiles.length).toBe(0);
      expect(component.errorMessage).toBe('La imagen supera el límite de 10 MB. Elige un archivo más pequeño.');
      i18nService.setLang('en');
    });

    it('ignores remote URL drops (without local files) and drops when disabled/past event', () => {
      const remoteUrlDrop = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          types: ['text/uri-list'],
          files: [] as unknown as FileList,
        },
      } as unknown as DragEvent;

      component.onPhotoDrop(remoteUrlDrop);
      expect(component.selectedNewFiles.length).toBe(0);

      // Disabled when past event
      component.isPastEvent = true;
      const validDropWhilePast = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          types: ['Files'],
          files: [new File(['img'], 'photo.png', { type: 'image/png' })] as unknown as FileList,
        },
      } as unknown as DragEvent;

      component.onPhotoDrop(validDropWhilePast);
      expect(component.selectedNewFiles.length).toBe(0);
    });

    it('supports keyboard Enter and Space activation on the photo upload dropzone', () => {
      const fileInput = document.createElement('input');
      const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => {});
      const keyEvt = new KeyboardEvent('keydown', { key: 'Enter' });
      const preventSpy = vi.spyOn(keyEvt, 'preventDefault');

      component.onDropzoneKeydown(keyEvt, fileInput);
      expect(preventSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
    });

    it('preserves multi-paragraph descriptions and single line breaks across input, CRLF normalization, save payload, reload, and preview', async () => {
      // Simulate pasting text with CRLF line endings and blank lines between paragraphs
      const crlfInput = MULTILINE_FIXTURE.replace(/\n/g, '\r\n');
      component.onDescriptionChange(crlfInput);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.draft.description).toBe(MULTILINE_FIXTURE);

      // Live preview element renders exact multi-paragraph text with pre-wrap styling
      const previewDescEl = fixture.nativeElement.querySelector('.phone-desc') as HTMLElement;
      expect(previewDescEl).toBeTruthy();
      expect(previewDescEl.textContent).toBe(MULTILINE_FIXTURE);

      // Session recovery stores normalized multiline description
      const stored = JSON.parse(sessionStorage.getItem('vamo_editor_recovery_new')!);
      expect(stored.description).toBe(MULTILINE_FIXTURE);

      // Save payload preserves exact paragraph breaks and single line breaks
      component.draft.name = 'Sunset Acoustic Session';
      component.draft.category = 'music';
      component.draft.address = 'Playa Bonita';
      component.draft.startDate = '2026-11-20';
      component.existingImages = [{ junctionId: 1, url: 'https://example.com/1.jpg' }];

      await component.publishListing();

      expect(businessServiceSpy.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          description: MULTILINE_FIXTURE,
        }),
        expect.anything(),
        expect.anything()
      );

      // Reloading existing event preserves exact multiline description in textarea and preview
      businessServiceSpy.getEventById.mockResolvedValueOnce({
        id: 'ev-multiline-1',
        name: 'Sunset Acoustic Session',
        category: 'music',
        description: MULTILINE_FIXTURE,
        status: 'published',
        startDate: '2026-11-20',
      });

      await component.loadExistingEvent('ev-multiline-1');
      fixture.detectChanges();
      await fixture.whenStable();

      const textarea = fixture.nativeElement.querySelector('#event-desc') as HTMLTextAreaElement;
      expect(textarea.value).toBe(MULTILINE_FIXTURE);
      const reloadedPreview = fixture.nativeElement.querySelector('.phone-desc') as HTMLElement;
      expect(reloadedPreview.textContent).toBe(MULTILINE_FIXTURE);
    });

    it('renders HTML-like strings in event description safely as literal text without injecting DOM elements', async () => {
      const unsafeText = 'Line 1 <script>alert(1)</script>\n\n<b>Bold tag as plain text</b>';
      component.onDescriptionChange(unsafeText);
      fixture.detectChanges();
      await fixture.whenStable();

      const previewDescEl = fixture.nativeElement.querySelector('.phone-desc') as HTMLElement;
      expect(previewDescEl).toBeTruthy();
      expect(previewDescEl.textContent).toBe(unsafeText);
      expect(previewDescEl.querySelector('script')).toBeNull();
      expect(previewDescEl.querySelector('b')).toBeNull();
    });
  });

  describe('Image Upload Guidance & Simulated Mobile Placement Previews', () => {
    beforeEach(async () => {
      sessionStorage.clear();
      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('renders concise EN and ES event photo size and safe-area guidance without rejecting non-3:2 images', () => {
      i18nService.setLang('en');
      fixture.detectChanges();

      const sizeEl = fixture.nativeElement.querySelector('.photo-guidance-size') as HTMLElement;
      const safeAreaEl = fixture.nativeElement.querySelector('.photo-guidance-safe-area') as HTMLElement;
      expect(sizeEl).toBeTruthy();
      expect(safeAreaEl).toBeTruthy();
      expect(sizeEl.textContent?.trim()).toBe('Recommended: 1200 × 800 px (3:2 landscape).');
      expect(safeAreaEl.textContent?.trim()).toBe(
        'Keep text, logos, and important subjects near the center. Images may be cropped depending on placement and screen size.'
      );

      i18nService.setLang('es');
      fixture.detectChanges();

      expect(sizeEl.textContent?.trim()).toBe('Recomendado: 1200 × 800 px (formato horizontal 3:2).');
      expect(safeAreaEl.textContent?.trim()).toBe(
        'Mantén el texto, los logos y los elementos importantes cerca del centro. Las imágenes pueden recortarse según la ubicación y el tamaño de la pantalla.'
      );

      // Guidance is advisory only: uploading valid images does not enforce 1200x800 or 3:2
      const portraitOrSquareFile = new File(['img-bytes'], 'portrait-poster.png', { type: 'image/png' });
      component.handleSelectedFiles([portraitOrSquareFile]);
      expect(component.errorMessage).toBeNull();
      expect(component.selectedNewFiles.length).toBe(1);
    });

    it('renders EN/ES placement selector ("Preview image as") and "Approximate mobile preview" label, defaulting to Event Details', () => {
      i18nService.setLang('en');
      fixture.detectChanges();

      expect(component.previewPlacement).toBe('event_details');

      const approxNote = fixture.nativeElement.querySelector('.preview-approx-note') as HTMLElement;
      const placementLabel = fixture.nativeElement.querySelector('.preview-placement-label') as HTMLElement;
      const placementBtns = Array.from(
        fixture.nativeElement.querySelectorAll('.preview-placement-btn')
      ) as HTMLButtonElement[];

      expect(approxNote.textContent?.trim()).toBe('Approximate mobile preview');
      expect(placementLabel.textContent?.trim()).toBe('Preview image as');
      expect(placementBtns.map((b) => b.textContent?.trim())).toEqual([
        'Event Details',
        'What’s Hot',
        'Main Banner',
      ]);
      expect(placementBtns[0].classList.contains('active')).toBe(true);
      expect(placementBtns[0].getAttribute('aria-pressed')).toBe('true');

      i18nService.setLang('es');
      fixture.detectChanges();

      expect(approxNote.textContent?.trim()).toBe('Vista previa móvil aproximada');
      expect(placementLabel.textContent?.trim()).toBe('Vista previa de la imagen');
      expect(placementBtns.map((b) => b.textContent?.trim())).toEqual([
        'Detalles del evento',
        'What’s Hot',
        'Banner principal',
      ]);
    });

    it('shows an empty image state when no event photo is available and renders the image across all 3 placement modes without altering saved data or dirty state', () => {
      // Initial create state has no images -> empty state rendered instead of broken placeholder img
      expect(component.hasPreviewImage()).toBe(false);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.phone-cover-img')).toBeNull();
      const emptyStateEl = fixture.nativeElement.querySelector('.phone-image-empty-state') as HTMLElement;
      expect(emptyStateEl).toBeTruthy();
      expect(emptyStateEl.textContent).toContain('No photo yet');

      // Add two existing images and reset dirty state to verify mode switching is purely visual
      component.existingImages = [
        { junctionId: 11, url: 'https://api.vamo-app.com/assets/photo-first.jpg' },
        { junctionId: 12, url: 'https://api.vamo-app.com/assets/photo-second.jpg' },
      ];
      component.isDirty = false;
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();

      expect(component.hasPreviewImage()).toBe(true);
      expect(fixture.nativeElement.querySelector('.phone-image-empty-state')).toBeNull();

      let imageWrap = fixture.nativeElement.querySelector('.phone-card-image-wrap') as HTMLElement;
      let coverImg = fixture.nativeElement.querySelector('.phone-cover-img') as HTMLImageElement;
      expect(coverImg).toBeTruthy();
      expect(coverImg.getAttribute('src')).toBe('https://api.vamo-app.com/assets/photo-first.jpg');
      expect(imageWrap.classList.contains('placement-image-event_details')).toBe(true);
      expect(fixture.nativeElement.querySelector('.phone-view-event-details')).toBeTruthy();

      // Switch to What's Hot
      const whatsHotBtn = fixture.nativeElement.querySelector(
        '.preview-placement-btn[data-placement="whats_hot"]'
      ) as HTMLButtonElement;
      whatsHotBtn.click();
      fixture.detectChanges();

      imageWrap = fixture.nativeElement.querySelector('.phone-card-image-wrap') as HTMLElement;
      coverImg = fixture.nativeElement.querySelector('.phone-cover-img') as HTMLImageElement;
      expect(component.previewPlacement).toBe('whats_hot');
      expect(fixture.nativeElement.querySelector('.phone-view-whats-hot')).toBeTruthy();
      expect(imageWrap.classList.contains('placement-image-whats_hot')).toBe(true);
      expect(coverImg.getAttribute('src')).toBe('https://api.vamo-app.com/assets/photo-first.jpg');
      expect(component.isDirty).toBe(false);

      // Switch to Main Banner
      const mainBannerBtn = fixture.nativeElement.querySelector(
        '.preview-placement-btn[data-placement="main_banner"]'
      ) as HTMLButtonElement;
      mainBannerBtn.click();
      fixture.detectChanges();

      imageWrap = fixture.nativeElement.querySelector('.phone-card-image-wrap') as HTMLElement;
      coverImg = fixture.nativeElement.querySelector('.phone-cover-img') as HTMLImageElement;
      expect(component.previewPlacement).toBe('main_banner');
      expect(fixture.nativeElement.querySelector('.phone-view-main-banner')).toBeTruthy();
      expect(imageWrap.classList.contains('placement-image-main_banner')).toBe(true);
      expect(coverImg.getAttribute('src')).toBe('https://api.vamo-app.com/assets/photo-first.jpg');
      expect(component.isDirty).toBe(false);

      // Selecting the second thumbnail updates the previewed image across modes without mutating existingImages order or dirty state
      const photoCards = fixture.nativeElement.querySelectorAll('.photo-preview-card');
      expect(photoCards.length).toBe(2);
      photoCards[1].click();
      fixture.detectChanges();

      coverImg = fixture.nativeElement.querySelector('.phone-cover-img') as HTMLImageElement;
      expect(coverImg.getAttribute('src')).toBe('https://api.vamo-app.com/assets/photo-second.jpg');
      expect(component.existingImages.map((i) => i.junctionId)).toEqual([11, 12]);
      expect(component.isDirty).toBe(false);
    });

    it('renders distinct mobile app structures for Event Details, What’s Hot, and Main Banner placements', () => {
      component.existingImages = [
        { junctionId: 21, url: 'https://api.vamo-app.com/assets/beach-party.jpg' },
      ];
      component.draft.name = 'Sunset Rooftop Sessions';
      component.draft.description = 'First paragraph of event details.\n\nSecond paragraph after blank line.';
      component.draft.address = 'Calle Pedro Clisante, Sosúa';
      component.draft.price = '1500';
      component.draft.hasPromotion = true;
      component.draft.promoText = '2x1 cocktails before 8 PM';
      component.draft.mode = 'recurring';
      component.draft.recurring = { days: ['fri', 'sat'] };
      component.draft.from = '20:00';
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();

      // 1. Event Details mode: full-width hero, meta rows, 3 consumer action buttons, description glass card, promotion glass card
      expect(component.previewPlacement).toBe('event_details');
      expect(fixture.nativeElement.querySelector('.phone-view-event-details')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.phone-details-actions')).toBeTruthy();
      expect(fixture.nativeElement.querySelectorAll('.action-icon-btn').length).toBe(3);
      expect(fixture.nativeElement.querySelector('.phone-desc')?.textContent).toBe(
        'First paragraph of event details.\n\nSecond paragraph after blank line.'
      );
      expect(fixture.nativeElement.querySelector('.phone-promo-glass-card .phone-promo-body')?.textContent?.trim()).toBe(
        '2x1 cocktails before 8 PM'
      );
      // No hero placement badges unless the event actually has banner/what's hot placement
      expect(fixture.nativeElement.querySelector('.phone-hero-badges')).toBeNull();

      component.originalEvent = { id: 'evt-1', is_main_banner: true, is_whats_hot: true } as any;
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
      const heroBadges = fixture.nativeElement.querySelectorAll('.hero-badge');
      expect(heroBadges.length).toBe(1);
      expect(heroBadges[0].textContent).toContain('Fully Featured');

      // 2. What’s Hot mode: home-screen horizontal card with pink title, yellow promo badge, and no full event description body
      component.setPreviewPlacement('whats_hot');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.phone-view-whats-hot')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.phone-whats-hot-card')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.whats-hot-promo-badge')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.whats-hot-card-title')?.textContent?.trim()).toBe(
        'Sunset Rooftop Sessions'
      );
      expect(fixture.nativeElement.querySelector('.phone-desc')).toBeNull();
      expect(fixture.nativeElement.querySelector('.phone-details-actions')).toBeNull();

      // 3. Main Banner mode: home-screen full-width hero banner with bottom overlay, recurring + promo icons, and no full event description body
      component.setPreviewPlacement('main_banner');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.phone-view-main-banner')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.phone-banner-overlay')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.phone-banner-title')?.textContent?.trim()).toBe(
        'Sunset Rooftop Sessions'
      );
      expect(fixture.nativeElement.querySelector('.phone-banner-repeat-icon')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.phone-banner-promo-icon')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.phone-desc')).toBeNull();
      expect(fixture.nativeElement.querySelector('.phone-details-actions')).toBeNull();
    });

    it('scales the simulated phone frame uniformly by both width and height so the full phone fits in view', () => {
      expect(component.simulatedPhoneViewportWidth).toBe(330);
      expect(component.simulatedPhoneViewportHeight).toBe(560);
      expect(component.simulatedPhoneFrameWidth).toBe(358);
      expect(component.simulatedPhoneFrameHeight).toBe(624);

      // Width-constrained case (286.4px width = 0.8x of 358px, plenty of height)
      component.updatePhonePreviewScale(286.4, 800);
      fixture.detectChanges();

      expect(component.phoneScale).toBeCloseTo(0.8, 3);
      expect(component.phoneStageWidthPx).toBe(Math.ceil(358 * component.phoneScale));
      expect(component.phoneStageHeightPx).toBe(Math.ceil(624 * component.phoneScale));
      const phoneFrame = fixture.nativeElement.querySelector('.phone-frame') as HTMLElement;
      expect(phoneFrame.style.transform).toContain('scale(0.8)');

      // Height-constrained case (full 358px width, but only 468px vertical space = 0.75x of 624px)
      component.updatePhonePreviewScale(358, 468);
      fixture.detectChanges();

      expect(component.phoneScale).toBeCloseTo(0.75, 3);
      expect(component.phoneStageWidthPx).toBe(Math.ceil(358 * 0.75));
      expect(component.phoneStageHeightPx).toBe(468);

      // Restoring full width and height resets scale to 1
      component.updatePhonePreviewScale(358, 700);
      fixture.detectChanges();
      expect(component.phoneScale).toBe(1);
      expect(component.phoneStageWidthPx).toBe(358);
      expect(component.phoneStageHeightPx).toBe(624);
    });
  });

  describe('Post-Release Alignment: Category Icons, Pricing Units, Image Fitting & Event Links', () => {
    beforeEach(async () => {
      sessionStorage.clear();
      fixture = TestBed.createComponent(ListingEditorComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('renders all 9 supplied PNG category icons in the category selector without emoji placeholders', () => {
      const categoryButtons = Array.from(
        fixture.nativeElement.querySelectorAll('.category-grid .category-card-btn')
      ) as HTMLButtonElement[];
      expect(categoryButtons.length).toBe(9);

      const expectedIcons = [
        '/assets/category-icons/music_nightlife.png',
        '/assets/category-icons/Food_drink.png',
        '/assets/category-icons/excursion.png',
        '/assets/category-icons/Wellness.png',
        '/assets/category-icons/arts_and_culture.png',
        '/assets/category-icons/sports_outdoor.png',
        '/assets/category-icons/personalized.png',
        '/assets/category-icons/celebrations_festivities.png',
        '/assets/category-icons/other.png',
      ];

      const renderedIcons = categoryButtons.map((btn) => {
        const img = btn.querySelector('img.cat-icon-img') as HTMLImageElement | null;
        expect(img).toBeTruthy();
        expect(img?.getAttribute('aria-hidden')).toBe('true');
        expect(btn.querySelector('.cat-emoji')).toBeNull();
        return img?.getAttribute('src');
      });

      expect(renderedIcons).toEqual(expectedIcons);

      // Selecting a category sets aria-pressed="true" and updates draft.category
      categoryButtons[2].click(); // Excursions & Tours ('excursions')
      fixture.detectChanges();
      expect(component.draft.category).toBe('excursions');
      expect(categoryButtons[2].getAttribute('aria-pressed')).toBe('true');
      expect(categoryButtons[0].getAttribute('aria-pressed')).toBe('false');
    });

    it('supports all 4 mobile app pricing units (per_person, per_group, per_week, per_month) with EN/ES labels and suffixes', async () => {
      expect(component.draft.price_unit).toBe('per_person');

      // Switch to paid pricing model
      component.setPricingModel('paid');
      component.draft.price = 60;
      fixture.detectChanges();

      i18nService.setLang('en');
      fixture.detectChanges();

      const unitBtnsEn = Array.from(
        fixture.nativeElement.querySelectorAll('.price-unit-selector .price-unit-btn')
      ) as HTMLButtonElement[];
      expect(unitBtnsEn.map((b) => b.textContent?.trim())).toEqual([
        'Per person',
        'Per group',
        'Per week',
        'Per month',
      ]);
      expect(component.formatPreviewPrice()).toBe('USD $60.00 / person');
      expect(component.formatEventDetailsPrice()).toBe('$60.00 / person');

      // Select 'per_group'
      unitBtnsEn[1].click();
      fixture.detectChanges();
      expect(component.draft.price_unit).toBe('per_group');
      expect(component.formatPreviewPrice()).toBe('USD $60.00 / group');
      expect(component.formatEventDetailsPrice()).toBe('$60.00 / group');

      // Switch to Spanish
      i18nService.setLang('es');
      fixture.detectChanges();
      const unitBtnsEs = Array.from(
        fixture.nativeElement.querySelectorAll('.price-unit-selector .price-unit-btn')
      ) as HTMLButtonElement[];
      expect(unitBtnsEs.map((b) => b.textContent?.trim())).toEqual([
        'Por persona',
        'Por grupo',
        'Por semana',
        'Por mes',
      ]);
      expect(component.formatPreviewPrice()).toBe('USD $60.00 / grupo');
      expect(component.formatEventDetailsPrice()).toBe('$60.00 / grupo');

      // Persist price_unit on save when paid, and null it when free
      i18nService.setLang('en');
      component.draft.name = 'Catamaran Group Charter';
      component.draft.category = 'excursions';
      component.draft.description = 'Private catamaran excursion along Samaná bay.';
      await component.saveDraft();

      expect(businessServiceSpy.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          isFree: false,
          contactForPrice: false,
          price: 60,
          price_unit: 'per_group',
        }),
        expect.anything(),
        expect.anything()
      );

      businessServiceSpy.updateEvent.mockClear();
      component.setPricingModel('free');
      await component.saveDraft();
      expect(businessServiceSpy.updateEvent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          isFree: true,
          price_unit: null,
        }),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it('uses FitImageComponent to show narrow/portrait flyers uncropped with a blurred backdrop while keeping 3:2 landscape images as cover', () => {
      component.existingImages = [
        { junctionId: 50, url: 'https://api.vamo-app.com/assets/portrait-flyer.jpg' },
      ];
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();

      const fitImageEl = fixture.nativeElement.querySelector(
        '.phone-card-image-wrap app-fit-image'
      ) as HTMLElement;
      expect(fitImageEl).toBeTruthy();

      const mainImg = fitImageEl.querySelector('img.phone-cover-img') as HTMLImageElement;
      expect(mainImg).toBeTruthy();

      // Mock container box as 330x210 (ratio ~1.57) and image as portrait 800x1200 (ratio ~0.67 < 1.57 * 0.85)
      Object.defineProperty(fitImageEl, 'clientWidth', { value: 330, configurable: true });
      Object.defineProperty(fitImageEl, 'clientHeight', { value: 210, configurable: true });
      Object.defineProperty(mainImg, 'naturalWidth', { value: 800, configurable: true });
      Object.defineProperty(mainImg, 'naturalHeight', { value: 1200, configurable: true });

      mainImg.dispatchEvent(new Event('load'));
      fixture.detectChanges();

      expect(fitImageEl.classList.contains('fit-image--contain')).toBe(true);
      expect(fitImageEl.querySelector('.fit-image-backdrop')).toBeTruthy();

      // Now simulate a 3:2 landscape image (1200x800, ratio 1.5 >= 1.57 * 0.85)
      Object.defineProperty(mainImg, 'naturalWidth', { value: 1200, configurable: true });
      Object.defineProperty(mainImg, 'naturalHeight', { value: 800, configurable: true });

      mainImg.dispatchEvent(new Event('load'));
      fixture.detectChanges();

      expect(fitImageEl.classList.contains('fit-image--contain')).toBe(false);
      expect(fitImageEl.querySelector('.fit-image-backdrop')).toBeNull();
    });

    it('resolves the canonical event URL (https://app.vamo-app.com/event/:id) without adding a public-facing View on VAMO button', async () => {
      businessServiceSpy.getEventById.mockResolvedValueOnce({
        id: 'ev-live-99',
        name: 'Published Beach Concert',
        status: 'published',
        category: 'live',
        startDate: '2026-12-15',
        from: '20:00',
        to: '23:30',
      });

      component.isEditMode = true;
      component.eventId = 'ev-live-99';
      await component.loadExistingEvent('ev-live-99');
      fixture.detectChanges();

      expect(component.getPublicEventLink()).toBe('https://app.vamo-app.com/event/ev-live-99');
      expect(fixture.nativeElement.querySelector('.view-on-vamo-btn')).toBeNull();
    });
  });

});

