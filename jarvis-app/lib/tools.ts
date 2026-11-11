import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { getSupabaseClient } from "./supabase";
import { createAutomationJob } from "./automation/service";
import { loadTomorrow } from "./plan";
import {
  isIsoDate,
  isTaskPriority,
  isTaskStatus,
  resolveTaskDateRange,
  sortTasksByPriorityAndDue,
  addCalendarDays,
  getLocalDate,
  type TaskPriority,
} from "./task-utils";

const str = (d: string, desc: string) => ({ type: "string" as const, description: desc });
export const TOOLS: Anthropic.Tool[] = [
  { name: "get_plan", description: "Plan für morgen (Routinen, Termine, Gebetszeiten) plus Termine der nächsten 14 Tage.", input_schema: { type: "object", properties: {} } },
  { name: "add_event", description: "Trägt einen Termin ein.", input_schema: { type: "object", properties: { title: str("", "Titel"), day: str("", "YYYY-MM-DD"), time: str("", "HH:MM oder leer"), category: str("", "termin, fussball, privat, reise") }, required: ["title", "day"] } },
  { name: "add_task", description: "Fügt eine offene Aufgabe hinzu. Extrahiere nur ausdrücklich genannte Fälligkeit und Priorität; ohne Angabe ist due null und priority normal.", input_schema: { type: "object", properties: { title: str("", "Titel der Aufgabe"), due: str("", "YYYY-MM-DD oder leer"), priority: { type: "string", enum: ["high", "normal", "low"] } }, required: ["title"] } },
  { name: "list_tasks", description: "Listet offene Aufgaben, nach Priorität (hoch, normal, niedrig) und dann Fälligkeit sortiert.", input_schema: { type: "object", properties: {} } },
  { name: "list_completed_tasks", description: "Listet erledigte Aufgaben auf. Verwende dieses Tool für Fragen wie „Zeig mir meine erledigten Aufgaben.“", input_schema: { type: "object", properties: {} } },
  { name: "list_tasks_by_date", description: "Listet Aufgaben nach Fälligkeit. Verwende period=today, tomorrow oder this_week für relative Zeiträume; date für ein einzelnes YYYY-MM-DD-Datum; range für frei gewählte Grenzen. Für „diese Woche erledigt“ setze status=completed. Das filtert nach Fälligkeit, nicht nach Abschlusszeit.", input_schema: { type: "object", properties: { period: { type: "string", enum: ["today", "tomorrow", "this_week", "date", "range"] }, date: str("", "Ein Datum YYYY-MM-DD, erforderlich für period=date"), start_date: str("", "Erster Tag inklusive, YYYY-MM-DD, erforderlich für period=range"), end_date: str("", "Letzter Tag inklusive, YYYY-MM-DD, erforderlich für period=range"), status: { type: "string", enum: ["open", "completed", "all"] } }, required: ["period", "status"] } },
  { name: "update_task_priority", description: "Ändert die Priorität einer bestehenden Aufgabe anhand ihrer UUID.", input_schema: { type: "object", properties: { task_id: str("", "UUID der Aufgabe"), priority: { type: "string", enum: ["high", "normal", "low"] } }, required: ["task_id", "priority"] } },
  { name: "complete_task", description: "Hakt eine Aufgabe anhand ihrer ID ab. Nutze zuerst list_tasks und verwende die ID der gewünschten Aufgabe.", input_schema: { type: "object", properties: { task_id: str("", "UUID der Aufgabe aus list_tasks") }, required: ["task_id"] } },
  { name: "log_money", description: "Bucht Einnahme (positiv) oder Ausgabe (negativ) in Euro.", input_schema: { type: "object", properties: { amount: { type: "number" }, note: str("", "Wofür") }, required: ["amount"] } },
  { name: "finance_summary", description: "Verfügbares Geld, Ziele (Paris, Möbel) und letzte Buchungen.", input_schema: { type: "object", properties: {} } },
  { name: "log_gym", description: "Loggt Training oder Körpergewicht (exercise = 'Körpergewicht').", input_schema: { type: "object", properties: { exercise: str("", ""), kg: { type: "number" }, reps: { type: "number" }, sets: { type: "number" } }, required: ["exercise"] } },
  { name: "check_habit", description: "Hakt eine Gewohnheit für heute ab.", input_schema: { type: "object", properties: { habit: str("", "Name") }, required: ["habit"] } },
  { name: "save_fact", description: "Merkt sich einen dauerhaften Fakt über Youssef. Keine Passwörter oder Kontonummern.", input_schema: { type: "object", properties: { text: str("", "Fakt") }, required: ["text"] } },
  { name: "request_automation", description: "Plant einen klaren Software- oder Repository-Auftrag mit OpenAI und Claude. Es werden keine Dateien geändert, bevor der Nutzer den Plan ausdrücklich im Dashboard oder Telegram freigibt. Nicht für normale Fragen oder Aufgabenlisten verwenden.", input_schema: { type: "object", properties: { prompt: str("", "Konkreter Implementierungsauftrag ohne Passwörter, API-Schlüssel oder andere Geheimnisse") }, required: ["prompt"] } },
  { name: "portfolio", description: "Liest Konto und Positionen vom Broker (nur lesen, keine Orders). Optional: nur nutzbar, wenn ein Broker verbunden ist.", input_schema: { type: "object", properties: {} } },
];

async function alpaca(path: string) {
  if (!process.env.ALPACA_KEY) throw new Error("Broker noch nicht verbunden");
  const r = await fetch("https://paper-api.alpaca.markets/v2" + path, {
    headers: { "APCA-API-KEY-ID": process.env.ALPACA_KEY!, "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET! },
  });
  if (!r.ok) throw new Error("Alpaca " + r.status);
  return r.json();
}

export async function runTool(name: string, i: any, supabaseClient?: SupabaseClient, requestKey?: string): Promise<string> {
  if (!i || typeof i !== "object") i = {};
  if ((name === "complete_task" || name === "update_task_priority") && (typeof i.task_id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(i.task_id))) {
    throw new Error("Eine gültige Aufgaben-ID ist erforderlich.");
  }
  if (name === "add_task" && (typeof i.title !== "string" || !i.title.trim())) throw new Error("Ein Aufgabentitel ist erforderlich.");
  if (name === "add_task" && i.due != null && i.due !== "" && !isIsoDate(i.due)) throw new Error("Das Fälligkeitsdatum muss ein gültiges Datum im Format YYYY-MM-DD sein.");
  if (name === "add_task" && i.priority != null && !isTaskPriority(i.priority)) throw new Error("Ungültige Priorität. Erlaubt sind high, normal und low.");
  if (name === "update_task_priority" && !isTaskPriority(i.priority)) throw new Error("Ungültige Priorität. Erlaubt sind high, normal und low.");
  let taskDateRange: { startDate: string; endDate: string } | undefined;
  if (name === "list_tasks_by_date") {
    if (!isTaskStatus(i.status)) throw new Error("Ungültiger Aufgabenstatus. Erlaubt sind open, completed und all.");
    taskDateRange = resolveTaskDateRange(i);
  }

  const supabase = supabaseClient ?? getSupabaseClient();

  switch (name) {
    case "request_automation": {
      if (typeof i.prompt !== "string") throw new Error("Ein konkreter Implementierungsauftrag ist erforderlich.");
      const promptHash = createHash("sha256").update(i.prompt).digest("hex").slice(0, 24);
      const job = await createAutomationJob(i.prompt, requestKey ? `${requestKey}:${promptHash}` : `tool:${randomUUID()}`);
      return JSON.stringify({
        job_id: job.id,
        status: job.status,
        plan: job.plan?.summary ?? null,
        review: job.review?.summary ?? null,
        message: job.status === "awaiting_approval"
          ? "Der Plan ist bereit. Vor dem Start des GitHub-Agenten ist eine ausdrückliche Freigabe im Dashboard erforderlich."
          : "Der Auftrag wurde angelegt. Status und eventuelle Fehlermeldung stehen im Dashboard.",
      });
    }
    case "get_plan": {
      const from = getLocalDate();
      const to = addCalendarDays(from, 14);
      const { data } = await supabase.from("events").select("title,day,time,skipped").gte("day", from).lte("day", to).order("day");
      return JSON.stringify({ morgen: await loadTomorrow(), naechste_termine: data });
    }
    case "add_event": await supabase.from("events").insert({ title: i.title, day: i.day, time: i.time || null, category: i.category || "termin" }); return "eingetragen";
    case "add_task": {
      const priority: TaskPriority = i.priority ?? "normal";
      const { data, error } = await supabase
        .from("tasks")
        .insert({ text: i.title.trim(), due: i.due || null, done: false, priority })
        .select("id,text,due,done,priority")
        .single();
      if (error) throw new Error(`Aufgabe konnte nicht gespeichert werden: ${error.message}`);
      if (!data) throw new Error("Supabase hat keinen gespeicherten Aufgabensatz zurückgegeben.");
      return JSON.stringify({ ok: true, task: { id: data.id, title: data.text, due: data.due, priority: data.priority ?? priority, status: data.done ? "erledigt" : "offen" } });
    }
    case "list_tasks": {
      const { data, error } = await supabase.from("tasks").select("id,text,due,done,priority").eq("done", false).order("due");
      if (error) throw new Error(`Aufgaben konnten nicht gelesen werden: ${error.message}`);
      if (!data) throw new Error("Supabase hat keine Aufgabenliste zurückgegeben.");
      return JSON.stringify(sortTasksByPriorityAndDue(data).map((task) => ({ id: task.id, title: task.text, due: task.due, priority: task.priority ?? "normal", status: task.done ? "erledigt" : "offen" })));
    }
    case "list_completed_tasks": {
      const { data, error } = await supabase.from("tasks").select("id,text,due,done,priority").eq("done", true).order("due");
      if (error) throw new Error(`Erledigte Aufgaben konnten nicht gelesen werden: ${error.message}`);
      if (!data) throw new Error("Supabase hat keine Aufgabenliste zurückgegeben.");
      return JSON.stringify(sortTasksByPriorityAndDue(data).map((task) => ({ id: task.id, title: task.text, due: task.due, priority: task.priority ?? "normal", status: task.done ? "erledigt" : "offen" })));
    }
    case "list_tasks_by_date": {
      if (!taskDateRange) throw new Error("Ein gültiger Datumsfilter ist erforderlich.");
      let query = supabase.from("tasks").select("id,text,due,done,priority").gte("due", taskDateRange.startDate).lte("due", taskDateRange.endDate);
      if (i.status === "open") query = query.eq("done", false);
      if (i.status === "completed") query = query.eq("done", true);
      const { data, error } = await query.order("due");
      if (error) throw new Error(`Aufgaben für den Zeitraum konnten nicht gelesen werden: ${error.message}`);
      if (!data) throw new Error("Supabase hat keine Aufgabenliste zurückgegeben.");
      return JSON.stringify(sortTasksByPriorityAndDue(data).map((task) => ({ id: task.id, title: task.text, due: task.due, priority: task.priority ?? "normal", status: task.done ? "erledigt" : "offen" })));
    }
    case "update_task_priority": {
      const taskId = i.task_id.toLowerCase();
      const { data, error } = await supabase.from("tasks").update({ priority: i.priority }).eq("id", taskId).select("id,priority").maybeSingle();
      if (error) throw new Error(`Aufgabenpriorität konnte nicht geändert werden: ${error.message}`);
      if (!data) return "nicht gefunden";
      if (data.id !== taskId || data.priority !== i.priority) throw new Error("Supabase hat die Prioritätsänderung nicht bestätigt.");
      return JSON.stringify({ ok: true, task_id: data.id, priority: data.priority });
    }
    case "complete_task": {
      const taskId = i.task_id.toLowerCase();
      const { data: updated, error: updateError } = await supabase
        .from("tasks")
        .update({ done: true })
        .eq("id", taskId)
        .eq("done", false)
        .select("id,done")
        .maybeSingle();
      if (updateError) throw new Error(`Aufgabe konnte nicht abgehakt werden: ${updateError.message}`);
      if (!updated) return "nicht gefunden";
      if (updated.id !== taskId || !updated.done) throw new Error("Supabase hat das Abhaken der Aufgabe nicht bestätigt.");
      return "erledigt";
    }
    case "log_money": await supabase.from("money").insert({ amt: i.amount, note: i.note || null }); return "gebucht";
    case "finance_summary": {
      const [m, g] = await Promise.all([supabase.from("money").select("amt,note,day").order("day", { ascending: false }).limit(200), supabase.from("goals").select("name,target,saved")]);
      const bal = (m.data ?? []).reduce((s, x) => s + Number(x.amt), 0);
      return JSON.stringify({ verfuegbar: bal, ziele: g.data, letzte: (m.data ?? []).slice(0, 8) });
    }
    case "log_gym": await supabase.from("gym_logs").insert({ ex: i.exercise, kg: i.kg ?? 0, reps: i.reps ?? 0, sets: i.sets ?? 1 }); return "geloggt";
    case "check_habit": await supabase.from("habit_checks").upsert({ day: getLocalDate(), habit: i.habit }); return "abgehakt";
    case "save_fact": await supabase.from("facts").insert({ text: String(i.text).slice(0, 300) }); return "gemerkt";
    case "portfolio": if (!process.env.ALPACA_KEY) return "Noch kein Broker verbunden."; return JSON.stringify({ konto: await alpaca("/account"), positionen: await alpaca("/positions") });
    default: return "unbekanntes Tool";
  }
}
