import { getSupabaseClient } from "@/lib/supabase";
import { getLocalDate } from "@/lib/task-utils";
import { prayerTimes } from "@/lib/prayer";
import { isAutomationAuthorized } from "@/lib/automation/auth";

export const dynamic = "force-dynamic";

type QueryResult<T> = { data: T; error: string | null; count: number | null };

async function readSection<T>(
  label: string,
  query: PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }>,
  fallback: T
): Promise<QueryResult<T>> {
  try {
    const result = await query;
    if (result.error) {
      console.error(`[dashboard] ${label} query failed`, result.error.message);
      return { data: fallback, error: `${label} konnten nicht geladen werden.`, count: null };
    }
    return { data: (result.data ?? fallback) as T, error: null, count: result.count ?? (Array.isArray(result.data) ? result.data.length : null) };
  } catch (error) {
    console.error(`[dashboard] ${label} query failed`, error instanceof Error ? error.message : "unknown_error");
    return { data: fallback, error: `${label} konnten nicht geladen werden.`, count: null };
  }
}

export async function GET(request: Request) {
  if (!isAutomationAuthorized(request)) return new Response("Nein", { status: 401 });

  try {
    const supabase = getSupabaseClient();
    const today = getLocalDate();
    const monthStart = `${today.slice(0, 7)}-01`;
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();

    const [tasks, events, routines, breaks, money, goals, workouts, habits, checks, actionRuns, actionItems, prayers] = await Promise.all([
      readSection("Aufgaben", supabase.from("tasks").select("id,text,due,done,priority").order("due", { ascending: true, nullsFirst: false }).limit(100), []),
      readSection("Termine", supabase.from("events").select("id,title,day,time,category,skipped").eq("day", today).eq("skipped", false).order("time"), []),
      readSection("Routinen", supabase.from("routines").select("id,title,category,weekdays,time,end_time,active").eq("active", true).contains("weekdays", [weekday]).order("time"), []),
      readSection("Pausen", supabase.from("breaks").select("title,categories").lte("start_date", today).gte("end_date", today), []),
      readSection("Finanzen", supabase.from("money").select("amt").gte("day", monthStart).lte("day", today), []),
      readSection("Sparziele", supabase.from("goals").select("id,name,target,saved"), []),
      readSection("Training", supabase.from("gym_logs").select("id,ex,kg,reps,sets,day", { count: "exact" }).gte("day", monthStart).lte("day", today).order("day", { ascending: false }).limit(12), []),
      readSection("Gewohnheiten", supabase.from("habits").select("name").order("name"), []),
      readSection("Gewohnheitsstatus", supabase.from("habit_checks").select("habit,day").eq("day", today), []),
      readSection("Ausführungsstatus", supabase.from("jarvis_action_runs").select("id,request_key,status,summary,error_code,created_at,updated_at").order("updated_at", { ascending: false }).limit(20), []),
      readSection("Ausgeführte Aktionen", supabase.from("jarvis_action_items").select("id,run_id,action_id,kind,label,status,requires_approval,result,error_code,attempts,updated_at").order("updated_at", { ascending: false }).limit(100), []),
      prayerTimes(today),
    ]);

    const pausedCategories = new Set((breaks.data as { categories?: string[] }[]).flatMap((item) => item.categories ?? []));
    return Response.json({
      date: today,
      tasks: tasks.data,
      events: (events.data as { category?: string }[]).filter((item) => !pausedCategories.has(item.category ?? "")),
      routines: (routines.data as { category?: string }[]).filter((item) => !pausedCategories.has(item.category ?? "")),
      money: money.data,
      goals: goals.data,
      workouts: workouts.data,
      workoutCount: workouts.count ?? (workouts.data as unknown[]).length,
      habits: habits.data,
      habitChecks: checks.data,
      prayers,
      actions: actionRuns.data,
      actionItems: actionItems.data,
      errors: {
        tasks: tasks.error,
        events: events.error,
        routines: routines.error,
        money: money.error,
        goals: goals.error,
        workouts: workouts.error,
        habits: habits.error ?? checks.error,
        prayers: prayers.length ? null : "Gebetszeiten sind derzeit nicht verfügbar.",
        actions: actionRuns.error,
        actionItems: actionItems.error,
      },
    });
  } catch (error) {
    console.error("[dashboard] failed to load", error instanceof Error ? error.message : "unknown_error");
    return Response.json({ error: "Das Dashboard konnte nicht geladen werden." }, { status: 503 });
  }
}
