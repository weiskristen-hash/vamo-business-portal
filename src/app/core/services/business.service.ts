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
   * Safe, explicit list of Directus provider fields matching business read permissions.
   * Excludes wildcards (*, logo.*, images.directus_files_id.*) to prevent unauthorized field errors.
   */
  readonly providerReadFields = [
    'id',
    'status',
    'name',
    'business_type',
    'description',
    'address',
    'city',
    'phone',
    'wa_number',
    'email',
    'facebook',
    'instagram',
    'google_business_link',
    'location',
    'offerings',
    'opening_times',
    'subscription_tier',
    'logo.id',
    'images.id',
    'images.directus_files_id.id',
  ] as const;

  /**
   * Verified editable provider fields from source VAMO mobile app.
   */
  readonly editableProviderFields = [
    'name',
    'business_type',
    'description',
    'address',
    'city',
    'phone',
    'wa_number',
    'email',
    'facebook',
    'instagram',
    'google_business_link',
    'location',
    'offerings',
    'opening_times',
    'logo',
    'images',
  ] as const;

  /**
   * Explicitly protected provider fields that must NEVER be submitted by the frontend.
   */
  readonly protectedProviderFields = [
    'id',
    'status',
    'subscription_tier',
    'bookmarkCount',
    'translations',
    'translation_status',
    'internal_provider_data',
    'user_created',
    'date_created',
    'user_updated',
    'date_updated',
    'sort',
  ] as const;

  /**
   * Builds a strictly validated and sanitized provider update payload.
   * Strips all protected and unexpected fields, and optionally excludes unchanged values.
   */
  buildSafeProviderPayload(
    data: Partial<Provider>,
    original?: Partial<Provider>
  ): Record<string, any> {
    const payload: Record<string, any> = {};

    if (data.name !== undefined) {
      payload['name'] = data.name.trim();
    }
    if (data.business_type !== undefined) {
      payload['business_type'] = data.business_type;
    }
    if (data.description !== undefined) {
      payload['description'] = data.description.trim();
    }
    if (data.address !== undefined) {
      payload['address'] = data.address.trim();
    }
    if (data.city !== undefined) {
      payload['city'] = data.city?.trim() || null;
    }
    if (data.email !== undefined) {
      payload['email'] = data.email?.trim() || null;
    }
    if (data.phone !== undefined) {
      payload['phone'] = data.phone?.trim() || null;
    }
    if (data.wa_number !== undefined) {
      payload['wa_number'] = data.wa_number?.trim() || null;
    }
    if (data.facebook !== undefined) {
      payload['facebook'] = data.facebook?.trim() || null;
    }
    if (data.instagram !== undefined) {
      payload['instagram'] = data.instagram?.trim() || null;
    }
    if (data.google_business_link !== undefined) {
      payload['google_business_link'] = data.google_business_link?.trim() || null;
    }
    if (data.location !== undefined) {
      payload['location'] = data.location;
    }
    if (data.offerings !== undefined) {
      payload['offerings'] = Array.isArray(data.offerings) ? data.offerings : [];
    }
    if (data.opening_times !== undefined) {
      payload['opening_times'] = (data.opening_times || []).map((ot) => ({
        day: ot.day,
        opens_at: ot.opens_at || '',
        closes_at: ot.closes_at || '',
        break_from: ot.break_from || '',
        break_to: ot.break_to || '',
        closed: !!ot.closed,
      }));
    }
    if (data.logo !== undefined) {
      payload['logo'] =
        typeof data.logo === 'object' && data.logo !== null
          ? (data.logo as any).id
          : data.logo;
    }
    if (data.images !== undefined) {
      payload['images'] = data.images;
    }

    // If original is provided, omit unchanged fields to minimize mutation surface
    if (original) {
      for (const key of Object.keys(payload)) {
        const origVal = (original as any)[key];
        const newVal = payload[key];
        if (JSON.stringify(origVal) === JSON.stringify(newVal)) {
          delete payload[key];
        }
      }
    }

    return payload;
  }

  /**
   * Loads complete provider record by ID with explicit, permission-safe fields.
   */
  async getProviderById(id: string): Promise<Provider> {
    if (!id) throw new Error('Provider ID is required');

    return this.authService.safeRequest(async () => {
      const provider = await directusClient.request<Provider>(
        readItem('providers', id, {
          fields: this.providerReadFields as any,
        })
      );
      return provider;
    });
  }

  /**
   * Updates provider record with sanitized fields matching Directus schema and least-privilege allowlist.
   */
  async updateProvider(
    id: string,
    data: Partial<Provider>,
    original?: Partial<Provider>
  ): Promise<Provider> {
    if (!id) throw new Error('Provider ID is required');

    return this.authService.safeRequest(async () => {
      const payload = this.buildSafeProviderPayload(data, original);

      // If no fields changed, return existing state
      if (Object.keys(payload).length === 0) {
        return this.getProviderById(id);
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
   * Extracts HH:mm:ss string matching canonical util.service.ts extractTime.
   */
  extractTime(value?: string | null): string | undefined {
    if (!value) return undefined;

    // ISO String → extract time
    if (value.includes('T')) {
      return value.split('T')[1].substring(0, 8); // HH:mm:ss
    }

    // HH:mm → append seconds
    if (/^\d{2}:\d{2}$/.test(value)) {
      return value + ':00';
    }

    // Already HH:mm:ss
    if (/^\d{2}:\d{2}:\d{2}$/.test(value)) {
      return value;
    }

    return undefined;
  }

  /**
   * Safe, explicit list of Directus event fields matching read permissions.
   * Excludes non-existent 'openEnd', restricted root 'provider' expansion, and unauthorized boost/addon metadata.
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
    'location_point',
    'address',
    'is_main_banner',
    'is_whats_hot',
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
   * Creates a new event/listing in Directus matching canonical VamoEvent creation contract.
   * Relies on Directus $CURRENT_USER.provider_link server preset for provider assignment.
   */
  async createEvent(
    data: Partial<VamoEvent>,
    files: File[] = [],
    areaIds: string[] = []
  ): Promise<VamoEvent> {
    return this.authService.safeRequest(async () => {
      // 1. Build canonical payload matching create-event.page.ts buildPayload()
      const payload: Record<string, any> = {
        name: data.name !== undefined ? data.name.trim() : undefined,
        category: data.category !== undefined ? data.category : undefined,
        description: data.description !== undefined ? data.description.trim() : undefined,
        location_point: data.location_point ?? null,
        address: data.address !== undefined ? (data.address ? data.address.trim() : null) : null,
        startDate: data.startDate ? new Date(data.startDate).toISOString().split('T')[0] : undefined,
        endDate: data.endDate ? new Date(data.endDate).toISOString().split('T')[0] : undefined,
        allDay: !!data.allDay,
        mode: data.mode ?? 'single',
        recurring: typeof data.recurring === 'object' && data.recurring !== null
          ? JSON.stringify(data.recurring)
          : (typeof data.recurring === 'string' ? data.recurring : JSON.stringify({ days: [] })),
        from: data.from ? this.extractTime(data.from) : undefined,
        to: data.allDay || data.openEnd || !data.to ? undefined : this.extractTime(data.to),
        promotionStart: data.promotionStart !== undefined
          ? data.promotionStart
          : new Date().toISOString(),
        hasPromotion: !!data.hasPromotion,
        promoText: data.hasPromotion ? (data.promoText ? data.promoText.trim() : null) : null,
        isFree: !!data.isFree,
        contactForPrice: !!data.contactForPrice,
        price: data.price ?? 0,
        currency: data.isFree ? undefined : (data.currency || 'USD'),
        status: data.status || 'draft',
        areas: {
          create: areaIds.map((aid) => ({ areas_id: aid })),
          update: [],
          delete: [],
        },
      };

      // Directus createItem
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
   * Updates an existing event in Directus matching canonical VamoEvent update contract.
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

      if (data.name !== undefined) payload['name'] = data.name.trim();
      if (data.category !== undefined) payload['category'] = data.category;
      if (data.description !== undefined) payload['description'] = data.description.trim();
      if (data.location_point !== undefined) payload['location_point'] = data.location_point ?? null;
      if (data.address !== undefined) payload['address'] = data.address ? data.address.trim() : null;
      if (data.startDate !== undefined) {
        payload['startDate'] = data.startDate ? new Date(data.startDate).toISOString().split('T')[0] : undefined;
      }
      if (data.endDate !== undefined) {
        payload['endDate'] = data.endDate ? new Date(data.endDate).toISOString().split('T')[0] : undefined;
      }
      if (data.allDay !== undefined) payload['allDay'] = !!data.allDay;
      if (data.mode !== undefined) payload['mode'] = data.mode;
      if (data.recurring !== undefined) {
        payload['recurring'] = typeof data.recurring === 'object' && data.recurring !== null
          ? JSON.stringify(data.recurring)
          : (typeof data.recurring === 'string' ? data.recurring : JSON.stringify({ days: [] }));
      }
      if (data.from !== undefined) {
        payload['from'] = data.from ? this.extractTime(data.from) : undefined;
      }
      if (data.allDay !== undefined || data.openEnd !== undefined || data.to !== undefined) {
        const isAllDay = !!data.allDay;
        const isOpenEnd = !!data.openEnd;
        payload['to'] = (isAllDay || isOpenEnd || !data.to) ? undefined : this.extractTime(data.to);
      }
      if (data.promotionStart !== undefined) {
        payload['promotionStart'] = data.promotionStart;
      }
      if (data.hasPromotion !== undefined) payload['hasPromotion'] = !!data.hasPromotion;
      if (data.promoText !== undefined) {
        payload['promoText'] = data.hasPromotion ? (data.promoText ? data.promoText.trim() : null) : null;
      }
      if (data.isFree !== undefined) payload['isFree'] = !!data.isFree;
      if (data.contactForPrice !== undefined) payload['contactForPrice'] = !!data.contactForPrice;
      if (data.price !== undefined) payload['price'] = data.price;
      if (data.currency !== undefined || data.isFree !== undefined) {
        payload['currency'] = (data.isFree || payload['isFree']) ? undefined : (data.currency || 'USD');
      }
      if (data.status !== undefined) payload['status'] = data.status;

      // Handle area updates matching canonical nested shape
      if (areaIds !== undefined) {
        payload['areas'] = {
          create: areaIds.map((aid) => ({ areas_id: aid })),
          update: [],
          delete: existingAreaJunctionIds,
        };
      }

      // Handle image updates
      const newFileIds = files.length > 0 ? await this.uploadEventImages(files) : [];
      if (newFileIds.length > 0 || removedImageJunctionIds.length > 0) {
        payload['images'] = {
          create: newFileIds.map((fid) => ({ directus_files_id: fid, events_id: eventId })),
          update: [],
          delete: removedImageJunctionIds,
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
   * Duplicates an existing event as a draft matching canonical event.service.ts duplicateEventAsDraft.
   */
  async duplicateEventAsDraft(event: VamoEvent): Promise<string> {
    return this.authService.safeRequest(async () => {
      const payload: Record<string, any> = {
        status: 'draft',
        name: event.name ? `${event.name} (Copy)` : 'Untitled Copy',
        description: event.description,
        location_point: event.location_point ?? null,
        address: event.address ?? null,
        category: event.category,
        mode: event.mode,
        from: event.from,
        to: event.to,
        allDay: event.allDay,
        recurring: typeof event.recurring === 'object' && event.recurring !== null
          ? JSON.stringify(event.recurring)
          : (typeof event.recurring === 'string' ? event.recurring : JSON.stringify({ days: [] })),
        isFree: event.isFree,
        price: event.price,
        hasPromotion: event.hasPromotion,
        promoText: event.promoText,
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
