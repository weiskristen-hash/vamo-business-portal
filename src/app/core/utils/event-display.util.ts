import { VamoEvent } from '../models/event.model';
import { BusinessService } from '../services/business.service';
import { I18nService } from '../i18n/i18n.service';

export interface EventStatusBadge {
  text: string;
  cssClass: string;
  status: 'draft' | 'active' | 'past' | 'archived';
}

export interface SharedEventStats {
  total: number;
  published: number;
  active: number;
  draft: number;
  past: number;
  archived: number;
}

/**
 * Extracts raw file ID from Directus images junction array,
 * handling both direct string ID and `{ id: string }` object formats.
 */
export function getEventCoverImageFileId(event: VamoEvent | null | undefined): string | null {
  if (!event?.images || event.images.length === 0) return null;
  const first = event.images[0]?.directus_files_id;
  if (!first) return null;
  if (typeof first === 'string') return first;
  if (typeof first === 'object' && 'id' in first) return (first as any).id || null;
  return null;
}

/**
 * Returns cover image URL with fallback to placeholder.
 */
export function getEventCoverImageUrl(
  event: VamoEvent | null | undefined,
  businessService: BusinessService,
  transform = 'width=600&height=400&fit=cover'
): string {
  const fileId = getEventCoverImageFileId(event);
  if (fileId) {
    return businessService.getAssetUrl(fileId, transform);
  }
  return '/assets/placeholder.png';
}

/**
 * Checks if an event is currently active / upcoming.
 * Published recurring events or published single/multi-day events ending today or in the future.
 */
export function isEventActive(event: VamoEvent, businessService: BusinessService): boolean {
  if (event.status !== 'published') return false;
  if (event.mode === 'recurring') return true;
  if (typeof businessService?.isEventUpcomingOrOngoing === 'function') {
    return businessService.isEventUpcomingOrOngoing(event);
  }
  return true;
}

/**
 * Checks if an event is past / expired or archived.
 */
export function isEventPast(event: VamoEvent, businessService: BusinessService): boolean {
  if (event.status === 'archived') return true;
  if (event.status === 'published' && event.mode !== 'recurring') {
    if (typeof businessService?.isEventUpcomingOrOngoing === 'function') {
      return !businessService.isEventUpcomingOrOngoing(event);
    }
    return false;
  }
  return false;
}

/**
 * Determines normalized status key: 'draft' | 'active' | 'past' | 'archived'.
 */
export function getNormalizedEventStatus(
  event: VamoEvent,
  businessService: BusinessService
): 'draft' | 'active' | 'past' | 'archived' {
  if (event.status === 'draft') return 'draft';
  if (event.status === 'archived') return 'archived';
  if (isEventActive(event, businessService)) return 'active';
  return 'past';
}

/**
 * Returns unified status badge presentation used by both Listings and Overview.
 */
export function getEventStatusBadge(
  event: VamoEvent,
  businessService: BusinessService,
  i18n: I18nService
): EventStatusBadge {
  const status = getNormalizedEventStatus(event, businessService);

  switch (status) {
    case 'draft':
      return {
        text: i18n.t('PORTAL.LISTINGS.STATUS_DRAFT'),
        cssClass: 'badge-warning',
        status: 'draft',
      };
    case 'archived':
      return {
        text: i18n.t('PORTAL.LISTINGS.STATUS_ARCHIVED'),
        cssClass: 'badge-neutral',
        status: 'archived',
      };
    case 'active':
      return {
        text: i18n.t('PORTAL.LISTINGS.STATUS_ACTIVE'),
        cssClass: 'badge-success',
        status: 'active',
      };
    case 'past':
    default:
      return {
        text: i18n.t('PORTAL.LISTINGS.STATUS_PAST'),
        cssClass: 'badge-neutral',
        status: 'past',
      };
  }
}

/**
 * Normalizes day abbreviation ('mon', 'tue', etc.) to full day key.
 */
function normalizeDayToFull(d: string): string {
  const map: Record<string, string> = {
    mon: 'monday',
    tue: 'tuesday',
    wed: 'wednesday',
    thu: 'thursday',
    fri: 'friday',
    sat: 'saturday',
    sun: 'sunday',
  };
  return map[d.toLowerCase()] || d.toLowerCase();
}

/**
 * Parses YYYY-MM-DD string into Date at local midnight without UTC day shift.
 */
export function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.split('T')[0].split('-').map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date(dateStr);
}

/**
 * Unified schedule formatting for single, multi-day, and recurring events.
 */
export function formatEventSchedule(event: VamoEvent, i18n: I18nService): string {
  if (event.mode === 'recurring') {
    const days = (event.recurring as any)?.days;
    if (Array.isArray(days) && days.length > 0) {
      const localizedDays = days
        .map((d: string) => {
          const shortKey = 'EVENTS.RECURRING.DAYS.' + d.toLowerCase();
          const translatedShort = i18n.t(shortKey);
          if (translatedShort && !translatedShort.startsWith('EVENTS.')) {
            return translatedShort;
          }
          const fullKey = 'DAYS.' + normalizeDayToFull(d);
          const translatedFull = i18n.t(fullKey);
          if (translatedFull && !translatedFull.startsWith('DAYS.')) {
            return translatedFull;
          }
          return d.charAt(0).toUpperCase() + d.slice(1);
        })
        .join(', ');
      const everyPrefix = i18n.t('EVENTS.RECURRING.EVERY') || 'Every';
      return `${everyPrefix} ${localizedDays}`;
    }
    return i18n.t('PORTAL.LISTINGS.MODE_RECURRING');
  }

  if (!event.startDate) return i18n.t('PORTAL.LISTINGS.DATE_TBA');

  const locale = i18n.dateLocale();
  try {
    const start = parseLocalDate(event.startDate).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    if (event.endDate) {
      const end = parseLocalDate(event.endDate).toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return `${start} – ${end}`;
    }

    return start;
  } catch {
    return event.startDate;
  }
}

/**
 * Unified time window formatting for all-day, open-ended, and standard windows.
 */
export function formatEventTimeWindow(event: VamoEvent, i18n: I18nService): string {
  if (event.allDay) return i18n.t('PORTAL.LISTINGS.ALL_DAY');
  if (!event.from) return '';

  const start = event.from.substring(0, 5);
  if (event.openEnd || !event.to) {
    return `${start} · ${i18n.t('PORTAL.LISTINGS.OPEN_END')}`;
  }

  const end = event.to.substring(0, 5);
  return `${start} – ${end}`;
}

/**
 * Unified event stats calculation shared across Overview and Listings.
 */
export function calculateSharedEventStats(
  events: VamoEvent[],
  businessService: BusinessService
): SharedEventStats {
  let active = 0;
  let draft = 0;
  let past = 0;
  let archived = 0;
  let published = 0;

  for (const ev of events) {
    if (ev.status === 'published') {
      published++;
    }
    if (ev.status === 'draft') {
      draft++;
    } else if (ev.status === 'archived') {
      archived++;
      past++;
    } else if (isEventActive(ev, businessService)) {
      active++;
    } else {
      past++;
    }
  }

  return {
    total: events.length,
    published,
    active,
    draft,
    past,
    archived,
  };
}

/**
 * Checks whether an event is eligible for editing.
 * Past events are strictly read-only.
 */
export function canEditEvent(event: VamoEvent, businessService: BusinessService): boolean {
  return !isEventPast(event, businessService);
}
