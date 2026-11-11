import { createAutomationController, AutomationError } from "@/lib/automation/service";
import { isAutomationAuthorized } from "@/lib/automation/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  if (!isAutomationAuthorized(request)) return new Response("Nein", { status: 401 });
  try {
    const { jobId } = await context.params;
    return Response.json(await createAutomationController().getJob(jobId));
  } catch (error) {
    if (error instanceof AutomationError) return Response.json({ error: error.code }, { status: error.httpStatus });
    return Response.json({ error: "Auftrag konnte nicht geladen werden." }, { status: 503 });
  }
}
