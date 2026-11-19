import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";
import { runTool } from "./tools";
import type { OrchestratorAction } from "./orchestrator";

export type ExecutionStatus = "pending" | "running" | "completed" | "failed" | "awaiting_approval";

export type ExecutionItem = {
  actionId: string;
  actionKey: string;
  kind: string;
  label: string;
  status: ExecutionStatus;
  result?: string;
  errorCode?: string;
  attempts: number;
  requiresApproval: boolean;
  input: Record<string, unknown>;
};

export type ExecutionRun = {
  runId: string;
  requestKey: string;
  status: ExecutionStatus;
  summary: string;
  items: ExecutionItem[];
};

export type ExecutionExecutor = (kind: string, input: Record<string, unknown>) => Promise<string>;

function stableActionKey(kind: string, input: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify({ kind, input }))
    .digest("hex")
    .slice(0, 24);
}

function itemLabel(kind: string, input: Record<string, unknown>): string {
  if (kind === "add_task") return `Aufgabe erstellen: ${String(input.title ?? "")}`;
  if (kind === "add_event") return `Termin eintragen: ${String(input.title ?? "")}`;
  if (kind === "generate_daily_plan") return "Tagesplan aktualisieren";
  if (kind === "generate_weekly_plan") return "Wochenplan aktualisieren";
  if (kind === "log_gym") return `Training speichern: ${String(input.exercise ?? "")}`;
  if (kind === "save_fact") return "Erinnerung speichern";
  if (kind === "complete_task") return `Aufgabe erledigen: ${String(input.title ?? "")}`;
  return kind;
}

export function orchestrationActionsToExecutionActions(actions: OrchestratorAction[]): ExecutionItem[] {
  return actions
    .filter((action) => action.type !== "clarify")
    .map((action) => {
      let kind = "";
      let input: Record<string, unknown> = {};
      if (action.type === "add_task") {
        kind = "add_task";
        input = { title: action.title, due: action.due, priority: action.priority };
      } else if (action.type === "add_event") {
        kind = "add_event";
        input = { title: action.title, day: action.day, time: action.time, category: action.category };
      } else if (action.type === "log_gym") {
        kind = "log_gym";
        input = { exercise: action.exercise };
      } else if (action.type === "save_fact") {
        kind = "save_fact";
        input = { text: action.text };
      } else if (action.type === "complete_task") {
        kind = "complete_task";
        input = { title: action.title };
      } else if (action.type === "generate_daily_plan") {
        kind = "generate_daily_plan";
        input = { date: action.date };
      } else if (action.type === "generate_weekly_plan") {
        kind = "generate_weekly_plan";
        input = { date: action.date };
      } else if (action.type === "approval_required") {
        kind = "approval_required";
        input = { reason: action.reason };
      }
      const actionKey = stableActionKey(kind, input);
      return {
        actionId: randomUUID(),
        actionKey,
        kind,
        label: itemLabel(kind, input),
        status: "pending" as const,
        attempts: 0,
        requiresApproval: action.type === "approval_required",
        input,
      };
    });
}

async function updateRun(supabase: SupabaseClient, runId: string, values: Record<string, unknown>) {
  await supabase.from("jarvis_action_runs").update({ ...values, updated_at: new Date().toISOString() }).eq("id", runId);
}

async function updateItem(supabase: SupabaseClient, actionId: string, values: Record<string, unknown>) {
  await supabase.from("jarvis_action_items").update({ ...values, updated_at: new Date().toISOString() }).eq("action_id", actionId);
}

async function loadExistingRun(supabase: SupabaseClient, requestKey: string): Promise<ExecutionRun | null> {
  const run = await supabase
    .from("jarvis_action_runs")
    .select("id,request_key,status,summary")
    .eq("request_key", requestKey)
    .maybeSingle();
  if (run.error || !run.data) return null;
  const rows = await supabase
    .from("jarvis_action_items")
    .select("action_id,action_key,kind,label,status,result,error_code,attempts,requires_approval,input")
    .eq("run_id", run.data.id)
    .order("created_at", { ascending: true });
  if (rows.error) return null;
  return {
    runId: run.data.id,
    requestKey: run.data.request_key,
    status: run.data.status,
    summary: run.data.summary ?? "",
    items: (rows.data ?? []).map((row) => ({
      actionId: row.action_id,
      actionKey: row.action_key,
      kind: row.kind,
      label: row.label,
      status: row.status,
      result: row.result ?? undefined,
      errorCode: row.error_code ?? undefined,
      attempts: row.attempts,
      requiresApproval: row.requires_approval,
      input: (row.input ?? {}) as Record<string, unknown>,
    })),
  };
}

async function createPersistedRun(supabase: SupabaseClient, requestKey: string, sourceText: string, items: ExecutionItem[]): Promise<ExecutionRun | null> {
  const run = await supabase
    .from("jarvis_action_runs")
    .insert({ request_key: requestKey, source_text: sourceText, status: "running" })
    .select("id,request_key,status,summary")
    .single();
  if (run.error || !run.data) return null;
  const runId = run.data.id as string;
  await supabase.from("jarvis_action_items").insert(items.map((item) => ({
    run_id: runId,
    action_key: item.actionKey,
    action_id: item.actionId,
    kind: item.kind,
    label: item.label,
    input: item.input,
    status: item.status,
    requires_approval: item.requiresApproval,
    attempts: item.attempts,
  })));
  return { runId, requestKey, status: "running", summary: "", items };
}

async function isDuplicate(supabase: SupabaseClient, kind: string, input: Record<string, unknown>): Promise<boolean> {
  if (kind === "add_task" && typeof input.title === "string") {
    let query = supabase.from("tasks").select("id").ilike("text", input.title.trim()).eq("done", false).limit(1);
    if (typeof input.due === "string" && input.due) query = query.eq("due", input.due);
    const result = await query;
    return !result.error && (result.data?.length ?? 0) > 0;
  }
  if (kind === "add_event" && typeof input.title === "string" && typeof input.day === "string") {
    const result = await supabase
      .from("events")
      .select("id")
      .ilike("title", input.title.trim())
      .eq("day", input.day)
      .limit(1);
    return !result.error && (result.data?.length ?? 0) > 0;
  }
  return false;
}

export async function executeCentralActions(
  sourceText: string,
  requestId: string,
  actions: OrchestratorAction[],
  options: { supabase?: SupabaseClient; executor?: ExecutionExecutor; maxAttempts?: number } = {},
): Promise<ExecutionRun> {
  const supabase = options.supabase ?? getSupabaseClient();
  const executor = options.executor ?? (async (kind, input) => runTool(kind, input));
  const maxAttempts = options.maxAttempts ?? 2;
  const items = orchestrationActionsToExecutionActions(actions);
  const requestKey = createHash("sha256").update(`${requestId}:${sourceText}`).digest("hex").slice(0, 48);

  let persisted: ExecutionRun | null = null;
  try {
    persisted = await loadExistingRun(supabase, requestKey);
    if (persisted) {
      if (persisted.status === "awaiting_approval") return persisted;
      if (persisted.status === "completed") return persisted;
    } else {
      persisted = await createPersistedRun(supabase, requestKey, sourceText, items);
    }
  } catch (error) {
    console.error("[execution-engine] persistence unavailable", error instanceof Error ? error.message : "unknown_error");
  }

  if (items.length === 0) {
    return persisted ?? { runId: randomUUID(), requestKey, status: "completed", summary: "Keine Datenänderung erforderlich.", items: [] };
  }

  let completed = 0;
  let failed = 0;
  for (const item of items) {
    if (item.status === "completed") {
      completed++;
      continue;
    }
    if (item.requiresApproval) {
      item.status = "awaiting_approval";
      if (persisted) await updateItem(supabase, item.actionId, { status: "awaiting_approval", requires_approval: true });
      continue;
    }
    item.status = "running";
    if (persisted) await updateItem(supabase, item.actionId, { status: "running", attempts: item.attempts + 1 });
    try {
      if (await isDuplicate(supabase, item.kind, item.input)) {
        item.status = "completed";
        item.result = "Bereits vorhanden; kein Duplikat erstellt.";
        item.attempts += 1;
        completed++;
        if (persisted) await updateItem(supabase, item.actionId, { status: "completed", result: item.result, attempts: item.attempts });
        continue;
      }

      let result = "";
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        item.attempts = attempt;
        if (persisted) await updateItem(supabase, item.actionId, { attempts: attempt });
        try {
          result = await executor(item.kind, item.input);
          break;
        } catch (error) {
          lastError = error;
          if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
        }
      }
      if (!result) {
        throw lastError instanceof Error ? lastError : new Error("Aktion lieferte kein Ergebnis.");
      }
      item.status = "completed";
      item.result = result;
      completed++;
      if (persisted) await updateItem(supabase, item.actionId, { status: "completed", result, attempts: item.attempts, error_code: null });
    } catch (error) {
      item.status = "failed";
      item.errorCode = error instanceof Error ? error.message : "action_failed";
      failed++;
      if (persisted) await updateItem(supabase, item.actionId, { status: "failed", error_code: item.errorCode, attempts: item.attempts });
    }
  }

  const awaiting = items.filter((item) => item.status === "awaiting_approval").length;
  const status: ExecutionStatus = failed > 0 ? "failed" : awaiting > 0 ? "awaiting_approval" : "completed";
  const summary = awaiting > 0
    ? `${awaiting} Aktion(en) warten auf deine ausdrückliche Bestätigung.`
    : `${completed} Aktion(en) abgeschlossen${failed ? `, ${failed} fehlgeschlagen` : ""}.`;
  if (persisted) {
    await updateRun(supabase, persisted.runId, { status, summary, error_code: failed ? "action_partial_failure" : null });
  }
  return persisted
    ? { ...persisted, status, summary, items }
    : { runId: randomUUID(), requestKey, status, summary, items };
}

export async function retryExecutionItem(
  actionId: string,
  options: { supabase?: SupabaseClient; executor?: ExecutionExecutor } = {},
): Promise<ExecutionItem> {
  const supabase = options.supabase ?? getSupabaseClient();
  const executor = options.executor ?? (async (kind, input) => runTool(kind, input));
  const row = await supabase
    .from("jarvis_action_items")
    .select("id,run_id,action_id,action_key,kind,label,status,requires_approval,result,error_code,attempts,input")
    .eq("action_id", actionId)
    .maybeSingle();
  if (row.error) throw new Error(`Aktionsstatus konnte nicht geladen werden: ${row.error.message}`);
  if (!row.data) throw new Error("Aktion wurde nicht gefunden.");
  if (row.data.requires_approval) throw new Error("Diese Aktion wartet weiterhin auf Bestätigung.");

  const attempts = Number(row.data.attempts ?? 0) + 1;
  await updateItem(supabase, actionId, { status: "running", attempts, error_code: null });
  try {
    const input = (row.data.input ?? {}) as Record<string, unknown>;
    const result = await executor(row.data.kind, input);
    await updateItem(supabase, actionId, { status: "completed", result, attempts, error_code: null });
    const siblings = await supabase
      .from("jarvis_action_items")
      .select("status")
      .eq("run_id", row.data.run_id);
    const statuses = (siblings.data ?? []).map((item) => item.status);
    const runStatus: ExecutionStatus = statuses.includes("failed") ? "failed" : statuses.includes("pending") || statuses.includes("running") ? "running" : "completed";
    await updateRun(supabase, row.data.run_id, { status: runStatus, summary: runStatus === "completed" ? "Alle Aktionen abgeschlossen." : "Aktionen werden geprüft." });
    return {
      actionId,
      actionKey: row.data.action_key,
      kind: row.data.kind,
      label: row.data.label,
      status: "completed",
      result,
      attempts,
      requiresApproval: false,
      input,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "action_retry_failed";
    await updateItem(supabase, actionId, { status: "failed", error_code: message, attempts });
    await updateRun(supabase, row.data.run_id, { status: "failed", summary: "Eine Aktion ist erneut fehlgeschlagen.", error_code: "action_partial_failure" });
    throw new Error(message);
  }
}
