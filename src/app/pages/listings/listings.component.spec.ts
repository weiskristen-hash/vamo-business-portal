import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListingsComponent } from './listings.component';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
import { Router, provideRouter } from '@angular/router';
import { VamoEvent } from '../../core/models/event.model';

describe('ListingsComponent', () => {
  let component: ListingsComponent;
  let fixture: ComponentFixture<ListingsComponent>;
  let authServiceSpy: any;
  let businessServiceSpy: any;
  let router: Router;

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

    fixture = TestBed.createComponent(ListingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the listings component and load provider events', async () => {
    await fixture.whenStable();
    expect(component).toBeTruthy();
    expect(businessServiceSpy.getEventsForProvider).toHaveBeenCalledWith('provider-123');
    expect(component.events.length).toBe(4);
    expect(component.stats.total).toBe(4);
    expect(component.stats.active).toBe(2); // ev-1 (single upcoming), ev-2 (recurring)
    expect(component.stats.draft).toBe(1);  // ev-3
    expect(component.stats.past).toBe(1);   // ev-4
  });

  it('should filter listings by status tabs', () => {
    component.setStatusFilter('active');
    expect(component.filteredEvents.length).toBe(2);
    expect(component.filteredEvents.every((e) => e.status === 'published')).toBe(true);

    component.setStatusFilter('draft');
    expect(component.filteredEvents.length).toBe(1);
    expect(component.filteredEvents[0].id).toBe('ev-3');

    component.setStatusFilter('past');
    expect(component.filteredEvents.length).toBe(1);
    expect(component.filteredEvents[0].id).toBe('ev-4');

    component.setStatusFilter('all');
    expect(component.filteredEvents.length).toBe(4);
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

  it('should duplicate an event as draft and route to edit wizard', async () => {
    await component.onDuplicate(mockEvents[0]);
    expect(businessServiceSpy.duplicateEventAsDraft).toHaveBeenCalledWith(mockEvents[0], 'provider-123');
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
});
