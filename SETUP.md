# Prenotazione online — setup guide

The site now includes a "Prenota Ora" booking widget (nav, hero, contact
section, mobile menu). It is a 3-step flow: **service → date/time →
contact info**, backed by a Cloudflare Worker that:

1. Reads your **Google Calendar** in **read-only** mode to know which slots
   are free (`freeBusy` — it can only see busy/free blocks, never event
   details, and it can never create, edit, or delete anything).
2. Re-checks the exact slot is still free right before accepting the request.
3. Sends you a **push notification via ntfy** with all the booking details.
4. Shows the customer an on-screen confirmation.

That's the entire outcome of a booking: **an ntfy notification + a UI
confirmation**. The website never writes to your Google Calendar — you (or
Roberta) review the notification and add the appointment to the calendar
yourselves once it's confirmed with the customer. Nothing is stored in a
separate database either; a small Cloudflare KV namespace is used only for
duplicate-submission protection and basic rate limiting.

> Because nothing is reserved on the calendar automatically, treat every
> request as a **pending request**, not a guaranteed booking, until you've
> confirmed it (e.g. by phone/WhatsApp) and added it to your calendar. In the
> rare case two customers request the exact same slot within moments of each
> other, whoever you confirm first gets it — just like a phone call.

## Architecture at a glance

```
public/                → static site (served directly, unchanged behavior)
src/worker.js          → Cloudflare Worker: /api/services, /api/availability, /api/bookings
src/config.js          → services, business hours, buffer/lead time (EDIT ME)
src/google.js          → Google service-account auth + Calendar API calls
src/availability.js    → turns freeBusy data into bookable slots
src/ntfy.js            → push notification sender
```

Nothing under `src/` or `wrangler.jsonc` is publicly served — only the
`public/` folder is exposed to visitors.

---

## 1. Google Cloud — create a Service Account

The Worker talks to Google Calendar as a **service account** (no OAuth login
flow, no "log in with Google" for you — it's a machine identity you create
once).

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and
   create a new project (e.g. "softique-booking"), or reuse an existing one.
2. Enable the **Google Calendar API** for that project (APIs & Services →
   Library → search "Google Calendar API" → Enable).
3. Go to **APIs & Services → Credentials → Create Credentials → Service
   Account**. Give it any name (e.g. `softique-booking`). You don't need to
   grant it any project-level IAM roles.
4. Open the new service account → **Keys** tab → **Add Key → Create new key
   → JSON**. This downloads a `.json` file — keep it private, treat it like a
   password.
5. From that JSON file you'll need two values:
   - `client_email` → e.g. `softique-booking@your-project.iam.gserviceaccount.com`
   - `private_key` → the multi-line `-----BEGIN PRIVATE KEY-----...` block.

## 2. Share your Google Calendar with the service account — read-only

1. Open [Google Calendar](https://calendar.google.com/) with the account you
   currently use to track appointments.
2. Settings (gear icon) → **Settings** → under "Settings for my calendars",
   pick the calendar you use for appointments (or "primary" if it's your
   main calendar).
3. **Share with specific people or groups → Add people** → paste the
   service account's `client_email` → permission: **"See only free/busy
   (hide details)"** → Send.
   This is the most restrictive option Google Calendar offers — the service
   account can only tell whether a given time slot is busy or free. It
   cannot read appointment titles/descriptions, and it has no permission to
   create, edit, or delete anything.
4. On the same settings page, copy the **Calendar ID** (under "Integrate
   calendar"). For your primary calendar this is just your Gmail address.

The Worker itself is also coded to only ever request the narrowest Google
OAuth scope that exists for this (`calendar.freebusy`), so even if you
accidentally shared with a higher permission, the Worker still couldn't use
it to write anything — there is simply no calendar-writing code in this
project.

## 3. ntfy — get notified on your phone

1. Install the **ntfy** app ([iOS](https://apps.apple.com/us/app/ntfy/id1625396347) /
   [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy)),
   or just use the web app at [ntfy.sh](https://ntfy.sh/).
2. Pick a **long, random topic name** that nobody can guess, e.g.
   `softique-bk-7f3a9c21`. Anyone who knows the topic name can read your
   notifications, so don't use something obvious like `softique`.
3. Subscribe to that topic in the app: `https://ntfy.sh/softique-bk-7f3a9c21`.
4. That URL is the value you'll set as `NTFY_URL` in the next section. (If
   you self-host ntfy or want extra protection, you can also set an access
   token as `NTFY_TOKEN` — see the [ntfy docs](https://docs.ntfy.sh/publish/#access-tokens).)

## 4. Cloudflare — what you need to set up

You already deploy this site with Wrangler. Two new things are needed:
a **KV namespace** (for rate limiting / duplicate-submission protection) and
a handful of **secrets**.

From the project root:

```bash
# 1. Install dependencies (just Wrangler)
npm install

# 2. Log in to Cloudflare (if you haven't already)
npx wrangler login

# 3. Create the KV namespace used for rate limiting
npx wrangler kv namespace create BOOKING_KV
```

That last command prints an `id`. Copy it into `wrangler.jsonc`, replacing
`REPLACE_WITH_KV_NAMESPACE_ID`:

```jsonc
"kv_namespaces": [
  { "binding": "BOOKING_KV", "id": "PASTE_THE_ID_HERE" }
]
```

Now set the secrets (each command will prompt you to paste the value):

```bash
npx wrangler secret put GOOGLE_CLIENT_EMAIL
npx wrangler secret put GOOGLE_PRIVATE_KEY     # paste the whole PEM block, multi-line is fine
npx wrangler secret put GOOGLE_CALENDAR_ID
npx wrangler secret put NTFY_URL               # e.g. https://ntfy.sh/softique-bk-7f3a9c21
npx wrangler secret put NTFY_TOKEN             # optional, only if your ntfy topic needs auth
```

Deploy:

```bash
npx wrangler deploy
```

Your site keeps working exactly as before, plus `/api/services`,
`/api/availability` and `/api/bookings` are now live.

### Local development

Copy `.dev.vars.example` to `.dev.vars` (already gitignored) and fill in the
same values, then run:

```bash
npm run dev
```

This runs the site + Worker locally at `http://localhost:8787` with a local
(simulated) KV namespace — no need to touch the real Cloudflare KV while
developing.

---

## 5. Customizing the booking rules

Everything business-specific lives in `src/config.js`, fully commented:

- `SERVICES` — treatments shown to customers and their duration in minutes.
- `BUSINESS_HOURS` — opening hours per weekday (currently Mon–Fri
  14:30–19:00, matching your site's schema.org data — update both places if
  hours change).
- `SLOT_STEP_MINUTES` — granularity of proposed start times (default 15 min).
- `BUFFER_MINUTES` — cleanup/prep gap enforced between appointments
  (default 10 min).
- `MIN_LEAD_MINUTES` — minimum notice required before a slot can be booked
  (default 2h, to avoid someone booking 5 minutes from now).
- `BOOKING_HORIZON_DAYS` — how far in advance customers can book (default 45
  days).

No redeploy logic needed beyond `npx wrangler deploy` after editing.

## 6. How it behaves

- Customers pick a service, then see a calendar with available days marked,
  plus a "next available slot" shortcut, then pick a time, then fill in
  name/phone/email(optional)/notes.
- On submit, the Worker re-checks the exact slot against your calendar's
  free/busy data (in case a slot became busy after the page loaded — e.g.
  you added an appointment by phone in the meantime), then sends you an
  ntfy push with all the details (service, date/time, name, phone, email,
  notes) and shows the customer an on-screen "richiesta inviata" confirmation.
- **Nothing is ever written to Google Calendar.** Tapping the ntfy
  notification opens your phone's dialer with the customer's number ready to
  call. The customer also gets a "+ Aggiungi al tuo Google Calendar" link on
  the confirmation screen — that only adds the event to *their own* personal
  calendar and has nothing to do with your studio's calendar or the Worker.
- A hidden honeypot field plus a soft per-IP rate limit (8 requests / 10 min,
  via `BOOKING_KV`) provide basic spam/bot protection. For stronger
  protection later, consider adding [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/)
  to the form.
- Every request is logged to `wrangler tail` / the Cloudflare dashboard Logs
  view (`observability.enabled` is already on), so you have a record of
  requests even though nothing is written to a database or calendar.

## 7. Costs

- Google Calendar API: generous free quota (1,000,000 requests/day), no cost
  for this use case.
- ntfy.sh: free for personal use; self-host if you want full control.
- Cloudflare Workers + KV: comfortably within the free tier for a small
  studio's traffic.
