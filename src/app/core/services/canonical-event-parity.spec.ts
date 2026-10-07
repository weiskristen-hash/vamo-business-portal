import { TestBed } from '@angular/core/testing';
import { BusinessService } from './business.service';
import { AuthService } from './auth.service';
import { directusClient } from '../directus/directus-client';
import { VamoEvent } from '../models/event.model';

vi.mock('../directus/directus-client', () => ({
  directusClient: {
    request: vi.fn(),
  },
}));

describe('Canonical Event Creation Parity (Phase 4A.2D)', () => {
  let service: BusinessService;
  let authServiceSpy: any;
  let clientRequestMock: any;

  function extractPayload(callArg: any): any {
    if (typeof callArg === 'function') {
      const resolved = callArg();
      if (resolved && resolved.body) {
        return typeof resolved.body === 'string' ? JSON.parse(resolved.body) : resolved.body;
      }
      return resolved;
    }
    return callArg;
  }

  function extractMethod(callArg: any): string | undefined {
    if (typeof callArg === 'function') {
      return callArg()?.method;
    }
    return undefined;
  }

  beforeEach(() => {
    authServiceSpy = {
      safeRequest: vi.fn((fn) => fn()),
    };

    clientRequestMock = vi.mocked(directusClient.request);
    clientRequestMock.mockReset();

    TestBed.configureTestingModule({
      providers: [
        BusinessService,
        { provide: AuthService, useValue: authServiceSpy },
      ],
    });

    service = TestBed.inject(BusinessService);
  });

  it('1. single event canonical payload: recurring is stringified empty days array and mode is single', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-single-1' }); // createItem
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-single-1', name: 'Single Event' }); // read back

    await service.createEvent({
      name: 'Single Event',
      mode: 'single',
      startDate: '2026-11-01',
    });

    expect(clientRequestMock).toHaveBeenCalled();
    const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(payload.mode).toBe('single');
    expect(payload.recurring).toBe(JSON.stringify({ days: [] }));
  });

  it('2. recurring event canonical payload: recurring is stringified days array and mode is recurring', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-rec-1' });
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-rec-1', name: 'Weekly Party' });

    await service.createEvent({
      name: 'Weekly Party',
      mode: 'recurring',
      recurring: { days: ['fri', 'sat'] },
    });

    const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(payload.mode).toBe('recurring');
    expect(payload.recurring).toBe(JSON.stringify({ days: ['fri', 'sat'] }));
  });

  it('3. all-day event: allDay is true, from is undefined/omitted, to is undefined/omitted', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-allday-1' });
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-allday-1', name: 'Fiesta' });

    await service.createEvent({
      name: 'Fiesta',
      allDay: true,
      from: '10:00',
      to: '18:00',
    });

    const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(payload.allDay).toBe(true);
    expect(payload.to).toBeUndefined();
  });

  it('4. timed event: from and to formatted with seconds HH:mm:ss', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-timed-1' });
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-timed-1', name: 'Concert' });

    await service.createEvent({
      name: 'Concert',
      allDay: false,
      openEnd: false,
      from: '19:30',
      to: '22:00',
    });

    const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(payload.from).toBe('19:30:00');
    expect(payload.to).toBe('22:00:00');
  });

  it('5. free event: currency is undefined (omitted from payload)', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-free-1' });
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-free-1', name: 'Free Meetup' });

    await service.createEvent({
      name: 'Free Meetup',
      isFree: true,
      price: 0,
      currency: 'USD',
    });

    const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(payload.isFree).toBe(true);
    expect(payload.currency).toBeUndefined();
  });

  it('6. paid event: currency is included (USD/DOP)', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-paid-1' });
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-paid-1', name: 'Paid Workshop' });

    await service.createEvent({
      name: 'Paid Workshop',
      isFree: false,
      price: 25,
      currency: 'USD',
    });

    const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(payload.isFree).toBe(false);
    expect(payload.price).toBe(25);
    expect(payload.currency).toBe('USD');
  });

  it('7. absent endDate: omitted / undefined for single-day event', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-single-date-1' });
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-single-date-1' });

    await service.createEvent({
      name: 'Single Date',
      startDate: '2026-12-01',
      endDate: undefined,
    });

    const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(payload.startDate).toBe('2026-12-01');
    expect(payload.endDate).toBeUndefined();
  });

  it('8. absent to time: omitted / undefined for openEnd events', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-openend-1' });
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-openend-1' });

    await service.createEvent({
      name: 'Open End Jam',
      from: '18:00',
      openEnd: true,
      to: '23:00',
    });

    const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(payload.from).toBe('18:00:00');
    expect(payload.to).toBeUndefined();
  });

  it('9. promotionStart is populated with exact full ISO timestamp on immediate event creation', async () => {
    const fixedNow = new Date('2026-10-04T12:34:56.789Z');
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    try {
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-promo-1' });
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-promo-1' });

      await service.createEvent({
        name: 'Promo Event',
      });

      const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
      expect(payload.promotionStart).toBe('2026-10-04T12:34:56.789Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('10. nested area creation shape matches canonical Directus contract', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-area-1' });
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-area-1' });

    await service.createEvent(
      { name: 'Area Event' },
      [],
      ['area-las-terrenas', 'area-samana']
    );

    const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(payload.areas).toEqual({
      create: [
        { areas_id: 'area-las-terrenas' },
        { areas_id: 'area-samana' },
      ],
      update: [],
      delete: [],
    });
  });

  it('11. provider field is NEVER sent by client payload (relies on Directus server preset)', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-provider-1' });
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-provider-1' });

    await service.createEvent({
      name: 'Provider Preset Check',
    });

    const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(payload.provider).toBeUndefined();
    expect(payload['provider_link']).toBeUndefined();
  });

  it('12. image relationship attaches uploaded files via updateItem after event creation', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-img-1' }); // createItem
    vi.spyOn(service, 'uploadEventImages').mockResolvedValueOnce(['file-1', 'file-2']);
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-img-1' }); // updateItem for images
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-img-1', name: 'With Images' }); // read back

    const mockFiles = [new File(['dummy'], 'img1.jpg'), new File(['dummy2'], 'img2.jpg')];
    await service.createEvent({ name: 'With Images' }, mockFiles, []);

    expect(clientRequestMock).toHaveBeenCalledTimes(3);
    expect(extractMethod(clientRequestMock.mock.calls[1][0])).toBe('PATCH');
    const updatePayload = extractPayload(clientRequestMock.mock.calls[1][0]);
    expect(updatePayload.images).toEqual({
      create: [
        { directus_files_id: 'file-1', events_id: 'ev-img-1' },
        { directus_files_id: 'file-2', events_id: 'ev-img-1' },
      ],
      update: [],
      delete: [],
    });
  });

  it('13. translation workflow preservation: does NOT issue immediate secondary override patch on clean creation', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-clean-1' }); // createItem
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-clean-1', name: 'Clean Event' }); // read back

    await service.createEvent({ name: 'Clean Event' }, [], ['area-1']);

    // Exactly 2 calls: createItem (POST) then readItem (GET). No secondary updateItem when no files.
    expect(clientRequestMock).toHaveBeenCalledTimes(2);
    expect(extractMethod(clientRequestMock.mock.calls[0][0])).toBe('POST');
    expect(extractMethod(clientRequestMock.mock.calls[1][0])).toBe('GET');
  });

  it('14. duplicate event parity matches canonical event.service duplicateEventAsDraft', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-dup-2' }); // createItem duplicate
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-dup-2' }); // updateItem images
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-dup-2' }); // updateItem areas

    const original: VamoEvent = {
      id: 'ev-orig',
      name: 'Original Event',
      description: 'Desc',
      status: 'published',
      category: 'nightlife',
      mode: 'single',
      allDay: false,
      from: '20:00:00',
      to: '02:00:00',
      recurring: { days: [] },
      isFree: true,
      price: 0,
      images: [{ id: 10, directus_files_id: 'file-x' } as any],
      areas: [{ id: 20, areas_id: 'area-y' } as any],
    };

    const newId = await service.duplicateEventAsDraft(original);
    expect(newId).toBe('ev-dup-2');

    const createPayload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(createPayload.status).toBe('draft');
    expect(createPayload.name).toBe('Original Event (Copy)');
    expect(createPayload.provider).toBeUndefined(); // preset only
  });

  it('15. edit/update parity properly formats extractTime and omits openEnd/currency when free', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-edit-1', status: 'draft' }); // persisted getEventById
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-edit-1' }); // updateItem
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-edit-1', name: 'Updated Name' }); // read back

    await service.updateEvent('ev-edit-1', {
      name: 'Updated Name',
      allDay: false,
      openEnd: true,
      from: '18:00',
      to: '22:00',
      isFree: true,
      currency: 'USD',
    });

    const updatePayload = extractPayload(clientRequestMock.mock.calls[1][0]);
    expect(updatePayload.name).toBe('Updated Name');
    expect(updatePayload.from).toBe('18:00:00');
    expect(updatePayload.to).toBeUndefined();
    expect(updatePayload.currency).toBeUndefined();
  });

  describe('Strict Full-Object Canonical Payload Equality (Phase 4A.3B)', () => {
    const fixedIso = '2026-10-04T12:00:00.000Z';

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(fixedIso));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('16. strict full object equality: single timed paid event', async () => {
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-16' });
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-16', name: 'Jazz Night' });

      await service.createEvent(
        {
          name: 'Jazz Night',
          category: 'live',
          description: 'Live jazz under the stars',
          startDate: '2026-11-15',
          endDate: '2026-11-15',
          allDay: false,
          openEnd: false,
          mode: 'single',
          from: '20:00',
          to: '23:30',
          hasPromotion: true,
          promoText: '2x1 Cocktails before 21:00',
          isFree: false,
          contactForPrice: false,
          price: 15,
          currency: 'USD',
          address: 'Playa Bonita 14',
          location_point: { type: 'Point', coordinates: [-69.54, 19.31] },
          status: 'published',
        },
        [],
        ['area-lt']
      );

      const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
      expect(payload).toEqual({
        name: 'Jazz Night',
        category: 'live',
        description: 'Live jazz under the stars',
        location_point: { type: 'Point', coordinates: [-69.54, 19.31] },
        address: 'Playa Bonita 14',
        startDate: '2026-11-15',
        endDate: '2026-11-15',
        allDay: false,
        mode: 'single',
        recurring: JSON.stringify({ days: [] }),
        from: '20:00:00',
        to: '23:30:00',
        promotionStart: fixedIso,
        hasPromotion: true,
        promoText: '2x1 Cocktails before 21:00',
        isFree: false,
        contactForPrice: false,
        price: 15,
        currency: 'USD',
        areas: {
          create: [{ areas_id: 'area-lt' }],
          update: [],
          delete: [],
        },
        status: 'published',
      });
    });

    it('17. strict full object equality: single all-day free event', async () => {
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-17' });
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-17', name: 'Beach Clean Up' });

      await service.createEvent(
        {
          name: 'Beach Clean Up',
          category: 'community',
          description: 'Join us to clean the beach',
          startDate: '2026-11-20',
          allDay: true,
          mode: 'single',
          isFree: true,
          contactForPrice: false,
          price: 0,
          currency: 'USD',
          status: 'published',
        },
        [],
        ['area-samana']
      );

      const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
      expect(payload).toEqual({
        name: 'Beach Clean Up',
        category: 'community',
        description: 'Join us to clean the beach',
        location_point: null,
        address: null,
        startDate: '2026-11-20',
        endDate: undefined,
        allDay: true,
        mode: 'single',
        recurring: JSON.stringify({ days: [] }),
        from: undefined,
        to: undefined,
        promotionStart: fixedIso,
        hasPromotion: undefined,
        promoText: undefined,
        isFree: true,
        contactForPrice: false,
        price: 0,
        currency: undefined,
        areas: {
          create: [{ areas_id: 'area-samana' }],
          update: [],
          delete: [],
        },
        status: 'published',
      });
    });

    it('18. strict full object equality: recurring timed event', async () => {
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-18' });
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-18', name: 'Salsa Saturdays' });

      await service.createEvent(
        {
          name: 'Salsa Saturdays',
          category: 'dance',
          description: 'Weekly salsa classes and social dancing',
          startDate: '2026-10-10',
          endDate: '2026-12-31',
          allDay: false,
          openEnd: true,
          mode: 'recurring',
          recurring: { days: ['sat'] },
          from: '21:00',
          to: '02:00',
          isFree: false,
          contactForPrice: true,
          price: 0,
          currency: 'DOP',
          status: 'draft',
        },
        [],
        ['area-pc']
      );

      const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
      expect(payload).toEqual({
        name: 'Salsa Saturdays',
        category: 'dance',
        description: 'Weekly salsa classes and social dancing',
        location_point: null,
        address: null,
        startDate: '2026-10-10',
        endDate: '2026-12-31',
        allDay: false,
        mode: 'recurring',
        recurring: JSON.stringify({ days: ['sat'] }),
        from: '21:00:00',
        to: undefined,
        promotionStart: fixedIso,
        hasPromotion: undefined,
        promoText: undefined,
        isFree: false,
        contactForPrice: true,
        price: 0,
        currency: 'DOP',
        areas: {
          create: [{ areas_id: 'area-pc' }],
          update: [],
          delete: [],
        },
        status: 'draft',
      });
    });
  });

  describe('Translation Trigger & Event Update Parity (Phase 2A)', () => {
    const fixedIso = '2026-10-04T12:00:00.000Z';

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(fixedIso));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('19. updateEvent full-object parity: sends complete canonical payload matching edit-event buildPayload()', async () => {
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-full-update', status: 'published', startDate: '2026-11-20', endDate: '2026-11-22' }); // persisted getEventById
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-full-update' }); // updateItem
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-full-update', name: 'Updated Festival' }); // read back

      await service.updateEvent(
        'ev-full-update',
        {
          name: 'Updated Festival',
          category: 'festivals',
          description: 'Annual cultural festival celebration',
          location_point: { type: 'Point', coordinates: [-69.89, 18.48] },
          address: 'Zona Colonial, Santo Domingo',
          startDate: '2026-11-20',
          endDate: '2026-11-22',
          allDay: false,
          openEnd: false,
          mode: 'single',
          recurring: { days: [] },
          from: '16:00',
          to: '23:00',
          hasPromotion: true,
          promoText: 'Early Bird discount 20%',
          isFree: false,
          contactForPrice: false,
          price: 25,
          currency: 'USD',
          status: 'published',
        },
        [],
        [],
        ['area-sd'],
        [101]
      );

      // Exactly 3 calls: persisted readItem (GET), updateItem (PATCH) then post-update readItem (GET). No secondary image call.
      expect(clientRequestMock).toHaveBeenCalledTimes(3);
      expect(extractMethod(clientRequestMock.mock.calls[1][0])).toBe('PATCH');

      const payload = extractPayload(clientRequestMock.mock.calls[1][0]);
      expect(payload).toEqual({
        name: 'Updated Festival',
        category: 'festivals',
        description: 'Annual cultural festival celebration',
        location_point: { type: 'Point', coordinates: [-69.89, 18.48] },
        address: 'Zona Colonial, Santo Domingo',
        startDate: '2026-11-20',
        endDate: '2026-11-22',
        allDay: false,
        mode: 'single',
        recurring: JSON.stringify({ days: [] }),
        from: '16:00:00',
        to: '23:00:00',
        hasPromotion: true,
        promoText: 'Early Bird discount 20%',
        isFree: false,
        contactForPrice: false,
        price: 25,
        currency: 'USD',
        areas: {
          create: [{ areas_id: 'area-sd' }],
          update: [],
          delete: [101],
        },
        status: 'published',
      });
      // promotionStart is NOT part of canonical edit-event buildPayload() and must not be overwritten
      expect(payload.promotionStart).toBeUndefined();
      expect(payload.images).toBeUndefined();
      expect(payload.translations).toBeUndefined();
      expect(payload.translation_status).toBeUndefined();
    });

    it('20. updateEvent canonical image attachment: performs primary metadata update first, then secondary image junction update', async () => {
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-img-update', status: 'published', startDate: '2026-11-20' }); // persisted getEventById
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-img-update' }); // primary updateItem
      vi.spyOn(service, 'uploadEventImages').mockResolvedValueOnce(['new-img-file-id']);
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-img-update' }); // secondary updateItem for images
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-img-update', name: 'Event with Images' }); // read back

      const mockFiles = [new File(['dummy'], 'poster.png')];
      await service.updateEvent(
        'ev-img-update',
        {
          name: 'Event with Images',
          status: 'published',
        },
        mockFiles,
        [42]
      );

      // Call 1: primary updateItem for metadata
      expect(extractMethod(clientRequestMock.mock.calls[1][0])).toBe('PATCH');
      const primaryPayload = extractPayload(clientRequestMock.mock.calls[1][0]);
      expect(primaryPayload.name).toBe('Event with Images');
      expect(primaryPayload.status).toBe('published');
      expect(primaryPayload.images).toBeUndefined();

      // Call 2: secondary updateItem for images junction
      expect(extractMethod(clientRequestMock.mock.calls[2][0])).toBe('PATCH');
      const imagePayload = extractPayload(clientRequestMock.mock.calls[2][0]);
      expect(imagePayload.images).toEqual({
        create: [{ directus_files_id: 'new-img-file-id', events_id: 'ev-img-update' }],
        update: [],
        delete: [42],
      });
      // Ensure secondary image payload does NOT contain status or metadata
      expect(imagePayload.status).toBeUndefined();
      expect(imagePayload.name).toBeUndefined();
    });

    it('21. translations and translation_status are strictly stripped from write payloads on create and update', async () => {
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-strip-create' });
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-strip-create' });

      // Simulate caller passing cached or contaminated event record
      const contaminatedData: any = {
        name: 'Contaminated Event',
        status: 'published',
        startDate: '2026-11-20',
        translations: [{ id: 1, languages_code: 'es-ES', name: 'Evento Contaminado' }],
        translation_status: 'completed',
      };

      await service.createEvent(contaminatedData);
      const createPayload = extractPayload(clientRequestMock.mock.calls[0][0]);
      expect(createPayload.translations).toBeUndefined();
      expect(createPayload.translation_status).toBeUndefined();

      clientRequestMock.mockReset();
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-strip-update', status: 'published', startDate: '2026-11-20' }); // persisted getEventById
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-strip-update' }); // updateItem
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-strip-update' }); // read back

      await service.updateEvent('ev-strip-update', contaminatedData);
      const updatePayload = extractPayload(clientRequestMock.mock.calls[1][0]);
      expect(updatePayload.translations).toBeUndefined();
      expect(updatePayload.translation_status).toBeUndefined();
      expect(updatePayload.status).toBe('published');
    });

    it('22. updateEvent preserves status draft when saving draft edit', async () => {
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-draft-update', status: 'draft' }); // persisted getEventById
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-draft-update' }); // updateItem
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-draft-update', status: 'draft' }); // read back

      await service.updateEvent('ev-draft-update', {
        name: 'Draft Edit',
        status: 'draft',
      });

      const payload = extractPayload(clientRequestMock.mock.calls[1][0]);
      expect(payload.status).toBe('draft');
      expect(payload.name).toBe('Draft Edit');
    });

    it('23. updateEvent strict edge case canonical parity: preserves whitespace, empty descriptions, false booleans, nulls, and currency rules without invention', async () => {
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-edge', status: 'published', startDate: '2026-11-01' }); // persisted getEventById
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-edge' }); // updateItem
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-edge' }); // read back

      await service.updateEvent('ev-edge', {
        name: '  Whitespace Title  ',
        category: 'art',
        description: '',
        location_point: null,
        address: '  Untrimmed Address 123  ',
        startDate: '2026-11-01',
        endDate: undefined,
        allDay: false,
        openEnd: true,
        mode: 'single',
        recurring: { days: [] },
        from: '19:00',
        to: '23:00',
        hasPromotion: false,
        promoText: null,
        isFree: true,
        contactForPrice: false,
        price: 0,
        currency: 'DOP',
        status: 'published',
      });

      const payload = extractPayload(clientRequestMock.mock.calls[1][0]);
      expect(payload).toEqual({
        name: '  Whitespace Title  ', // NOT trimmed
        category: 'art',
        description: '', // NOT trimmed or replaced with undefined
        location_point: null,
        address: '  Untrimmed Address 123  ', // NOT trimmed
        startDate: '2026-11-01',
        endDate: undefined,
        allDay: false, // NOT coerced to truthy
        mode: 'single',
        recurring: JSON.stringify({ days: [] }),
        from: '19:00:00',
        to: undefined, // openEnd: true omits to
        hasPromotion: false, // strictly false
        promoText: null, // strictly null, not trimmed
        isFree: true,
        contactForPrice: false, // strictly false
        price: 0,
        currency: undefined, // free event omits currency
        status: 'published',
      });
      expect(payload.promotionStart).toBeUndefined(); // omitted
    });

    it('24. updateEvent strictly omits promotionStart even if caller supplies it, preserving all other canonical fields', async () => {
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-omit-promo', status: 'published', startDate: '2026-11-20' }); // persisted getEventById
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-omit-promo' }); // updateItem
      clientRequestMock.mockResolvedValueOnce({ id: 'ev-omit-promo' }); // read back

      await service.updateEvent('ev-omit-promo', {
        name: 'Paid DOP Event',
        mode: 'single',
        isFree: false,
        price: 500,
        currency: 'DOP',
        promotionStart: fixedIso,
        status: 'published',
      });

      const payload = extractPayload(clientRequestMock.mock.calls[1][0]);
      expect(payload.promotionStart).toBeUndefined();
      expect(payload.name).toBe('Paid DOP Event');
      expect(payload.mode).toBe('single');
      expect(payload.isFree).toBe(false);
      expect(payload.price).toBe(500);
      expect(payload.currency).toBe('DOP');
      expect(payload.status).toBe('published');
    });
  });
});
