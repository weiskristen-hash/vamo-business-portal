import { VamoEvent } from '../models/event.model';
import { BusinessService } from '../services/business.service';
import { I18nService } from '../i18n/i18n.service';
import { getDrCurrentDateTime, addDaysToDateStr } from './date-validation.util';

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

export interface ScheduleClassificationOptions {
  now?: Date | number;
  drNowMs?: Date | number;
  todayStr?: string;
  drTodayStr?: string;
  currentTimeStr?: string;
  drTimeStr?: string;
}

export interface PublishValidationResult {
  valid: boolean;
  errorCode: string | null;
  messageKey: string;
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
 * Normalizes date to YYYY-MM-DD.
 */
export function normalizeDateStr(val?: Date | string | null): string | null {
  if (!val) return null;
  if (typeof val === 'string') {
    return val.split('T')[0];
  }
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  return null;
}

/**
 * Normalizes time to HH:mm.
 */
export function normalizeTimeStr(val?: string | null): string | null {
  if (!val) return null;
  if (val.includes('T')) {
    return val.split('T')[1].substring(0, 5);
  }
  return val.substring(0, 5);
}

/**
 * Unified schedule-classification: checks if an event has already ended in Dominican Republic time.
 * - Archived events: always ended.
 * - Recurring events: repeat weekly, not ended unless archived.
 * - All-day events: stay active through 23:59:59 of applicable end day.
 * - Open-ended events: stay active through 23:59:59 of applicable end day (without inventing arbitrary durations).
 * - Timed events: end on end date + end time (accounting for overnight schedules).
 */
export function isEventEnded(
  event: Partial<VamoEvent> | null | undefined,
  options?: ScheduleClassificationOptions
): boolean {
  if (!event) return true;
  if (event.status === 'archived') return true;
  if (event.mode === 'recurring') return false;

  const startDay = normalizeDateStr(event.startDate);
  const endDay = normalizeDateStr(event.endDate) || startDay;
  if (!startDay && !endDay) return false;

  const refNow = options?.now ?? options?.drNowMs;
  const dr = getDrCurrentDateTime(refNow);
  const todayStr = options?.todayStr || options?.drTodayStr || dr.todayStr;
  const currentTimeStr = options?.currentTimeStr || options?.drTimeStr || dr.currentTimeStr;

  // All-day: active until 23:59:59 of effective end date
  if (event.allDay) {
    return !!endDay && todayStr > endDay;
  }

  // Open-ended: no end time specified; stays active through end of start/end calendar day
  const isOpenEnd = !!event.openEnd || (!event.allDay && !event.to);
  if (isOpenEnd) {
    return !!endDay && todayStr > endDay;
  }

  // Timed event with explicit end time 'to'
  const from = normalizeTimeStr(event.from);
  const to = normalizeTimeStr(event.to);

  let endingDate = endDay || startDay!;
  // Check for overnight schedule on same-day event (e.g. 22:00 to 02:00)
  if ((!event.endDate || event.endDate === startDay) && from && to && to < from) {
    endingDate = addDaysToDateStr(startDay!, 1);
  }

  if (todayStr > endingDate) return true;
  if (todayStr === endingDate && to && currentTimeStr >= to) return true;
  return false;
}

/**
 * Unified schedule-classification: checks if an event has not yet started in DR time.
 */
export function isEventUpcoming(
  event: Partial<VamoEvent> | null | undefined,
  options?: ScheduleClassificationOptions
): boolean {
  if (!event) return false;
  if (event.status === 'archived') return false;
  if (event.mode === 'recurring') return false;

  const startDay = normalizeDateStr(event.startDate);
  if (!startDay) return false;

  const refNow = options?.now ?? options?.drNowMs;
  const dr = getDrCurrentDateTime(refNow);
  const todayStr = options?.todayStr || options?.drTodayStr || dr.todayStr;
  const currentTimeStr = options?.currentTimeStr || options?.drTimeStr || dr.currentTimeStr;

  if (todayStr < startDay) return true;
  if (todayStr === startDay) {
    if (event.allDay) return false;
    const from = normalizeTimeStr(event.from);
    if (from && currentTimeStr < from) return true;
  }
  return false;
}

/**
 * Unified schedule-classification: checks if an event is currently ongoing in DR time.
 */
export function isEventOngoing(
  event: Partial<VamoEvent> | null | undefined,
  options?: ScheduleClassificationOptions
): boolean {
  if (!event) return false;
  if (event.status === 'archived') return false;
  if (event.mode === 'recurring') return event.status === 'published';

  if (isEventEnded(event, options)) return false;
  if (isEventUpcoming(event, options)) return false;
  return !!normalizeDateStr(event.startDate);
}

/**
 * Checks if an event is currently active (upcoming or ongoing).
 * Published recurring events or published single/multi-day events not ended.
 */
export function isEventActive(
  event: VamoEvent | Partial<VamoEvent>,
  businessServiceOrOptions?: BusinessService | ScheduleClassificationOptions,
  options?: ScheduleClassificationOptions
): boolean {
  if (event.status !== 'published') return false;
  if (event.mode === 'recurring') return true;

  const opt = businessServiceOrOptions && typeof (businessServiceOrOptions as any).getAssetUrl !== 'function'
    ? (businessServiceOrOptions as ScheduleClassificationOptions)
    : options;

  return !isEventEnded(event, opt);
}

/**
 * Checks if an event is past / expired or archived.
 */
export function isEventPast(
  event: VamoEvent | Partial<VamoEvent>,
  businessServiceOrOptions?: BusinessService | ScheduleClassificationOptions,
  options?: ScheduleClassificationOptions
): boolean {
  if (event.status === 'archived') return true;
  if (event.mode === 'recurring') return false;

  const opt = businessServiceOrOptions && typeof (businessServiceOrOptions as any).getAssetUrl !== 'function'
    ? (businessServiceOrOptions as ScheduleClassificationOptions)
    : options;

  return isEventEnded(event, opt);
}

/**
 * Validates whether an event draft has all required fields, images, and schedule to be safely published.
 */
export function validateEventForPublish(
  event: Partial<VamoEvent> | null | undefined,
  options?: ScheduleClassificationOptions
): PublishValidationResult {
  if (!event) {
    return { valid: false, errorCode: 'EVENT_REQUIRED', messageKey: 'PORTAL.EVENT_EDITOR.VALIDATION.NAME_REQUIRED' };
  }

  // 1. Title / Name
  if (!event.name?.trim()) {
    return { valid: false, errorCode: 'NAME_REQUIRED', messageKey: 'PORTAL.EVENT_EDITOR.VALIDATION.NAME_REQUIRED' };
  }

  // 2. Category
  if (!event.category?.trim()) {
    return { valid: false, errorCode: 'CATEGORY_REQUIRED', messageKey: 'PORTAL.EVENT_EDITOR.VALIDATION.CATEGORY_REQUIRED' };
  }

  // 3. Description (min 10 characters)
  if (!event.description?.trim() || event.description.trim().length < 10) {
    return { valid: false, errorCode: 'DESC_MIN', messageKey: 'PORTAL.EVENT_EDITOR.VALIDATION.DESC_MIN' };
  }

  // 4. Images (at least 1 image junction or file attached)
  const hasImages = Array.isArray(event.images) && event.images.length > 0;
  if (!hasImages) {
    return { valid: false, errorCode: 'PHOTO_REQUIRED', messageKey: 'PORTAL.EVENT_EDITOR.VALIDATION.PHOTO_REQUIRED' };
  }

  // 5. Schedule
  const mode = event.mode || 'single';
  if (mode === 'single') {
    if (!event.startDate) {
      return { valid: false, errorCode: 'START_DATE_REQUIRED', messageKey: 'PORTAL.EVENT_EDITOR.VALIDATION.START_DATE_REQUIRED' };
    }

    if (event.endDate && normalizeDateStr(event.endDate)! < normalizeDateStr(event.startDate)!) {
      return { valid: false, errorCode: 'END_DATE_BEFORE_START', messageKey: 'PORTAL.LISTINGS.ERRORS.END_DATE_BEFORE_START' };
    }

    if (!event.allDay) {
      if (!event.from) {
        return { valid: false, errorCode: 'START_TIME_REQUIRED', messageKey: 'PORTAL.EVENT_EDITOR.VALIDATION.START_TIME_REQUIRED' };
      }
      const isOpenEnd = !!event.openEnd || !event.to;
      if (!isOpenEnd && !event.to) {
        return { valid: false, errorCode: 'END_TIME_REQUIRED', messageKey: 'PORTAL.EVENT_EDITOR.VALIDATION.END_TIME_REQUIRED' };
      }
    }

    // Must not be already ended/past in DR timezone
    if (isEventEnded(event, options)) {
      return { valid: false, errorCode: 'SCHEDULE_PAST_ERROR', messageKey: 'PORTAL.LISTINGS.ERRORS.START_DATE_PAST' };
    }
  } else if (mode === 'recurring') {
    const days = (event.recurring as any)?.days;
    if (!Array.isArray(days) || days.length === 0) {
      return { valid: false, errorCode: 'WEEKDAYS_REQUIRED', messageKey: 'PORTAL.EVENT_EDITOR.VALIDATION.WEEKDAYS_REQUIRED' };
    }

    if (!event.allDay) {
      if (!event.from) {
        return { valid: false, errorCode: 'START_TIME_REQUIRED', messageKey: 'PORTAL.EVENT_EDITOR.VALIDATION.START_TIME_REQUIRED' };
      }
      const isOpenEnd = !!event.openEnd || !event.to;
      if (!isOpenEnd && !event.to) {
        return { valid: false, errorCode: 'END_TIME_REQUIRED', messageKey: 'PORTAL.EVENT_EDITOR.VALIDATION.END_TIME_REQUIRED' };
      }
    }
  }

  return { valid: true, errorCode: null, messageKey: '' };
}

/**
 * Determines normalized status key: 'draft' | 'active' | 'past' | 'archived'.
 */
export function getNormalizedEventStatus(
  event: VamoEvent,
  businessService?: BusinessService
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
 * Drafts are editable. Past published or archived events are strictly read-only.
 */
export function canEditEvent(
  event: VamoEvent | Partial<VamoEvent>,
  businessService?: BusinessService
): boolean {
  if (event.status === 'draft') return true;
  return !isEventPast(event, businessService);
}
