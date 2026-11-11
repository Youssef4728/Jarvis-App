import { runAgent } from "@/lib/agent";
import { sendTelegram } from "@/lib/telegram";
import { approveAutomationJob, AutomationError, getAutomationJob } from "@/lib/automation/service";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(req: Request) {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) return new Response("Nein", { status: 401 });
  const u = await req.json();
  const msg = u.message;
  if (!msg?.text || String(msg.chat.id) !== process.env.TELEGRAM_CHAT_ID) return Response.json({ ok: true });
  const command = /^\/(approve|job)\s+([0-9a-f-]{36})$/i.exec(msg.text.trim());
  if (command) {
    try {
      if (command[1].toLowerCase() === "approve") {
        const job = await approveAutomationJob(command[2]);
        await sendTelegram(`GitHub-Agent gestartet. Status: ${job.status}${job.github_task_url ? `\n${job.github_task_url}` : ""}`);
      } else {
        const result = await getAutomationJob(command[2]);
        await sendTelegram(`${result.job.status}: ${result.job.plan?.summary ?? result.job.request_text}`);
      }
    } catch (error) {
      const message = error instanceof AutomationError ? error.code : "automation_request_failed";
      await sendTelegram(`Auftrag konnte nicht bearbeitet werden: ${message}`);
    }
    return Response.json({ ok: true });
  }
  await sendTelegram(await runAgent(msg.text, true, `telegram:${u.update_id}`));
  return Response.json({ ok: true });
}
