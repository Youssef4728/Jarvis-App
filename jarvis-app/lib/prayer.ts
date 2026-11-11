// Gebetszeiten über die kostenlose Aladhan-API (Methode 13 = Diyanet), Ort: Dornum
export async function prayerTimes(iso: string) {
  const [y, m, d] = iso.split("-");
  try {
    const r = await fetch(
      `https://api.aladhan.com/v1/timingsByCity/${d}-${m}-${y}?city=Dornum&country=Germany&method=13`,
      { next: { revalidate: 3600 } }
    );
    const t = (await r.json()).data.timings;
    return ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"].map((k) => ({
      title: `Gebet: ${k}`,
      time: String(t[k]).slice(0, 5),
      category: "gebet",
    }));
  } catch {
    return [];
  }
}
