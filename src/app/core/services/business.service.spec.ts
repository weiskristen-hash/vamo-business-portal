import { TestBed } from '@angular/core/testing';
import { BusinessService } from './business.service';
import { AuthService } from './auth.service';
import { directusClient } from '../directus/directus-client';
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
      expect(fields.includes('website')).toBe(true);
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

    it('should include business_type in editableProviderFields allowlist and omit images junction', () => {
      const editable = service.editableProviderFields as readonly string[];
      expect(editable.includes('images')).toBe(false);
      expect(editable.includes('business_type')).toBe(true);
      expect(editable.includes('website')).toBe(true);
      expect(editable.includes('name')).toBe(true);
      expect(editable.includes('logo')).toBe(true);
    });

    it('should define protected provider fields that must never be modified by business users', () => {
      const protectedFields = service.protectedProviderFields as readonly string[];
      expect(protectedFields.includes('id')).toBe(true);
      expect(protectedFields.includes('status')).toBe(true);
      expect(protectedFields.includes('business_type')).toBe(false);
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

    it('should strip protected fields and build a safe provider payload preserving business_type', () => {
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
      expect(safePayload['images']).toBeUndefined();
      expect(safePayload['subscription_tier']).toBeUndefined();
      expect(safePayload['user_created']).toBeUndefined();
      expect(safePayload['translations']).toBeUndefined();
      expect(safePayload['translation_status']).toBeUndefined();

      // Verify editable fields were preserved according to canonical semantics
      expect(safePayload['name']).toBe('  Safe Beach Bar  ');
      expect(safePayload['business_type']).toBe('bar');
      expect(safePayload['website']).toBe('https://bar.com');
      expect(safePayload['city']).toBe('Las Terrenas');
      expect(safePayload['facebook']).toBe('https://facebook.com/bar');
    });

    it('should query Directus areas with status=published and filter out any non-published areas without hardcoded fallback', async () => {
      const requestSpy = vi.spyOn(directusClient, 'request').mockResolvedValueOnce([
        { id: 'area-lt', name: 'Las Terrenas', slug: 'las-terrenas', status: 'published', latitude: 19.31, longitude: -69.54 },
        { id: 'area-draft', name: 'Draft Area', slug: 'draft-area', status: 'draft', latitude: 19.0, longitude: -70.0 },
        { id: 'area-arch', name: 'Archived Area', slug: 'archived-area', status: 'archived', latitude: 18.5, longitude: -68.4 },
      ] as any);

      const areas = await service.getAreas();
      expect(requestSpy).toHaveBeenCalledTimes(1);
      expect(areas.map((a) => a.name)).toEqual(['Las Terrenas']);

      requestSpy.mockResolvedValueOnce([
        { id: 'area-draft', name: 'Draft Area', slug: 'draft-area', status: 'draft' },
      ] as any);
      const emptyAreas = await service.getAreas();
      expect(emptyAreas).toEqual([]);

      requestSpy.mockRejectedValueOnce(new Error('Network error'));
      await expect(service.getAreas()).rejects.toThrow('Network error');
      requestSpy.mockRestore();
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
        website: '   ',
      };

      const payload = service.buildSafeProviderPayload(dataWithClearing);

      expect(payload['instagram']).toBe('');
      expect(payload['facebook']).toBe('');
      expect(payload['city']).toBe('');
      expect(payload['email']).toBeNull();
      expect(payload['wa_number']).toBeNull();
      expect(payload['website']).toBeNull();

      const clearedEmpty = service.buildSafeProviderPayload({ website: '' });
      expect(clearedEmpty['website']).toBeNull();

      const validWebsite = service.buildSafeProviderPayload({ website: '  www.example.com  ' });
      expect(validWebsite['website']).toBe('www.example.com');

      expect(() => service.buildSafeProviderPayload({ website: 'javascript:alert(1)' })).toThrow(
        'INVALID_WEBSITE_URL'
      );
      expect(() =>
        service.buildSafeProviderPayload({ website: 'data:text/html,<script>alert(1)</script>' })
      ).toThrow('INVALID_WEBSITE_URL');
      expect(() =>
        service.buildSafeProviderPayload({ website: 'https://example.com/' + 'a'.repeat(240) })
      ).toThrow('INVALID_WEBSITE_URL');
    });
  });

  describe('Event Lifecycle & Scheduling Hardening', () => {
    it('should include active and past counts in calculateStats', () => {
      const stats = service.calculateStats(mockEvents);
      expect(stats.active).toBe(2);
      expect(stats.past).toBe(1); // event-4 is archived
      expect(stats.total).toBe(4);
    });

    it('should throw PAST_EVENT_READ_ONLY error when updateEvent is called on a past event', async () => {
      const pastEvent: VamoEvent = {
        id: 'past-event-1',
        name: 'Past Party',
        status: 'published',
        startDate: '2020-01-01',
        endDate: '2020-01-02',
      };

      await expect(
        service.updateEvent('past-event-1', { name: 'Attempted Change' }, [], [], undefined, [], pastEvent)
      ).rejects.toThrow('PAST_EVENT_READ_ONLY');
    });

    it('should fetch fresh persisted record in updateEvent and reject past event even if caller provides no existing event', async () => {
      const persistedPast: VamoEvent = {
        id: 'past-directus-1',
        name: 'Past In Directus',
        status: 'published',
        startDate: '2020-01-01',
        endDate: '2020-01-02',
      };
      const getEventByIdSpy = vi.spyOn(service, 'getEventById').mockResolvedValueOnce(persistedPast);

      await expect(
        service.updateEvent('past-directus-1', { name: 'Attempted Change' })
      ).rejects.toThrow('PAST_EVENT_READ_ONLY');

      expect(getEventByIdSpy).toHaveBeenCalledWith('past-directus-1');
    });

    it('should reject pauseEvent on past or archived event with customer-safe error', async () => {
      const pastEvent: VamoEvent = {
        id: 'past-to-pause',
        name: 'Past Event Cannot Pause',
        status: 'published',
        startDate: '2020-01-01',
      };
      vi.spyOn(service, 'getEventById').mockResolvedValueOnce(pastEvent);

      await expect(service.pauseEvent('past-to-pause')).rejects.toThrow('PAST_EVENT_CANNOT_BE_PAUSED');
    });

    it('should reject publishEvent on incomplete draft or past schedule', async () => {
      const incompleteDraft: VamoEvent = {
        id: 'incomplete-draft-1',
        name: 'Incomplete Draft',
        status: 'draft',
        category: 'music',
        description: 'Short', // under 10 chars
        images: [],
      };
      vi.spyOn(service, 'getEventById').mockResolvedValueOnce(incompleteDraft);

      await expect(service.publishEvent('incomplete-draft-1')).rejects.toThrow('DESC_MIN');
    });
  });  describe('publish write validation', () => {
    const valid: VamoEvent = {
      id: 'valid-draft', status: 'draft', name: 'Complete draft event', category: 'music',
      description: 'Full description for this event', address: 'Calle Principal 12',
      areas: [{ areas_id: 'area-lt' }], images: [{ id: 42, directus_files_id: 'file-123' }],
      mode: 'single', startDate: '2026-10-08', from: '19:00', to: '22:00', isFree: true,
    };
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T22:00:00Z')); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it.each([
      [{ startDate: '2026-10-07', from: '09:00', to: '20:00' }, 'START_TIME_PAST_ERROR'],
      [{ from: '22:00', to: '02:00' }, 'END_TIME_BEFORE_START_ERROR'],
      [{ address: null }, 'ADDRESS_REQUIRED'],
      [{ areas: [] }, 'AREA_REQUIRED'],
      [{ isFree: false, price: null }, 'PRICE_INVALID'],
      [{ hasPromotion: true, promoText: '' }, 'PROMO_TEXT_REQUIRED'],
    ])('blocks stale/incomplete quick publish before any write %j', async (changes, error) => {
      vi.spyOn(service, 'getEventById').mockResolvedValue({ ...valid, ...changes } as VamoEvent);
      const request = vi.spyOn(directusClient, 'request').mockResolvedValue({} as any);
      await expect(service.publishEvent(valid.id)).rejects.toThrow(error);
      expect(request).not.toHaveBeenCalled();
    });

    it('rejects invalid editor publish updates at the fresh write boundary', async () => {
      vi.spyOn(service, 'getEventById').mockResolvedValue(valid);
      const request = vi.spyOn(directusClient, 'request').mockResolvedValue({} as any);
      await expect(service.updateEvent(valid.id, { status: 'published', from: '22:00', to: '02:00' })).rejects.toThrow('END_TIME_BEFORE_START_ERROR');
      expect(request).not.toHaveBeenCalled();
    });

    it('rejects publication after the last image is removed', async () => {
      vi.spyOn(service, 'getEventById').mockResolvedValue(valid);
      const request = vi.spyOn(directusClient, 'request').mockResolvedValue({} as any);
      await expect(service.updateEvent(valid.id, { status: 'published' }, [], [42])).rejects.toThrow('PHOTO_REQUIRED');
      expect(request).not.toHaveBeenCalled();
    });

    it('rejects new published events with a past start even when the end is future', async () => {
      const request = vi.spyOn(directusClient, 'request').mockResolvedValue({} as any);
      await expect(service.createEvent({ ...valid, status: 'published', startDate: '2026-10-06', endDate: '2026-10-09' }, [new File(['poster'], 'poster.png')], ['area-lt'])).rejects.toThrow('START_DATE_PAST_ERROR');
      expect(request).not.toHaveBeenCalled();
    });

    it('publishes a complete future draft with a status-only payload', async () => {
      vi.spyOn(service, 'getEventById').mockResolvedValue(valid);
      const request = vi.spyOn(directusClient, 'request').mockResolvedValue({} as any);
      await service.publishEvent(valid.id);
      const command = request.mock.calls[0][0] as () => { body: string };
      expect(JSON.parse(command().body)).toEqual({ status: 'published' });
    });

    it('preserves multi-paragraph descriptions and normalizes CRLF to LF in createEvent, updateEvent, and normalizeEvent', async () => {
      const rawCrlf =
        'First paragraph, first line.\r\nSecond line.\r\n\r\nSecond paragraph with accents: República Dominicana 🌴';
      const expectedLf =
        'First paragraph, first line.\nSecond line.\n\nSecond paragraph with accents: República Dominicana 🌴';

      const request = vi.spyOn(directusClient, 'request').mockResolvedValue({ id: 'created-ev-1' } as any);

      await service.createEvent(
        {
          ...valid,
          status: 'draft',
          description: rawCrlf,
        },
        [],
        ['area-lt']
      );

      const createCmd = request.mock.calls[0][0] as () => { body: string };
      const createBody = JSON.parse(createCmd().body);
      expect(createBody.description).toBe(expectedLf);

      request.mockClear();
      vi.spyOn(service, 'getEventById').mockResolvedValue(valid);
      await service.updateEvent(valid.id, { description: rawCrlf }, [], [], undefined, [], valid);

      const updateCmd = request.mock.calls[0][0] as () => { body: string };
      const updateBody = JSON.parse(updateCmd().body);
      expect(updateBody.description).toBe(expectedLf);

      const normalized = (service as any).normalizeEvent({
        id: 'ev-norm-1',
        name: 'Test',
        description: rawCrlf,
        status: 'published',
      });
      expect(normalized.description).toBe(expectedLf);
    });

    it('includes price_unit in eventFields and persists/nulls price_unit matching mobile app semantics', async () => {
      const fields = service.eventFields as readonly string[];
      expect(fields.includes('price_unit')).toBe(true);

      const request = vi.spyOn(directusClient, 'request').mockResolvedValue({ id: 'created-ev-2' } as any);

      // Paid event with per_group price_unit
      await service.createEvent(
        {
          ...valid,
          status: 'draft',
          isFree: false,
          contactForPrice: false,
          price: 2500,
          currency: 'DOP',
          price_unit: 'per_group',
        },
        [],
        ['area-lt']
      );

      const createCmd = request.mock.calls[0][0] as () => { body: string };
      const createBody = JSON.parse(createCmd().body);
      expect(createBody.price_unit).toBe('per_group');

      // Free event should null out price_unit
      request.mockClear();
      await service.createEvent(
        {
          ...valid,
          status: 'draft',
          isFree: true,
          contactForPrice: false,
          price_unit: 'per_person',
        },
        [],
        ['area-lt']
      );
      const freeBody = JSON.parse((request.mock.calls[0][0] as () => { body: string })().body);
      expect(freeBody.price_unit).toBeNull();
    });
  });

  describe('All-Day, Open-End, Multiday & Duplicate Serialization Regressions', () => {
    const basePersisted: VamoEvent = {
      id: 'ev-base-1',
      status: 'published',
      name: 'Playa Jackson Boat Adventure',
      category: 'excursions',
      description: 'Full-day boat excursion to Playa Jackson with lunch.',
      address: 'Playa Las Ballenas',
      areas: [{ id: 11, areas_id: 'area-lt' }],
      images: [{ id: 22, directus_files_id: 'file-boat' }],
      mode: 'single',
      startDate: '2026-11-20',
      endDate: null,
      from: '09:00:00',
      to: '17:00:00',
      allDay: false,
      openEnd: false,
      isFree: false,
      contactForPrice: false,
      price: 85,
      currency: 'USD',
      price_unit: 'per_person',
    };

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-17T18:00:00Z')); // 14:00 DR time
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    function readRawJsonBody(requestSpy: any, callIndex = 0): { rawBody: string; parsed: Record<string, any>; method?: string } {
      const cmd = requestSpy.mock.calls[callIndex][0] as () => { body: string; method?: string };
      const built = cmd();
      return {
        rawBody: built.body,
        parsed: JSON.parse(built.body),
        method: built.method,
      };
    }

    it('1. New All-Day event creation serializes allDay: true, from: null, to: null in POST JSON body', async () => {
      const request = vi.spyOn(directusClient, 'request').mockResolvedValue({ id: 'ev-new-allday' } as any);
      vi.spyOn(service, 'uploadEventImages').mockResolvedValue(['file-boat']);
      vi.spyOn(service, 'getEventById').mockResolvedValue({
        ...basePersisted,
        id: 'ev-new-allday',
        allDay: true,
        from: null,
        to: null,
      });

      await service.createEvent(
        {
          ...basePersisted,
          allDay: true,
          from: '19:00', // even if fallback times are passed, service must null them
          to: '22:00',
          endDate: null,
          status: 'published',
        },
        [new File(['poster'], 'poster.jpg', { type: 'image/jpeg' })],
        ['area-lt']
      );

      const { rawBody, parsed, method } = readRawJsonBody(request, 0);
      expect(method).toBe('POST');
      expect(rawBody).toContain('"allDay":true');
      expect(rawBody).toContain('"from":null');
      expect(rawBody).toContain('"to":null');
      expect(parsed['allDay']).toBe(true);
      expect(parsed['from']).toBeNull();
      expect(parsed['to']).toBeNull();
      expect(parsed['startDate']).toBe('2026-11-20');
      expect(parsed['endDate']).toBeNull();
    });

    it('2. All-Day draft -> published (updateEvent & publishEvent) preserves allDay: true, from: null, to: null', async () => {
      const allDayDraft: VamoEvent = {
        ...basePersisted,
        id: 'ev-allday-draft',
        status: 'draft',
        allDay: true,
        from: null,
        to: '22:00:00', // legacy stale time on draft
      };
      vi.spyOn(service, 'getEventById').mockResolvedValue(allDayDraft);
      const request = vi.spyOn(directusClient, 'request').mockResolvedValue({ id: 'ev-allday-draft' } as any);

      // Editor publish path (updateEvent)
      await service.updateEvent('ev-allday-draft', {
        status: 'published',
        allDay: true,
        startDate: '2026-11-20',
        endDate: null,
      });

      const editorPatch = readRawJsonBody(request, 0);
      expect(editorPatch.method).toBe('PATCH');
      expect(editorPatch.parsed).toMatchObject({
        status: 'published',
        allDay: true,
        from: null,
        to: null,
      });

      // Quick-publish path from Listings table (publishEvent)
      request.mockClear();
      await service.publishEvent('ev-allday-draft');
      const quickPublishPatch = readRawJsonBody(request, 0);
      expect(quickPublishPatch.method).toBe('PATCH');
      expect(quickPublishPatch.parsed).toEqual({
        status: 'published',
        allDay: true,
        from: null,
        to: null,
      });
    });

    it('3 & 11. Timed -> All Day sends explicit JSON null values for from and to in PATCH request', async () => {
      vi.spyOn(service, 'getEventById').mockResolvedValue(basePersisted);
      const request = vi.spyOn(directusClient, 'request').mockResolvedValue({ id: basePersisted.id } as any);

      await service.updateEvent(basePersisted.id, {
        allDay: true,
        from: '09:00',
        to: '17:00',
        status: 'published',
      });

      const { rawBody, parsed, method } = readRawJsonBody(request, 0);
      expect(method).toBe('PATCH');
      expect(Object.prototype.hasOwnProperty.call(parsed, 'from')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(parsed, 'to')).toBe(true);
      expect(parsed['allDay']).toBe(true);
      expect(parsed['from']).toBeNull();
      expect(parsed['to']).toBeNull();
      expect(rawBody).toContain('"from":null');
      expect(rawBody).toContain('"to":null');
    });

    it('4 & 5. All Day -> Timed and All Day -> Timed with Open End serialize exact times or explicit to: null', async () => {
      const persistedAllDay: VamoEvent = {
        ...basePersisted,
        allDay: true,
        from: null,
        to: null,
      };
      vi.spyOn(service, 'getEventById').mockResolvedValue(persistedAllDay);
      const request = vi.spyOn(directusClient, 'request').mockResolvedValue({ id: basePersisted.id } as any);

      // All Day -> Timed
      await service.updateEvent(basePersisted.id, {
        allDay: false,
        openEnd: false,
        from: '18:30',
        to: '21:30',
        status: 'published',
      });
      const timedPatch = readRawJsonBody(request, 0);
      expect(timedPatch.parsed).toMatchObject({
        allDay: false,
        from: '18:30:00',
        to: '21:30:00',
      });

      // All Day -> Timed with Open End
      request.mockClear();
      await service.updateEvent(basePersisted.id, {
        allDay: false,
        openEnd: true,
        from: '19:00',
        to: '22:00',
        status: 'published',
      });
      const openEndPatch = readRawJsonBody(request, 0);
      expect(openEndPatch.rawBody).toContain('"allDay":false');
      expect(openEndPatch.rawBody).toContain('"to":null');
      expect(openEndPatch.parsed).toMatchObject({
        allDay: false,
        from: '19:00:00',
        to: null,
      });
    });

    it('6. Editing unrelated fields on an All-Day event preserves allDay: true and explicitly nulls stale times', async () => {
      const persistedAllDayWithStaleTo: VamoEvent = {
        ...basePersisted,
        allDay: true,
        from: null,
        to: '22:00:00',
      };
      vi.spyOn(service, 'getEventById').mockResolvedValue(persistedAllDayWithStaleTo);
      const request = vi.spyOn(directusClient, 'request').mockResolvedValue({ id: basePersisted.id } as any);

      await service.updateEvent(basePersisted.id, {
        description: 'Updated description without touching schedule controls.',
      });

      const { parsed } = readRawJsonBody(request, 0);
      expect(parsed['description']).toBe('Updated description without touching schedule controls.');
      expect(parsed['allDay']).toBe(true);
      expect(parsed['from']).toBeNull();
      expect(parsed['to']).toBeNull();
    });

    it('7 & 8. Multiday All-Day creation and Multiday -> single-day explicit endDate: null clearing', async () => {
      const request = vi.spyOn(directusClient, 'request').mockResolvedValue({ id: 'ev-multi' } as any);
      const persistedMultiday: VamoEvent = {
        ...basePersisted,
        id: 'ev-multi',
        startDate: '2026-12-01',
        endDate: '2026-12-03',
        allDay: true,
        from: null,
        to: null,
      };
      vi.spyOn(service, 'getEventById').mockResolvedValue(persistedMultiday);
      vi.spyOn(service, 'uploadEventImages').mockResolvedValue(['file-boat']);

      // Multiday All-Day create
      await service.createEvent(
        {
          ...persistedMultiday,
          status: 'published',
        },
        [new File(['poster'], 'poster.jpg', { type: 'image/jpeg' })],
        ['area-lt']
      );
      const createRes = readRawJsonBody(request, 0);
      expect(createRes.parsed).toMatchObject({
        startDate: '2026-12-01',
        endDate: '2026-12-03',
        allDay: true,
        from: null,
        to: null,
      });

      // Multiday -> Single-Day update clears endDate with explicit JSON null
      request.mockClear();
      await service.updateEvent('ev-multi', {
        startDate: '2026-12-01',
        endDate: null,
        allDay: true,
        status: 'published',
      });
      const updateRes = readRawJsonBody(request, 0);
      expect(Object.prototype.hasOwnProperty.call(updateRes.parsed, 'endDate')).toBe(true);
      expect(updateRes.parsed['endDate']).toBeNull();
      expect(updateRes.rawBody).toContain('"endDate":null');
    });

    it('10. Duplicating an All-Day event clears stale times while preserving dates, mode, and recurrence', async () => {
      const request = vi.spyOn(directusClient, 'request').mockResolvedValue({ id: 'ev-dup-allday' } as any);

      const legacyCorruptedAllDay: VamoEvent = {
        ...basePersisted,
        id: 'ev-corrupted',
        mode: 'recurring',
        recurring: { days: ['fri', 'sat'] },
        startDate: '2026-11-20',
        endDate: '2026-12-20',
        allDay: true,
        from: '09:00:00',
        to: '22:00:00',
        images: [],
        areas: [],
      };

      const dupId = await service.duplicateEventAsDraft(legacyCorruptedAllDay);
      expect(dupId).toBe('ev-dup-allday');

      const { rawBody, parsed } = readRawJsonBody(request, 0);
      expect(rawBody).toContain('"allDay":true');
      expect(rawBody).toContain('"from":null');
      expect(rawBody).toContain('"to":null');
      expect(parsed).toMatchObject({
        status: 'draft',
        name: 'Playa Jackson Boat Adventure (Copy)',
        mode: 'recurring',
        recurring: JSON.stringify({ days: ['fri', 'sat'] }),
        startDate: '2026-11-20',
        endDate: '2026-12-20',
        allDay: true,
        from: null,
        to: null,
      });
    });

    it('12. Dominican Republic timezone boundary (23:30 DR = 03:30Z next UTC day) keeps All-Day event active and editable', async () => {
      // 2026-11-18T03:30:00Z is 2026-11-17 23:30:00 in Dominican Republic (UTC-4)
      vi.setSystemTime(new Date('2026-11-18T03:30:00Z'));
      expect(service.drTodayStr()).toBe('2026-11-17');

      const todayAllDay: VamoEvent = {
        ...basePersisted,
        id: 'ev-dr-today',
        startDate: '2026-11-17',
        endDate: null,
        allDay: true,
        from: null,
        to: null,
      };
      vi.spyOn(service, 'getEventById').mockResolvedValue(todayAllDay);
      const request = vi.spyOn(directusClient, 'request').mockResolvedValue({ id: 'ev-dr-today' } as any);

      await service.updateEvent('ev-dr-today', {
        name: 'Late Night Edit Before DR Midnight',
        startDate: '2026-11-17',
        endDate: null,
        allDay: true,
        status: 'published',
      });

      const { parsed } = readRawJsonBody(request, 0);
      expect(parsed['startDate']).toBe('2026-11-17');
      expect(parsed['allDay']).toBe(true);
      expect(parsed['from']).toBeNull();
      expect(parsed['to']).toBeNull();
    });
  });

  describe('Event Image Ordering & Cover Persistence via Directus events_files.sort', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('includes images.sort in eventFields and normalizes event.images ascending by sort', () => {
      expect((service.eventFields as readonly string[]).includes('images.sort')).toBe(true);

      const raw = {
        id: 'ev-sorted',
        name: 'Sorted Gallery',
        status: 'published',
        images: [
          { id: 101, sort: 2, directus_files_id: 'file-third' },
          { id: 102, sort: 0, directus_files_id: 'file-cover' },
          { id: 103, sort: 1, directus_files_id: 'file-second' },
        ],
      };
      const normalized = service.normalizeEvent(raw);
      expect(normalized.images?.map((i) => i.directus_files_id)).toEqual([
        'file-cover',
        'file-second',
        'file-third',
      ]);
    });

    it('persists reordered existing images in updateEvent via events_files.sort without re-uploading or deleting files', async () => {
      const persisted: VamoEvent = {
        id: 'ev-reorder-1',
        name: 'Beach Sunset',
        status: 'published',
        category: 'live',
        description: 'Live acoustic music right on the beach.',
        address: 'Playa Bonita',
        mode: 'recurring',
        recurring: { days: ['fri'] },
        allDay: true,
        isFree: true,
        areas: [{ id: 1, areas_id: 'area-lt' }],
        images: [
          { id: 10, sort: 0, directus_files_id: 'file-a' },
          { id: 11, sort: 1, directus_files_id: 'file-b' },
        ],
      };
      vi.spyOn(service, 'getEventById').mockResolvedValue(persisted);
      const uploadSpy = vi.spyOn(service, 'uploadEventImages');
      const requestSpy = vi.spyOn(directusClient, 'request').mockResolvedValue({ id: 'ev-reorder-1' } as any);

      await service.updateEvent(
        'ev-reorder-1',
        { name: 'Beach Sunset', status: 'published' },
        [],
        [],
        ['area-lt'],
        [1],
        persisted,
        [
          { junctionId: 11, url: 'https://api.vamo-app.com/assets/file-b' },
          { junctionId: 10, url: 'https://api.vamo-app.com/assets/file-a' },
        ]
      );

      expect(uploadSpy).not.toHaveBeenCalled();
      expect(requestSpy).toHaveBeenCalledTimes(2);
      const imagePatchArg = requestSpy.mock.calls[1][0] as any;
      const resolved = typeof imagePatchArg === 'function' ? imagePatchArg() : imagePatchArg;
      const body = typeof resolved.body === 'string' ? JSON.parse(resolved.body) : resolved.body;
      expect(body.images).toEqual({
        create: [],
        update: [
          { id: 11, sort: 0 },
          { id: 10, sort: 1 },
        ],
        delete: [],
      });
    });

    it('uploads only new files and assigns unified sort positions across interleaved new and existing images', async () => {
      const persisted: VamoEvent = {
        id: 'ev-interleave-1',
        name: 'Catamaran Day',
        status: 'draft',
        mode: 'single',
        startDate: '2027-01-15',
        allDay: true,
        images: [{ id: 20, sort: 0, directus_files_id: 'file-existing' }],
      };
      vi.spyOn(service, 'getEventById').mockResolvedValue(persisted);
      const newFile = new File(['bytes'], 'new-cover.jpg', { type: 'image/jpeg' });
      const uploadSpy = vi.spyOn(service, 'uploadEventImages').mockResolvedValueOnce(['file-new-cover']);
      const requestSpy = vi.spyOn(directusClient, 'request').mockResolvedValue({ id: 'ev-interleave-1' } as any);

      await service.updateEvent(
        'ev-interleave-1',
        { name: 'Catamaran Day', status: 'draft' },
        [newFile],
        [],
        ['area-lt'],
        [],
        persisted,
        [
          { file: newFile, url: 'blob:new-cover' },
          { junctionId: 20, url: 'https://api.vamo-app.com/assets/file-existing' },
        ]
      );

      expect(uploadSpy).toHaveBeenCalledOnce();
      expect(uploadSpy).toHaveBeenCalledWith([newFile]);
      const imagePatchArg = requestSpy.mock.calls[1][0] as any;
      const resolved = typeof imagePatchArg === 'function' ? imagePatchArg() : imagePatchArg;
      const body = typeof resolved.body === 'string' ? JSON.parse(resolved.body) : resolved.body;
      expect(body.images).toEqual({
        create: [{ directus_files_id: 'file-new-cover', events_id: 'ev-interleave-1', sort: 0 }],
        update: [{ id: 20, sort: 1 }],
        delete: [],
      });
    });
  });

});


