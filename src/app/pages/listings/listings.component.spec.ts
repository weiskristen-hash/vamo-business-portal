import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListingsComponent } from './listings.component';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { Router, provideRouter } from '@angular/router';
import { VamoEvent } from '../../core/models/event.model';
import { I18nService } from '../../core/i18n/i18n.service';

describe('ListingsComponent', () => {
  let component: ListingsComponent;
  let fixture: ComponentFixture<ListingsComponent>;
  let authServiceSpy: any;
  let businessServiceSpy: any;
  let router: Router;
  let i18nService: I18nService;

  const mockUser = {
    id: 'user-1',
    email: 'provider@example.com',
    provider_link: {
      id: 'provider-123',
      name: 'Cabarete Surf & Beach',
    },
  };

  const mockEvents: VamoEvent[] = [
    {
      id: 'ev-1',
      name: 'Live Salsa by the Ocean',
      status: 'published',
      category: 'live',
      mode: 'single',
      startDate: '2026-10-25',
      from: '19:00',
      to: '23:00',
      address: 'Kite Beach, Cabarete',
      isFree: true,
      price: 0,
      currency: 'USD',
      is_main_banner: true,
    },
    {
      id: 'ev-2',
      name: 'Weekly Sunset Yoga',
      status: 'published',
      category: 'wellness',
      mode: 'recurring',
      recurring: { days: ['tue', 'thu'] },
      from: '17:30',
      to: '18:45',
      address: 'Cabarete East',
      isFree: false,
      price: 15,
      currency: 'USD',
    },
    {
      id: 'ev-3',
      name: 'Draft Beach Volleyball Tournament',
      status: 'draft',
      category: 'sports',
      mode: 'single',
      startDate: '2026-11-01',
      address: 'Main Beach',
      isFree: true,
      price: 0,
    },
    {
      id: 'ev-4',
      name: 'Past Summer Jam',
      status: 'archived',
      category: 'celebrations',
      mode: 'single',
      startDate: '2026-06-01',
      address: 'Beach Front',
      isFree: true,
    },
  ];

  beforeEach(async () => {
    authServiceSpy = {
      currentUser: mockUser,
      safeRequest: vi.fn((fn) => fn()),
    };

    businessServiceSpy = {
      getEventsForProvider: vi.fn().mockResolvedValue([...mockEvents]),
      isEventUpcomingOrOngoing: vi.fn((ev: any) => {
        return ev.startDate ? ev.startDate >= '2026-10-01' : false;
      }),
      getAssetUrl: vi.fn((id: string) => `https://api.vamo-app.com/assets/${id}`),
      duplicateEventAsDraft: vi.fn().mockResolvedValue('ev-new-copy'),
      pauseEvent: vi.fn().mockResolvedValue(undefined),
      publishEvent: vi.fn().mockResolvedValue(undefined),
      deleteEvent: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [ListingsComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceSpy },
        { provide: BusinessService, useValue: businessServiceSpy },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    i18nService = TestBed.inject(I18nService);
    i18nService.setLang('en');

    fixture = TestBed.createComponent(ListingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the listings component and load provider events', async () => {
    await fixture.whenStable();
    expect(component).toBeTruthy();
    expect(businessServiceSpy.getEventsForProvider).toHaveBeenCalledWith('provider-123');
    expect(component.events.length).toBe(4);
    expect(component.stats.active).toBe(2); // ev-1 (single upcoming), ev-2 (recurring)
    expect(component.stats.draft).toBe(1);  // ev-3
    expect(component.stats.past).toBe(1);   // ev-4
  });

  it('shows only Active, Drafts, and Past status controls', async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('All Listings');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.metrics-row .metric-card').length).toBe(3);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.filter-tabs .filter-tab').length).toBe(3);
  });

  it('defaults to Active and filters listings by the three status tabs', () => {
    expect(component.statusFilter).toBe('active');
    expect(component.filteredEvents.length).toBe(2);
    expect(component.filteredEvents.every((e) => e.status === 'published')).toBe(true);

    component.setStatusFilter('draft');
    expect(component.filteredEvents.length).toBe(1);
    expect(component.filteredEvents[0].id).toBe('ev-3');

    component.setStatusFilter('past');
    expect(component.filteredEvents.length).toBe(1);
    expect(component.filteredEvents[0].id).toBe('ev-4');

    component.setStatusFilter('active');
    expect(component.filteredEvents.length).toBe(2);
  });

  it('should filter listings by search query', () => {
    component.searchQuery = 'Yoga';
    component.applyFilters();
    expect(component.filteredEvents.length).toBe(1);
    expect(component.filteredEvents[0].name).toContain('Sunset Yoga');

    component.searchQuery = 'NonExistent';
    component.applyFilters();
    expect(component.filteredEvents.length).toBe(0);
  });

  it('should filter listings by category and mode', () => {
    component.categoryFilter = 'wellness';
    component.applyFilters();
    expect(component.filteredEvents.length).toBe(1);
    expect(component.filteredEvents[0].category).toBe('wellness');

    component.categoryFilter = 'all';
    component.modeFilter = 'recurring';
    component.applyFilters();
    expect(component.filteredEvents.length).toBe(1);
    expect(component.filteredEvents[0].mode).toBe('recurring');
  });

  it('should navigate to edit draft or published event', () => {
    // Draft navigates to create wizard with queryParam
    component.onEdit(mockEvents[2]);
    expect(router.navigate).toHaveBeenCalledWith(['/app/listings/create'], {
      queryParams: { eventId: 'ev-3' },
    });

    // Published navigates to edit page
    component.onEdit(mockEvents[0]);
    expect(router.navigate).toHaveBeenCalledWith(['/app/listings/edit', 'ev-1']);
  });

  it('prevents editing past events, displaying error and keeping Copy enabled', async () => {
    (router.navigate as any).mockClear();
    const pastEvent = mockEvents[3]; // archived
    expect(component.canEdit(pastEvent)).toBe(false);

    component.onEdit(pastEvent);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.error).toBe('Past events cannot be edited. Please copy as a new listing instead.');

    // Duplicating past event is allowed
    await component.onDuplicate(pastEvent);
    expect(businessServiceSpy.duplicateEventAsDraft).toHaveBeenCalledWith(pastEvent);
    expect(router.navigate).toHaveBeenCalledWith(['/app/listings/create'], {
      queryParams: { eventId: 'ev-new-copy' },
    });
  });

  it('should duplicate an event as draft and route to edit wizard', async () => {
    await component.onDuplicate(mockEvents[0]);
    expect(businessServiceSpy.duplicateEventAsDraft).toHaveBeenCalledWith(mockEvents[0]);
    expect(router.navigate).toHaveBeenCalledWith(['/app/listings/create'], {
      queryParams: { eventId: 'ev-new-copy' },
    });
  });

  it('should pause an active event and move it to draft', async () => {
    await component.onPause(mockEvents[0]);
    expect(businessServiceSpy.pauseEvent).toHaveBeenCalledWith('ev-1');
    expect(component.actionSuccessMessage).toContain('paused');
  });

  it('should delete an event after confirmation', async () => {
    component.openDeleteConfirm(mockEvents[2]);
    expect(component.deletingEvent).toBe(mockEvents[2]);

    await component.executeDelete();
    expect(businessServiceSpy.deleteEvent).toHaveBeenCalledWith('ev-3');
    expect(component.deletingEvent).toBeNull();
    expect(component.actionSuccessMessage).toContain('permanently deleted');
  });

  it('should display customer-safe error without leaking Directus details when operation fails', async () => {
    businessServiceSpy.deleteEvent.mockRejectedValueOnce(
      new Error("You don't have permission to delete item in collection 'events'")
    );

    component.openDeleteConfirm(mockEvents[2]);
    await component.executeDelete();

    expect(component.error).not.toContain('Directus');
    expect(component.error).not.toContain('collection');
    expect(component.error).not.toContain('events');
    expect(component.error).toBe("We couldn't make that change. This action is not available for your account.");
  });

  describe('Phase 2C.3 Listings UI Localization', () => {
    it('1. should translate page heading in EN and ES', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      const titleEl = fixture.nativeElement.querySelector('.page-title');
      expect(titleEl.textContent.trim()).toBe('Listings & Posts');

      i18nService.setLang('es');
      fixture.detectChanges();
      expect(titleEl.textContent.trim()).toBe('Publicaciones y Eventos');
    });

    it('2. should translate page subtitle in EN and ES', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      const subEl = fixture.nativeElement.querySelector('.page-subtitle');
      expect(subEl.textContent.trim()).toBe('Manage your business events, recurring activities, excursions, and special promotions on VAMO.');

      i18nService.setLang('es');
      fixture.detectChanges();
      expect(subEl.textContent.trim()).toBe('Administra tus eventos, actividades recurrentes, excursiones y promociones especiales en VAMO.');
    });

    it('3. should translate Create Listing button in EN and ES', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      const createBtn = fixture.nativeElement.querySelector('.header-actions .btn-primary');
      expect(createBtn.textContent.trim()).toBe('Create Listing');

      i18nService.setLang('es');
      fixture.detectChanges();
      expect(createBtn.textContent.trim()).toBe('Crear Publicación');
    });

    it('4. should translate status filter tabs in EN and ES', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      const tabTextsEn = Array.from(fixture.nativeElement.querySelectorAll('.filter-tabs .filter-tab'))
        .map((el: any) => el.textContent.trim());
      expect(tabTextsEn.some((t) => t.includes('Active'))).toBe(true);
      expect(tabTextsEn.some((t) => t.includes('Drafts'))).toBe(true);
      expect(tabTextsEn.some((t) => t.includes('Past'))).toBe(true);

      i18nService.setLang('es');
      fixture.detectChanges();
      const tabTextsEs = Array.from(fixture.nativeElement.querySelectorAll('.filter-tabs .filter-tab'))
        .map((el: any) => el.textContent.trim());
      expect(tabTextsEs.some((t) => t.includes('Activos'))).toBe(true);
      expect(tabTextsEs.some((t) => t.includes('Borradores'))).toBe(true);
      expect(tabTextsEs.some((t) => t.includes('Pasados'))).toBe(true);
    });

    it('5. should translate empty account and empty filter states', () => {
      component.events = [];
      component.filteredEvents = [];

      i18nService.setLang('en');
      fixture.detectChanges();
      let emptyTitle = fixture.nativeElement.querySelector('.empty-state .empty-title');
      let emptyAction = fixture.nativeElement.querySelector('.empty-state .empty-action');
      expect(emptyTitle.textContent.trim()).toBe('You have no listings yet');
      expect(emptyAction.textContent.trim()).toBe('+ Create Your First Listing');

      i18nService.setLang('es');
      fixture.detectChanges();
      emptyTitle = fixture.nativeElement.querySelector('.empty-state .empty-title');
      emptyAction = fixture.nativeElement.querySelector('.empty-state .empty-action');
      expect(emptyTitle.textContent.trim()).toBe('Aún no tienes publicaciones');
      expect(emptyAction.textContent.trim()).toBe('+ Crea tu primera publicación');

      // Empty filter state
      component.events = [...mockEvents];
      component.searchQuery = 'NonExistentMatch';
      component.applyFilters();

      i18nService.setLang('en');
      fixture.detectChanges();
      emptyTitle = fixture.nativeElement.querySelector('.empty-state .empty-title');
      emptyAction = fixture.nativeElement.querySelector('.empty-state .empty-action');
      expect(emptyTitle.textContent.trim()).toBe('No listings match your filters');
      expect(emptyAction.textContent.trim()).toBe('Clear All Filters');

      i18nService.setLang('es');
      fixture.detectChanges();
      emptyTitle = fixture.nativeElement.querySelector('.empty-state .empty-title');
      emptyAction = fixture.nativeElement.querySelector('.empty-state .empty-action');
      expect(emptyTitle.textContent.trim()).toBe('Ninguna publicación coincide con tus filtros');
      expect(emptyAction.textContent.trim()).toBe('Borrar todos los filtros');
    });

    it('6. should translate action menu labels in EN and ES', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      const cardActionsEn = Array.from(fixture.nativeElement.querySelectorAll('.action-buttons .btn'))
        .map((b: any) => b.textContent.trim());
      expect(cardActionsEn.some((t) => t.includes('Edit'))).toBe(true);
      expect(cardActionsEn.some((t) => t.includes('Duplicate'))).toBe(true);

      i18nService.setLang('es');
      fixture.detectChanges();
      const cardActionsEs = Array.from(fixture.nativeElement.querySelectorAll('.action-buttons .btn'))
        .map((b: any) => b.textContent.trim());
      expect(cardActionsEs.some((t) => t.includes('Editar'))).toBe(true);
      expect(cardActionsEs.some((t) => t.includes('Copiar'))).toBe(true);
    });

    it('7. should translate delete confirmation dialog copy in EN and ES', () => {
      component.openDeleteConfirm(mockEvents[0]);

      i18nService.setLang('en');
      fixture.detectChanges();
      let modalTitle = fixture.nativeElement.querySelector('.modal-title');
      let cancelBtn = fixture.nativeElement.querySelector('.modal-footer .btn-secondary');
      let deleteBtn = fixture.nativeElement.querySelector('.modal-footer .btn-danger');
      expect(modalTitle.textContent.trim()).toBe('Delete Listing');
      expect(cancelBtn.textContent.trim()).toBe('Cancel');
      expect(deleteBtn.textContent.trim()).toBe('Delete Listing');

      i18nService.setLang('es');
      fixture.detectChanges();
      modalTitle = fixture.nativeElement.querySelector('.modal-title');
      cancelBtn = fixture.nativeElement.querySelector('.modal-footer .btn-secondary');
      deleteBtn = fixture.nativeElement.querySelector('.modal-footer .btn-danger');
      expect(modalTitle.textContent.trim()).toBe('Eliminar Publicación');
      expect(cancelBtn.textContent.trim()).toBe('Cancelar');
      expect(deleteBtn.textContent.trim()).toBe('Eliminar Publicación');
    });

    it('8. should format dates using the active locale via i18nService', () => {
      i18nService.setLang('en');
      const formattedEn = component.formatSchedule(mockEvents[0]);
      expect(formattedEn).toContain('2026');
      expect(formattedEn.toLowerCase()).toContain('oct');

      i18nService.setLang('es');
      const formattedEs = component.formatSchedule(mockEvents[0]);
      expect(formattedEs).toContain('2026');
      expect(formattedEs.toLowerCase()).toContain('oct');
    });

    it('9. should NEVER translate owner-entered event name on language switch', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      const firstCardNameEn = fixture.nativeElement.querySelector('.listing-title');
      expect(firstCardNameEn.textContent.trim()).toBe('Live Salsa by the Ocean');

      i18nService.setLang('es');
      fixture.detectChanges();
      const firstCardNameEs = fixture.nativeElement.querySelector('.listing-title');
      expect(firstCardNameEs.textContent.trim()).toBe('Live Salsa by the Ocean');
      expect(mockEvents[0].name).toBe('Live Salsa by the Ocean');
    });

    it('10. should NEVER translate owner-entered event address on language switch', () => {
      i18nService.setLang('en');
      fixture.detectChanges();
      const firstCardAddrEn = fixture.nativeElement.querySelector('.location-row .meta-text');
      expect(firstCardAddrEn.textContent.trim()).toBe('Kite Beach, Cabarete');

      i18nService.setLang('es');
      fixture.detectChanges();
      const firstCardAddrEs = fixture.nativeElement.querySelector('.location-row .meta-text');
      expect(firstCardAddrEs.textContent.trim()).toBe('Kite Beach, Cabarete');
      expect(mockEvents[0].address).toBe('Kite Beach, Cabarete');
    });
  });

  describe('Event-Level Boost Entry (Phase 1C.2)', () => {
    it('should display Boost / Manage Boost button only on published events', () => {
      component.setStatusFilter('all');
      fixture.detectChanges();

      const cards = fixture.nativeElement.querySelectorAll('.listing-card');
      expect(cards.length).toBe(4);

      // ev-1 (published, is_main_banner: true) -> Manage Boost
      const ev1Card = cards[0];
      const ev1BoostBtn = ev1Card.querySelector('.boost-btn');
      expect(ev1BoostBtn).toBeTruthy();
      expect(ev1BoostBtn.textContent.trim()).toContain('Manage Promotion');

      // ev-2 (published, no boost) -> Promote
      const ev2Card = cards[1];
      const ev2BoostBtn = ev2Card.querySelector('.boost-btn');
      expect(ev2BoostBtn).toBeTruthy();
      expect(ev2BoostBtn.textContent.trim()).toContain('Promote');

      // ev-3 (draft) -> no boost button
      const ev3Card = cards[2];
      expect(ev3Card.querySelector('.boost-btn')).toBeNull();

      // ev-4 (archived) -> no boost button
      const ev4Card = cards[3];
      expect(ev4Card.querySelector('.boost-btn')).toBeNull();
    });

    it('should navigate to /app/promotions with eventId query param when boost button is clicked', () => {
      component.onBoost(mockEvents[1]);
      expect(router.navigate).toHaveBeenCalledWith(['/app/promotions'], {
        queryParams: { eventId: 'ev-2' },
      });
    });

    it('should reactively switch boost button labels between English and Spanish', () => {
      component.setStatusFilter('all');
      i18nService.setLang('en');
      fixture.detectChanges();
      const boostBtnEn = fixture.nativeElement.querySelector('.listing-card:nth-child(2) .boost-btn');
      expect(boostBtnEn.textContent.trim()).toBe('Promote');

      i18nService.setLang('es');
      fixture.detectChanges();
      const boostBtnEs = fixture.nativeElement.querySelector('.listing-card:nth-child(2) .boost-btn');
      expect(boostBtnEs.textContent.trim()).toBe('Promocionar');

      const manageBtnEs = fixture.nativeElement.querySelector('.listing-card:nth-child(1) .boost-btn');
      expect(manageBtnEs.textContent.trim()).toBe('Gestionar promoción');
    });
  });
});
