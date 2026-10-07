import { describe, it, expect } from 'vitest';
import {
  getDrCurrentDateTime,
  validateSchedule,
  ScheduleValidationOptions,
} from './date-validation.util';

describe('Date & Time Validation Utilities', () => {
  it('returns valid Dominican Republic date and time', () => {
    const { todayStr, currentTimeStr } = getDrCurrentDateTime();
    expect(todayStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(currentTimeStr).toMatch(/^\d{2}:\d{2}$/);
  });

  it('rejects start date in the past for new single-event listings', () => {
    const res = validateSchedule({
      mode: 'single',
      startDate: '2020-01-01',
      forPublish: true,
    });
    expect(res.valid).toBe(false);
    expect(res.errorCode).toBe('START_DATE_PAST_ERROR');
    expect(res.field).toBe('startDate');
  });

  it('rejects start date in the past even when saving draft if start date is provided', () => {
    const res = validateSchedule({
      mode: 'single',
      startDate: '2020-01-01',
      forPublish: false,
    });
    expect(res.valid).toBe(false);
    expect(res.errorCode).toBe('START_DATE_PAST_ERROR');
  });

  it('allows saving draft with empty start date', () => {
    const res = validateSchedule({
      mode: 'single',
      startDate: '',
      forPublish: false,
    });
    expect(res.valid).toBe(true);
  });

  it('rejects publishing when start date is empty', () => {
    const res = validateSchedule({
      mode: 'single',
      startDate: '',
      forPublish: true,
    });
    expect(res.valid).toBe(false);
    expect(res.errorCode).toBe('START_DATE_REQUIRED');
  });

  it('when start date is today, disallows start time earlier than current DR time', () => {
    const { todayStr } = getDrCurrentDateTime();

    const res = validateSchedule({
      mode: 'single',
      startDate: todayStr,
      from: '00:01', // earlier than any realistic daytime unless exactly midnight
      allDay: false,
      forPublish: true,
    });
    // If current time is past 00:01
    const { currentTimeStr } = getDrCurrentDateTime();
    if (currentTimeStr > '00:01') {
      expect(res.valid).toBe(false);
      expect(res.errorCode).toBe('START_TIME_PAST_ERROR');
    }
  });

  it('allows earlier clock time on future dates', () => {
    const res = validateSchedule({
      mode: 'single',
      startDate: '2030-01-01',
      from: '06:00',
      to: '10:00',
      allDay: false,
      openEnd: false,
      forPublish: true,
    });
    expect(res.valid).toBe(true);
  });

  it('does not reject all-day events starting today', () => {
    const { todayStr } = getDrCurrentDateTime();
    const res = validateSchedule({
      mode: 'single',
      startDate: todayStr,
      allDay: true,
      forPublish: true,
    });
    expect(res.valid).toBe(true);
  });

  it('does not reject recurring times just because that clock time passed today', () => {
    const res = validateSchedule({
      mode: 'recurring',
      recurringDays: ['fri'],
      from: '00:01',
      to: '02:00',
      allDay: false,
      forPublish: true,
    });
    expect(res.valid).toBe(true);
  });

  it('rejects same-day end time earlier than start time', () => {
    const res = validateSchedule({
      mode: 'single',
      startDate: '2030-05-10',
      from: '20:00',
      to: '18:00', // earlier!
      allDay: false,
      openEnd: false,
      forPublish: true,
    });
    expect(res.valid).toBe(false);
    expect(res.errorCode).toBe('END_TIME_BEFORE_START_ERROR');
  });

  it('allows earlier end clock time on multi-day events when end date > start date', () => {
    const res = validateSchedule({
      mode: 'single',
      startDate: '2030-05-10', // Friday
      endDate: '2030-05-11',   // Saturday
      multiDay: true,
      from: '22:00',
      to: '02:00', // Saturday 2 AM
      allDay: false,
      openEnd: false,
      forPublish: true,
    });
    expect(res.valid).toBe(true);
  });

  it('rejects multi-day event when end date is earlier than start date', () => {
    const res = validateSchedule({
      mode: 'single',
      startDate: '2030-05-10',
      endDate: '2030-05-09',
      multiDay: true,
      forPublish: true,
    });
    expect(res.valid).toBe(false);
    expect(res.errorCode).toBe('END_DATE_BEFORE_START_ERROR');
  });

  it('does not block legitimate edits to ongoing events with unchanged past start date', () => {
    const res = validateSchedule({
      mode: 'single',
      startDate: '2026-01-01',
      endDate: '2030-01-01',
      multiDay: true,
      allDay: true,
      isEditMode: true,
      isOngoing: true,
      originalStartDate: '2026-01-01',
      forPublish: true,
    });
    expect(res.valid).toBe(true);
  });
});
