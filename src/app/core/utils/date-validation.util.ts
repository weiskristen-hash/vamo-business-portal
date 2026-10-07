/**
 * Dominican Republic timezone (UTC-4, no daylight saving time).
 */
export const DR_TIMEZONE_OFFSET_HOURS = -4;

/**
 * Returns the current date (YYYY-MM-DD) and current time (HH:mm) in Dominican Republic timezone.
 */
export function getDrCurrentDateTime(): { todayStr: string; currentTimeStr: string } {
  const drNow = new Date(Date.now() + DR_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000);
  const iso = drNow.toISOString();
  const todayStr = iso.split('T')[0];
  const currentTimeStr = iso.split('T')[1].substring(0, 5); // HH:mm
  return { todayStr, currentTimeStr };
}

export interface ScheduleValidationResult {
  valid: boolean;
  errorCode: string | null;
  field: 'startDate' | 'endDate' | 'from' | 'to' | 'recurring' | null;
}

export interface ScheduleValidationOptions {
  mode: 'single' | 'recurring';
  startDate?: string | null;
  endDate?: string | null;
  multiDay?: boolean;
  allDay?: boolean;
  openEnd?: boolean;
  from?: string | null;
  to?: string | null;
  recurringDays?: string[];
  forPublish: boolean;
  isEditMode?: boolean;
  originalStartDate?: string | null;
  isOngoing?: boolean;
  todayStr?: string;
  currentTimeStr?: string;
}

/**
 * Validates scheduling constraints for new events, drafts, updates, and copies.
 */
export function validateSchedule(options: ScheduleValidationOptions): ScheduleValidationResult {
  const {
    mode,
    startDate,
    endDate,
    multiDay,
    allDay,
    openEnd,
    from,
    to,
    recurringDays,
    forPublish,
    isEditMode,
    originalStartDate,
    isOngoing,
  } = options;

  const drCurrent = getDrCurrentDateTime();
  const todayStr = options.todayStr || drCurrent.todayStr;
  const currentTimeStr = options.currentTimeStr || drCurrent.currentTimeStr;

  if (mode === 'single') {
    // 1. Start date check
    if (!startDate) {
      if (forPublish) {
        return { valid: false, errorCode: 'START_DATE_REQUIRED', field: 'startDate' };
      }
    } else {
      // Check if start date is in the past
      const isUnchangedOngoingStart = isEditMode && isOngoing && originalStartDate === startDate;

      if (!isUnchangedOngoingStart && startDate < todayStr) {
        return { valid: false, errorCode: 'START_DATE_PAST_ERROR', field: 'startDate' };
      }

      // If start date is today and not all-day, start time cannot be earlier than current time
      if (!allDay && from) {
        if (!isUnchangedOngoingStart && startDate === todayStr && from < currentTimeStr) {
          return { valid: false, errorCode: 'START_TIME_PAST_ERROR', field: 'from' };
        }
      }
    }

    // 2. End date & multi-day checks
    if (multiDay) {
      if (!endDate) {
        if (forPublish) {
          return { valid: false, errorCode: 'END_DATE_REQUIRED', field: 'endDate' };
        }
      } else if (startDate && endDate < startDate) {
        return { valid: false, errorCode: 'END_DATE_BEFORE_START_ERROR', field: 'endDate' };
      }
    }

    // 3. Time validation
    if (!allDay) {
      if (forPublish && !from) {
        return { valid: false, errorCode: 'START_TIME_REQUIRED', field: 'from' };
      }

      if (!openEnd) {
        if (forPublish && !to) {
          return { valid: false, errorCode: 'END_TIME_REQUIRED', field: 'to' };
        }

        // When both from and to are present:
        if (from && to) {
          // If single day OR multi-day on the exact same start and end day:
          const isSameDay = !multiDay || (startDate && endDate && startDate === endDate);
          if (isSameDay) {
            if (to < from) {
              return { valid: false, errorCode: 'END_TIME_BEFORE_START_ERROR', field: 'to' };
            }
          }
          // Note: If multi-day and endDate > startDate, earlier end clock time is allowed (e.g. Fri 22:00 to Sat 02:00)
        }
      }
    }
  } else if (mode === 'recurring') {
    // Recurring mode
    if (forPublish) {
      if (!recurringDays || recurringDays.length === 0) {
        return { valid: false, errorCode: 'WEEKDAYS_REQUIRED', field: 'recurring' };
      }
    }

    if (!allDay) {
      if (forPublish && !from) {
        return { valid: false, errorCode: 'START_TIME_REQUIRED', field: 'from' };
      }

      if (!openEnd) {
        if (forPublish && !to) {
          return { valid: false, errorCode: 'END_TIME_REQUIRED', field: 'to' };
        }

        // In recurring weekly schedules, end time cannot be earlier than start time within the recurring day
        if (from && to && to < from) {
          return { valid: false, errorCode: 'END_TIME_BEFORE_START_ERROR', field: 'to' };
        }
      }
    }
  }

  return { valid: true, errorCode: null, field: null };
}
