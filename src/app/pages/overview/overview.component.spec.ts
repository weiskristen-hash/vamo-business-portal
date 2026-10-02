import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OverviewComponent } from './overview.component';
import { AuthService } from '../../core/services/auth.service';
import { BusinessService } from '../../core/services/business.service';
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
});
