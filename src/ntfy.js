// ── ntfy.sh (or self-hosted ntfy) push notification helper ──
//
// Publish as JSON to the server root (not as custom HTTP headers). Cloudflare
// Workers' production fetch() rejects header values outside ISO-8859-1, so an
// emoji in `Title` (or a trailing newline in NTFY_TOKEN) throws before the
// request is sent. wrangler dev is more lenient, which is why this can work
// locally and fail on the deployed preview with no client-visible error.

const PRIORITY = { min: 1, low: 2, default: 3, high: 4, urgent: 5, max: 5 };

function trimEnv(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseNtfyTarget(rawUrl) {
  const url = new URL(rawUrl);
  const parts = url.pathname.split('/').filter(Boolean);
  const topic = parts.pop();
  if (!topic) throw new Error('NTFY_URL is missing a topic path (expected https://ntfy.sh/<topic>)');
  url.pathname = parts.length ? `/${parts.join('/')}/` : '/';
  url.search = '';
  url.hash = '';
  return { endpoint: url.toString(), topic };
}

export async function sendNtfy(env, { title, message, priority = 'high', tags = [], click }) {
  const ntfyUrl = trimEnv(env.NTFY_URL);
  const ntfyToken = trimEnv(env.NTFY_TOKEN);
  if (!ntfyUrl) return;

  let endpoint;
  let topic;
  try {
    ({ endpoint, topic } = parseNtfyTarget(ntfyUrl));
  } catch (err) {
    console.error('ntfy skipped: invalid NTFY_URL:', err && err.message ? err.message : String(err));
    return;
  }

  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (ntfyToken) headers.Authorization = `Bearer ${ntfyToken}`;

  const payload = {
    topic,
    title,
    message,
    priority: PRIORITY[priority] || 4,
    tags,
  };
  if (click) payload.click = click;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`ntfy notification failed (${res.status}): ${body}`);
      if (res.status === 429) {
        console.error(
          'ntfy 429: ntfy.sh free-tier limits are per source IP. Cloudflare Workers share egress IPs, so the daily quota is often already used. Use a self-hosted ntfy server, an ntfy.sh paid plan, or another notification channel.'
        );
      }
    } else {
      console.log('ntfy notification sent');
    }
  } catch (err) {
    console.error('ntfy notification failed:', err && err.stack ? err.stack : String(err));
  }
}
