// ── Timezone-aware helpers (no external deps, Workers-safe) ──
// Cloudflare Workers ship full ICU/Intl support, so we lean on
// Intl.DateTimeFormat to deal with Europe/Rome's CET/CEST switch instead of
// hardcoding UTC offsets.

const partsFormatterCache = new Map();

function getPartsFormatter(timeZone) {
  if (!partsFormatterCache.has(timeZone)) {
    partsFormatterCache.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    );
  }
  return partsFormatterCache.get(timeZone);
}

function formatToObject(date, timeZone) {
  const parts = getPartsFormatter(timeZone).formatToParts(date);
  const o = {};
  for (const p of parts) {
    if (p.type !== 'literal') o[p.type] = parseInt(p.value, 10);
  }
  // Intl reports midnight as hour 24 with hour12:false in some engines.
  if (o.hour === 24) o.hour = 0;
  return o;
}

/** Returns { year, month, day, hour, minute, weekday(0-6) } for "now" in timeZone. */
export function nowInTimeZone(timeZone) {
  const now = new Date();
  const o = formatToObject(now, timeZone);
  const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
  const weekdayShort = weekdayFmt.format(now);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { ...o, weekday: map[weekdayShort], instant: now };
}

/** Converts a local wall-clock date/time (Y, M(1-12), D, hh, mm) in `timeZone` into a UTC Date. */
export function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const seen = formatToObject(new Date(guessUtcMs), timeZone);
  const seenUtcMs = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
  const diff = guessUtcMs - seenUtcMs;
  return new Date(guessUtcMs + diff);
}

/** Weekday (0-6, Sun-Sat) of a Y-M-D date, evaluated as a calendar date (no time zone shift). */
export function weekdayOf(year, month, day) {
  // Noon UTC avoids any DST/date-boundary ambiguity for pure calendar-date math.
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

export function addDays(year, month, day, delta) {
  const d = new Date(Date.UTC(year, month - 1, day, 12));
  d.setUTCDate(d.getUTCDate() + delta);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function toDateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map((n) => parseInt(n, 10));
  return { year: y, month: m, day: d };
}

export function parseTimeKey(key) {
  const [h, m] = key.split(':').map((n) => parseInt(n, 10));
  return { hour: h, minute: m };
}

export function minutesToTimeKey(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timeKeyToMinutes(key) {
  const { hour, minute } = parseTimeKey(key);
  return hour * 60 + minute;
}
