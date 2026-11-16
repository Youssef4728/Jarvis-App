// Gebetszeiten über die kostenlose Aladhan-API (Methode 13 = Diyanet), Ort: Dornum
export async function prayerTimes(iso: string) {
  const [y, m, d] = iso.split("-");
  try {
    const r = await fetch(
      `https://api.aladhan.com/v1/timingsByCity/${d}-${m}-${y}?city=Dornum&country=Germany&method=13`,
      { next: { revalidate: 3600 } }
    );
    if (!r.ok) throw new Error(`Aladhan HTTP ${r.status}`);
    const payload = await r.json() as { data?: { timings?: Record<string, unknown> } };
    const t = payload.data?.timings;
    if (!t || !["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"].every((key) => typeof t[key] === "string")) {
      throw new Error("Aladhan response did not contain prayer timings.");
    }
    return ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"].map((k) => ({
      title: `Gebet: ${k}`,
      time: (t[k] as string).slice(0, 5),
      category: "gebet",
    }));
  } catch (error) {
    console.error("[prayer] prayer times unavailable", error instanceof Error ? error.message : "unknown_error");
    return [];
  }
}
