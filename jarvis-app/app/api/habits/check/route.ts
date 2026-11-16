import { getSupabaseClient } from "@/lib/supabase";
import { getLocalDate } from "@/lib/task-utils";
import { isAutomationAuthorized } from "@/lib/automation/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAutomationAuthorized(request)) return new Response("Nein", { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Ungültiger Request." }, { status: 400 }); }
  const name = body && typeof body === "object" && "name" in body ? (body as { name: unknown }).name : null;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
    return Response.json({ error: "Ein gültiger Gewohnheitsname ist erforderlich." }, { status: 400 });
  }

  try {
    const { error } = await getSupabaseClient().from("habit_checks").upsert(
      { day: getLocalDate(), habit: name.trim() },
      { onConflict: "day,habit" }
    );
    if (error) throw error;
    return Response.json({ ok: true, habit: name.trim() });
  } catch (error) {
    console.error("[dashboard] habit check failed", error instanceof Error ? error.message : "unknown_error");
    return Response.json({ error: "Gewohnheit konnte nicht abgehakt werden." }, { status: 503 });
  }
}
