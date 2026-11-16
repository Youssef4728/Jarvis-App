import { loadTomorrow } from "@/lib/plan";
import { isAutomationAuthorized } from "@/lib/automation/auth";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (!isAutomationAuthorized(req)) return new Response("Nein", { status: 401 });
  return Response.json(await loadTomorrow());
}
