import { getSupabaseClient } from "./supabase";
import { prayerTimes } from "./prayer";

export function tomorrowBerlin() {
  const d = new Date(Date.now() + 864e5);
  const iso = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);
  const weekday = new Date(iso + "T12:00:00Z").getUTCDay();
  return { iso, weekday };
}

export async function loadTomorrow() {
  const supabase = getSupabaseClient();
  const { iso, weekday } = tomorrowBerlin();
  const [r, e, b, prayers] = await Promise.all([
    supabase.from("routines").select("*").eq("active", true).contains("weekdays", [weekday]),
    supabase.from("events").select("*").eq("day", iso).eq("skipped", false),
    supabase.from("breaks").select("*").lte("start_date", iso).gte("end_date", iso),
    prayerTimes(iso),
  ]);
  const paused = new Set((b.data ?? []).flatMap((x) => x.categories as string[]));
  const items = [
    ...(r.data ?? []),
    ...(e.data ?? []),
  ]
    .filter((x) => !paused.has(x.category))
    .map((x) => ({ title: x.title, time: x.time as string | null, category: x.category as string }))
    .concat(prayers)
    .sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
  return { date: iso, pauses: (b.data ?? []).map((x) => x.title), items };
}

export async function askClaude(userText: string, history: { role: "user" | "assistant"; content: string }[]) {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();
  const plan = await loadTomorrow();
  const res = await client.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 800,
    system:
      "Du bist Jarvis, der persönliche Assistent von Youssef. Antworte auf Deutsch, kurz und klar. " +
      "Hilf bei Tagesplanung, Routinen und Disziplin. Plan für morgen: " + JSON.stringify(plan),
    messages: [...history, { role: "user", content: userText }],
  });
  return res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
}
