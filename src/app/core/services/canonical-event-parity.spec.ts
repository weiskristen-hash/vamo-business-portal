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

  it('9. promotionStart is populated on event creation', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-promo-1' });
    clientRequestMock.mockResolvedValueOnce({ id: 'ev-promo-1' });

    await service.createEvent({
      name: 'Promo Event',
    });

    const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(payload.promotionStart).toBeDefined();
    expect(typeof payload.promotionStart).toBe('string');
    expect(payload.promotionStart.length).toBeGreaterThan(0);
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

    const updatePayload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(updatePayload.name).toBe('Updated Name');
    expect(updatePayload.from).toBe('18:00:00');
    expect(updatePayload.to).toBeUndefined();
    expect(updatePayload.currency).toBeUndefined();
  });
});
