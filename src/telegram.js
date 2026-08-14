// ── Telegram Bot API push helper ──
// Used in production because ntfy.sh's free tier rate-limits by source IP,
// and Cloudflare Workers share egress IPs (so bookings get HTTP 429).

function trimEnv(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendTelegram(env, { title, message }) {
  const token = trimEnv(env.TELEGRAM_BOT_TOKEN);
  const chatId = trimEnv(env.TELEGRAM_CHAT_ID);
  if (!token || !chatId) return;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `<b>${escapeHtml(title)}</b>\n${escapeHtml(message)}`,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error(`telegram notification failed (${res.status}): ${await res.text()}`);
    } else {
      console.log('telegram notification sent');
    }
  } catch (err) {
    console.error('telegram notification failed:', err && err.stack ? err.stack : String(err));
  }
}
