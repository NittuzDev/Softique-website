import {
  BUSINESS_HOURS,
  BUFFER_MINUTES,
  MIN_LEAD_MINUTES,
  SLOT_STEP_MINUTES,
  TIMEZONE,
} from './config.js';
import {
  addDays,
  minutesToTimeKey,
  nowInTimeZone,
  parseDateKey,
  toDateKey,
  weekdayOf,
  zonedTimeToUtc,
} from './time.js';
import { freeBusyQuery } from './google.js';

/**
 * Computes available slots for `service` across `days` starting at `fromDateKey`.
 * Makes a single freeBusy call for the whole range to stay well within Google's
 * rate limits even if a customer flips through many days.
 */
export async function computeAvailability(env, { service, fromDateKey, days }) {
  const from = parseDateKey(fromDateKey);
  const rangeStart = zonedTimeToUtc(from.year, from.month, from.day, 0, 0, TIMEZONE);
  const last = addDays(from.year, from.month, from.day, days - 1);
  const rangeEnd = zonedTimeToUtc(last.year, last.month, last.day, 23, 59, TIMEZONE);

  const busyRaw = await freeBusyQuery(env, rangeStart.toISOString(), rangeEnd.toISOString());
  const busy = busyRaw.map((b) => ({
    start: Date.parse(b.start) - BUFFER_MINUTES * 60_000,
    end: Date.parse(b.end) + BUFFER_MINUTES * 60_000,
  }));

  const now = nowInTimeZone(TIMEZONE);
  const nowMs = now.instant.getTime();

  const result = [];
  let nextAvailable = null;

  for (let i = 0; i < days; i++) {
    const day = addDays(from.year, from.month, from.day, i);
    const dateKey = toDateKey(day.year, day.month, day.day);
    const weekday = weekdayOf(day.year, day.month, day.day);
    const hours = BUSINESS_HOURS[weekday];

    if (!hours) {
      result.push({ date: dateKey, closed: true, slots: [] });
      continue;
    }

    const [openH, openM] = hours.open.split(':').map(Number);
    const [closeH, closeM] = hours.close.split(':').map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;
    const slots = [];

    for (
      let startMin = openMinutes;
      startMin + service.duration <= closeMinutes;
      startMin += SLOT_STEP_MINUTES
    ) {
      const startHour = Math.floor(startMin / 60);
      const startMinute = startMin % 60;
      const slotStartUtc = zonedTimeToUtc(day.year, day.month, day.day, startHour, startMinute, TIMEZONE);
      const slotStartMs = slotStartUtc.getTime();
      const slotEndMs = slotStartMs + service.duration * 60_000;

      if (slotStartMs < nowMs + MIN_LEAD_MINUTES * 60_000) continue;

      const overlaps = busy.some((b) => slotStartMs < b.end && slotEndMs > b.start);
      if (overlaps) continue;

      slots.push({ start: minutesToTimeKey(startMin), end: minutesToTimeKey(startMin + service.duration) });
    }

    result.push({ date: dateKey, closed: false, slots });
    if (!nextAvailable && slots.length) {
      nextAvailable = { date: dateKey, start: slots[0].start };
    }
  }

  return { days: result, nextAvailable };
}
