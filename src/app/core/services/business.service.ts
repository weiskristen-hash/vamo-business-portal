import { Injectable, inject } from '@angular/core';
import { readItem, readItems, updateItem, uploadFiles } from '@directus/sdk';
import { directusClient } from '../directus/directus-client';
import { runtimeConfig } from '../config/runtime-config';
import { Provider } from '../models/provider.model';
import { VamoEvent, ProviderEventStats } from '../models/event.model';
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
   * Loads events scoped strictly to the specified provider ID.
   * Never queries all events or unscoped data.
   */
  async getEventsForProvider(providerId: string): Promise<VamoEvent[]> {
    if (!providerId) {
      return [];
    }

    return this.authService.safeRequest(async () => {
      const items = await directusClient.request<VamoEvent[]>(
        readItems('events', {
          fields: [
            'id',
            'status',
            'name',
            'description',
            'startDate',
            'endDate',
            'from',
            'to',
            'mode',
            'allDay',
            'date_created',
            'date_updated',
            'images.id',
            'images.directus_files_id',
          ] as any,
          filter: {
            provider: {
              id: { _eq: providerId },
            },
          } as any,
          sort: ['-date_created', '-startDate'] as any,
        })
      );
      return items || [];
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
