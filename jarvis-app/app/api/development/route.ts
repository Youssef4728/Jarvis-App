import { isAutomationAuthorized } from "@/lib/automation/auth";
import { createDevelopmentStore, DevelopmentStoreError } from "@/lib/development/store";
import {
  canTransitionDevelopmentItem,
  validateDevelopmentItem,
  validateVisionRevision,
} from "@/lib/development/validation";
import { DEVELOPMENT_STATUSES, type DevelopmentStatus } from "@/lib/development/types";

export const dynamic = "force-dynamic";

function jsonError(error: unknown, fallback: string) {
  if (error instanceof DevelopmentStoreError) {
    return Response.json({ error: error.code }, { status: error.httpStatus });
  }
  if (error instanceof Error && /^[a-z0-9_]+$/.test(error.message)) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  return Response.json({ error: fallback }, { status: 503 });
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (!isAutomationAuthorized(request)) return new Response("Nein", { status: 401 });
  try {
    return Response.json(await createDevelopmentStore().getSnapshot());
  } catch (error) {
    console.error("[development] snapshot read failed", error instanceof DevelopmentStoreError ? error.code : "unknown_error");
    return jsonError(error, "development_store_unavailable");
  }
}

export async function POST(request: Request) {
  if (!isAutomationAuthorized(request)) return new Response("Nein", { status: 401 });
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const idempotencyKey = request.headers.get("idempotency-key");

  try {
    if (body.action === "create_vision") {
      const input = validateVisionRevision({
        title: body.title,
        content: body.content,
        idempotencyKey,
      });
      return Response.json({ vision: await createDevelopmentStore().createVisionRevision(input) }, { status: 201 });
    }
    if (body.action === "create_item") {
      const input = validateDevelopmentItem({
        ...((body.item && typeof body.item === "object" && !Array.isArray(body.item)) ? body.item as Record<string, unknown> : {}),
        idempotencyKey,
      });
      return Response.json({ item: await createDevelopmentStore().createItem(input) }, { status: 201 });
    }
    return Response.json({ error: "action_invalid" }, { status: 400 });
  } catch (error) {
    console.error("[development] create failed", error instanceof DevelopmentStoreError ? error.code : "validation_or_store_error");
    return jsonError(error, "development_store_unavailable");
  }
}

export async function PATCH(request: Request) {
  if (!isAutomationAuthorized(request)) return new Response("Nein", { status: 401 });
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  if (typeof body.itemId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.itemId)) {
    return Response.json({ error: "item_id_invalid" }, { status: 400 });
  }
  if (
    typeof body.expectedStatus !== "string" || !DEVELOPMENT_STATUSES.includes(body.expectedStatus as DevelopmentStatus)
    || typeof body.nextStatus !== "string" || !DEVELOPMENT_STATUSES.includes(body.nextStatus as DevelopmentStatus)
  ) {
    return Response.json({ error: "status_invalid" }, { status: 400 });
  }
  const expectedStatus = body.expectedStatus as DevelopmentStatus;
  const nextStatus = body.nextStatus as DevelopmentStatus;
  if (!canTransitionDevelopmentItem(expectedStatus, nextStatus)) {
    return Response.json({ error: "development_transition_rejected" }, { status: 409 });
  }
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (summary.length > 2000 || (nextStatus === "blocked" && !summary)) {
    return Response.json({ error: "transition_summary_invalid" }, { status: 400 });
  }
  try {
    const item = await createDevelopmentStore().transitionItem(body.itemId, expectedStatus, nextStatus, summary);
    return Response.json({ item });
  } catch (error) {
    console.error("[development] transition failed", error instanceof DevelopmentStoreError ? error.code : "unknown_error");
    return jsonError(error, "development_store_unavailable");
  }
}
