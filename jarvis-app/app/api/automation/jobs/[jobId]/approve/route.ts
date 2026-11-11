import { createAutomationController, AutomationError } from "@/lib/automation/service";
import { isAutomationAuthorized } from "@/lib/automation/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  if (!isAutomationAuthorized(request)) return new Response("Nein", { status: 401 });
  try {
    const { jobId } = await context.params;
    const job = await createAutomationController().approveJob(jobId);
    return Response.json({ job });
  } catch (error) {
    if (error instanceof AutomationError) return Response.json({ error: error.code }, { status: error.httpStatus });
    return Response.json({ error: "Der GitHub-Agent konnte nicht gestartet werden." }, { status: 503 });
  }
}
