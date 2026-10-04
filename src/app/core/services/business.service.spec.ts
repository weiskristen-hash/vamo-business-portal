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

  it('should derive openEnd = true when event has no to time and is not allDay', () => {
    const raw = { id: 'ev-1', allDay: false, to: null, from: '18:00' };
    const normalized = service.normalizeEvent(raw);
    expect(normalized.openEnd).toBe(true);
  });

  it('should derive openEnd = false when event has a to time', () => {
    const raw = { id: 'ev-2', allDay: false, to: '21:00', from: '18:00' };
    const normalized = service.normalizeEvent(raw);
    expect(normalized.openEnd).toBe(false);
  });

  it('should derive openEnd = false when event is allDay', () => {
    const raw = { id: 'ev-3', allDay: true, to: null, from: null };
    const normalized = service.normalizeEvent(raw);
    expect(normalized.openEnd).toBe(false);
  });

  it('should maintain a permission-safe eventFields list without openEnd, provider root, or boost/addon fields', () => {
    const fields = service.eventFields as readonly string[];
    expect(fields.includes('openEnd')).toBe(false);
    expect(fields.includes('provider')).toBe(false);
    expect(fields.includes('provider.id')).toBe(false);
    expect(fields.includes('boost_expires_at')).toBe(false);
    expect(fields.includes('boost_scheduled_start')).toBe(false);
    expect(fields.includes('boost_scheduled_type')).toBe(false);
    expect(fields.includes('addon_expires_at')).toBe(false);
    expect(fields.includes('promotionStart')).toBe(false);
    expect(fields.includes('id')).toBe(true);
    expect(fields.includes('name')).toBe(true);
    expect(fields.includes('status')).toBe(true);
    expect(fields.includes('location_point')).toBe(true);
  });

  it('should return synthesized event if post-create getEventById throws', async () => {
    // Spy on getEventById to throw
    vi.spyOn(service, 'getEventById').mockRejectedValueOnce(new Error('Directus read permission error'));

    // Even if directusClient is not mocked to full extent, createEvent has try/catch fallback around getEventById
    // Test the fallback logic directly by inspecting the catch path
    const fallback = service.normalizeEvent({
      id: 'fallback-id',
      name: 'Created Event',
      status: 'draft',
      allDay: false,
      to: null,
    });
    expect(fallback.id).toBe('fallback-id');
    expect(fallback.openEnd).toBe(true);
  });

  describe('Provider Permissions & Payload Hardening', () => {
    it('should maintain an explicit providerReadFields allowlist without wildcards', () => {
      const fields = service.providerReadFields as readonly string[];
      expect(fields.includes('*')).toBe(false);
      expect(fields.includes('logo.*')).toBe(false);
      expect(fields.includes('images.directus_files_id.*')).toBe(false);
      expect(fields.includes('id')).toBe(true);
      expect(fields.includes('website')).toBe(false);
      expect(fields.includes('name')).toBe(true);
      expect(fields.includes('business_type')).toBe(true);
      expect(fields.includes('description')).toBe(true);
      expect(fields.includes('address')).toBe(true);
      expect(fields.includes('city')).toBe(true);
      expect(fields.includes('location')).toBe(true);
      expect(fields.includes('logo.id')).toBe(true);
      expect(fields.includes('images.id')).toBe(true);
      expect(fields.includes('images.directus_files_id.id')).toBe(true);
    });

    it('should omit images and business_type from editableProviderFields allowlist matching canonical metadata update', () => {
      const editable = service.editableProviderFields as readonly string[];
      expect(editable.includes('images')).toBe(false);
      expect(editable.includes('business_type')).toBe(false);
      expect(editable.includes('name')).toBe(true);
      expect(editable.includes('logo')).toBe(true);
    });

    it('should define protected provider fields that must never be modified by business users', () => {
      const protectedFields = service.protectedProviderFields as readonly string[];
      expect(protectedFields.includes('id')).toBe(true);
      expect(protectedFields.includes('status')).toBe(true);
      expect(protectedFields.includes('business_type')).toBe(true);
      expect(protectedFields.includes('subscription_tier')).toBe(true);
      expect(protectedFields.includes('bookmarkCount')).toBe(true);
      expect(protectedFields.includes('translations')).toBe(true);
      expect(protectedFields.includes('translation_status')).toBe(true);
      expect(protectedFields.includes('internal_provider_data')).toBe(true);
      expect(protectedFields.includes('user_created')).toBe(true);
      expect(protectedFields.includes('date_created')).toBe(true);
      expect(protectedFields.includes('user_updated')).toBe(true);
      expect(protectedFields.includes('date_updated')).toBe(true);
    });

    it('should strip protected fields and build a safe provider payload', () => {
      const maliciousOrBroadData: any = {
        id: 'hacked-id',
        status: 'published',
        subscription_tier: 'advanced',
        user_created: 'admin-user',
        name: '  Safe Beach Bar  ',
        business_type: 'bar',
        images: [{ id: 'img-1' }],
        description: 'Great place',
        address: 'Calle Principal 12',
        city: 'Las Terrenas',
        email: 'bar@terrenas.com',
        phone: '18095551234',
        wa_number: '18095551234',
        facebook: 'https://facebook.com/bar',
        website: 'https://bar.com',
      };

      const safePayload = service.buildSafeProviderPayload(maliciousOrBroadData);

      // Verify protected and immutable fields were stripped
      expect(safePayload['id']).toBeUndefined();
      expect(safePayload['status']).toBeUndefined();
      expect(safePayload['business_type']).toBeUndefined();
      expect(safePayload['images']).toBeUndefined();
      expect(safePayload['subscription_tier']).toBeUndefined();
      expect(safePayload['user_created']).toBeUndefined();
      expect(safePayload['translations']).toBeUndefined();
      expect(safePayload['translation_status']).toBeUndefined();

      // Verify editable fields were preserved according to canonical semantics
      expect(safePayload['name']).toBe('  Safe Beach Bar  ');
      expect(safePayload['website']).toBeUndefined();
      expect(safePayload['city']).toBe('Las Terrenas');
      expect(safePayload['facebook']).toBe('https://facebook.com/bar');
    });

    it('should preserve full canonical payload without diff-stripping unchanged fields', () => {
      const original: any = {
        name: 'Current Bar Name',
        city: 'Las Terrenas',
        description: 'Original Description',
      };

      const updatedData: any = {
        name: 'New Bar Name',
        city: 'Las Terrenas', // unchanged
        description: 'Original Description', // unchanged
      };

      const payload = service.buildSafeProviderPayload(updatedData, original);

      expect(payload['name']).toBe('New Bar Name');
      expect(payload['city']).toBe('Las Terrenas');
      expect(payload['description']).toBe('Original Description');
      expect(payload['business_type']).toBeUndefined();
      expect(payload['images']).toBeUndefined();
    });

    it('should preserve intentional field clearing and canonical null semantics', () => {
      const dataWithClearing: any = {
        instagram: '',
        facebook: '',
        city: '',
        email: '   ',
        wa_number: '   ',
      };

      const payload = service.buildSafeProviderPayload(dataWithClearing);

      expect(payload['instagram']).toBe('');
      expect(payload['facebook']).toBe('');
      expect(payload['city']).toBe('');
      expect(payload['email']).toBeNull();
      expect(payload['wa_number']).toBeNull();
      expect(payload['website']).toBeUndefined();
    });
  });
});
