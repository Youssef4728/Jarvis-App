export async function sendTelegram(text: string) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) throw new Error("telegram_not_configured");
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: text.slice(0, 4000) }),
  });
  if (!response.ok) throw new Error(`telegram_http_${response.status}`);
  const result = await response.json() as { ok?: unknown };
  if (result.ok !== true) throw new Error("telegram_send_failed");
}
