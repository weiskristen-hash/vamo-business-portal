import { describe, it, expect, vi } from 'vitest';
import {
  getEventCoverImageFileId,
  getEventCoverImageUrl,
  isEventActive,
  isEventPast,
  getNormalizedEventStatus,
  getEventStatusBadge,
  formatEventSchedule,
  formatEventTimeWindow,
  calculateSharedEventStats,
  canEditEvent,
} from './event-display.util';
import { VamoEvent } from '../models/event.model';

describe('Event Display Utilities', () => {
  const mockBusinessService = {
    getAssetUrl: vi.fn((fileId: string, transform?: string) => `https://api.vamo-app.com/assets/${fileId}?${transform || ''}`),
    isEventUpcomingOrOngoing: vi.fn((event: any) => {
      const end = event.endDate || event.startDate;
      return end >= '2026-10-07';
    }),
  } as any;

  const mockI18n = {
    t: vi.fn((key: string) => {
      const map: Record<string, string> = {
        'PORTAL.LISTINGS.STATUS_DRAFT': 'Draft',
        'PORTAL.LISTINGS.STATUS_ARCHIVED': 'Archived',
        'PORTAL.LISTINGS.STATUS_ACTIVE': 'Active',
        'PORTAL.LISTINGS.STATUS_PAST': 'Past',
        'PORTAL.LISTINGS.ALL_DAY': 'All Day',
        'PORTAL.LISTINGS.OPEN_END': 'Open End',
        'PORTAL.LISTINGS.DATE_TBA': 'Date TBA',
        'PORTAL.LISTINGS.MODE_RECURRING': 'Weekly Recurring',
        'EVENTS.RECURRING.EVERY': 'Every',
        'EVENTS.RECURRING.DAYS.fri': 'Fri',
        'EVENTS.RECURRING.DAYS.sat': 'Sat',
      };
      return map[key] || key;
    }),
    dateLocale: vi.fn().mockReturnValue('en-US'),
  } as any;

  it('resolves image file ID from string and from { id: string } object', () => {
    const eventWithString: VamoEvent = {
      id: '1',
      name: 'Event 1',
      status: 'published',
      images: [{ directus_files_id: 'file-123' }],
    };
    expect(getEventCoverImageFileId(eventWithString)).toBe('file-123');
    expect(getEventCoverImageUrl(eventWithString, mockBusinessService)).toContain('file-123');

    const eventWithObj: VamoEvent = {
      id: '2',
      name: 'Event 2',
      status: 'published',
      images: [{ directus_files_id: { id: 'file-456' } as any }],
    };
    expect(getEventCoverImageFileId(eventWithObj)).toBe('file-456');
    expect(getEventCoverImageUrl(eventWithObj, mockBusinessService)).toContain('file-456');

    const eventNoImages: VamoEvent = {
      id: '3',
      name: 'Event 3',
      status: 'draft',
      images: [],
    };
    expect(getEventCoverImageFileId(eventNoImages)).toBeNull();
    expect(getEventCoverImageUrl(eventNoImages, mockBusinessService)).toBe('/assets/placeholder.png');
  });

  it('determines event active and past statuses correctly', () => {
    const activeEvent: VamoEvent = {
      id: 'act-1',
      name: 'Active Future Event',
      status: 'published',
      startDate: '2026-10-15',
    };
    expect(isEventActive(activeEvent, mockBusinessService)).toBe(true);
    expect(isEventPast(activeEvent, mockBusinessService)).toBe(false);
    expect(canEditEvent(activeEvent, mockBusinessService)).toBe(true);

    const recurringEvent: VamoEvent = {
      id: 'rec-1',
      name: 'Recurring Event',
      status: 'published',
      mode: 'recurring',
      recurring: { days: ['fri', 'sat'] },
    };
    expect(isEventActive(recurringEvent, mockBusinessService)).toBe(true);
    expect(isEventPast(recurringEvent, mockBusinessService)).toBe(false);

    const pastEvent: VamoEvent = {
      id: 'past-1',
      name: 'Past Expired Event',
      status: 'published',
      mode: 'single',
      startDate: '2026-09-01',
    };
    expect(isEventActive(pastEvent, mockBusinessService)).toBe(false);
    expect(isEventPast(pastEvent, mockBusinessService)).toBe(true);
    expect(canEditEvent(pastEvent, mockBusinessService)).toBe(false);

    const draftEvent: VamoEvent = {
      id: 'draft-1',
      name: 'Draft Event',
      status: 'draft',
    };
    expect(isEventActive(draftEvent, mockBusinessService)).toBe(false);
    expect(isEventPast(draftEvent, mockBusinessService)).toBe(false);
    expect(canEditEvent(draftEvent, mockBusinessService)).toBe(true);
  });

  it('calculates shared stats agreeing between Overview and Listings', () => {
    const events: VamoEvent[] = [
      { id: '1', name: 'Draft 1', status: 'draft' },
      { id: '2', name: 'Draft 2', status: 'draft' },
      { id: '3', name: 'Active 1', status: 'published', startDate: '2026-10-15' },
      { id: '4', name: 'Recurring 1', status: 'published', mode: 'recurring' },
      { id: '5', name: 'Past 1', status: 'published', mode: 'single', startDate: '2026-09-01' },
      { id: '6', name: 'Archived 1', status: 'archived' },
    ];

    const stats = calculateSharedEventStats(events, mockBusinessService);
    expect(stats.total).toBe(6);
    expect(stats.draft).toBe(2);
    expect(stats.active).toBe(2);
    expect(stats.past).toBe(2); // 1 past published + 1 archived
    expect(stats.archived).toBe(1);
  });

  it('formats schedule and time window', () => {
    const singleEvent: VamoEvent = {
      id: '1',
      name: 'Single',
      status: 'published',
      startDate: '2026-10-15',
      from: '19:00:00',
      to: '22:00:00',
    };
    expect(formatEventSchedule(singleEvent, mockI18n)).toContain('Oct 15, 2026');
    expect(formatEventTimeWindow(singleEvent, mockI18n)).toBe('19:00 – 22:00');

    const allDayEvent: VamoEvent = {
      id: '2',
      name: 'All Day',
      status: 'published',
      startDate: '2026-10-15',
      allDay: true,
    };
    expect(formatEventTimeWindow(allDayEvent, mockI18n)).toBe('All Day');

    const openEndEvent: VamoEvent = {
      id: '3',
      name: 'Open End',
      status: 'published',
      startDate: '2026-10-15',
      from: '20:00',
      openEnd: true,
    };
    expect(formatEventTimeWindow(openEndEvent, mockI18n)).toBe('20:00 · Open End');
  });

  it('returns appropriate status badges', () => {
    const activeBadge = getEventStatusBadge(
      { id: '1', name: 'Active', status: 'published', startDate: '2026-10-15' },
      mockBusinessService,
      mockI18n
    );
    expect(activeBadge.status).toBe('active');
    expect(activeBadge.cssClass).toBe('badge-success');

    const pastBadge = getEventStatusBadge(
      { id: '2', name: 'Past', status: 'published', startDate: '2026-09-01' },
      mockBusinessService,
      mockI18n
    );
    expect(pastBadge.status).toBe('past');
    expect(pastBadge.cssClass).toBe('badge-neutral');
  });
});
