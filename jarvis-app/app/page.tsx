"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Item = { title: string; time: string | null; category: string };
type Job = {
  id: string;
  status: string;
  planning_attempt_count: number;
  github_task_id: string | null;
  request_text: string;
  plan: { summary: string; prompt: string; steps: { title: string; description: string }[] } | null;
  review: { summary: string; prompt: string; concerns: string[] } | null;
  evaluation: { summary: string; limitations: string[] } | null;
  github_task_url: string | null;
  github_pr_url: string | null;
  github_state: string | null;
  failure_code: string | null;
  created_at: string;
};
type JobDetails = { job: Job; steps: { id: string; name: string; agent: string; status: string; summary: string | null; error_code: string | null }[]; events: { id: number; type: string; created_at: string }[] };

const jobStatusLabel: Record<string, string> = {
  pending: "Wartet auf Planung oder Wiederaufnahme",
  planning: "Wird geplant",
  awaiting_approval: "Freigabe erforderlich",
  dispatching: "Wird an GitHub übergeben",
  dispatch_uncertain: "GitHub-Übergabe unklar – bitte manuell prüfen",
  queued: "In der GitHub-Warteschlange",
  in_progress: "GitHub-Agent arbeitet",
  evaluating: "Ergebnis wird bewertet",
  completed: "Agent abgeschlossen",
  failed: "Fehlgeschlagen",
};

function jobErrorMessage(code: string | null) {
  if (!code) return null;
  if (code === "openai_not_configured") return "OPENAI_API_KEY fehlt serverseitig.";
  if (code === "claude_not_configured") return "ANTHROPIC_API_KEY fehlt serverseitig.";
  if (code === "github_not_configured") return "GITHUB_USER_TOKEN oder GitHub-Repository-Konfiguration fehlt.";
  if (code === "github_dispatch_uncertain") return "Der Startstatus ist unbekannt. Vor einem erneuten Versuch zuerst die GitHub-Agent-Aufgaben prüfen, um Doppelstarts zu vermeiden.";
  if (code === "job_not_retryable") return "Dieser Auftrag kann nicht automatisch erneut geplant werden.";
  if (code === "request_may_contain_secret") return "Der Auftrag sieht wie ein Geheimnis oder Zugangsschlüssel aus und wurde nicht gespeichert. Entferne sensible Angaben.";
  return `Fehlercode: ${code}`;
}

export default function Home() {
  const [pw, setPw] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [plan, setPlan] = useState<{ date: string; items: Item[] } | null>(null);
  const [chat, setChat] = useState<{ role: string; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [planError, setPlanError] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobRequest, setJobRequest] = useState("");
  const [jobError, setJobError] = useState("");
  const [jobBusy, setJobBusy] = useState(false);
  const [selectedJob, setSelectedJob] = useState("");
  const [jobDetails, setJobDetails] = useState<JobDetails | null>(null);
  const [jobActionBusy, setJobActionBusy] = useState(false);
  const chatRequestIds = useRef(new Map<string, string>());
  const jobIdempotencyKey = useRef<string | null>(null);

  async function loadJobs(password: string) {
    const response = await fetch("/api/automation/jobs", { headers: { "x-app-password": password } });
    if (response.status === 401) throw new Error("Passwort stimmt nicht. Bitte erneut anmelden.");
    if (!response.ok) throw new Error(`Aufträge konnten nicht geladen werden (HTTP ${response.status}).`);
    const data = await response.json();
    setJobs(data.jobs);
  }

  async function loadJob(jobId: string, password: string) {
    const response = await fetch(`/api/automation/jobs/${encodeURIComponent(jobId)}`, { headers: { "x-app-password": password } });
    if (response.status === 401) throw new Error("Passwort stimmt nicht. Bitte erneut anmelden.");
    if (!response.ok) throw new Error(`Auftragsstatus konnte nicht geladen werden (HTTP ${response.status}).`);
    setJobDetails(await response.json());
  }

  useEffect(() => { setPw(localStorage.getItem("pw") ?? ""); }, []);
  useEffect(() => {
    if (!pw) return;
    let cancelled = false;
    fetch("/api/tomorrow", { headers: { "x-app-password": pw } })
      .then(async (r) => {
        if (r.status === 401) {
          if (!cancelled) {
            localStorage.removeItem("pw");
            setPw("");
            setAuthError("Passwort stimmt nicht. Bitte erneut eingeben.");
          }
          return null;
        }
        if (!r.ok) throw new Error(`Plan konnte nicht geladen werden (HTTP ${r.status}).`);
        return r.json();
      })
      .then((data) => { if (!cancelled && data) setPlan(data); })
      .catch((error: unknown) => {
        if (!cancelled) setPlanError(error instanceof Error ? error.message : "Plan konnte nicht geladen werden.");
      });
    return () => { cancelled = true; };
  }, [pw]);
  useEffect(() => {
    if (!pw) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        await loadJobs(pw);
        if (selectedJob) await loadJob(selectedJob, pw);
      } catch (error) {
        if (!cancelled) setJobError(error instanceof Error ? error.message : "Aufträge konnten nicht geladen werden.");
      }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 8000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [pw, selectedJob]);

  function savePassword(value: string) {
    if (!value.trim()) {
      setAuthError("Bitte Passwort eingeben.");
      return;
    }
    localStorage.setItem("pw", value);
    setAuthError("");
    setPw(value);
  }

  async function send() {
    if (!input.trim() || busy) return;
    const text = input; setInput(""); setBusy(true);
    const requestId = chatRequestIds.current.get(text) ?? crypto.randomUUID();
    chatRequestIds.current.set(text, requestId);
    setChat((c) => [...c, { role: "user", text }]);
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "x-app-password": pw, "Content-Type": "application/json" }, body: JSON.stringify({ message: text, request_id: requestId }) });
      if (r.status === 401) {
        localStorage.removeItem("pw");
        setPw("");
        setAuthError("Passwort stimmt nicht. Bitte erneut eingeben.");
        return;
      }
      if (!r.ok) throw new Error(`Serverfehler (HTTP ${r.status}).`);
      const j = await r.json();
      setChat((c) => [...c, { role: "assistant", text: j.reply }]);
      chatRequestIds.current.delete(text);
      void loadJobs(pw).catch(() => {});
    } catch (error) {
      setChat((c) => [...c, { role: "assistant", text: error instanceof Error ? error.message : "Nachricht konnte nicht gesendet werden." }]);
    } finally {
      setBusy(false);
    }
  }

  async function createJob(event: FormEvent) {
    event.preventDefault();
    if (!jobRequest.trim() || jobBusy) return;
    setJobBusy(true); setJobError("");
    try {
      const response = await fetch("/api/automation/jobs", {
        method: "POST",
        headers: { "x-app-password": pw, "Content-Type": "application/json", "Idempotency-Key": jobIdempotencyKey.current ?? (jobIdempotencyKey.current = crypto.randomUUID()) },
        body: JSON.stringify({ request: jobRequest }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `Auftrag fehlgeschlagen (HTTP ${response.status}).`);
      setJobRequest("");
      jobIdempotencyKey.current = null;
      setSelectedJob(data.job.id);
      await loadJobs(pw);
    } catch (error) {
      setJobError(jobErrorMessage(error instanceof Error ? error.message : null) ?? "Auftrag konnte nicht erstellt werden.");
    } finally {
      setJobBusy(false);
    }
  }

  async function approveJob(jobId: string) {
    setJobActionBusy(true); setJobError("");
    try {
      const response = await fetch(`/api/automation/jobs/${encodeURIComponent(jobId)}/approve`, {
        method: "POST",
        headers: { "x-app-password": pw },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `Freigabe fehlgeschlagen (HTTP ${response.status}).`);
      await loadJob(jobId, pw);
      await loadJobs(pw);
    } catch (error) {
      setJobError(jobErrorMessage(error instanceof Error ? error.message : null) ?? "GitHub-Agent konnte nicht gestartet werden.");
    } finally {
      setJobActionBusy(false);
    }
  }

  async function retryJob(jobId: string) {
    setJobActionBusy(true); setJobError("");
    try {
      const response = await fetch(`/api/automation/jobs/${encodeURIComponent(jobId)}/retry`, {
        method: "POST",
        headers: { "x-app-password": pw },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `Neuer Versuch fehlgeschlagen (HTTP ${response.status}).`);
      setJobDetails(data);
      await loadJobs(pw);
    } catch (error) {
      setJobError(jobErrorMessage(error instanceof Error ? error.message : null) ?? "Planung konnte nicht wiederholt werden.");
    } finally {
      setJobActionBusy(false);
    }
  }

  if (!pw) return (
    <main style={{ padding: 20 }}>
      <h1>Jarvis</h1>
      <form onSubmit={(e) => { e.preventDefault(); savePassword(passwordInput); }}>
        <div style={{ display: "flex", width: "100%" }}>
          <input type={showPassword ? "text" : "password"} placeholder="Passwort aus APP_PASSWORD" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} style={{ flex: 1, minWidth: 0, padding: 12, boxSizing: "border-box" }} />
          <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"} title={showPassword ? "Passwort verbergen" : "Passwort anzeigen"} style={{ padding: "0 12px" }}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
              {showPassword && <path d="m3 3 18 18" />}
            </svg>
          </button>
        </div>
        <button type="submit" style={{ marginTop: 8, padding: 12 }}>Anmelden</button>
      </form>
      {authError && <p role="alert">{authError}</p>}
    </main>
  );

  return (
    <main style={{ padding: 20, maxWidth: 560, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 4 }}>Morgen</h2>
      <p style={{ marginTop: 0, opacity: 0.6 }}>{plan?.date}</p>
      {planError ? <p role="alert">{planError}</p> : plan?.items.length ? plan.items.map((i, k) => (
        <div key={k} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid #232a34" }}>
          <span style={{ width: 52, opacity: 0.6 }}>{i.time?.slice(0, 5) ?? "–"}</span><span>{i.title}</span>
        </div>
      )) : <p style={{ opacity: 0.6 }}>Noch nichts eingetragen.</p>}

      <h2 style={{ marginTop: 32 }}>Chat</h2>
      {chat.map((m, k) => (
        <p key={k} style={{ background: m.role === "user" ? "#1c2430" : "transparent", padding: 10, borderRadius: 8, whiteSpace: "pre-wrap" }}>{m.text}</p>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Schreib Jarvis…" style={{ flex: 1, padding: 12 }} />
        <button onClick={send} disabled={busy} style={{ padding: "12px 16px" }}>Senden</button>
      </div>

      <section aria-labelledby="automation-heading" style={{ marginTop: 36, borderTop: "1px solid #303947", paddingTop: 20 }}>
        <h2 id="automation-heading">Agenten-Aufträge</h2>
        <p>JARVIS plant mit OpenAI und Claude. Der GitHub-Agent startet erst nach deiner ausdrücklichen Freigabe und soll einen Pull Request erstellen.</p>
        <form onSubmit={createJob}>
          <textarea value={jobRequest} onChange={(event) => setJobRequest(event.target.value)} maxLength={6000} rows={4} placeholder="Beschreibe eine gewünschte Repository-Änderung – keine Passwörter oder API-Schlüssel." style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 12 }} />
          <button type="submit" disabled={jobBusy || !jobRequest.trim()} style={{ marginTop: 8, padding: "10px 14px" }}>{jobBusy ? "Plan wird erstellt…" : "Plan erstellen"}</button>
        </form>
        {jobError && <p role="alert">{jobError}</p>}
        <h3>Letzte Aufträge</h3>
        {jobs.length ? jobs.map((job) => (
          <button key={job.id} type="button" onClick={() => { setSelectedJob(job.id); setJobError(""); }} aria-pressed={selectedJob === job.id} style={{ display: "block", width: "100%", textAlign: "left", padding: 10, marginBottom: 6 }}>
            <strong>{jobStatusLabel[job.status] ?? job.status}</strong><br />
            <span>{job.plan?.summary ?? job.request_text}</span>
          </button>
        )) : <p>Noch keine Agenten-Aufträge.</p>}
        {jobDetails && selectedJob === jobDetails.job.id && (
          <article style={{ marginTop: 16, padding: 14, background: "#1c2430", borderRadius: 8 }}>
            <h3>{jobStatusLabel[jobDetails.job.status] ?? jobDetails.job.status}</h3>
            <p>{jobDetails.job.plan?.summary ?? jobDetails.job.request_text}</p>
            {jobDetails.job.plan?.steps.map((step, index) => <p key={index}><strong>{index + 1}. {step.title}</strong>: {step.description}</p>)}
            {jobDetails.job.review && <p><strong>Claude-Prüfung:</strong> {jobDetails.job.review.summary}</p>}
            {jobDetails.job.review?.concerns.map((concern, index) => <p key={index}>Hinweis: {concern}</p>)}
            {jobDetails.steps.map((step) => <p key={step.id}>{step.agent} · {step.name}: {step.summary ?? step.error_code ?? step.status}</p>)}
            {jobDetails.job.evaluation && <p><strong>Ergebnis:</strong> {jobDetails.job.evaluation.summary}</p>}
            {jobDetails.job.evaluation?.limitations.map((item, index) => <p key={index}>Einschränkung: {item}</p>)}
            {jobDetails.job.github_pr_url && <p><a href={jobDetails.job.github_pr_url} target="_blank" rel="noreferrer">Pull Request prüfen</a></p>}
            {jobDetails.job.github_task_url && <p><a href={jobDetails.job.github_task_url} target="_blank" rel="noreferrer">GitHub-Agent-Aufgabe öffnen</a></p>}
            {jobDetails.job.github_state && <p>GitHub-Status: {jobDetails.job.github_state}</p>}
            {jobDetails.job.failure_code && <p role="alert">{jobErrorMessage(jobDetails.job.failure_code)}</p>}
            {jobDetails.job.status === "failed" && !jobDetails.job.github_task_id && jobDetails.job.planning_attempt_count < 2 && /^(openai|claude)_|^provider_request_failed$/.test(jobDetails.job.failure_code ?? "") && (
              <button type="button" disabled={jobActionBusy} onClick={() => void retryJob(jobDetails.job.id)}>{jobActionBusy ? "Wird wiederholt…" : "Planung erneut versuchen (max. zwei Versuche)"}</button>
            )}
            {jobDetails.job.status === "awaiting_approval" && (
              <>
                <h4>Vorgeschlagener GitHub-Auftrag</h4>
                <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{jobDetails.job.review?.prompt ?? jobDetails.job.plan?.prompt}</pre>
                <p>Die Freigabe startet einen GitHub-Agenten auf einem neuen Branch und fordert einen Pull Request an. Es wird nichts automatisch gemergt oder deployed.</p>
                <button type="button" disabled={jobActionBusy} onClick={() => {
                  if (window.confirm("Diesen angezeigten Plan an den GitHub-Agenten übergeben? Es wird ein Branch/PR angefordert; kein automatischer Merge oder Deploy.")) {
                    void approveJob(jobDetails.job.id);
                  }
                }}>{jobActionBusy ? "Wird freigegeben…" : "Plan freigeben und GitHub-Agent starten"}</button>
              </>
            )}
          </article>
        )}
      </section>
    </main>
  );
}
