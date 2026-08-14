import {
  BOOKING_HORIZON_DAYS,
  BUFFER_MINUTES,
  MIN_LEAD_MINUTES,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_SECONDS,
  SERVICES,
  TIMEZONE,
  getServiceById,
} from './config.js';
import { computeAvailability } from './availability.js';
import { freeBusyQuery } from './google.js';
import { sendNtfy } from './ntfy.js';
import { nowInTimeZone, parseDateKey, parseTimeKey, toDateKey, zonedTimeToUtc } from './time.js';

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function badRequest(message) {
  return json({ error: message }, 400);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PHONE_RE = /^[0-9+\s().-]{6,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function checkRateLimit(env, ip) {
  if (!env.BOOKING_KV) return true; // KV not configured — skip limiting rather than break bookings.
  const key = `rl:${ip}`;
  const raw = await env.BOOKING_KV.get(key);
  const record = raw ? JSON.parse(raw) : { count: 0 };
  record.count += 1;
  await env.BOOKING_KV.put(key, JSON.stringify(record), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
  return record.count <= RATE_LIMIT_MAX;
}

async function handleServices() {
  return json({ services: SERVICES, timezone: TIMEZONE });
}

async function handleAvailability(env, url) {
  const serviceId = url.searchParams.get('serviceId');
  const service = getServiceById(serviceId);
  if (!service) return badRequest('Servizio non valido.');

  const fromParam = url.searchParams.get('from');
  const now = nowInTimeZone(TIMEZONE);
  const fromDateKey = fromParam && DATE_RE.test(fromParam) ? fromParam : toDateKey(now.year, now.month, now.day);

  let days = parseInt(url.searchParams.get('days') || '14', 10);
  if (!Number.isFinite(days) || days < 1) days = 14;
  days = Math.min(days, BOOKING_HORIZON_DAYS);

  try {
    const availability = await computeAvailability(env, { service, fromDateKey, days });
    return json({ service, ...availability });
  } catch (err) {
    console.error('availability error', err);
    return json({ error: 'Impossibile calcolare la disponibilità in questo momento. Riprova più tardi.' }, 502);
  }
}

function validateBookingPayload(body) {
  if (!body || typeof body !== 'object') return 'Richiesta non valida.';
  if (body.honeypot) return 'SPAM'; // handled specially by caller
  const service = getServiceById(body.serviceId);
  if (!service) return 'Servizio non valido.';
  if (!DATE_RE.test(body.date || '')) return 'Data non valida.';
  if (!TIME_RE.test(body.start || '')) return 'Orario non valido.';
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 80) {
    return 'Inserisci il tuo nome.';
  }
  if (!PHONE_RE.test(body.phone || '')) return 'Inserisci un numero di telefono valido.';
  if (body.email && !EMAIL_RE.test(body.email)) return 'Inserisci un indirizzo email valido.';
  if (body.notes && String(body.notes).length > 500) return 'Note troppo lunghe.';
  return null;
}

async function handleCreateBooking(env, request, ip) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('JSON non valido.');
  }

  const validationError = validateBookingPayload(body);
  if (validationError === 'SPAM') {
    // Honeypot tripped: pretend success so bots move on, but do nothing.
    return json({ ok: true }, 201);
  }
  if (validationError) return badRequest(validationError);

  const requestId = typeof body.requestId === 'string' && body.requestId.length <= 100 ? body.requestId : null;
  if (requestId && env.BOOKING_KV) {
    const cached = await env.BOOKING_KV.get(`booking:${requestId}`);
    if (cached) return json(JSON.parse(cached), 201);
  }

  const withinLimit = await checkRateLimit(env, ip);
  if (!withinLimit) return json({ error: 'Troppe richieste. Riprova più tardi.' }, 429);

  const service = getServiceById(body.serviceId);
  const { year, month, day } = parseDateKey(body.date);
  const { hour, minute } = parseTimeKey(body.start);

  const startUtc = zonedTimeToUtc(year, month, day, hour, minute, TIMEZONE);
  const endUtc = new Date(startUtc.getTime() + service.duration * 60_000);

  const now = nowInTimeZone(TIMEZONE);
  if (startUtc.getTime() < now.instant.getTime() + MIN_LEAD_MINUTES * 60_000) {
    return badRequest('Questo orario non è più disponibile. Scegline un altro.');
  }

  // Re-check the exact slot server-side right before booking to avoid double-booking.
  try {
    const busy = await freeBusyQuery(
      env,
      new Date(startUtc.getTime() - BUFFER_MINUTES * 60_000).toISOString(),
      new Date(endUtc.getTime() + BUFFER_MINUTES * 60_000).toISOString()
    );
    if (busy.length > 0) {
      return json({ error: 'Questo orario è stato appena prenotato da qualcun altro. Scegline un altro.' }, 409);
    }
  } catch (err) {
    console.error('freeBusy re-check failed', err);
    return json({ error: 'Impossibile verificare la disponibilità. Riprova.' }, 502);
  }

  const name = body.name.trim();
  const phone = body.phone.trim();
  const email = body.email ? body.email.trim() : '';
  const notes = body.notes ? String(body.notes).trim() : '';

  const endTotalMinutes = hour * 60 + minute + service.duration;
  const endTimeKey = `${String(Math.floor(endTotalMinutes / 60) % 24).padStart(2, '0')}:${String(
    endTotalMinutes % 60
  ).padStart(2, '0')}`;

  const responsePayload = {
    ok: true,
    booking: {
      service: service.name,
      date: body.date,
      start: body.start,
      end: endTimeKey,
      name,
    },
  };

  if (requestId && env.BOOKING_KV) {
    await env.BOOKING_KV.put(`booking:${requestId}`, JSON.stringify(responsePayload), { expirationTtl: 86400 });
  }

  console.log(
    'New booking request',
    JSON.stringify({ service: service.id, date: body.date, start: body.start, end: endTimeKey, name, phone })
  );

  // Nothing is written to Google Calendar — this notification (plus the
  // on-screen confirmation) is the only outcome of a booking request.
  // Add it to your calendar yourself once you've confirmed with the customer.
  await sendNtfy(env, {
    title: '💅 Nuova richiesta di prenotazione',
    message: [
      `${service.name} (${service.duration} min)`,
      `📅 ${body.date} alle ${body.start}–${endTimeKey}`,
      `👤 ${name}`,
      `📞 ${phone}`,
      email ? `✉️ ${email}` : null,
      notes ? `📝 ${notes}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    tags: ['nail_care', 'bell'],
    click: `tel:${phone.replace(/\s+/g, '')}`,
  });

  return json(responsePayload, 201);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    }

    try {
      if (url.pathname === '/api/services' && request.method === 'GET') {
        return await handleServices();
      }
      if (url.pathname === '/api/availability' && request.method === 'GET') {
        return await handleAvailability(env, url);
      }
      if (url.pathname === '/api/bookings' && request.method === 'POST') {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        return await handleCreateBooking(env, request, ip);
      }
      return json({ error: 'Not found' }, 404);
    } catch (err) {
      console.error('Unhandled worker error', err);
      return json({ error: 'Errore interno del server.' }, 500);
    }
  },
};
