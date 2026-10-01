import { Injectable, inject } from '@angular/core';
import { readItems } from '@directus/sdk';
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
