import { getSupabaseClient } from "@/lib/supabase";
import { isAutomationAuthorized } from "@/lib/automation/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  if (!isAutomationAuthorized(request)) return new Response("Nein", { status: 401 });
  const { taskId } = await context.params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(taskId)) {
    return Response.json({ error: "Ungültige Aufgaben-ID." }, { status: 400 });
  }

  try {
    const { data, error } = await getSupabaseClient()
      .from("tasks")
      .update({ done: true })
      .eq("id", taskId.toLowerCase())
      .eq("done", false)
      .select("id,done")
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "Offene Aufgabe nicht gefunden." }, { status: 404 });
    return Response.json({ task: data });
  } catch (error) {
    console.error("[dashboard] task completion failed", error instanceof Error ? error.message : "unknown_error");
    return Response.json({ error: "Aufgabe konnte nicht abgehakt werden." }, { status: 503 });
  }
}
