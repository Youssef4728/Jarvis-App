import { runAgent } from "@/lib/agent";
import { sendTelegram } from "@/lib/telegram";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Nein", { status: 401 });
  await sendTelegram(await runAgent("Schreibe meinen Abendcheck: Frage kurz, was heute gut lief und was offen blieb, fasse morgen zusammen (get_plan) und schlage einen klaren Plan vor.", false));
  return Response.json({ ok: true });
}
