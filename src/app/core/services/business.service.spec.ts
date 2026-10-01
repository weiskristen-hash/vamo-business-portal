import { TestBed } from '@angular/core/testing';
import { BusinessService } from './business.service';
import { AuthService } from './auth.service';
import { VamoEvent } from '../models/event.model';

describe('BusinessService', () => {
  let service: BusinessService;
  let authServiceSpy: any;

  const mockEvents: VamoEvent[] = [
    {
      id: 'event-1',
      name: 'Sunset Beach Party',
      status: 'published',
      startDate: '2026-10-15',
      from: '18:00',
    },
    {
      id: 'event-2',
      name: 'Morning Yoga on the Sand',
      status: 'published',
      startDate: '2026-10-16',
      from: '08:00',
    },
    {
      id: 'event-3',
      name: 'Draft Surf Workshop',
      status: 'draft',
      startDate: '2026-10-20',
      from: '10:00',
    },
    {
      id: 'event-4',
      name: 'Old Summer Kickoff',
      status: 'archived',
      startDate: '2026-06-01',
    },
  ];

  beforeEach(() => {
    authServiceSpy = {
      safeRequest: vi.fn((fn) => fn()),
    };

    TestBed.configureTestingModule({
      providers: [
        BusinessService,
        { provide: AuthService, useValue: authServiceSpy },
      ],
    });

    service = TestBed.inject(BusinessService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should calculate event statistics accurately', () => {
    const stats = service.calculateStats(mockEvents);

    expect(stats.total).toBe(4);
    expect(stats.published).toBe(2);
    expect(stats.draft).toBe(1);
    expect(stats.archived).toBe(1);
  });

  it('should sort and limit recent events up to specified limit', () => {
    const recent = service.getRecentEvents(mockEvents, 2);

    expect(recent.length).toBe(2);
    // Should be sorted descending by start date
    expect(recent[0].id).toBe('event-3'); // 2026-10-20
    expect(recent[1].id).toBe('event-2'); // 2026-10-16
  });

  it('should format Directus asset URL correctly', () => {
    const url = service.getAssetUrl('file-abc-123', 'width=100&height=100');
    expect(url).toContain('/assets/file-abc-123?width=100&height=100');
  });

  it('should return empty string for null or empty asset', () => {
    expect(service.getAssetUrl(null)).toBe('');
    expect(service.getAssetUrl('')).toBe('');
  });
});
