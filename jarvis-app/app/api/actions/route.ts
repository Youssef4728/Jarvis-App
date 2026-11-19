import { getSupabaseClient } from "@/lib/supabase";
import { isAutomationAuthorized } from "@/lib/automation/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAutomationAuthorized(req)) return new Response("Nein", { status: 401 });
  try {
    const supabase = getSupabaseClient();
    const runs = await supabase
      .from("jarvis_action_runs")
      .select("id,request_key,status,summary,error_code,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(30);
    if (runs.error) return Response.json({ error: "execution_history_unavailable" }, { status: 503 });
    const items = await supabase
      .from("jarvis_action_items")
      .select("id,run_id,action_id,kind,label,status,requires_approval,result,error_code,attempts,updated_at")
      .order("updated_at", { ascending: false })
      .limit(120);
    if (items.error) return Response.json({ error: "execution_items_unavailable" }, { status: 503 });
    return Response.json({ runs: runs.data ?? [], items: items.data ?? [] });
  } catch (error) {
    console.error("[actions] history failed", error instanceof Error ? error.message : "unknown_error");
    return Response.json({ error: "execution_history_unavailable" }, { status: 503 });
  }
}
