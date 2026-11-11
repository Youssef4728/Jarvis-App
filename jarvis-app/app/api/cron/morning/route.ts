import { runAgent } from "@/lib/agent";
import { sendTelegram } from "@/lib/telegram";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Nein", { status: 401 });
  await sendTelegram(await runAgent("Schreibe meinen Tagesstart: Was steht heute an (Schule, Gym, Termine, Gebetszeiten), offene Aufgaben mit Frist, ein klarer Fokus für heute. Nutze get_plan und list_tasks.", false));
  return Response.json({ ok: true });
}
