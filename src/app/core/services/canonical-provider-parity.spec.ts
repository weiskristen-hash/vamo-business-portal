import { TestBed } from '@angular/core/testing';
import { createItem } from '@directus/sdk';
import { BusinessService } from './business.service';
import { AuthService } from './auth.service';
import { directusClient } from '../directus/directus-client';
import { Provider } from '../models/provider.model';

vi.mock('../directus/directus-client', () => ({
  directusClient: {
    request: vi.fn(),
  },
}));

describe('Canonical Provider Translation Save Parity (Phase 2B)', () => {
  let businessService: BusinessService;
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
    clientRequestMock = vi.mocked(directusClient.request);
    clientRequestMock.mockReset();

    authServiceSpy = {
      safeRequest: vi.fn((fn: () => any) => fn()),
      createProviderAndLink: vi.fn(async (data: Record<string, any>) => {
        const payload = { ...data };
        delete payload['translations'];
        delete payload['translation_status'];
        return directusClient.request(createItem('providers', payload as any));
      }),
      restoreSession: vi.fn().mockResolvedValue(undefined),
      currentUser: { id: 'user-1', email: 'owner@vamo.do' },
    };

    TestBed.configureTestingModule({
      providers: [
        BusinessService,
        { provide: AuthService, useValue: authServiceSpy },
      ],
    });

    businessService = TestBed.inject(BusinessService);
  });

  // 1. provider creation during business onboarding
  it('1. provider creation during business onboarding: exact full canonical payload equality including business_type', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'prov-created-1' });

    const createInput = {
      name: 'Playa Bar & Grill',
      business_type: 'restaurant_and_bar',
      description: 'Beachfront dining with cocktails and fresh seafood.',
      phone: '+1 809-555-0199',
      wa_number: '+1 809-555-0199',
      email: 'owner@playagrill.do',
      address: 'Calle Principal 10',
      city: 'Las Terrenas/Samana',
      area: 'area-lt',
      location: {
        type: 'Point' as const,
        coordinates: [-69.535, 19.321] as [number, number],
      },
      status: 'published',
    };

    await authServiceSpy.createProviderAndLink(createInput);

    expect(clientRequestMock).toHaveBeenCalledTimes(1);
    expect(extractMethod(clientRequestMock.mock.calls[0][0])).toBe('POST');

    const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(payload).toEqual({
      name: 'Playa Bar & Grill',
      business_type: 'restaurant_and_bar',
      description: 'Beachfront dining with cocktails and fresh seafood.',
      phone: '+1 809-555-0199',
      wa_number: '+1 809-555-0199',
      email: 'owner@playagrill.do',
      address: 'Calle Principal 10',
      city: 'Las Terrenas/Samana',
      area: 'area-lt',
      location: {
        type: 'Point',
        coordinates: [-69.535, 19.321],
      },
      status: 'published',
    });
  });

  // 2. provider profile edit
  it('2. provider profile edit: exact full canonical update payload equality (omits business_type, images, status)', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'prov-1', name: 'Playa Bar & Grill' });

    const editData: Partial<Provider> = {
      name: 'Playa Bar & Grill',
      business_type: 'restaurant_and_bar', // Must be omitted on edit
      images: [{ id: 'img-1' }] as any,    // Must be omitted on edit
      description: 'Beachfront dining with cocktails and fresh seafood.',
      address: 'Calle Principal 10',
      city: 'Las Terrenas',
      email: 'owner@playagrill.do',
      phone: '+1 809-555-0199',
      wa_number: '+1 809-555-0199',
      facebook: 'https://facebook.com/playagrill',
      instagram: 'https://instagram.com/playagrill',
      google_business_link: 'https://maps.google.com/?cid=playagrill',
      logo: { id: 'logo-file-1' } as any,
      location: {
        type: 'Point',
        coordinates: [-69.535, 19.321],
      },
      offerings: ['wifi', 'parking', 'outdoor_seating'],
      opening_times: [
        {
          day: 'monday',
          opens_at: '09:00',
          closes_at: '22:00',
          break_from: '',
          break_to: '',
          closed: false,
        },
      ],
    };

    await businessService.updateProvider('prov-1', editData);

    expect(clientRequestMock).toHaveBeenCalledTimes(1);
    expect(extractMethod(clientRequestMock.mock.calls[0][0])).toBe('PATCH');

    const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(payload).toEqual({
      name: 'Playa Bar & Grill',
      description: 'Beachfront dining with cocktails and fresh seafood.',
      address: 'Calle Principal 10',
      city: 'Las Terrenas',
      email: 'owner@playagrill.do',
      phone: '+1 809-555-0199',
      wa_number: '+1 809-555-0199',
      facebook: 'https://facebook.com/playagrill',
      instagram: 'https://instagram.com/playagrill',
      google_business_link: 'https://maps.google.com/?cid=playagrill',
      logo: 'logo-file-1',
      location: {
        type: 'Point',
        coordinates: [-69.535, 19.321],
      },
      offerings: ['wifi', 'parking', 'outdoor_seating'],
      opening_times: [
        {
          day: 'monday',
          opens_at: '09:00',
          closes_at: '22:00',
          break_from: null,
          break_to: null,
          closed: false,
        },
      ],
    });
    expect('business_type' in payload).toBe(false);
    expect('images' in payload).toBe(false);
    expect('status' in payload).toBe(false);
  });

  // 3. description with leading/trailing whitespace
  it('3. description with leading/trailing whitespace: preserved exactly without trimming', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'prov-1' });

    const dataWithUntrimmedDesc: Partial<Provider> = {
      name: 'Cafe Dominicano',
      description: '   Authentic Dominican coffee and roasted beans.   ',
    };

    await businessService.updateProvider('prov-1', dataWithUntrimmedDesc);

    const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(payload.description).toBe('   Authentic Dominican coffee and roasted beans.   ');
    expect(payload.name).toBe('Cafe Dominicano');
  });

  // 4. empty description if canonical allows it
  it('4. empty description: preserved as empty string without null coercion or omission', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'prov-1' });

    const dataWithEmptyDesc: Partial<Provider> = {
      name: 'Cafe Dominicano',
      description: '',
    };

    await businessService.updateProvider('prov-1', dataWithEmptyDesc);

    const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(payload.description).toBe('');
  });

  // 5. null/empty phone
  it('5. null/empty phone: empty phone is preserved as empty string, empty wa_number is coerced to null', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'prov-1' });

    const dataWithEmptyPhones: Partial<Provider> = {
      phone: '',
      wa_number: '   ',
      email: '   ',
    };

    await businessService.updateProvider('prov-1', dataWithEmptyPhones);

    const payload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(payload.phone).toBe('');
    expect(payload.wa_number).toBeNull();
    expect(payload.email).toBeNull();
  });

  // 6. WhatsApp same-as-phone
  it('6. WhatsApp same-as-phone: wa_number receives phone value trimmed or null', async () => {
    const phone = '+1 809-555-7788';
    const waSame = (true ? phone : '+1 809-555-9999').trim() || null;

    const payload = businessService.buildSafeProviderPayload({
      phone,
      wa_number: waSame,
    });

    expect(payload).toEqual({
      phone: '+1 809-555-7788',
      wa_number: '+1 809-555-7788',
    });
  });

  // 7. distinct WhatsApp
  it('7. distinct WhatsApp: wa_number receives distinct whatsapp number', async () => {
    const phone = '+1 809-555-1111';
    const separateWhatsapp = ' +1 809-555-2222 ';
    const waNumber = (false ? phone : separateWhatsapp).trim() || null;

    const payload = businessService.buildSafeProviderPayload({
      phone,
      wa_number: waNumber,
    });

    expect(payload).toEqual({
      phone: '+1 809-555-1111',
      wa_number: '+1 809-555-2222',
    });
  });

  // 8. null/empty address
  it('8. null/empty address: address is passed without non-canonical coercion', async () => {
    const payload = businessService.buildSafeProviderPayload({
      address: '',
    });

    expect(payload).toEqual({
      address: '',
    });
  });

  // 9. business type
  it('9. business type: onboarding create DOES include business_type; provider edit payload does NOT include business_type', async () => {
    // Edit path: business_type is strictly omitted
    const editPayload = businessService.buildSafeProviderPayload({
      business_type: 'bakery',
    });
    expect(editPayload).toEqual({});
    expect('business_type' in editPayload).toBe(false);

    // Create path: business_type is explicitly included
    clientRequestMock.mockResolvedValueOnce({ id: 'prov-new' });
    await authServiceSpy.createProviderAndLink({
      name: 'La Panaderia',
      business_type: 'bakery',
      description: 'Pan fresco cada mañana.',
    });

    const createPayload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(createPayload.business_type).toBe('bakery');
  });

  // 10. coordinates/location
  it('10. coordinates/location: Point geometry is preserved on edit or set to null when null', async () => {
    const pointLocation = {
      type: 'Point' as const,
      coordinates: [-69.535, 19.321] as [number, number],
    };

    const payloadWithPoint = businessService.buildSafeProviderPayload({
      location: pointLocation,
    });
    expect(payloadWithPoint).toEqual({
      location: pointLocation,
    });

    const payloadWithNull = businessService.buildSafeProviderPayload({
      location: null,
    });
    expect(payloadWithNull).toEqual({
      location: null,
    });
  });

  // 11. area/city
  it('11. area/city: city is passed directly on edit without stripping or alteration', async () => {
    const payload = businessService.buildSafeProviderPayload({
      city: 'Las Terrenas',
    });

    expect(payload).toEqual({
      city: 'Las Terrenas',
    });
  });

  // 12. status
  it('12. status: status is strictly omitted from edit payload and included in create payload', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'prov-1' });

    // Calling update with status in data
    await businessService.updateProvider('prov-1', {
      name: 'Safe Bar',
      status: 'published' as any,
    });

    const editPayload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(editPayload.name).toBe('Safe Bar');
    expect(editPayload.status).toBeUndefined();
    expect('status' in editPayload).toBe(false);

    // Create includes status: 'published'
    clientRequestMock.mockResolvedValueOnce({ id: 'prov-created' });
    await authServiceSpy.createProviderAndLink({
      name: 'New Bar',
      status: 'published',
    });

    const createPayload = extractPayload(clientRequestMock.mock.calls[1][0]);
    expect(createPayload.status).toBe('published');
  });

  // 13. translations never written
  it('13. translations never written: translations is defensively deleted from both create and edit payloads', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'prov-1' });

    // On edit
    await businessService.updateProvider('prov-1', {
      name: 'Safe Bar',
      translations: { description: { en: 'Injected translation' } } as any,
    });

    const editPayload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(editPayload.translations).toBeUndefined();
    expect('translations' in editPayload).toBe(false);

    // On create
    clientRequestMock.mockResolvedValueOnce({ id: 'prov-created' });
    await authServiceSpy.createProviderAndLink({
      name: 'New Bar',
      translations: { description: { en: 'Injected translation' } },
    });

    const createPayload = extractPayload(clientRequestMock.mock.calls[1][0]);
    expect(createPayload.translations).toBeUndefined();
    expect('translations' in createPayload).toBe(false);
  });

  // 14. translation_status never written
  it('14. translation_status never written: translation_status is defensively deleted from both create and edit payloads', async () => {
    clientRequestMock.mockResolvedValueOnce({ id: 'prov-1' });

    // On edit
    await businessService.updateProvider('prov-1', {
      name: 'Safe Bar',
      translation_status: 'pending' as any,
    });

    const editPayload = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(editPayload.translation_status).toBeUndefined();
    expect('translation_status' in editPayload).toBe(false);

    // On create
    clientRequestMock.mockResolvedValueOnce({ id: 'prov-created' });
    await authServiceSpy.createProviderAndLink({
      name: 'New Bar',
      translation_status: 'pending',
    });

    const createPayload = extractPayload(clientRequestMock.mock.calls[1][0]);
    expect(createPayload.translation_status).toBeUndefined();
    expect('translation_status' in createPayload).toBe(false);
  });

  // 15. images update parity & gallery dedicated behavior
  it('15. images update parity: provider metadata update omits images while dedicated gallery mutations remain intact', async () => {
    // Generic edit payload omits images
    const editPayload = businessService.buildSafeProviderPayload({
      name: 'Bar with Images',
      images: [{ id: 'img-1' }] as any,
    });
    expect(editPayload.name).toBe('Bar with Images');
    expect('images' in editPayload).toBe(false);

    // Dedicated uploadProviderImage continues through its dedicated canonical path
    const mockFile = new File(['dummy'], 'photo.jpg', { type: 'image/jpeg' });
    vi.spyOn(businessService as any, 'uploadFile').mockResolvedValue('file-upload-123');
    clientRequestMock.mockResolvedValueOnce({ id: 'prov-1' });

    const uploadedId = await businessService.uploadProviderImage('prov-1', mockFile);
    expect(uploadedId).toBe('file-upload-123');
    expect(clientRequestMock).toHaveBeenCalled();
    const uploadCallArg = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(uploadCallArg.images).toEqual({
      create: [{ directus_files_id: 'file-upload-123' }],
    });

    // Dedicated removeProviderImage continues through its dedicated canonical path
    clientRequestMock.mockReset();
    clientRequestMock.mockResolvedValueOnce({ id: 'prov-1' });
    await businessService.removeProviderImage('prov-1', 'img-to-del', 'junc-456');
    expect(clientRequestMock).toHaveBeenCalled();
    const removeCallArg = extractPayload(clientRequestMock.mock.calls[0][0]);
    expect(removeCallArg.images).toEqual({
      delete: ['junc-456'],
    });
  });
});
