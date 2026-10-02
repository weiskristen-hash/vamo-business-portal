import { Injectable, inject } from '@angular/core';
import { createItem, deleteItem, readItem, readItems, updateItem, uploadFiles } from '@directus/sdk';
import { directusClient } from '../directus/directus-client';
import { runtimeConfig } from '../config/runtime-config';
import { Provider } from '../models/provider.model';
import { VamoEvent, ProviderEventStats, Area } from '../models/event.model';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class BusinessService {
  private authService = inject(AuthService);

  /**
   * Resolves a Directus asset ID to a full URL.
   */
  getAssetUrl(fileIdOrObj: any, transforms: string = ''): string {
    if (!fileIdOrObj) return '';
    const id = typeof fileIdOrObj === 'object' ? fileIdOrObj.id : fileIdOrObj;
    if (!id) return '';
    const base = runtimeConfig.directusUrl;
    const query = transforms ? `?${transforms}` : '';
    return `${base}/assets/${id}${query}`;
  }

  /**
   * Loads complete provider record by ID with expanded logo and images.
   */
  async getProviderById(id: string): Promise<Provider> {
    if (!id) throw new Error('Provider ID is required');

    return this.authService.safeRequest(async () => {
      const provider = await directusClient.request<Provider>(
        readItem('providers', id, {
          fields: [
            '*',
            'logo.*',
            'images.id',
            'images.directus_files_id.*',
          ] as any,
        })
      );
      return provider;
    });
  }

  /**
   * Updates provider record with sanitized fields matching Directus schema.
   */
  async updateProvider(id: string, data: Partial<Provider>): Promise<Provider> {
    if (!id) throw new Error('Provider ID is required');

    return this.authService.safeRequest(async () => {
      const openingTimes = data.opening_times
        ? data.opening_times.map((ot) => ({
            day: ot.day,
            opens_at: ot.opens_at || '',
            closes_at: ot.closes_at || '',
            break_from: ot.break_from || '',
            break_to: ot.break_to || '',
            closed: !!ot.closed,
          }))
        : undefined;

      const payload: Record<string, any> = {
        name: data.name?.trim(),
        business_type: data.business_type,
        description: data.description?.trim(),
        address: data.address?.trim(),
        city: data.city?.trim() || null,
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        wa_number: data.wa_number?.trim() || null,
        website: data.website?.trim() || null,
        facebook: data.facebook?.trim() || null,
        instagram: data.instagram?.trim() || null,
        google_business_link: data.google_business_link?.trim() || null,
      };

      if (data.location !== undefined) {
        payload['location'] = data.location;
      }
      if (data.offerings !== undefined) {
        payload['offerings'] = data.offerings;
      }
      if (openingTimes !== undefined) {
        payload['opening_times'] = openingTimes;
      }
      if (data.logo !== undefined) {
        payload['logo'] =
          typeof data.logo === 'object' && data.logo !== null
            ? (data.logo as any).id
            : data.logo;
      }

      const updated = await directusClient.request<Provider>(
        updateItem('providers', id, payload as any)
      );

      // Refresh auth state to sync across topbar and other widgets
      await this.authService.restoreSession();

      return updated;
    });
  }

  /**
   * Uploads an image file to Directus files collection with client-side compression.
   */
  async uploadFile(file: File, compress = true): Promise<string> {
    const fileToUpload = compress ? await this.compressImage(file) : file;
    const formData = new FormData();
    formData.append('file', fileToUpload);

    return this.authService.safeRequest(async () => {
      const res: any = await directusClient.request(uploadFiles(formData));
      const fileId = Array.isArray(res) ? res[0]?.id : res?.id;
      if (!fileId) {
        throw new Error('Upload succeeded but no file ID was returned.');
      }
      return fileId;
    });
  }

  /**
   * Uploads a new logo and attaches it to the provider.
   */
  async updateProviderLogo(providerId: string, file: File): Promise<string> {
    const fileId = await this.uploadFile(file);
    await this.authService.safeRequest(async () => {
      await directusClient.request(
        updateItem('providers', providerId, { logo: fileId } as any)
      );
      await this.authService.restoreSession();
    });
    return fileId;
  }

  /**
   * Uploads a gallery image and appends it to the provider's images relation.
   */
  async uploadProviderImage(providerId: string, file: File): Promise<string> {
    const fileId = await this.uploadFile(file);
    await this.authService.safeRequest(async () => {
      await directusClient.request(
        updateItem('providers', providerId, {
          images: {
            create: [{ directus_files_id: fileId }],
          },
        } as any)
      );
      await this.authService.restoreSession();
    });
    return fileId;
  }

  /**
   * Removes an image from the provider's gallery.
   */
  async removeProviderImage(
    providerId: string,
    imageItemOrFileId: string,
    junctionId?: string
  ): Promise<void> {
    await this.authService.safeRequest(async () => {
      if (junctionId) {
        await directusClient.request(
          updateItem('providers', providerId, {
            images: {
              delete: [junctionId],
            },
          } as any)
        );
      } else {
        const current = await this.getProviderById(providerId);
        const filtered = (current.images || []).filter((img: any) => {
          const fid =
            typeof img.directus_files_id === 'object'
              ? img.directus_files_id?.id
              : img.directus_files_id;
          return fid !== imageItemOrFileId && img.id !== imageItemOrFileId;
        });
        await directusClient.request(
          updateItem('providers', providerId, {
            images: filtered.map((img: any) => ({
              id: img.id,
              directus_files_id:
                typeof img.directus_files_id === 'object'
                  ? img.directus_files_id?.id
                  : img.directus_files_id,
            })),
          } as any)
        );
      }
      await this.authService.restoreSession();
    });
  }

  /**
   * Client-side HTML5 canvas image compression.
   */
  private async compressImage(
    file: File,
    maxDimension = 1200,
    quality = 0.85
  ): Promise<File> {
    if (
      typeof window === 'undefined' ||
      !file.type.startsWith('image/') ||
      file.type === 'image/svg+xml'
    ) {
      return file;
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(file);
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob) return resolve(file);
              resolve(new File([blob], file.name, { type: blob.type }));
            },
            file.type === 'image/png' ? 'image/png' : 'image/jpeg',
            quality
          );
        };
        img.onerror = () => resolve(file);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Returns current Dominican Republic date as YYYY-MM-DD.
   */
  drTodayStr(): string {
    const drNow = new Date(Date.now() - 4 * 60 * 60 * 1000);
    return drNow.toISOString().split('T')[0];
  }

  /**
   * Checks whether a single or multi-day event is upcoming or ongoing in the DR timezone.
   */
  isEventUpcomingOrOngoing(event: { startDate?: Date | string | null; endDate?: Date | string | null }): boolean {
    const last = event.endDate || event.startDate;
    if (!last) return false;
    const str = typeof last === 'string' ? last.split('T')[0] : last.toISOString().split('T')[0];
    return str >= this.drTodayStr();
  }

  /**
   * Safe, explicit list of Directus event fields matching read permissions.
   * Excludes non-existent 'openEnd' and restricted root 'provider' object expansion.
   */
  readonly eventFields = [
    'id',
    'status',
    'name',
    'description',
    'category',
    'mode',
    'startDate',
    'endDate',
    'from',
    'to',
    'allDay',
    'recurring',
    'isFree',
    'contactForPrice',
    'price',
    'currency',
    'hasPromotion',
    'promoText',
    'promotionStart',
    'location_point',
    'address',
    'is_main_banner',
    'is_whats_hot',
    'boost_expires_at',
    'boost_scheduled_start',
    'boost_scheduled_type',
    'addon_expires_at',
    'date_created',
    'date_updated',
    'images.id',
    'images.directus_files_id',
    'areas.id',
    'areas.areas_id.id',
    'areas.areas_id.name',
    'areas.areas_id.slug',
    'areas.areas_id.emoji',
    'areas.areas_id.latitude',
    'areas.areas_id.longitude',
  ] as const;

  /**
   * Normalizes raw Directus event object (parses recurring JSON, derives openEnd).
   */
  normalizeEvent(e: any): VamoEvent {
    if (!e) return e;
    const event: VamoEvent = { ...e };
    if (typeof event.recurring === 'string') {
      try {
        event.recurring = JSON.parse(event.recurring);
      } catch {
        event.recurring = { days: [] };
      }
    }
    if (!event.recurring || !Array.isArray((event.recurring as any).days)) {
      event.recurring = { days: [] };
    }
    // Derive openEnd from (!to && !allDay) since openEnd is not a Directus schema field
    if (event.openEnd === undefined) {
      event.openEnd = !event.allDay && !event.to;
    }
    return event;
  }

  /**
   * Loads events scoped strictly to the specified provider ID.
   * Uses permission-safe field list without restricted root 'provider' or non-existent 'openEnd'.
   */
  async getEventsForProvider(providerId: string): Promise<VamoEvent[]> {
    if (!providerId) {
      return [];
    }

    return this.authService.safeRequest(async () => {
      const items = await directusClient.request<VamoEvent[]>(
        readItems('events', {
          fields: this.eventFields as any,
          filter: {
            provider: {
              id: { _eq: providerId },
            },
          } as any,
          sort: ['-date_created', '-startDate'] as any,
        })
      );
      return (items || []).map((ev) => this.normalizeEvent(ev));
    });
  }

  /**
   * Loads a single event by ID with explicit, permission-safe fields.
   */
  async getEventById(id: string): Promise<VamoEvent> {
    if (!id) throw new Error('Event ID is required');

    return this.authService.safeRequest(async () => {
      const event = await directusClient.request<VamoEvent>(
        readItem('events', id, {
          fields: this.eventFields as any,
        })
      );
      return this.normalizeEvent(event);
    });
  }

  /**
   * Uploads multiple event images using client-side compression.
   */
  async uploadEventImages(files: File[]): Promise<string[]> {
    if (!files || files.length === 0) return [];
    const uploadedIds: string[] = [];
    for (const file of files) {
      const id = await this.uploadFile(file, true);
      if (id) uploadedIds.push(id);
    }
    return uploadedIds;
  }

  /**
   * Creates a new event/listing for the provider in Directus.
   */
  async createEvent(
    providerId: string,
    data: Partial<VamoEvent>,
    files: File[] = [],
    areaIds: string[] = []
  ): Promise<VamoEvent> {
    if (!providerId) throw new Error('Provider ID is required');

    return this.authService.safeRequest(async () => {
      const payload: Record<string, any> = {
        provider: providerId,
        status: data.status || 'draft',
        name: data.name?.trim(),
        description: data.description?.trim(),
        category: data.category || 'other',
        mode: data.mode || 'single',
        startDate: data.startDate || null,
        endDate: data.endDate || null,
        from: data.from || null,
        to: data.allDay || data.openEnd ? null : (data.to || null),
        allDay: !!data.allDay,
        recurring: typeof data.recurring === 'object' && data.recurring !== null
          ? JSON.stringify(data.recurring)
          : (data.recurring || null),
        isFree: !!data.isFree,
        contactForPrice: !!data.contactForPrice,
        price: data.price ?? 0,
        currency: data.currency || 'USD',
        hasPromotion: !!data.hasPromotion,
        promoText: data.promoText?.trim() || null,
        promotionStart: data.promotionStart || null,
        location_point: data.location_point || null,
        address: data.address?.trim() || null,
      };

      const created = await directusClient.request<any>(createItem('events', payload as any));
      if (!created?.id) throw new Error('Failed to create event in Directus');

      // Upload and attach images if any
      if (files.length > 0) {
        const fileIds = await this.uploadEventImages(files);
        if (fileIds.length > 0) {
          await directusClient.request(updateItem('events', created.id, {
            images: {
              create: fileIds.map((fid) => ({ directus_files_id: fid, events_id: created.id })),
              update: [],
              delete: [],
            },
          } as any));
        }
      }

      // Attach areas if any
      if (areaIds.length > 0) {
        await directusClient.request(updateItem('events', created.id, {
          areas: {
            create: areaIds.map((aid) => ({ areas_id: aid, events_id: created.id })),
            update: [],
            delete: [],
          },
        } as any));
      }

      // Read back created event, with resilient fallback to prevent false "save failed" states
      try {
        return await this.getEventById(created.id);
      } catch (readErr) {
        console.warn('[BusinessService] Post-create getEventById failed, returning synthesized event record:', readErr);
        return this.normalizeEvent({
          ...payload,
          id: created.id,
          date_created: new Date().toISOString(),
          date_updated: new Date().toISOString(),
        } as VamoEvent);
      }
    });
  }

  /**
   * Updates an existing event in Directus.
   */
  async updateEvent(
    eventId: string,
    data: Partial<VamoEvent>,
    files: File[] = [],
    removedImageJunctionIds: (number | string)[] = [],
    areaIds?: string[],
    existingAreaJunctionIds: (number | string)[] = []
  ): Promise<VamoEvent> {
    if (!eventId) throw new Error('Event ID is required');

    return this.authService.safeRequest(async () => {
      const payload: Record<string, any> = {};

      if (data.status !== undefined) payload['status'] = data.status;
      if (data.name !== undefined) payload['name'] = data.name.trim();
      if (data.description !== undefined) payload['description'] = data.description.trim();
      if (data.category !== undefined) payload['category'] = data.category;
      if (data.mode !== undefined) payload['mode'] = data.mode;
      if (data.startDate !== undefined) payload['startDate'] = data.startDate;
      if (data.endDate !== undefined) payload['endDate'] = data.endDate;
      if (data.from !== undefined) payload['from'] = data.from;
      if (data.allDay !== undefined || data.openEnd !== undefined || data.to !== undefined) {
        const isAllDay = data.allDay !== undefined ? !!data.allDay : false;
        const isOpenEnd = data.openEnd !== undefined ? !!data.openEnd : false;
        if (isAllDay || isOpenEnd) {
          payload['to'] = null;
        } else if (data.to !== undefined) {
          payload['to'] = data.to;
        }
      }
      if (data.allDay !== undefined) payload['allDay'] = data.allDay;
      if (data.recurring !== undefined) {
        payload['recurring'] = typeof data.recurring === 'object' && data.recurring !== null
          ? JSON.stringify(data.recurring)
          : data.recurring;
      }
      if (data.isFree !== undefined) payload['isFree'] = data.isFree;
      if (data.contactForPrice !== undefined) payload['contactForPrice'] = data.contactForPrice;
      if (data.price !== undefined) payload['price'] = data.price;
      if (data.currency !== undefined) payload['currency'] = data.currency;
      if (data.hasPromotion !== undefined) payload['hasPromotion'] = data.hasPromotion;
      if (data.promoText !== undefined) payload['promoText'] = data.promoText ? data.promoText.trim() : null;
      if (data.promotionStart !== undefined) payload['promotionStart'] = data.promotionStart;
      if (data.location_point !== undefined) payload['location_point'] = data.location_point;
      if (data.address !== undefined) payload['address'] = data.address ? data.address.trim() : null;

      // Handle image updates
      const newFileIds = files.length > 0 ? await this.uploadEventImages(files) : [];
      if (newFileIds.length > 0 || removedImageJunctionIds.length > 0) {
        payload['images'] = {
          create: newFileIds.map((fid) => ({ directus_files_id: fid, events_id: eventId })),
          update: [],
          delete: removedImageJunctionIds,
        };
      }

      // Handle area updates
      if (areaIds !== undefined) {
        payload['areas'] = {
          create: areaIds.map((aid) => ({ areas_id: aid, events_id: eventId })),
          update: [],
          delete: existingAreaJunctionIds,
        };
      }

      await directusClient.request(updateItem('events', eventId, payload as any));

      // Read back updated event, with resilient fallback to prevent false "save failed" states
      try {
        return await this.getEventById(eventId);
      } catch (readErr) {
        console.warn('[BusinessService] Post-update getEventById failed, returning synthesized event record:', readErr);
        return this.normalizeEvent({
          id: eventId,
          ...data,
          date_updated: new Date().toISOString(),
        } as VamoEvent);
      }
    });
  }

  /**
   * Deletes an event permanently from Directus.
   */
  async deleteEvent(eventId: string): Promise<void> {
    if (!eventId) throw new Error('Event ID is required');

    return this.authService.safeRequest(async () => {
      await directusClient.request(deleteItem('events', eventId));
    });
  }

  /**
   * Pauses an active event (sets status to 'draft').
   */
  async pauseEvent(eventId: string): Promise<void> {
    if (!eventId) throw new Error('Event ID is required');

    return this.authService.safeRequest(async () => {
      await directusClient.request(updateItem('events', eventId, { status: 'draft' } as any));
    });
  }

  /**
   * Publishes a draft event (sets status to 'published').
   */
  async publishEvent(eventId: string): Promise<void> {
    if (!eventId) throw new Error('Event ID is required');

    return this.authService.safeRequest(async () => {
      await directusClient.request(updateItem('events', eventId, { status: 'published' } as any));
    });
  }

  /**
   * Duplicates an existing event as a draft, preserving images and categories without re-uploading.
   */
  async duplicateEventAsDraft(event: VamoEvent, providerId: string): Promise<string> {
    if (!providerId) throw new Error('Provider ID is required');

    return this.authService.safeRequest(async () => {
      const payload: Record<string, any> = {
        status: 'draft',
        provider: providerId,
        name: event.name ? `${event.name} (Copy)` : 'Untitled Copy',
        description: event.description || '',
        category: event.category || 'other',
        mode: event.mode || 'single',
        startDate: event.startDate || null,
        endDate: event.endDate || null,
        from: event.from || null,
        to: event.allDay || event.openEnd || !event.to ? null : event.to,
        allDay: !!event.allDay,
        recurring: typeof event.recurring === 'object' && event.recurring !== null
          ? JSON.stringify(event.recurring)
          : (event.recurring || null),
        isFree: !!event.isFree,
        contactForPrice: !!event.contactForPrice,
        price: event.price ?? 0,
        currency: event.currency || 'USD',
        hasPromotion: !!event.hasPromotion,
        promoText: event.promoText || null,
        promotionStart: event.promotionStart || null,
        location_point: event.location_point || null,
        address: event.address || null,
      };

      const newEvent = await directusClient.request<any>(createItem('events', payload as any));
      if (!newEvent?.id) throw new Error('Duplicate failed to create event.');

      // Copy existing image links without re-uploading
      const fileIds = (event.images || [])
        .map((img: any) => {
          const f = img.directus_files_id;
          return typeof f === 'string' ? f : f?.id;
        })
        .filter(Boolean);

      if (fileIds.length > 0) {
        await directusClient.request(updateItem('events', newEvent.id, {
          images: {
            create: fileIds.map((fileId: string) => ({
              directus_files_id: fileId,
              events_id: newEvent.id,
            })),
            update: [],
            delete: [],
          },
        } as any));
      }

      // Copy existing areas
      const areaIds = (event.areas || [])
        .map((a: any) => {
          const aid = a.areas_id;
          return typeof aid === 'string' ? aid : aid?.id;
        })
        .filter(Boolean);

      if (areaIds.length > 0) {
        await directusClient.request(updateItem('events', newEvent.id, {
          areas: {
            create: areaIds.map((areaId: string) => ({
              areas_id: areaId,
              events_id: newEvent.id,
            })),
            update: [],
            delete: [],
          },
        } as any));
      }

      return newEvent.id;
    });
  }

  /**
   * Fetches published areas from Directus with reliable fallback.
   */
  async getAreas(): Promise<Area[]> {
    return this.authService.safeRequest(async () => {
      try {
        const areas = await directusClient.request<Area[]>(
          readItems('areas', {
            filter: { status: { _eq: 'published' } },
            sort: ['sort', 'name'] as any,
            fields: ['id', 'name', 'slug', 'emoji', 'latitude', 'longitude'] as any,
          })
        );
        return areas || [];
      } catch (err) {
        console.warn('[BusinessService] getAreas fallback:', err);
        return [
          { id: '88adabdb-66ba-4168-92e7-155e27ef4fb1', name: 'Las Terrenas/Samana', slug: 'las_terrenas', emoji: '🏖️', latitude: 19.31, longitude: -69.5444 },
          { id: '2ae214bc-f4de-40c6-b7b4-2524c5d79165', name: 'Punta Cana', slug: 'punta_cana', emoji: '🌴', latitude: 18.5622, longitude: -68.4044 },
          { id: 'fe593396-d157-4d46-b7ab-9cb922f72387', name: 'Santo Domingo', slug: 'santo_domingo', emoji: '🏙️', latitude: 18.4861, longitude: -69.9312 },
          { id: '6f4ed55f-f46c-44e2-b1f1-4e8a856a22f1', name: 'Puerto Plata', slug: 'puerto_plata', emoji: '⛵', latitude: 19.7938, longitude: -70.6918 },
          { id: 'e711a086-dbb1-41b1-a503-5cb5fa02a865', name: 'Cabarete', slug: 'cabarete', emoji: '🏊', latitude: 19.7521, longitude: -70.4074 },
          { id: '2ec5078a-f43d-4a1c-93d6-ab3eebf6eb95', name: 'Santiago', slug: 'santiago', emoji: '🌆', latitude: 19.4517, longitude: -70.697 },
        ];
      }
    });
  }

  /**
   * Computes stats summary for the provider's events.
   */
  calculateStats(events: VamoEvent[]): ProviderEventStats {
    const published = events.filter((e) => e.status === 'published').length;
    const draft = events.filter((e) => e.status === 'draft').length;
    const archived = events.filter((e) => e.status === 'archived').length;

    return {
      total: events.length,
      published,
      draft,
      archived,
    };
  }

  /**
   * Returns up to 5 most recent events for the provider.
   */
  getRecentEvents(events: VamoEvent[], limit: number = 5): VamoEvent[] {
    return [...events]
      .sort((a, b) => {
        const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
        const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, limit);
  }
}
