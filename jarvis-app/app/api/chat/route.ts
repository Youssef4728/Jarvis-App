import { runAgent } from "@/lib/agent";
import { randomUUID } from "node:crypto";
import { isAutomationAuthorized } from "@/lib/automation/auth";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(req: Request) {
  if (!isAutomationAuthorized(req)) return new Response("Nein", { status: 401 });
  const body = await req.json();
  if (!body || typeof body.message !== "string" || !body.message.trim()) return Response.json({ error: "Ungültige Nachricht." }, { status: 400 });
  const requestId = typeof body.request_id === "string" && /^[0-9a-f-]{36}$/i.test(body.request_id)
    ? body.request_id
    : randomUUID();
  return Response.json({ reply: await runAgent(body.message, true, requestId) });
}
