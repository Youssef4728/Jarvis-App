import { createAutomationController, AutomationError } from "@/lib/automation/service";
import { isAutomationAuthorized } from "@/lib/automation/auth";
import { validateIdempotencyKey } from "@/lib/automation/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!isAutomationAuthorized(request)) return new Response("Nein", { status: 401 });
  try {
    return Response.json({ jobs: await createAutomationController().listJobs() });
  } catch {
    return Response.json({ error: "Aufträge konnten nicht geladen werden." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isAutomationAuthorized(request)) return new Response("Nein", { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültiger JSON-Request." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("request" in body)) {
    return Response.json({ error: "Ein Auftragstext ist erforderlich." }, { status: 400 });
  }
  let key: string;
  try {
    key = validateIdempotencyKey(request.headers.get("idempotency-key"));
  } catch {
    return Response.json({ error: "Ein gültiger Idempotency-Key ist erforderlich." }, { status: 400 });
  }
  try {
    const job = await createAutomationController().createJob((body as { request: unknown }).request, key);
    return Response.json({ job }, { status: 201 });
  } catch (error) {
    if (error instanceof AutomationError) return Response.json({ error: error.code }, { status: error.httpStatus });
    return Response.json({ error: "Auftrag konnte nicht erstellt werden." }, { status: 503 });
  }
}
