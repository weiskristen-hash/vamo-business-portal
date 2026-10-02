import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListingEditorComponent } from './listing-editor.component';
import { AuthService } from '../../../core/services/auth.service';
import { BusinessService } from '../../../core/services/business.service';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { VamoEvent } from '../../../core/models/event.model';

describe('ListingEditorComponent', () => {
  let component: ListingEditorComponent;
  let fixture: ComponentFixture<ListingEditorComponent>;
  let authServiceSpy: any;
  let businessServiceSpy: any;
  let router: Router;

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
      'provider-999',
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
      'provider-999',
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
});
