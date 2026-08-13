// ── ntfy.sh (or self-hosted ntfy) push notification helper ──

export async function sendNtfy(env, { title, message, priority = 'high', tags = [], click }) {
  if (!env.NTFY_URL) return; // Not configured — fail soft, never block a booking on this.
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
    Title: title,
    Priority: priority,
  };
  if (tags.length) headers.Tags = tags.join(',');
  if (click) headers.Click = click;
  if (env.NTFY_TOKEN) headers.Authorization = `Bearer ${env.NTFY_TOKEN}`;

  try {
    const res = await fetch(env.NTFY_URL, { method: 'POST', headers, body: message });
    if (!res.ok) {
      console.error(`ntfy notification failed (${res.status}): ${await res.text()}`);
    }
  } catch (err) {
    console.error('ntfy notification failed:', err);
  }
}
