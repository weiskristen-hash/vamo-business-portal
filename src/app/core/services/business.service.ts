import { Injectable, inject } from '@angular/core';
import { createItem, deleteItem, readItem, readItems, updateItem, uploadFiles } from '@directus/sdk';
import { directusClient } from '../directus/directus-client';
import { runtimeConfig } from '../config/runtime-config';
import { Provider } from '../models/provider.model';
import { VamoEvent, ProviderEventStats, Area, OrderedEventImage } from '../models/event.model';
import { AuthService } from './auth.service';
import {
  calculateSharedEventStats,
  isEventPast,
  isEventActive,
  isEventEnded,
  isEventOngoing,
  isEventUpcoming,
  validateEventForPublish,
  normalizeEventDescription,
  normalizeDateStr,
  ScheduleClassificationOptions,
} from '../utils/event-display.util';
import { normalizeWebsiteForStorage } from '../utils/website-url.util';
import imageCompression from 'browser-image-compression';

/** Types every browser can display, so the original may be uploaded if compressing it fails. */
const DISPLAYABLE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

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
    'website',
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
    'website',
    'google_business_link',
    'location',
    'offerings',
    'opening_times',
    'logo',
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
   * Builds a strictly validated and sanitized provider update payload matching canonical VAMO semantics.
   * Strips all protected and translation metadata fields, preserving canonical full payload semantics.
   */
  buildSafeProviderPayload(
    data: Partial<Provider>,
    original?: Partial<Provider>
  ): Record<string, any> {
    const payload: Record<string, any> = {};

    if (data.name !== undefined) {
      payload['name'] = data.name;
    }
    if (data.business_type !== undefined) {
      payload['business_type'] = data.business_type;
    }
    if (data.description !== undefined) {
      payload['description'] = data.description;
    }
    if (data.address !== undefined) {
      payload['address'] = data.address;
    }
    if (data.city !== undefined) {
      payload['city'] = data.city;
    }
    if (data.email !== undefined) {
      payload['email'] = data.email?.trim() || null;
    }
    if (data.phone !== undefined) {
      payload['phone'] = data.phone;
    }
    if (data.wa_number !== undefined) {
      payload['wa_number'] = data.wa_number?.trim() || null;
    }
    if (data.facebook !== undefined) {
      payload['facebook'] = data.facebook;
    }
    if (data.instagram !== undefined) {
      payload['instagram'] = data.instagram;
    }
    if (data.google_business_link !== undefined) {
      payload['google_business_link'] = data.google_business_link;
    }
    if (data.website !== undefined) {
      payload['website'] = normalizeWebsiteForStorage(data.website);
    }
    if (data.location !== undefined) {
      payload['location'] = data.location ?? null;
    }
    if (data.offerings !== undefined) {
      payload['offerings'] = Array.isArray(data.offerings) ? data.offerings : [];
    }
    if (data.opening_times !== undefined) {
      payload['opening_times'] = (data.opening_times || []).map((ot) => ({
        day: ot.day,
        opens_at: ot.opens_at || null,
        closes_at: ot.closes_at || null,
        break_from: ot.break_from || null,
        break_to: ot.break_to || null,
        closed: ot.closed,
      }));
    }
    if (data.logo !== undefined) {
      payload['logo'] =
        typeof data.logo === 'object' && data.logo !== null
          ? (data.logo as any).id
          : data.logo ?? null;
    }

    // Defensive: immutable / protected fields must never be sent on provider update
    delete payload['images'];
    delete payload['translations'];
    delete payload['translation_status'];
    delete payload['status'];

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
        updateItem('providers', id, payload as any, {
          fields: this.providerReadFields as any,
        })
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
   * Client-side image compression matching VAMO mobile app (maxSizeMB: 0.6, maxWidthOrHeight: 1200).
   * Falls back to the original file when compression fails only if the format is displayable in browsers;
   * throws for unsupported/undisplayable formats (e.g. HEIC when browser cannot decode it).
   */
  protected async compressImage(
    file: File,
    maxDimension = 1200,
    maxSizeMB = 0.6
  ): Promise<File> {
    if (
      typeof window === 'undefined' ||
      !file.type.startsWith('image/') ||
      file.type === 'image/svg+xml'
    ) {
      return file;
    }

    try {
      const compressed = await this.runImageCompression(file, maxDimension, maxSizeMB);
      if (compressed instanceof File) {
        return compressed;
      }
      return new File([compressed], file.name, { type: compressed.type || file.type });
    } catch (err) {
      if (DISPLAYABLE_IMAGE_TYPES.includes(file.type)) {
        return file;
      }
      throw err;
    }
  }

  protected runImageCompression(
    file: File,
    maxWidthOrHeight = 1200,
    maxSizeMB = 0.6
  ): Promise<Blob> {
    return imageCompression(file, {
      maxSizeMB,
      maxWidthOrHeight,
      useWebWorker: true,
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
   * Portal-side helper considering end time, overnight schedules, all-day, and open-ended.
   */
  isEventUpcomingOrOngoing(
    event: Partial<VamoEvent> | { startDate?: Date | string | null; endDate?: Date | string | null },
    options?: ScheduleClassificationOptions
  ): boolean {
    return isEventActive(event as any, options);
  }

  /**
   * Checks whether an event has ended/past in DR timezone.
   */
  isEventPast(
    event: Partial<VamoEvent> | { startDate?: Date | string | null; endDate?: Date | string | null },
    options?: ScheduleClassificationOptions
  ): boolean {
    return isEventEnded(event as any, options);
  }

  /**
   * Checks whether an event is ongoing in DR timezone.
   */
  isEventOngoing(
    event: Partial<VamoEvent> | { startDate?: Date | string | null; endDate?: Date | string | null },
    options?: ScheduleClassificationOptions
  ): boolean {
    return isEventOngoing(event as any, options);
  }

  /**
   * Checks whether an event is upcoming in DR timezone.
   */
  isEventUpcoming(
    event: Partial<VamoEvent> | { startDate?: Date | string | null; endDate?: Date | string | null },
    options?: ScheduleClassificationOptions
  ): boolean {
    return isEventUpcoming(event as any, options);
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
    'price_unit',
    'hasPromotion',
    'promoText',
    'location_point',
    'address',
    'is_main_banner',
    'is_whats_hot',
    'date_created',
    'date_updated',
    'images.id',
    'images.sort',
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
    if (typeof event.description === 'string') {
      event.description = normalizeEventDescription(event.description);
    }
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
    if (Array.isArray(event.images) && event.images.some((img: any) => typeof img?.sort === 'number')) {
      event.images = event.images
        .map((img, idx) => ({ img, idx }))
        .sort((a, b) => {
          const sa = typeof a.img?.sort === 'number' ? a.img.sort : Number.MAX_SAFE_INTEGER;
          const sb = typeof b.img?.sort === 'number' ? b.img.sort : Number.MAX_SAFE_INTEGER;
          return sa !== sb ? sa - sb : a.idx - b.idx;
        })
        .map((entry) => entry.img);
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

  /** Canonical quota query: published posts updated within the billing window. */
  async getPublishedPostCount(providerId: string, since: string): Promise<number> {
    return this.authService.safeRequest(async () => {
      const result = await directusClient.request(readItems('events', {
        filter: {
          provider: { id: { _eq: providerId } },
          status: { _eq: 'published' },
          date_updated: { _gte: since },
        },
        aggregate: { count: ['*'] },
      } as any));
      const count = (result as any)?.[0]?.count;
      const raw = typeof count === 'object' ? (count?.['*'] ?? count?.['id']) : count;
      const parsed = Number(raw);
      if (raw == null || !Number.isFinite(parsed) || parsed < 0) {
        throw new Error('Post usage could not be verified.');
      }
      return parsed;
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
    areaIds: string[] = [],
    orderedImages?: OrderedEventImage[]
  ): Promise<VamoEvent> {
    return this.authService.safeRequest(async () => {
      const isAllDay = Boolean(data.allDay);
      const isOpenEnd = !isAllDay && Boolean(data.openEnd);
      const normalizedStartDate = data.startDate !== undefined
        ? (data.startDate ? (normalizeDateStr(data.startDate) ?? null) : null)
        : undefined;
      const normalizedEndDate = data.endDate !== undefined
        ? (data.endDate ? (normalizeDateStr(data.endDate) ?? null) : null)
        : undefined;
      const normalizedFrom = isAllDay
        ? null
        : (data.from !== undefined
            ? (data.from ? (this.extractTime(data.from) ?? null) : null)
            : undefined);
      const normalizedTo = (isAllDay || isOpenEnd)
        ? null
        : (data.to !== undefined
            ? (data.to ? (this.extractTime(data.to) ?? null) : null)
            : undefined);
      const normalizedAllDay = isAllDay
        ? true
        : (isOpenEnd || data.allDay !== undefined ? false : undefined);

      if (data.status === 'published') {
        const validation = validateEventForPublish(
          {
            ...data,
            startDate: normalizedStartDate,
            endDate: normalizedEndDate,
            allDay: normalizedAllDay,
            openEnd: isOpenEnd,
            from: normalizedFrom,
            to: normalizedTo,
          },
          { hasImages: files.length > 0 || Boolean(orderedImages && orderedImages.length > 0), areaIds }
        );
        if (!validation.valid) throw new Error(validation.errorCode || 'INCOMPLETE_EVENT_DRAFT');
      }
      // 1. Build canonical payload matching create-event.page.ts buildPayload()
      const payload: Record<string, any> = {
        name: data.name ?? undefined,
        category: data.category ?? undefined,
        description: typeof data.description === 'string'
          ? normalizeEventDescription(data.description)
          : (data.description ?? undefined),
        location_point: data.location_point ?? null,
        address: data.address ?? null,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        allDay: normalizedAllDay,
        mode: data.mode!,
        recurring: typeof data.recurring === 'object' && data.recurring !== null
          ? JSON.stringify(data.recurring)
          : (typeof data.recurring === 'string' ? data.recurring : JSON.stringify({ days: [] })),
        from: normalizedFrom,
        to: normalizedTo,
        promotionStart: data.promotionStart !== undefined
          ? data.promotionStart
          : new Date().toISOString(),
        hasPromotion: data.hasPromotion,
        promoText: data.promoText,
        isFree: data.isFree,
        contactForPrice: data.contactForPrice,
        price: data.price,
        currency: data.isFree ? undefined : data.currency,
        price_unit: data.isFree || data.contactForPrice ? null : (data.price_unit ?? null),
        areas: {
          create: areaIds.map((aid) => ({ areas_id: aid })),
          update: [],
          delete: [],
        },
        status: data.status,
        ...(data.addon_expires_at !== undefined ? { addon_expires_at: data.addon_expires_at } : {}),
      };

      // Ensure translations, translation_status, and images are never in the primary event payload
      delete payload['translations'];
      delete payload['translation_status'];
      delete payload['images'];

      // Directus createItem
      const created = await directusClient.request<any>(createItem('events', payload as any));
      if (!created?.id) throw new Error('Failed to create event in Directus');

      // Upload and attach images if any (preserving explicit sort order when orderedImages provided)
      if (orderedImages && orderedImages.length > 0) {
        const filesToUpload = orderedImages.filter((img) => img.file).map((img) => img.file!);
        const fileIds = filesToUpload.length > 0 ? await this.uploadEventImages(filesToUpload) : [];
        let uploadIdx = 0;
        const create = orderedImages
          .map((img, sort) => {
            if (img.file) {
              const fid = fileIds[uploadIdx++];
              return fid ? { directus_files_id: fid, events_id: created.id, sort } : null;
            }
            return null;
          })
          .filter(Boolean);
        if (create.length > 0) {
          await directusClient.request(updateItem('events', created.id, {
            images: {
              create,
              update: [],
              delete: [],
            },
          } as any));
        }
      } else if (files.length > 0) {
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
   * Following canonical saveEventWithImages (event.service.ts):
   * 1. Primary write updates event record with metadata (including status, without images).
   * 2. Secondary write attaches/deletes images junction records ONLY if new files or removed junctions exist.
   * Translations and translation_status are strictly managed by Directus backend Flows and never sent.
   */
  async updateEvent(
    eventId: string,
    data: Partial<VamoEvent>,
    files: File[] = [],
    removedImageJunctionIds: (number | string)[] = [],
    areaIds?: string[],
    existingAreaJunctionIds: (number | string)[] = [],
    _deprecatedExistingEvent?: VamoEvent,
    orderedImages?: OrderedEventImage[]
  ): Promise<VamoEvent> {
    if (!eventId) throw new Error('Event ID is required');

    if (
      _deprecatedExistingEvent &&
      (_deprecatedExistingEvent.status === 'archived' ||
        (_deprecatedExistingEvent.status !== 'draft' && this.isEventPast(_deprecatedExistingEvent)))
    ) {
      throw new Error('PAST_EVENT_READ_ONLY');
    }

    return this.authService.safeRequest(async () => {
      // Portal-side guard: do not rely on cached/client-provided event argument.
      // Fetch and re-verify fresh persisted record from Directus.
      const persisted = await this.getEventById(eventId);
      const persistedProviderId =
        typeof (persisted as any).provider === 'string'
          ? (persisted as any).provider
          : (persisted as any).provider?.id;
      const currentProviderId = this.authService.currentUser?.provider_link?.id;
      if (persistedProviderId && currentProviderId && persistedProviderId !== currentProviderId) {
        const forbiddenErr: any = new Error('FORBIDDEN_NOT_EVENT_OWNER');
        forbiddenErr.status = 403;
        throw forbiddenErr;
      }
      if (persisted.status === 'archived' || (persisted.status !== 'draft' && this.isEventPast(persisted))) {
        throw new Error('PAST_EVENT_READ_ONLY');
      }

      const effectiveAllDay = data.allDay !== undefined
        ? Boolean(data.allDay)
        : Boolean(persisted.allDay);
      const effectiveOpenEnd = !effectiveAllDay && Boolean(
        data.openEnd !== undefined ? data.openEnd : persisted.openEnd
      );

      const targetStatus = data.status || persisted.status;
      if (targetStatus === 'published') {
        const retainedImages = persisted.images?.filter(image =>
          !removedImageJunctionIds.some(id => String(id) === String(image.id))
        ) || [];
        const candidateForValidation: Partial<VamoEvent> = {
          ...persisted,
          ...data,
          allDay: effectiveAllDay,
          openEnd: effectiveOpenEnd,
          from: effectiveAllDay ? null : (data.from !== undefined ? data.from : persisted.from),
          to: (effectiveAllDay || effectiveOpenEnd)
            ? null
            : (data.to !== undefined ? data.to : persisted.to),
          endDate: data.endDate !== undefined ? data.endDate : persisted.endDate,
          images: retainedImages,
        };
        const validation = validateEventForPublish(candidateForValidation, {
          originalEvent: persisted,
          hasImages: files.length > 0 || retainedImages.some(image => {
            const file = image.directus_files_id;
            return typeof file === 'string' ? !!file : !!file?.id;
          }),
          areaIds,
        });
        if (!validation.valid) throw new Error(validation.errorCode || 'INCOMPLETE_EVENT_DRAFT');
      }

      const payload: Record<string, any> = {};

      if (data.name !== undefined) payload['name'] = data.name ?? undefined;
      if (data.category !== undefined) payload['category'] = data.category ?? undefined;
      if (data.description !== undefined) {
        payload['description'] = typeof data.description === 'string'
          ? normalizeEventDescription(data.description)
          : (data.description ?? undefined);
      }
      if (data.location_point !== undefined) payload['location_point'] = data.location_point ?? null;
      if (data.address !== undefined) payload['address'] = data.address ?? null;
      if (data.startDate !== undefined) {
        payload['startDate'] = data.startDate ? (normalizeDateStr(data.startDate) ?? null) : null;
      }
      if (data.endDate !== undefined) {
        payload['endDate'] = data.endDate ? (normalizeDateStr(data.endDate) ?? null) : null;
      }
      if (data.mode !== undefined) payload['mode'] = data.mode;
      if (data.recurring !== undefined) {
        payload['recurring'] = typeof data.recurring === 'object' && data.recurring !== null
          ? JSON.stringify(data.recurring)
          : (typeof data.recurring === 'string' ? data.recurring : JSON.stringify({ days: [] }));
      }
      if (effectiveAllDay) {
        payload['allDay'] = true;
        payload['from'] = null;
        payload['to'] = null;
      } else {
        if (data.allDay !== undefined || data.openEnd) {
          payload['allDay'] = false;
        }
        if (data.from !== undefined) {
          payload['from'] = data.from ? (this.extractTime(data.from) ?? null) : null;
        }
        if (data.openEnd) {
          payload['to'] = null;
        } else if (data.to !== undefined || data.openEnd === false) {
          payload['to'] = data.to ? (this.extractTime(data.to) ?? null) : null;
        }
      }
      if (data.hasPromotion !== undefined) payload['hasPromotion'] = data.hasPromotion;
      if (data.promoText !== undefined) payload['promoText'] = data.promoText;
      if (data.isFree !== undefined) payload['isFree'] = data.isFree;
      if (data.contactForPrice !== undefined) payload['contactForPrice'] = data.contactForPrice;
      if (data.price !== undefined) payload['price'] = data.price;
      if (data.currency !== undefined || data.isFree !== undefined) {
        payload['currency'] = data.isFree ? undefined : data.currency;
      }
      if (data.price_unit !== undefined || data.isFree !== undefined || data.contactForPrice !== undefined) {
        payload['price_unit'] = (data.isFree || data.contactForPrice) ? null : (data.price_unit ?? null);
      }
      if (data.status !== undefined) payload['status'] = data.status;
      if (data.addon_expires_at !== undefined) payload['addon_expires_at'] = data.addon_expires_at;

      // Handle area updates matching canonical nested shape
      if (areaIds !== undefined) {
        payload['areas'] = {
          create: areaIds.map((aid) => ({ areas_id: aid })),
          update: [],
          delete: existingAreaJunctionIds,
        };
      }

      // Ensure translations, translation_status, images, and promotionStart are never in the primary event payload on edit
      delete payload['translations'];
      delete payload['translation_status'];
      delete payload['images'];
      delete payload['promotionStart'];

      // 1. Primary write: update event record with metadata (including status, triggering Translate Event Flow if published)
      await directusClient.request(updateItem('events', eventId, payload as any));

      // 2. Secondary write: attach/reorder/delete images junction records matching canonical saveEventWithImages
      if (orderedImages !== undefined) {
        if (orderedImages.length > 0 || removedImageJunctionIds.length > 0) {
          const filesToUpload = orderedImages.filter((img) => img.file).map((img) => img.file!);
          const newFileIds = filesToUpload.length > 0 ? await this.uploadEventImages(filesToUpload) : [];
          let uploadIdx = 0;
          const create: { directus_files_id: string; events_id: string; sort: number }[] = [];
          const update: { id: number | string; sort: number }[] = [];
          orderedImages.forEach((img, sort) => {
            if (img.junctionId != null) {
              update.push({ id: img.junctionId, sort });
            } else if (img.file) {
              const fid = newFileIds[uploadIdx++];
              if (fid) {
                create.push({ directus_files_id: fid, events_id: eventId, sort });
              }
            }
          });
          await directusClient.request(updateItem('events', eventId, {
            images: {
              create,
              update,
              delete: removedImageJunctionIds,
            },
          } as any));
        }
      } else if (files.length > 0 || removedImageJunctionIds.length > 0) {
        const newFileIds = files.length > 0 ? await this.uploadEventImages(files) : [];
        await directusClient.request(updateItem('events', eventId, {
          images: {
            create: newFileIds.map((fid) => ({ directus_files_id: fid, events_id: eventId })),
            update: [],
            delete: removedImageJunctionIds,
          },
        } as any));
      }

      // Read back updated event, with resilient fallback to prevent false "save failed" states
      try {
        return await this.getEventById(eventId);
      } catch (readErr) {
        console.warn('[BusinessService] Post-update getEventById failed, returning synthesized event record:', readErr);
        return this.normalizeEvent({
          ...persisted,
          ...data,
          ...payload,
          id: eventId,
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
   * Portal-side guard: verifies that past events cannot be paused into editable drafts.
   */
  async pauseEvent(eventId: string): Promise<void> {
    if (!eventId) throw new Error('Event ID is required');

    return this.authService.safeRequest(async () => {
      const event = await this.getEventById(eventId);
      if (this.isEventPast(event) || event.status === 'archived') {
        throw new Error('PAST_EVENT_CANNOT_BE_PAUSED');
      }

      await directusClient.request(updateItem('events', eventId, { status: 'draft' } as any));
    });
  }

  /**
   * Publishes a draft event (sets status to 'published').
   * Portal-side guard: validates completeness of draft (name, category, description, images, schedule).
   */
  async publishEvent(eventId: string, addonExpiresAt?: string | null): Promise<void> {
    if (!eventId) throw new Error('Event ID is required');

    return this.authService.safeRequest(async () => {
      const event = await this.getEventById(eventId);
      const validation = validateEventForPublish(
        event.allDay ? { ...event, allDay: true, from: null, to: null } : event
      );
      if (!validation.valid) {
        throw new Error(validation.errorCode || 'INCOMPLETE_EVENT_DRAFT');
      }

      await directusClient.request(updateItem('events', eventId, {
        status: 'published',
        ...(event.allDay ? { allDay: true, from: null, to: null } : {}),
        ...(addonExpiresAt !== undefined ? { addon_expires_at: addonExpiresAt } : {}),
      } as any));
    });
  }

  /**
   * Duplicates an existing event as a draft matching canonical event.service.ts duplicateEventAsDraft.
   */
  async duplicateEventAsDraft(event: VamoEvent): Promise<string> {
    return this.authService.safeRequest(async () => {
      const isAllDay = Boolean(event.allDay);
      const isOpenEnd = !isAllDay && Boolean(event.openEnd);
      const payload: Record<string, any> = {
        status: 'draft',
        name: event.name ? `${event.name} (Copy)` : 'Untitled Copy',
        description: typeof event.description === 'string'
          ? normalizeEventDescription(event.description)
          : event.description,
        location_point: event.location_point ?? null,
        address: event.address ?? null,
        category: event.category,
        mode: event.mode,
        startDate: event.startDate ? (normalizeDateStr(event.startDate) ?? null) : null,
        endDate: event.endDate ? (normalizeDateStr(event.endDate) ?? null) : null,
        from: isAllDay ? null : (event.from ? (this.extractTime(event.from) ?? null) : null),
        to: (isAllDay || isOpenEnd) ? null : (event.to ? (this.extractTime(event.to) ?? null) : null),
        allDay: isAllDay,
        recurring: typeof event.recurring === 'object' && event.recurring !== null
          ? JSON.stringify(event.recurring)
          : (typeof event.recurring === 'string' ? event.recurring : JSON.stringify({ days: [] })),
        isFree: event.isFree,
        contactForPrice: event.contactForPrice,
        price: event.price,
        currency: event.currency,
        price_unit: event.isFree || event.contactForPrice ? null : (event.price_unit ?? null),
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
            create: fileIds.map((fileId: string, sort: number) => ({
              directus_files_id: fileId,
              events_id: newEvent.id,
              ...(fileIds.length > 1 ? { sort } : {}),
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
   * Fetches published areas from Directus matching canonical VAMO OnboardingService.getAreas().
   */
  async getAreas(): Promise<Area[]> {
    return this.authService.safeRequest(async () => {
      const areas = await directusClient.request<Area[]>(
        readItems('areas', {
          filter: { status: { _eq: 'published' } },
          sort: ['sort', 'name'] as any,
          fields: ['id', 'name', 'slug', 'emoji', 'latitude', 'longitude'] as any,
        })
      );
      return (areas || []).filter(
        (area: any) => !area?.status || area.status === 'published'
      );
    });
  }

  /**
   * Computes stats summary for the provider's events.
   */
  calculateStats(events: VamoEvent[]): ProviderEventStats {
    return calculateSharedEventStats(events, this);
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
