import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { getSupabaseClient } from "./supabase";
import { TOOLS, runTool } from "./tools";
import { getLocalDate, runTaskCreationOnce } from "./task-utils";

export async function runAgent(text: string, save = true, requestId: string = randomUUID()) {
  const client = new Anthropic();
  const supabase = getSupabaseClient();
  const [facts, hist] = await Promise.all([
    supabase.from("facts").select("text"),
    supabase.from("messages").select("role,content").order("id", { ascending: false }).limit(20),
  ]);
  const past = (hist.data ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  while (past.length && past[0].role !== "user") past.shift();
  const messages: Anthropic.MessageParam[] = [...past, { role: "user", content: text }];
  const system =
    "Du bist Jarvis, der persönliche Assistent von Youssef: direkt, konkret, motivierend, auf Deutsch, kurz. " +
    "Du hast Tools für Plan, Aufgaben, Geld, Fitness, Gewohnheiten und Gedächtnis. Nutze sie, statt zu raten, und trage Dinge direkt ein, wenn er sie erwähnt. " +
    "Erstelle Aufgaben mit add_task nur einmal pro eindeutiger Aufgabe; übernimm den Titel, ein ausdrücklich genanntes Datum und eine ausdrücklich genannte Priorität. Ohne Datum due leer lassen, ohne Priorität normal verwenden. Dringend bedeutet high nur, wenn der Nutzer diese Dringlichkeit klar nennt. Bei mehrdeutigen Daten, insbesondere fehlendem Jahr, frage nach statt zu raten. Nach erfolgreichem Speichern bestätige Titel, Fälligkeit und Priorität. " +
    "Für heute/morgen/Wochentage nutze list_tasks_by_date mit period=today, tomorrow oder this_week; die Anwendung berechnet Europe/Berlin und Montag bis Sonntag. Einen Wochentag ohne weitere Präzisierung als nächstes zukünftiges Vorkommen interpretieren; bei unklarer Absicht nachfragen. Für konkrete Daten nutze period=date und ein YYYY-MM-DD-Datum; bei mehrdeutigem Jahr nachfragen. „Diese Woche erledigt“ bedeutet erledigte Aufgaben mit Fälligkeit diese Woche; wenn nach dem tatsächlichen Erledigungszeitpunkt gefragt wird, erkläre, dass kein Abschlussdatum gespeichert wird. " +
    "Wenn Youssef eine konkrete Änderung am JARVIS-Repository oder einen Coding-Auftrag erteilt, nutze request_automation. Behaupte nicht, Code geändert zu haben: der Plan wartet ausdrücklich auf Freigabe im Dashboard oder Telegram. Niemals Geheimnisse in Aufträge übernehmen. " +
    "Melde Schreibvorgänge nur dann als erfolgreich, wenn das Tool eine erfolgreiche Datenbankoperation bestätigt. Weise auf Tool-Fehler ausdrücklich hin. " +
    "Heute in Europe/Berlin ist " + getLocalDate() + ". Gesundheit: Wade (möglicher Muskelfaserriss) und Rücken schonen. " +
    "Bei Geld und Trading rechnest du ehrlich vor und führst keine Orders aus. Gemerkte Fakten:\n" +
    ((facts.data ?? []).map((f) => "- " + f.text).join("\n") || "(noch keine)");

  const taskCreations = new Map<string, Promise<string>>();
  for (let step = 0; step < 6; step++) {
    const res = await client.messages.create({ model: "claude-sonnet-5-5", max_tokens: 1200, system, tools: TOOLS, messages });
    if (res.stop_reason !== "tool_use") {
      const out = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
      if (save) await supabase.from("messages").insert([{ role: "user", content: text }, { role: "assistant", content: out }]);
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
