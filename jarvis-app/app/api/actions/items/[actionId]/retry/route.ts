import { retryExecutionItem } from "@/lib/execution-engine";
import { isAutomationAuthorized } from "@/lib/automation/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ actionId: string }> }) {
  if (!isAutomationAuthorized(req)) return new Response("Nein", { status: 401 });
  const { actionId } = await context.params;
  if (!/^[-0-9a-f]{36}$/i.test(actionId)) return Response.json({ error: "Ungültige Aktions-ID." }, { status: 400 });
  try {
    return Response.json({ action: await retryExecutionItem(actionId) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "action_retry_failed" }, { status: 409 });
  }
}
