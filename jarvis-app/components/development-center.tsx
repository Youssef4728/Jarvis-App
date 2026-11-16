"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { canTransitionDevelopmentItem } from "@/lib/development/validation";
import type { DevelopmentStatus } from "@/lib/development/types";

type VisionRevision = {
  id: string;
  revision: number;
  title: string;
  content: string;
  created_at: string;
};
type DevelopmentItem = {
  id: string;
  vision_revision_id: string;
  parent_id: string | null;
  item_type: "goal" | "milestone" | "task";
  title: string;
  description: string;
  priority: number;
  status: DevelopmentStatus;
  acceptance_criteria: string[];
  test_requirements: string[];
  affected_components: string[];
  estimated_effort_minutes: number | null;
  blocked_reason: string | null;
  created_at: string;
};
type DevelopmentEvent = {
  id: number;
  event_type: string;
  summary: string;
  created_at: string;
};
type Snapshot = { vision: VisionRevision | null; items: DevelopmentItem[]; events: DevelopmentEvent[] };

const statusLabels: Record<DevelopmentStatus, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Bearbeitung",
  testing: "Testing",
  review: "Review",
  blocked: "Blockiert",
  awaiting_approval: "Freigabe nötig",
  completed: "Abgeschlossen",
  failed: "Fehlgeschlagen",
  cancelled: "Abgebrochen",
};
const nextStatus: Partial<Record<DevelopmentStatus, DevelopmentStatus>> = {
  backlog: "ready",
  ready: "in_progress",
  in_progress: "testing",
  testing: "review",
  blocked: "ready",
  failed: "ready",
  awaiting_approval: "ready",
};

function authHeader(password: string) {
  const safeValue = /[^\x20-\x7e]/.test(password) ? "utf8:" + encodeURIComponent(password) : password;
  return { "x-app-password": safeValue };
}

function lines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function responseData(response: Response) {
  let data: Record<string, unknown>;
  try {
    data = await response.json() as Record<string, unknown>;
  } catch {
    throw new Error("Development Center: ungültige Serverantwort.");
  }
  if (response.status === 401) throw new Error("Sitzung abgelaufen. Bitte abmelden und erneut anmelden.");
  if (!response.ok) {
    const code = typeof data.error === "string" ? data.error : "";
    if (code === "development_store_unavailable") {
      throw new Error("Development-Datenbank nicht verfügbar. Prüfe, ob die additive Self-Evolution-Migration angewendet wurde.");
    }
    if (code === "development_transition_rejected") {
      throw new Error("Statuswechsel abgelehnt. Prüfe Abhängigkeiten und den aktuellen Aufgabenstatus.");
    }
    if (code === "idempotency_key_conflict") {
      throw new Error("Dieser Wiederholungsschlüssel wurde bereits für andere Inhalte verwendet.");
    }
    throw new Error("Development-Aktion fehlgeschlagen (" + (code || response.status) + ").");
  }
  return data;
}

export default function DevelopmentCenter({ password }: { password: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [visionTitle, setVisionTitle] = useState("JARVIS Master Vision");
  const [visionContent, setVisionContent] = useState("");
  const [itemType, setItemType] = useState<"goal" | "milestone" | "task">("goal");
  const [itemTitle, setItemTitle] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemPriority, setItemPriority] = useState(1);
  const [effortMinutes, setEffortMinutes] = useState("");
  const [dependencyIds, setDependencyIds] = useState<string[]>([]);
  const [criteriaText, setCriteriaText] = useState("");
  const [testsText, setTestsText] = useState("");
  const [componentsText, setComponentsText] = useState("");
  const visionKey = useRef<string | null>(null);
  const itemKey = useRef<string | null>(null);

  async function refresh(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/development", { headers: authHeader(password), cache: "no-store" });
      const data = await responseData(response);
      setSnapshot({
        vision: (data.vision as VisionRevision | null) ?? null,
        items: Array.isArray(data.items) ? data.items as DevelopmentItem[] : [],
        events: Array.isArray(data.events) ? data.events as DevelopmentEvent[] : [],
      });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Development-Daten konnten nicht geladen werden.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    if (!password) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/development", { headers: authHeader(password), cache: "no-store" });
        const data = await responseData(response);
        if (!cancelled) {
          setSnapshot({
            vision: (data.vision as VisionRevision | null) ?? null,
            items: Array.isArray(data.items) ? data.items as DevelopmentItem[] : [],
            events: Array.isArray(data.events) ? data.events as DevelopmentEvent[] : [],
          });
          setError("");
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Development-Daten konnten nicht geladen werden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(() => { void load(); }, 30_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [password]);

  async function createVision(event: FormEvent) {
    event.preventDefault();
    if (!visionTitle.trim() || !visionContent.trim() || busy) return;
    setBusy("vision");
    setError("");
    try {
      const response = await fetch("/api/development", {
        method: "POST",
        headers: { ...authHeader(password), "Content-Type": "application/json", "Idempotency-Key": visionKey.current ?? (visionKey.current = crypto.randomUUID()) },
        body: JSON.stringify({ action: "create_vision", title: visionTitle, content: visionContent }),
      });
      await responseData(response);
      visionKey.current = null;
      setVisionContent("");
      await refresh(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Master Vision konnte nicht gespeichert werden.");
    } finally {
      setBusy("");
    }
  }

  async function createItem(event: FormEvent) {
    event.preventDefault();
    if (!snapshot?.vision || !itemTitle.trim() || busy) return;
    setBusy("item");
    setError("");
    try {
      const response = await fetch("/api/development", {
        method: "POST",
        headers: { ...authHeader(password), "Content-Type": "application/json", "Idempotency-Key": itemKey.current ?? (itemKey.current = crypto.randomUUID()) },
        body: JSON.stringify({
          action: "create_item",
          item: {
            visionRevisionId: snapshot.vision.id,
            type: itemType,
            title: itemTitle,
            description: itemDescription,
            priority: itemPriority,
            acceptanceCriteria: lines(criteriaText),
            testRequirements: lines(testsText),
            affectedComponents: componentsText.split(",").map((part) => part.trim()).filter(Boolean),
            estimatedEffortMinutes: effortMinutes ? Number(effortMinutes) : null,
            dependencies: dependencyIds,
          },
        }),
      });
      await responseData(response);
      itemKey.current = null;
      setItemTitle("");
      setItemDescription("");
      setEffortMinutes("");
      setDependencyIds([]);
      setCriteriaText("");
      setTestsText("");
      setComponentsText("");
      await refresh(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Development-Aufgabe konnte nicht erstellt werden.");
    } finally {
      setBusy("");
    }
  }

  async function advanceItem(item: DevelopmentItem) {
    const target = nextStatus[item.status];
    if (!target || !canTransitionDevelopmentItem(item.status, target) || busy) return;
    setBusy(item.id);
    setError("");
    try {
      const response = await fetch("/api/development", {
        method: "PATCH",
        headers: { ...authHeader(password), "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, expectedStatus: item.status, nextStatus: target }),
      });
      await responseData(response);
      await refresh(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Aufgabenstatus konnte nicht geändert werden.");
    } finally {
      setBusy("");
    }
  }

  const completed = snapshot?.items.filter((item) => item.status === "completed").length ?? 0;
  const progress = snapshot?.items.length ? Math.round(completed / snapshot.items.length * 100) : 0;

  return (
    <section id="development" className="development-center surface-card" aria-labelledby="development-title">
      <div className="development-heading">
        <div>
          <span className="eyebrow">SELF-EVOLUTION ENGINE</span>
          <h2 id="development-title">Development Center</h2>
          <p>Vision, persistente Aufgaben und nachvollziehbarer Fortschritt.</p>
        </div>
        <button className="secondary-button" type="button" disabled={loading} onClick={() => void refresh()}>{loading ? "Lädt…" : "Aktualisieren"}</button>
      </div>

      {error && <div className="development-error" role="alert">{error}</div>}
      {loading && !snapshot ? <div className="development-loading" aria-label="Development-Daten werden geladen"><span /><span /><span /></div> : (
        <>
          <div className="development-metrics">
            <div><span>Aufgaben</span><strong>{snapshot?.items.length ?? 0}</strong></div>
            <div><span>Abgeschlossen</span><strong>{completed}</strong></div>
            <div><span>Fortschritt</span><strong>{progress}%</strong></div>
            <div><span>Master Vision</span><strong>{snapshot?.vision ? "v" + snapshot.vision.revision : "Noch nicht gespeichert"}</strong></div>
          </div>

          {snapshot?.vision && <article className="development-vision">
            <div><span className="eyebrow">AKTIVE VISION · VERSION {snapshot.vision.revision}</span><h3>{snapshot.vision.title}</h3></div>
            <details><summary>Vision anzeigen</summary><p>{snapshot.vision.content}</p></details>
          </article>}

          <div className="development-forms">
            <form className="development-form" onSubmit={createVision}>
              <h3>{snapshot?.vision ? "Neue Vision-Version speichern" : "Master Vision speichern"}</h3>
              <label>Titel<input value={visionTitle} onChange={(event) => setVisionTitle(event.target.value)} maxLength={160} required /></label>
              <label>Vision<textarea value={visionContent} onChange={(event) => setVisionContent(event.target.value)} maxLength={40000} rows={5} placeholder="Füge hier die Master Vision ein." required /></label>
              <button className="primary-button" type="submit" disabled={busy !== "" || !visionContent.trim()}>{busy === "vision" ? "Wird gespeichert…" : "Vision-Version speichern"}</button>
            </form>

            <form className="development-form" onSubmit={createItem}>
              <h3>Entwicklungsziel oder Aufgabe hinzufügen</h3>
              {!snapshot?.vision && <p className="development-hint">Speichere zuerst eine Master Vision.</p>}
              <label>Typ<select value={itemType} onChange={(event) => setItemType(event.target.value as typeof itemType)} disabled={!snapshot?.vision}><option value="goal">Ziel</option><option value="milestone">Meilenstein</option><option value="task">Aufgabe</option></select></label>
              <label>Titel<input value={itemTitle} onChange={(event) => setItemTitle(event.target.value)} maxLength={200} required disabled={!snapshot?.vision} /></label>
              <label>Beschreibung<textarea value={itemDescription} onChange={(event) => setItemDescription(event.target.value)} maxLength={12000} rows={2} disabled={!snapshot?.vision} /></label>
              <label>Priorität<select value={itemPriority} onChange={(event) => setItemPriority(Number(event.target.value))} disabled={!snapshot?.vision}><option value={0}>P0 · kritisch</option><option value={1}>P1 · hoch</option><option value={2}>P2 · normal</option><option value={3}>P3 · niedrig</option></select></label>
              <label>Geschätzter Aufwand (Minuten)<input type="number" min={1} max={100000} step={1} value={effortMinutes} onChange={(event) => setEffortMinutes(event.target.value)} required={itemType === "task"} disabled={!snapshot?.vision} /></label>
              {snapshot?.items.length ? <label>Abhängigkeiten (Mehrfachauswahl)<select multiple size={Math.min(5, snapshot.items.length)} value={dependencyIds} onChange={(event) => setDependencyIds(Array.from(event.target.selectedOptions, (option) => option.value))}>{snapshot.items.filter((item) => item.vision_revision_id === snapshot.vision?.id).map((item) => <option key={item.id} value={item.id}>{item.title} · {statusLabels[item.status]}</option>)}</select></label> : null}
              <label>Akzeptanzkriterien, je Zeile eins<textarea value={criteriaText} onChange={(event) => setCriteriaText(event.target.value)} rows={3} required disabled={!snapshot?.vision} /></label>
              <label>Testanforderungen, je Zeile eins<textarea value={testsText} onChange={(event) => setTestsText(event.target.value)} rows={3} required disabled={!snapshot?.vision} /></label>
              <label>Betroffene Komponenten, kommasepariert<input value={componentsText} onChange={(event) => setComponentsText(event.target.value)} required disabled={!snapshot?.vision} /></label>
              <button className="primary-button" type="submit" disabled={!snapshot?.vision || busy !== "" || !itemTitle.trim() || (itemType === "task" && !effortMinutes)}>{busy === "item" ? "Wird gespeichert…" : "In Backlog aufnehmen"}</button>
            </form>
          </div>

          <div className="development-backlog">
            <div className="development-subheading"><h3>Persistenter Backlog</h3><span>{snapshot?.items.length ?? 0} Einträge</span></div>
            {!snapshot?.items.length ? <p className="development-hint">Noch keine Ziele oder Aufgaben gespeichert.</p> : snapshot.items.map((item) => {
              const target = nextStatus[item.status];
              const canAdvance = target && canTransitionDevelopmentItem(item.status, target);
              return <article className="development-item" key={item.id}>
                <div className="development-item-main">
                  <div className="development-item-meta"><span className="development-type">{item.item_type}</span><span className="development-priority">P{item.priority}</span><span className={"development-status " + item.status}>{statusLabels[item.status]}</span></div>
                  <h4>{item.title}</h4>
                  {item.description && <p>{item.description}</p>}
                  <div className="development-criteria"><span>{item.acceptance_criteria.length} Kriterien</span><span>{item.test_requirements.length} Testanforderungen</span>{item.affected_components.length > 0 && <span>{item.affected_components.join(", ")}</span>}</div>
                  {item.blocked_reason && <p className="development-hint">Blockiert: {item.blocked_reason}</p>}
                </div>
                {canAdvance ? <button className="secondary-button" type="button" disabled={busy !== ""} onClick={() => void advanceItem(item)}>{busy === item.id ? "…" : "Weiter: " + statusLabels[target]}</button>
                  : item.status === "review" ? <span className="development-hint">Abschluss wartet auf Check- und Review-Nachweise.</span> : null}
              </article>;
            })}
          </div>

          <div className="development-events"><h3>Letzte Ereignisse</h3>{snapshot?.events.length ? snapshot.events.slice(0, 5).map((event) => <p key={event.id}><span>{event.event_type.replaceAll("_", " ")}</span><time>{new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.created_at))}</time></p>) : <p className="development-hint">Noch keine Ereignisse protokolliert.</p>}</div>
        </>
      )}
    </section>
  );
}
