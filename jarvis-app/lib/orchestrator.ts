import { addCalendarDays, getLocalDate } from "./task-utils";

export type OrchestratorIntent =
  | "general"
  | "task"
  | "task_completion"
  | "daily_planning"
  | "weekly_planning"
  | "calendar"
  | "reminder"
  | "learning"
  | "fitness"
  | "finance"
  | "business"
  | "goals"
  | "habits"
  | "memory"
  | "analysis"
  | "automation"
  | "development";

export type OrchestratorAction =
  | { type: "add_task"; title: string; due: string | null; priority: "high" | "normal" | "low" }
  | { type: "complete_task"; title: string }
  | { type: "add_event"; title: string; day: string; time: string | null; category: string }
  | { type: "log_gym"; exercise: string }
  | { type: "save_fact"; text: string }
  | { type: "generate_daily_plan"; date: string }
  | { type: "generate_weekly_plan"; date: string }
  | { type: "approval_required"; reason: "delete" | "cancel_external" | "financial_transaction" | "sensitive_change" }
  | { type: "clarify"; question: string };

export type OrchestratorAnalysis = {
  intents: OrchestratorIntent[];
  tools: string[];
  actions: OrchestratorAction[];
  shouldAskClarification: boolean;
  shouldRequireApproval: boolean;
};

const normalize = (text: string) => text.trim().toLocaleLowerCase("de");

function resolveGermanDate(text: string, now = new Date()): string | null {
  const today = getLocalDate(now);
  if (/\bmorgen\b/.test(normalize(text))) return addCalendarDays(today, 1);
  if (/\bheute\b/.test(normalize(text))) return today;
  if (/\bübermorgen\b/.test(normalize(text))) return addCalendarDays(today, 2);

  const iso = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(text);
  if (iso) return iso[1];

  const weekdays: Record<string, number> = {
    sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6,
  };
  const match = /\b(sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag)\b/i.exec(text);
  if (!match) return null;
  const target = weekdays[match[1].toLocaleLowerCase("de")];
  const current = new Date(`${today}T12:00:00Z`).getUTCDay();
  let offset = (target - current + 7) % 7;
  if (offset === 0) offset = 7;
  return addCalendarDays(today, offset);
}

function extractTime(text: string): string | null {
  const match = /\b([01]?\d|2[0-3])(?::([0-5]\d))?\s*(?:uhr\b)?/i.exec(text);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2] ?? "00"}`;
}

export function analyzeOrchestratorInput(input: string, now = new Date()): OrchestratorAnalysis {
  const text = input.trim();
  const lower = normalize(text);
  const intents = new Set<OrchestratorIntent>();
  const tools = new Set<string>();
  const actions: OrchestratorAction[] = [];

  if (/\b(plan|planung|plane|woche|heute|morgen|tag)\b/.test(lower)) {
    if (/\b(wochen|nächste woche|kommende woche)\b/.test(lower)) {
      intents.add("weekly_planning");
      tools.add("get_weekly_plan");
    } else if (/\b(plan|planung|plane)\b/.test(lower)) {
      intents.add("daily_planning");
      tools.add("generate_daily_plan");
    }
  }

  if (/\b(klausur(?:en)?|lernen|schule|präsentation(?:en)?|hausaufgabe|prüfung(?:en)?)\b/.test(lower)) {
    intents.add("learning");
    tools.add("list_tasks");
  }
  if (/\b(training|gym|fitness|fitnessstudio|brust|rücken|laufen|kraft|trainiert|trainiere|trainieren|dehnen)\b/.test(lower)) {
    intents.add("fitness");
    tools.add("list_tasks");
  }
  if (/\b(euro|kontostand|geld|buchung|ausgabe|einnahme|sparziel|preis|kaufen|überweisen)\b/.test(lower)) {
    intents.add("finance");
    tools.add("finance_summary");
  }
  if (/\b(projekt|business|kund|deadline|unternehmens)\b/.test(lower)) {
    intents.add("business");
  }
  if (/\bziel|abnehmen|zunehmen|kg\b/.test(lower)) {
    intents.add("goals");
  }
  if (/\bgewohnheit|routine|habit|täglich|jeden tag\b/.test(lower)) {
    intents.add("habits");
  }
  if (/\btermin|kalender|datum|morgen um|uhr\b/.test(lower)) {
    intents.add("calendar");
  }
  if (/\b(erinner|reminder|nicht vergessen)\b/.test(lower)) {
    intents.add("reminder");
  }
  if (/\bmerke|gemerkt|speichere|mein kontostand|ich habe|mein ziel|ich bin\b/.test(lower)) {
    intents.add("memory");
  }
  if (/\b(berichte|analyse|auswertung|wie war|statistik|fortschritt)\b/.test(lower)) {
    intents.add("analysis");
  }
  if (/\b(automation|automatisier|job)\b/.test(lower)) {
    intents.add("automation");
  }
  if (/\b(repo|github|code|implementier|baue|entwickle|reparier|branch|deploy)\b/.test(lower)) {
    intents.add("development");
  }

  if (/(\blöschen?\b|\blösche\b|\bstorniere\b|\bsag .* ab\b)/.test(lower)
    || /\b(kaufen|überweise|übertragung|bezahle|trade|order)\b/.test(lower)
    || /\b(ändern|ändere|verändere|sensitive)\b.*\b(passwort|konto|geheim|sensitive)\b/.test(lower)) {
    intents.add("finance");
  }

  let approvalRequired = false;
  let approvalAction: OrchestratorAction | null = null;
  if (/\b(löschen|lösche|löscht|delete)\b/.test(lower)) {
    approvalRequired = true;
    approvalAction = { type: "approval_required", reason: "delete" };
  } else if (/\b(storniere|storniert|sag(e)? .* ab|sage .* ab|absagen|kündige)\b/.test(lower)) {
    approvalRequired = true;
    approvalAction = { type: "approval_required", reason: "cancel_external" };
  } else if (lower.includes("kaufen") || lower.includes("überweise") || lower.includes("überweisung") || lower.includes("übertragung") || lower.includes("bezahle") || lower.includes("trade") || lower.includes("order")) {
    approvalRequired = true;
    approvalAction = { type: "approval_required", reason: "financial_transaction" };
  } else if (/\b(passwort|kontonummer|geheimnis|api[_ -]?key)\b/.test(lower)) {
    approvalRequired = true;
    approvalAction = { type: "approval_required", reason: "sensitive_change" };
  }

  if (/(\berledigt\b|\babgehakt\b|\bgeschlossen\b)/.test(lower) && /\b(aufgabe|task|präsentation|hausaufgabe)\b/.test(lower)) {
    intents.add("task_completion");
    tools.add("complete_task");
    actions.push({ type: "complete_task", title: text.replace(/.*?(?:aufgabe|task)\s*(?:mit dem titel)?|.*?\b/i, "").trim() });
  } else {
    const taskMatch = /\b(muss|brauche|erstelle|füge|mach|aufgabe|deadline)\b/i.test(text);
    if (taskMatch) {
      intents.add("task");
      tools.add("add_task");
      const due = resolveGermanDate(text, now);
      const learningTask = /\b(muss|muss noch|möchte|will)\s+(.*?)\blernen\b/i.exec(text);
      let title = learningTask?.[2]
        ? `${learningTask[2].trim()} lernen`
        : text
          .replace(/^(?:ich\s+muss|ich\s+brauche|erstelle|füge|mach(?:e)?(?: eine)? aufgabe|die aufgabe)\s*/i, "")
          .replace(/\s+(?:bis|am|für|für)\s+(?:morgen|heute|übermorgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b.*$/i, "")
          .replace(/\b(bitte|dringend)\b/gi, "")
          .replace(/\s+/g, " ")
          .trim();
      if (title.length > 120) title = title.slice(0, 120);
      if (title) actions.push({ type: "add_task", title, due, priority: /\b(dringen(d|t)|höchste priorität)\b/i.test(text) ? "high" : "normal" });
    }
  }

  const date = resolveGermanDate(text, now);
  const explicitEvent = /\b(termin|training|gym|meeting|besprechung|feier|fahrt|fahrt nach|veranstaltung|fußball|fussball)\b/i.test(text);
  if (explicitEvent && date) {
    intents.add("calendar");
    tools.add("add_event");
    const time = extractTime(text);
    const category = /\b(training|gym|laufen|kraft)\b/i.test(text) ? "fussball" : "termin";
    const title = /\bfußball\b/i.test(text) ? "Fußball" : /\bfitnessstudio\b/i.test(text) ? "Fitnessstudio" : text.replace(/^(ich habe|ich muss|setze|termin:?)\s*/i, "").replace(/\b(morgen|heute|übermorgen|um\s+\d{1,2}(?::\d{2})?\s*uhr)\b/gi, "").trim().slice(0, 160) || "Termin";
    actions.push({ type: "add_event", title, day: date, time, category });
  }

  if (/\b(plane|planung|planen)\b.*\b(morgen|heute|kommende woche|nächste woche)\b/i.test(text)) {
    if (/\b(kommende|nächste)\s+woche\b/i.test(text)) {
      actions.push({ type: "generate_weekly_plan", date: getLocalDate(now) });
    } else {
      actions.push({ type: "generate_daily_plan", date: date ?? getLocalDate(now) });
    }
  }

  if (/\bfitnessstudio\b/i.test(text) && date) {
    const alreadyAdded = actions.some((action) => action.type === "add_task" && action.title.toLocaleLowerCase("de").includes("fitness"));
    if (!alreadyAdded) actions.push({ type: "add_task", title: "Ins Fitnessstudio gehen", due: date, priority: "normal" });
  }

  if (/(\bhabe\b.*\b(trainiert|gelaufen)\b|\bbrust und rücken\b)/.test(lower) || /\blog(?:ge)?\s*(?:mein)?\s*training\b/.test(lower)) {
    intents.add("fitness");
    tools.add("log_gym");
    const exercise = /\bbrust und rücken\b/i.test(text) ? "Brust und Rücken" : text.match(/\b(Kniebeugen|Bankdrücken|Rudern|Laufen|Dehnen|Brust|Rücken)\b/i)?.[0] ?? "Training";
    actions.push({ type: "log_gym", exercise });
  }

  if (/\b(kontostand|mein kontostand|mein ziel|ich bin|ich habe .* euro|merke|gemerkt)\b/.test(lower)
    && !/\b(passwort|kontonummer|api[_ -]?key|geheimnis)\b/.test(lower)) {
    tools.add("save_fact");
    const fact = text
      .replace(/^(?:merke(?: dir)?|gemerkt|speichere)\s*/i, "")
      .replace(/\b(bitte|kurz)\b/gi, "")
      .trim();
    if (fact) actions.push({ type: "save_fact", text: fact.slice(0, 300) });
  }

  if (approvalRequired && approvalAction) actions.unshift(approvalAction);
  if (intents.size === 0) intents.add("general");

  const needsYearClarification = /\b\d{1,2}[.]\d{1,2}[.]|\b\d{1,2}\s+(?:januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\b/i.test(text)
    && !/\b20\d{2}\b/.test(text);
  if (needsYearClarification) {
    actions.push({ type: "clarify", question: "Für welches Jahr gilt dieses Datum?" });
  }

  return {
    intents: [...intents],
    tools: [...tools],
    actions,
    shouldAskClarification: actions.some((action) => action.type === "clarify"),
    shouldRequireApproval: approvalRequired,
  };
}

export function selectRelevantMemory<T extends { text: string }>(facts: T[], text: string, limit = 12): T[] {
  const terms = normalize(text).split(/[^a-zäöüß0-9]+/).filter((term) => term.length >= 4);
  if (!terms.length) return facts.slice(0, limit);
  const aliases: Record<string, string[]> = {
    mathe: ["mathematik", "prüfung", "klausur"],
    mathematik: ["mathe", "prüfung", "klausur"],
    prüfung: ["klausur", "prüfung", "mathe", "mathematik"],
    klausur: ["prüfung", "klausur", "mathe", "mathematik"],
  };
  const score = (fact: T) => terms.reduce((count, term) => {
    const haystack = normalize(fact.text);
    if (haystack.includes(term)) return count + 2;
    if (term.includes("mathe") && /mathematik|prüfung|klausur/.test(haystack)) return count + 2;
    return count + (aliases[term]?.some((alias) => haystack.includes(alias)) ? 1 : 0);
  }, 0);
  return facts
    .map((fact, index) => ({ fact, index, score: score(fact) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.fact)
    .slice(0, limit);
}
