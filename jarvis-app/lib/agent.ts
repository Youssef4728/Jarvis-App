import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { getSupabaseClient } from "./supabase";
import { TOOLS, runTool } from "./tools";
import { getLocalDate, runTaskCreationOnce } from "./task-utils";
import { hasConfirmedZeroCostQuota } from "./zero-cost";
import { createAutomationJob } from "./automation/service";
import { runPlanningIntent } from "./planning-chat";
import { analyzeOrchestratorInput, selectRelevantMemory } from "./orchestrator";
import { executeCentralActions } from "./execution-engine";

const DEVELOPMENT_REQUEST_PATTERN = /\b(entwickle|entwickeln|implementiere|implementieren|baue|bauen|erstelle|erstellen|programmiere|programmieren|fixe|repariere|reparieren|build|implement|create|fix)\b/i;

export async function runAgent(text: string, save = true, requestId: string = randomUUID()) {
  const orchestration = analyzeOrchestratorInput(text);
  const planningReply = await runPlanningIntent(text);
  if (planningReply !== null && orchestration.intents.length === 1 && orchestration.actions.length === 0) {
    if (save) {
      const { error } = await getSupabaseClient().from("messages").insert([{ role: "user", content: text }, { role: "assistant", content: planningReply }]);
      if (error) throw new Error(`Planungsantwort konnte nicht gespeichert werden: ${error.message}`);
    }
    return planningReply;
  }
  if (orchestration.shouldAskClarification) {
    const reply = orchestration.actions
      .filter((action) => action.type === "clarify")
      .map((action) => action.question)
      .join(" ");
    if (save) {
      const { error } = await getSupabaseClient().from("messages").insert([{ role: "user", content: text }, { role: "assistant", content: reply }]);
      if (error) throw new Error("offline_chat_persistence_failed");
    }
    return reply;
  }
  if (orchestration.shouldRequireApproval) {
    await executeCentralActions(text, requestId, orchestration.actions);
    const reply = "Diese Änderung hat größere Auswirkungen. Ich habe nichts ausgeführt. Bitte bestätige ausdrücklich, welche Aktion ausgeführt werden soll.";
    if (save) {
      const { error } = await getSupabaseClient().from("messages").insert([{ role: "user", content: text }, { role: "assistant", content: reply }]);
      if (error) throw new Error("offline_chat_persistence_failed");
    }
    return reply;
  }
  if (orchestration.actions.length > 0) {
    const execution = await executeCentralActions(text, requestId, orchestration.actions);
    const completed = execution.items.filter((item) => item.status === "completed");
    const failed = execution.items.filter((item) => item.status === "failed");
    const lines = [
      execution.summary,
      ...completed.map((item) => `Erledigt: ${item.label}${item.result ? ` — ${item.result}` : ""}`),
      ...failed.map((item) => `Fehlgeschlagen: ${item.label} — ${item.errorCode ?? "Unbekannter Fehler"}`),
    ];
    const reply = lines.join("\n");
    if (save) {
      const { error } = await getSupabaseClient().from("messages").insert([{ role: "user", content: text }, { role: "assistant", content: reply }]);
      if (error) throw new Error("offline_chat_persistence_failed");
    }
    return reply;
  }
  if (!hasConfirmedZeroCostQuota("anthropic")) {
    let reply = "JARVIS ist im 0-EUR-Modus. Die KI-Anfrage ist pausiert, bis ein kostenloses Kontingent ohne kostenpflichtigen Fallback verifiziert und freigegeben ist.";
    if (DEVELOPMENT_REQUEST_PATTERN.test(text)) {
      try {
        const job = await createAutomationJob(text, `chat:${requestId}`);
        reply = `Entwicklungsauftrag ${job.id} wurde dauerhaft gespeichert und pausiert. JARVIS setzt ihn fort, sobald die benötigten kostenlosen KI-Kontingente verifiziert verfügbar sind. Es wird kein kostenpflichtiger Fallback verwendet.`;
      } catch {
        reply = "JARVIS ist im 0-EUR-Modus. Der Entwicklungsauftrag konnte wegen eines Speicher- oder Validierungsfehlers nicht in die dauerhafte Auftragsqueue übernommen werden; bitte den angezeigten Fehler prüfen.";
      }
    }
    if (save) {
      const { error } = await getSupabaseClient().from("messages").insert([{ role: "user", content: text }, { role: "assistant", content: reply }]);
      if (error) throw new Error("offline_chat_persistence_failed");
    }
    return reply;
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("claude_not_configured");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 25_000, maxRetries: 1 });
  const supabase = getSupabaseClient();
  const [facts, hist] = await Promise.all([
    supabase.from("facts").select("text"),
    supabase.from("messages").select("role,content").order("id", { ascending: false }).limit(20),
  ]);
  if (facts.error) throw new Error(`Fakten konnten nicht geladen werden: ${facts.error.message}`);
  if (hist.error) throw new Error(`Chat-Verlauf konnte nicht geladen werden: ${hist.error.message}`);
  const past = (hist.data ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  while (past.length && past[0].role !== "user") past.shift();
  const messages: Anthropic.MessageParam[] = [...past, { role: "user", content: text }];
  const system =
    "Du bist Jarvis, der persönliche Assistent von Youssef: direkt, konkret, motivierend, auf Deutsch, kurz. " +
    "Du hast deterministische Tools für Tages- und Wochenplanung, Konflikte, Prioritäten, Aufgaben, Geld, Fitness, Gewohnheiten und Gedächtnis. Nutze Planungs-Tools statt zu raten; der Plan-Kontext wird gezielt aus strukturierten Daten geladen, nicht aus dem Chatverlauf. " +
    "Erstelle Aufgaben mit add_task nur einmal pro eindeutiger Aufgabe; übernimm den Titel, ein ausdrücklich genanntes Datum und eine ausdrücklich genannte Priorität. Ohne Datum due leer lassen, ohne Priorität normal verwenden. Dringend bedeutet high nur, wenn der Nutzer diese Dringlichkeit klar nennt. Bei mehrdeutigen Daten, insbesondere fehlendem Jahr, frage nach statt zu raten. Nach erfolgreichem Speichern bestätige Titel, Fälligkeit und Priorität. " +
    "Für heute/morgen/Wochentage nutze list_tasks_by_date mit period=today, tomorrow oder this_week; die Anwendung berechnet Europe/Berlin und Montag bis Sonntag. Einen Wochentag ohne weitere Präzisierung als nächstes zukünftiges Vorkommen interpretieren; bei unklarer Absicht nachfragen. Für konkrete Daten nutze period=date und ein YYYY-MM-DD-Datum; bei mehrdeutigem Jahr nachfragen. „Diese Woche erledigt“ bedeutet erledigte Aufgaben mit Fälligkeit diese Woche; wenn nach dem tatsächlichen Erledigungszeitpunkt gefragt wird, erkläre, dass kein Abschlussdatum gespeichert wird. " +
    "Wenn Youssef eine konkrete Änderung am JARVIS-Repository oder einen Coding-Auftrag erteilt, nutze request_automation. Nach Plan und Prüfung kommt der Auftrag automatisch in die isolierte Coding-Worker-Queue. Behaupte nicht, Code geändert oder getestet zu haben, bevor das Development Center Worker-, Commit- und Testergebnisse meldet. Production-Änderungen, Deployments und externe Aktionen niemals durch diesen Pfad starten. Niemals Geheimnisse in Aufträge übernehmen. " +
    "Melde Schreibvorgänge nur dann als erfolgreich, wenn das Tool eine erfolgreiche Datenbankoperation bestätigt. Weise auf Tool-Fehler ausdrücklich hin. " +
    "Heute in Europe/Berlin ist " + getLocalDate() + ". Gesundheit: Wade (möglicher Muskelfaserriss) und Rücken schonen. " +
    "Bei Geld und Trading rechnest du ehrlich vor und führst keine Orders aus. Gemerkte Fakten:\n" +
    ((facts.data ?? []).map((f) => "- " + f.text).join("\n") || "(noch keine)");

  const taskCreations = new Map<string, Promise<string>>();
  for (let step = 0; step < 6; step++) {
    const res = await client.messages.create({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 1200, system, tools: TOOLS, messages });
    if (res.stop_reason !== "tool_use") {
      const out = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
      if (save) {
        const { error } = await supabase.from("messages").insert([{ role: "user", content: text }, { role: "assistant", content: out }]);
        if (error) console.error("[agent] chat response was not persisted", { message: error.message });
      }
      return out;
    }
    messages.push({ role: "assistant", content: res.content });
    const results = await Promise.all(
      res.content.filter((c): c is Anthropic.ToolUseBlock => c.type === "tool_use").map(async (c) => {
        try {
          let result: string;
          if (c.name === "add_task") {
            result = await runTaskCreationOnce(taskCreations, c.input, () => runTool(c.name, c.input));
          } else {
            result = await runTool(c.name, c.input, undefined, requestId);
          }
          return { type: "tool_result" as const, tool_use_id: c.id, content: result };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { type: "tool_result" as const, tool_use_id: c.id, content: `Tool ${c.name} fehlgeschlagen: ${message}`, is_error: true as const };
        }
      })
    );
    messages.push({ role: "user", content: results });
  }
  return "Das war zu viele Schritte auf einmal, frag mich bitte etwas konkreter.";
}
