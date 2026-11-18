"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import DevelopmentCenter from "@/components/development-center";

type BrowserSpeechRecognitionEvent = Event & {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};
type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

type Task = { id: string; text: string; due: string | null; done: boolean; priority: "high" | "normal" | "low" };
type ScheduleItem = { id?: string; title: string; time: string | null; category: string };
type DashboardData = {
  date: string;
  tasks: Task[];
  events: (ScheduleItem & { day: string })[];
  routines: (ScheduleItem & { end_time: string | null })[];
  money: { id: string; amt: number | string; note: string | null; day: string }[];
  goals: { id: string; name: string; target: number | string; saved: number | string }[];
  workouts: { id: string; ex: string; kg: number | string | null; reps: number | null; sets: number | null; day: string }[];
  workoutCount: number;
  habits: { name: string }[];
  habitChecks: { habit: string; day: string }[];
  prayers: ScheduleItem[];
  errors: Record<string, string | null>;
};
type Job = {
  id: string; status: string; planning_attempt_count: number; github_task_id: string | null; request_text: string;
  plan: { summary: string; prompt: string; steps: { title: string; description: string }[] } | null;
  review: { summary: string; prompt: string; concerns: string[] } | null;
  evaluation: { summary: string; limitations: string[] } | null; github_task_url: string | null; github_pr_url: string | null;
  github_state: string | null; failure_code: string | null; created_at: string;
};
type JobDetails = {
  job: Job;
  steps: { id: string; name: string; agent: string; status: string; summary: string | null; error_code: string | null }[];
  events: { id: number; type: string; created_at: string }[];
};

const navigation = [
  { id: "dashboard", href: "/#dashboard", label: "Dashboard", icon: "grid" },
  { id: "my-day", href: "/#my-day", label: "My Day", icon: "sun" },
  { id: "calendar", href: "/#calendar", label: "Calendar", icon: "calendar" },
  { id: "tasks", href: "/#tasks", label: "Tasks", icon: "check" },
  { id: "finance", href: "/#finance", label: "Finance", icon: "wallet" },
  { id: "fitness", href: "/#fitness", label: "Fitness", icon: "activity" },
  { id: "habits", href: "/#habits", label: "Habits", icon: "spark" },
  { id: "assistant", href: "/#assistant", label: "AI Assistant", icon: "message" },
  { id: "development", href: "/#development", label: "Development", icon: "settings" },
  { id: "settings", href: "/#settings", label: "Settings", icon: "settings" },
] as const;
const primaryMobileNavigation = navigation.filter((item) => ["dashboard", "my-day", "tasks", "assistant"].includes(item.id));

const jobStatusLabel: Record<string, string> = {
  pending: "Wartet auf Planung", planning: "Wird geplant", awaiting_approval: "Freigabe erforderlich",
  dispatching: "Wird übergeben", dispatch_uncertain: "Übergabe unklar – manuell prüfen", queued: "In der Warteschlange",
  in_progress: "Agent arbeitet", evaluating: "Ergebnis wird bewertet", completed: "Abgeschlossen", failed: "Fehlgeschlagen",
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    check: <><path d="m5 12 4 4L19 6" /><circle cx="12" cy="12" r="9" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18m-5 6h2" /><path d="M6 5V3h12v2" /></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /></>,
    message: <><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8 8 0 0 1-3.5-.8L4 20l1.6-3.5A7.1 7.1 0 0 1 4 12c0-4.1 3.6-7.5 8-7.5s8 3.1 8 7Z" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.6.9L16 20.7h-2.8l-.3-1.8a8 8 0 0 1-1.8 0l-.3 1.8H8l-.3-1.8a8 8 0 0 1-1.6-.9l-1.7.6L3 16.2l1.4-1.1a8 8 0 0 1 0-1.9L3 12.1l1.4-2.4 1.7.6a8 8 0 0 1 1.6-.9L8 7.6h2.8l.3 1.8a8 8 0 0 1 1.8 0l.3-1.8H16l.3 1.8a8 8 0 0 1 1.6.9l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1-.2 1.8Z" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    moon: <><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z" /></>,
    sunMode: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.1 0 2.1-.2 3-.5" /></>,
  };
  return <svg {...common}>{paths[name] ?? paths.spark}</svg>;
}

    microphone: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8" /></>,
    volume: <><path d="M4 10v4h4l5 4V6l-5 4H4Z" /><path d="M17 9a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12" /></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    repeat: <><path d="m17 2 4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
function Card({ children, className = "", id, ariaLabelledby }: { children: ReactNode; className?: string; id?: string; ariaLabelledby?: string }) {
  return <section id={id} className={`surface-card ${className}`} aria-labelledby={ariaLabelledby}>{children}</section>;
}

function SectionTitle({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="section-title"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>;
}

function LoadingRows({ count = 3 }: { count?: number }) {
  return <div className="loading-rows" aria-label="Daten werden geladen">{Array.from({ length: count }, (_, i) => <span key={i} />)}</div>;
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "—";
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, 12));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return "—";
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", ...options }).format(value);
}

function appPasswordHeader(password: string) {
  const safeValue = /[^\x20-\x7e]/.test(password) ? `utf8:${encodeURIComponent(password)}` : password;
  return { "x-app-password": safeValue };
}

function automationErrorMessage(code: string) {
  const messages: Record<string, string> = {
    automation_store_unavailable: "Agenten-Aufträge sind derzeit nicht verfügbar. Die Supabase-Verbindung oder Automationstabellen konnten nicht gelesen werden.",
    github_premium_quota_exhausted: "Das Copilot-Premium-Kontingent ist ausgeschöpft. Der Agentenauftrag wurde nicht gestartet.",
    github_not_configured: "GitHub ist serverseitig nicht konfiguriert.",
    github_configuration_missing: "Die GitHub-Repository-Konfiguration fehlt oder ist ungültig.",
    github_http_401: "GitHub hat die Authentifizierung abgelehnt. Bitte Token und Berechtigungen prüfen.",
    github_http_403: "GitHub hat die Aktion abgelehnt. Bitte Berechtigungen und Copilot-Zugriff prüfen.",
    github_http_412: "GitHub hat die Agenten-Anfrage abgelehnt. Bitte Voraussetzungen und Kontingent prüfen.",
    github_rate_limited: "GitHub begrenzt derzeit weitere Anfragen. Bitte später erneut versuchen.",
    github_dispatch_uncertain: "Der Übergabestatus ist unklar. Bitte GitHub prüfen, bevor du erneut freigibst.",
  };
  if (messages[code]) return messages[code];
  if (code === "openai_not_configured") return "OpenAI ist serverseitig nicht konfiguriert.";
  if (code === "claude_not_configured") return "Claude ist serverseitig nicht konfiguriert.";
  return `Agenten-Auftrag fehlgeschlagen (${code}).`;
}

export default function JarvisDashboard() {
  const [pw, setPw] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [active, setActive] = useState("dashboard");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [chat, setChat] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [intelligence, setIntelligence] = useState("");
  const [authError, setAuthError] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobRequest, setJobRequest] = useState("");
  const [jobError, setJobError] = useState("");
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(false);
  const [speechSynthesisSupported, setSpeechSynthesisSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [jobBusy, setJobBusy] = useState(false);
  const [selectedJob, setSelectedJob] = useState("");
  const [jobDetails, setJobDetails] = useState<JobDetails | null>(null);
  const [jobActionBusy, setJobActionBusy] = useState(false);
  const [taskBusy, setTaskBusy] = useState("");
  const [taskError, setTaskError] = useState("");
  const [habitBusy, setHabitBusy] = useState("");
  const chatRequestIds = useRef(new Map<string, string>());
  const jobIdempotencyKey = useRef<string | null>(null);
  const dashboardLoaded = useRef(false);

  useEffect(() => {
    setPw(localStorage.getItem("pw") ?? "");
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voiceModeRef = useRef(false);
  const busyRef = useRef(false);
  const speakingRef = useRef(false);
  const lastSpokenTextRef = useRef("");
  const recognitionRestartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const savedTheme = localStorage.getItem("jarvis-theme");
    if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    setCollapsed(localStorage.getItem("jarvis-sidebar-collapsed") === "true");
  useEffect(() => {
    setSpeechRecognitionSupported(Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition));
    setSpeechSynthesisSupported("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
    return () => {
      if (recognitionRestartTimer.current) clearTimeout(recognitionRestartTimer.current);
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  }, []);

  useEffect(() => {
    localStorage.setItem("jarvis-theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("jarvis-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const syncActiveSection = () => {
      const sectionId = window.location.hash.slice(1);
      setActive(navigation.some((item) => item.id === sectionId) ? sectionId : "dashboard");
    };
    syncActiveSection();
    window.addEventListener("hashchange", syncActiveSection);
    return () => window.removeEventListener("hashchange", syncActiveSection);
  }, []);

  async function loadDashboard(password: string, signal?: AbortSignal) {
    const response = await fetch("/api/dashboard", { headers: appPasswordHeader(password), signal });
    if (response.status === 401) throw new Error("Passwort stimmt nicht. Bitte erneut anmelden.");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `Dashboard konnte nicht geladen werden (HTTP ${response.status}).`);
    setDashboard(data);
  }

  async function loadJobs(password: string) {
    const response = await fetch("/api/automation/jobs", { headers: appPasswordHeader(password) });
    if (response.status === 401) throw new Error("Passwort stimmt nicht. Bitte erneut anmelden.");
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.error === "string" ? automationErrorMessage(data.error) : `Agenten-Aufträge konnten nicht geladen werden (HTTP ${response.status}).`);
    if (!Array.isArray(data.jobs)) throw new Error("Die Antwort der Agenten-Aufträge ist ungültig.");
    setJobs(data.jobs);
  }

  async function loadJob(jobId: string, password: string) {
    const response = await fetch(`/api/automation/jobs/${encodeURIComponent(jobId)}`, { headers: appPasswordHeader(password) });
    if (response.status === 401) throw new Error("Passwort stimmt nicht. Bitte erneut anmelden.");
    if (!response.ok) throw new Error(`Auftragsstatus konnte nicht geladen werden (HTTP ${response.status}).`);
    setJobDetails(await response.json());
  }

  useEffect(() => {
    if (!pw) return;
    let cancelled = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (!dashboardLoaded.current) setDashboardLoading(true);
      try {
        await loadDashboard(pw, controller.signal);
        dashboardLoaded.current = true;
        if (!cancelled) setDashboardError("");
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) setDashboardError(error instanceof Error ? error.message : "Dashboard konnte nicht geladen werden.");
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 120_000);
    return () => { cancelled = true; controller.abort(); window.clearInterval(interval); };
  }, [pw]);

  useEffect(() => {
    if (!pw) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        await loadJobs(pw);
        if (selectedJob) await loadJob(selectedJob, pw);
      } catch (error) {
        if (!cancelled) setJobError(error instanceof Error ? error.message : "Agenten-Aufträge konnten nicht geladen werden.");
      }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 8000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [pw, selectedJob]);

  const berlinDateParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const berlinDatePart = (type: string) => berlinDateParts.find((part) => part.type === type)?.value ?? "00";
  const fallbackToday = `${berlinDatePart("year")}-${berlinDatePart("month")}-${berlinDatePart("day")}`;
  const today = dashboard?.date && /^\d{4}-\d{2}-\d{2}$/.test(dashboard.date) ? dashboard.date : fallbackToday;
  const berlinHour = Number(new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const greeting = berlinHour < 11 ? "Guten Morgen" : berlinHour < 18 ? "Guten Tag" : "Guten Abend";
  const openTasks = useMemo(() => (dashboard?.tasks ?? []).filter((task) => !task.done), [dashboard]);
  const dueToday = (dashboard?.tasks ?? []).filter((task) => task.due === today);
  const completedDueToday = dueToday.filter((task) => task.done).length;
  const openDueToday = dueToday.filter((task) => !task.done).length;
  const overdue = openTasks.filter((task) => task.due && task.due < today).length;
  const taskProgress = dueToday.length ? Math.round((completedDueToday / dueToday.length) * 100) : 0;
  const monthlyIncome = (dashboard?.money ?? []).reduce((sum, row) => sum + Math.max(0, Number(row.amt)), 0);
  const monthlyExpenses = (dashboard?.money ?? []).reduce((sum, row) => sum + Math.abs(Math.min(0, Number(row.amt))), 0);
  const nowBerlin = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const nextPrayer = dashboard?.prayers.find((item) => item.time && item.time >= nowBerlin) ?? null;
  const nextSchedule = useMemo(() => {
    const items = [
      ...(dashboard?.events ?? []).map((item) => ({ ...item, kind: "Termin" })),
      ...(dashboard?.routines ?? []).map((item) => ({ ...item, kind: "Routine" })),
    ].sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
    return items.find((item) => item.time && item.time.slice(0, 5) >= nowBerlin) ?? items.find((item) => !item.time);
  }, [dashboard, nowBerlin]);

  function savePassword(value: string) {
    if (!value.trim()) { setAuthError("Bitte Passwort eingeben."); return; }
    localStorage.setItem("pw", value);
    setAuthError("");
    setPw(value);
  }

  function signOut() {
    localStorage.removeItem("pw");
    setPw(""); setDashboard(null); setJobs([]); setJobDetails(null); setChat([]); setIntelligence("");
    dashboardLoaded.current = false;
  }

    voiceModeRef.current = false;
    setVoiceMode(false);
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    window.speechSynthesis?.cancel();
    speakingRef.current = false;
    setListening(false);
    setSpeaking(false);
  async function sendMessage(text: string, briefing = false) {
    if (!text.trim() || busyRef.current) return;
    const requestId = chatRequestIds.current.get(text) ?? crypto.randomUUID();
    chatRequestIds.current.set(text, requestId);
    setChat((current) => [...current, { role: "user", text }]);
  function startListening() {
    setVoiceTranscript("");
    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError("Die deutsche Spracherkennung wird von diesem Browser nicht unterstützt.");
      return;
    }

    if (speakingRef.current) stopSpeaking();
    if (recognitionRestartTimer.current) {
      clearTimeout(recognitionRestartTimer.current);
      recognitionRestartTimer.current = null;
    }
    recognitionRef.current?.abort();
    const recognition = new SpeechRecognition();
    recognition.lang = "de-DE";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return;
      const results = Array.from({ length: event.results.length }, (_, index) => event.results[index]);
      const transcriptPreview = results.map((result) => result[0].transcript.trim()).filter(Boolean).join(" ");
      setVoiceTranscript(transcriptPreview);
      const transcript = Array.from({ length: event.results.length - event.resultIndex }, (_, index) => {
        const result = event.results[event.resultIndex + index];
        return result.isFinal ? result[0].transcript.trim() : "";
      }).filter(Boolean).join(" ");
      if (!transcript) return;

      if (voiceModeRef.current) {
        setInput("");
        void sendMessage(transcript);
      } else {
        setInput((current) => [current.trim(), transcript].filter(Boolean).join(" "));
      }
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      const messages: Record<string, string> = {
        "not-allowed": "Der Mikrofonzugriff wurde verweigert. Erlaube ihn in den Browser-Einstellungen.",
        "service-not-allowed": "Der Browser-Sprachdienst ist nicht verfügbar oder wurde blockiert.",
        "audio-capture": "Es wurde kein verwendbares Mikrofon gefunden.",
        network: "Die Spracherkennung benötigt eine verfügbare Netzwerkverbindung.",
        "no-speech": "Es wurde keine Sprache erkannt.",
      };
      if (event.error !== "aborted") setVoiceError(messages[event.error] ?? "Die Spracherkennung ist fehlgeschlagen.");
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        voiceModeRef.current = false;
        setVoiceMode(false);
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      setListening(false);
      if (voiceModeRef.current && !busyRef.current && !speakingRef.current) {
        recognitionRestartTimer.current = setTimeout(() => {
          recognitionRestartTimer.current = null;
          if (voiceModeRef.current && !busyRef.current && !speakingRef.current) startListening();
        }, 500);
      }
    };
    recognitionRef.current = recognition;
    setVoiceError("");
    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setListening(false);
      voiceModeRef.current = false;
      setVoiceMode(false);
      setVoiceError("Das Mikrofon konnte nicht gestartet werden. Bitte versuche es erneut.");
    }
  }

  function stopListening() {
    if (recognitionRestartTimer.current) {
      clearTimeout(recognitionRestartTimer.current);
      recognitionRestartTimer.current = null;
    }
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    setListening(false);
    recognition?.stop();
  }

  function abortListening() {
    if (recognitionRestartTimer.current) {
      clearTimeout(recognitionRestartTimer.current);
      recognitionRestartTimer.current = null;
    }
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    setListening(false);
    setVoiceTranscript("");
    recognition?.abort();
  }

  function toggleVoiceMode() {
    if (voiceModeRef.current) {
      voiceModeRef.current = false;
      setVoiceMode(false);
      abortListening();
      return;
    }
    if (!speechRecognitionSupported || !speechSynthesisSupported) {
      setVoiceError("Der Voice-Modus benötigt deutsche Spracherkennung und Sprachausgabe, die dieser Browser bereitstellen muss.");
      return;
    }
    voiceModeRef.current = true;
    setVoiceMode(true);
    startListening();
  }

  function speakText(text: string) {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setVoiceError("Die Sprachausgabe wird von diesem Browser nicht unterstützt.");
      return;
    }
    stopListening();
    utteranceRef.current = null;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "de-DE";
    const germanVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("de"));
    if (germanVoice) utterance.voice = germanVoice;
    speakingRef.current = true;
    setSpeaking(true);
    setVoiceError("");
    lastSpokenTextRef.current = text;
    utteranceRef.current = utterance;
    utterance.onend = () => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null;
      speakingRef.current = false;
      setSpeaking(false);
      if (voiceModeRef.current && !busyRef.current) startListening();
    };
    utterance.onerror = () => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null;
      speakingRef.current = false;
      setSpeaking(false);
      setVoiceError("Die Sprachausgabe konnte nicht abgespielt werden.");
    };
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      utteranceRef.current = null;
      speakingRef.current = false;
      setSpeaking(false);
      setVoiceError("Die Sprachausgabe konnte nicht gestartet werden.");
    }
  }

  function speakLatestReply() {
    const latestReply = [...chat].reverse().find((message) => message.role === "assistant");
    if (latestReply) speakText(latestReply.text);
  }

  function stopSpeaking() {
    utteranceRef.current = null;
    window.speechSynthesis?.cancel();
    speakingRef.current = false;
    setSpeaking(false);
  }

    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { ...appPasswordHeader(pw), "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, request_id: requestId }),
    busyRef.current = true;
      });
      if (response.status === 401) {
        localStorage.removeItem("pw"); setPw(""); setAuthError("Passwort stimmt nicht. Bitte erneut anmelden."); return;
      }
      if (!response.ok) throw new Error(`JARVIS ist gerade nicht erreichbar (HTTP ${response.status}).`);
      const data = await response.json();
      setChat((current) => [...current, { role: "assistant", text: data.reply }]);
      if (briefing) setIntelligence(data.reply);
      chatRequestIds.current.delete(text);
      void loadJobs(pw).catch(() => {});
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nachricht konnte nicht gesendet werden.";
      if (voiceModeRef.current) speakText(data.reply);
      setChat((current) => [...current, { role: "assistant", text: message }]);
      if (briefing) setIntelligence(`Fehler: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  function send() {
      busyRef.current = false;
    if (!input.trim() || busyRef.current) return;
      if (voiceModeRef.current && !speakingRef.current && !recognitionRef.current) startListening();
    const text = input.trim(); setInput(""); void sendMessage(text);
  }

  function askForBriefing() {
    const prompt = "Erstelle ein knappes Tagesbriefing auf Deutsch. Nutze ausschließlich lesende Funktionen, um meine offenen Aufgaben, heutigen Termine und Routinen, Finanzübersicht, letzten Trainings und heutigen Gewohnheiten zu prüfen. Nimm keine Änderungen vor und erfinde keine Daten. Nenne nur konkrete Prioritäten und Hinweise, die sich aus den vorhandenen Daten ergeben. Wenn eine Datenquelle leer oder nicht verfügbar ist, sage das klar.";
    setIntelligence("");
    void sendMessage(prompt, true);
    document.getElementById("assistant")?.scrollIntoView({ behavior: "smooth", block: "start" });
  function toggleListening() {
    if (listening) {
      if (voiceModeRef.current) {
        voiceModeRef.current = false;
        setVoiceMode(false);
      }
      abortListening();
    }
    else if (!busyRef.current) startListening();
  }

  }

  async function completeTask(task: Task) {
    if (taskBusy) return;
    setTaskBusy(task.id); setTaskError("");
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/complete`, { method: "POST", headers: appPasswordHeader(pw) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Aufgabe konnte nicht abgehakt werden.");
      await loadDashboard(pw);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "Aufgabe konnte nicht abgehakt werden.");
    } finally {
      setTaskBusy("");
    }
  }

  async function checkHabit(name: string) {
    if (habitBusy) return;
    setHabitBusy(name);
    try {
      const response = await fetch("/api/habits/check", {
        method: "POST", headers: { ...appPasswordHeader(pw), "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Gewohnheit konnte nicht abgehakt werden.");
      await loadDashboard(pw);
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : "Gewohnheit konnte nicht abgehakt werden.");
    } finally { setHabitBusy(""); }
  }

  async function createJob(event: FormEvent) {
    event.preventDefault();
    if (!jobRequest.trim() || jobBusy) return;
    setJobBusy(true); setJobError("");
    try {
      const response = await fetch("/api/automation/jobs", {
        method: "POST",
        headers: { ...appPasswordHeader(pw), "Content-Type": "application/json", "Idempotency-Key": jobIdempotencyKey.current ?? (jobIdempotencyKey.current = crypto.randomUUID()) },
        body: JSON.stringify({ request: jobRequest }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `Auftrag fehlgeschlagen (HTTP ${response.status}).`);
      setJobRequest(""); jobIdempotencyKey.current = null; setSelectedJob(data.job.id);
      await loadJobs(pw);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setJobError(automationErrorMessage(code));
    } finally { setJobBusy(false); }
  }

  async function approveJob(jobId: string) {
    setJobActionBusy(true); setJobError("");
    try {
      const response = await fetch(`/api/automation/jobs/${encodeURIComponent(jobId)}/approve`, { method: "POST", headers: appPasswordHeader(pw) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `Freigabe fehlgeschlagen (HTTP ${response.status}).`);
      await loadJob(jobId, pw); await loadJobs(pw);
    } catch (error) {
      setJobError(error instanceof Error ? automationErrorMessage(error.message) : "GitHub-Agent konnte nicht gestartet werden.");
    } finally { setJobActionBusy(false); }
  }

  async function retryJob(jobId: string) {
    setJobActionBusy(true); setJobError("");
    try {
      const response = await fetch(`/api/automation/jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST", headers: appPasswordHeader(pw) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `Neuer Versuch fehlgeschlagen (HTTP ${response.status}).`);
      setJobDetails(data); await loadJobs(pw);
    } catch (error) { setJobError(error instanceof Error ? automationErrorMessage(error.message) : "Planung konnte nicht wiederholt werden."); }
    finally { setJobActionBusy(false); }
  }

  function navLink(item: (typeof navigation)[number], compact = false) {
    const isActive = active === item.id;
    return <Link key={item.id} href={item.href} className={`nav-link${isActive ? " is-active" : ""}${compact ? " nav-link-compact" : ""}`} onClick={() => { setActive(item.id); setMoreOpen(false); }} aria-current={isActive ? "location" : undefined} title={item.label}>
      <Icon name={item.icon} /><span>{item.label}</span>{item.id === "tasks" && openTasks.length > 0 && <small className="nav-count">{openTasks.length}</small>}
    </Link>;
  }

  if (!pw) return <div className="login-screen theme-root" data-theme={theme}>
    <section className="login-card">
      <div className="brand-mark"><Icon name="spark" size={22} /></div>
      <span className="eyebrow">PERSONAL COMMAND CENTER</span>
      <h1>Willkommen zurück.</h1>
      <p>Melde dich an, um dein JARVIS-Dashboard zu öffnen.</p>
      <form onSubmit={(event) => { event.preventDefault(); savePassword(passwordInput); }}>
        <label htmlFor="app-password">Dashboard-Passwort</label>
        <div className="password-field"><input id="app-password" type={showPassword ? "text" : "password"} value={passwordInput} onChange={(event) => setPasswordInput(event.target.value)} autoComplete="current-password" /><button className="icon-button" type="button" aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"} onClick={() => setShowPassword((visible) => !visible)}><Icon name={showPassword ? "eyeOff" : "eye"} /></button></div>
        <button className="primary-button full-width" type="submit">Dashboard öffnen <Icon name="arrow" /></button>
      </form>
      {authError && <p role="alert" className="inline-error">{authError}</p>}
      <button className="theme-toggle login-theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><Icon name={theme === "dark" ? "sunMode" : "moon"} /> {theme === "dark" ? "Light mode" : "Dark mode"}</button>
    </section>
  </div>;

  const currentMonth = formatDate(today, { month: "long", year: "numeric" });
  const checkedHabits = new Set((dashboard?.habitChecks ?? []).map((item) => item.habit));
  const schedule = [
    ...(dashboard?.routines ?? []).map((item) => ({ ...item, kind: "Routine" })),
    ...(dashboard?.events ?? []).map((item) => ({ ...item, kind: "Termin" })),
  ].sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
  const dateLabel = formatDate(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return <div className="app-frame theme-root" data-theme={theme}>
    <aside className={`sidebar${collapsed ? " is-collapsed" : ""}`} aria-label="Hauptnavigation">
      <Link className="brand" href="/#dashboard" onClick={() => setActive("dashboard")}><span className="brand-mark"><Icon name="spark" size={20} /></span>{!collapsed && <span><strong>JARVIS</strong><small>PERSONAL AI</small></span>}</Link>
      {!collapsed && <span className="nav-caption">WORKSPACE</span>}
      <nav className="side-nav">{navigation.map((item) => navLink(item))}</nav>
      <div className="sidebar-bottom">
        <div className="system-status"><span className="status-dot" />{!collapsed && <><span>Session aktiv</span><small>LOCAL SESSION</small></>}</div>
        <button className="collapse-button" type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Navigation ausklappen" : "Navigation einklappen"}><Icon name="arrow" size={16} /></button>
      </div>
    </aside>

    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumb"><span>JARVIS</span><span className="breadcrumb-divider">/</span><strong>{navigation.find((item) => item.id === active)?.label ?? "Dashboard"}</strong></div>
        <div className="topbar-actions"><span className="topbar-date"><Icon name="calendar" size={15} />{dateLabel}</span><button className="theme-toggle" type="button" onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Light mode aktivieren" : "Dark mode aktivieren"}><Icon name={theme === "dark" ? "sunMode" : "moon"} /><span>{theme === "dark" ? "Light" : "Dark"}</span></button><Link className="assistant-shortcut" href="/#assistant" onClick={() => setActive("assistant")}><Icon name="message" /><span>Ask JARVIS</span><kbd>↵</kbd></Link></div>
      </header>

      <main className="dashboard-main">
        <section id="dashboard" className="welcome-row">
          <div><span className="eyebrow">{dateLabel.toUpperCase()}</span><h1>{greeting}, Youssef<span className="greeting-dot">.</span></h1><p>Hier ist dein Überblick für heute. Bleib fokussiert auf das, was zählt.</p></div>
          <div className="welcome-mark"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="orbit-core"><Icon name="spark" size={28} /></span></div>
        </section>

        {dashboardError && <div className="error-banner" role="alert"><Icon name="activity" />{dashboardError}<button className="text-button" onClick={() => { setDashboardError(""); setDashboardLoading(true); void loadDashboard(pw).catch((error) => setDashboardError(error.message)).finally(() => setDashboardLoading(false)); }}>Erneut versuchen</button></div>}

        <section className="overview-grid" aria-label="Tagesübersicht">
          <Card className="overview-card progress-card">
            <div className="metric-heading"><span className="metric-icon cyan"><Icon name="check" /></span><span className="eyebrow">TASK PROGRESS</span></div>
            {dashboardLoading && !dashboard ? <LoadingRows count={2} /> : <><div className="metric-main"><strong>{completedDueToday}<span> / {dueToday.length}</span></strong><span className="metric-note">Status · heute fällig</span></div><div className="progress-track"><span style={{ width: `${taskProgress}%` }} /></div><div className="metric-foot"><span>{openDueToday} heute offen</span><span>{taskProgress}%</span></div></>}
            {dashboard?.errors.tasks && <small className="section-error">{dashboard.errors.tasks}</small>}
          </Card>
          <Card className="overview-card">
            <div className="metric-heading"><span className="metric-icon violet"><Icon name="calendar" /></span><span className="eyebrow">NEXT UP</span></div>
            {dashboardLoading && !dashboard ? <LoadingRows count={2} /> : nextSchedule ? <><div className="next-time">{nextSchedule.time?.slice(0, 5) ?? "—"}<span className="live-dot" /></div><strong className="next-title">{nextSchedule.title}</strong><span className="metric-note">{nextSchedule.kind} · {nextSchedule.category}</span></> : <EmptyState text="Heute stehen keine Termine oder Routinen an." compact />}
            {(dashboard?.errors.events || dashboard?.errors.routines) && <small className="section-error">Tagesplan teilweise nicht verfügbar.</small>}
          </Card>
          <Card className="overview-card">
            <div className="metric-heading"><span className="metric-icon orange"><Icon name="activity" /></span><span className="eyebrow">FOCUS QUEUE</span></div>
            {dashboardLoading && !dashboard ? <LoadingRows count={2} /> : <><div className="metric-main"><strong>{openTasks.length}</strong><span className="metric-note">offene Aufgaben</span></div><div className="priority-line"><span className="priority-dot high" />{openTasks.filter((task) => task.priority === "high").length} hohe Priorität<span className="priority-divider" /><span className="overdue-text">{overdue} überfällig</span></div></>}
          </Card>
          <Card className="overview-card">
            <div className="metric-heading"><span className="metric-icon green"><Icon name="sun" /></span><span className="eyebrow">NEXT PRAYER</span></div>
            {dashboardLoading && !dashboard ? <LoadingRows count={2} /> : nextPrayer ? <><div className="next-time">{nextPrayer.time}<span className="live-dot" /></div><strong className="next-title">{nextPrayer.title.replace("Gebet: ", "")}</strong><span className="metric-note">Gebetszeit · heute</span></> : <EmptyState text={dashboard?.errors.prayers ?? "Keine Gebetszeiten verfügbar."} compact />}
          </Card>
        </section>

        <div className="dashboard-columns">
          <div className="main-column">
            <Card id="my-day" className="content-card day-card">
              <SectionTitle eyebrow="YOUR SCHEDULE" title="My Day" detail="Termine und Routinen für heute" action={<span className="date-chip">{formatDate(today, { day: "numeric", month: "short" })}</span>} />
              {dashboardLoading && !dashboard ? <LoadingRows count={4} /> : dashboard?.errors.events && dashboard?.errors.routines ? <ErrorState text="Dein Tagesplan konnte nicht geladen werden." /> : schedule.length ? <div className="schedule-list">{schedule.map((item, index) => <div className="schedule-item" key={`${item.kind}-${item.id ?? index}`}><span className="schedule-time">{item.time?.slice(0, 5) ?? "—"}</span><span className={`schedule-indicator ${item.kind === "Termin" ? "is-violet" : ""}`} /><div className="schedule-info"><strong>{item.title}</strong><span>{item.kind} · {item.category}</span></div><span className="schedule-chevron"><Icon name="arrow" size={15} /></span></div>)}</div> : <EmptyState text="Für heute sind noch keine Termine oder Routinen eingetragen." actionLabel="Mit JARVIS planen" onAction={() => { setActive("assistant"); document.getElementById("assistant")?.scrollIntoView({ behavior: "smooth" }); }} />}
              {dashboard?.errors.events && <small className="section-error">{dashboard.errors.events}</small>}
              {dashboard?.errors.routines && <small className="section-error">{dashboard.errors.routines}</small>}
            </Card>

            <Card id="tasks" className="content-card tasks-card">
              <SectionTitle eyebrow="STAY ON TRACK" title="Tasks" detail={`${openTasks.length} offene Aufgaben`} action={<Link className="subtle-link" href="/#assistant" onClick={() => setActive("assistant")}>Mit JARVIS planen <Icon name="arrow" size={14} /></Link>} />
              {taskError && <div role="alert" className="inline-error">{taskError}</div>}
              {dashboardLoading && !dashboard ? <LoadingRows count={4} /> : dashboard?.errors.tasks ? <ErrorState text={dashboard.errors.tasks} /> : openTasks.length ? <div className="task-list">{openTasks.slice(0, 8).map((task) => <div className="task-row" key={task.id}><button className="task-check" type="button" disabled={taskBusy === task.id} onClick={() => void completeTask(task)} aria-label={`Aufgabe erledigen: ${task.text}`}><Icon name="check" size={14} /></button><div className="task-copy"><strong>{task.text}</strong><span>{task.due ? task.due < today ? `Überfällig · ${formatDate(task.due, { day: "numeric", month: "short" })}` : task.due === today ? "Heute fällig" : formatDate(task.due, { day: "numeric", month: "short" }) : "Kein Fälligkeitsdatum"}</span></div><span className={`priority-label ${task.priority}`}>{task.priority === "high" ? "High" : task.priority === "low" ? "Low" : "Normal"}</span></div>)}</div> : <EmptyState text="Keine offenen Aufgaben. Das ist ein guter Moment für Fokus." />}
              {openTasks.length > 8 && <p className="muted-footnote">Weitere {openTasks.length - 8} Aufgaben sind in der Übersicht nicht eingeblendet.</p>}
            </Card>

            <Card id="calendar" className="content-card calendar-card">
              <SectionTitle eyebrow="TODAY AT A GLANCE" title="Calendar" detail="Deine Termine und Gebetszeiten" />
              {dashboardLoading && !dashboard ? <LoadingRows count={3} /> : <div className="calendar-content"><div className="calendar-date-block"><span>{formatDate(today, { weekday: "short" }).toUpperCase()}</span><strong>{formatDate(today, { day: "2-digit" })}</strong><span>{formatDate(today, { month: "short" })}</span></div><div className="calendar-timeline">{[...schedule.slice(0, 3).map((item) => ({ ...item, source: "agenda" })), ...(dashboard?.prayers ?? []).slice(0, 2).map((item) => ({ ...item, source: "prayer" }))].sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99")).slice(0, 4).map((item, index) => <div className="calendar-event" key={`${item.source}-${item.id ?? item.title}-${index}`}><span className="calendar-time">{item.time?.slice(0, 5) ?? "—"}</span><span className={`calendar-event-dot ${item.source === "prayer" ? "prayer-dot" : ""}`} /><span>{item.title}</span></div>)}</div></div>}
              {dashboard?.errors.prayers && <small className="section-error">{dashboard.errors.prayers}</small>}
              {!schedule.length && !dashboard?.prayers.length && !dashboardLoading && <EmptyState text="Keine Kalenderdaten für heute verfügbar." compact />}
            </Card>
          </div>

          <div className="side-column">
            <Card id="finance" className="content-card finance-card">
              <SectionTitle eyebrow="MONTHLY OVERVIEW" title="Finance" detail={currentMonth} />
              {dashboardLoading && !dashboard ? <LoadingRows count={3} /> : dashboard?.errors.money ? <ErrorState text={dashboard.errors.money} /> : <><div className="balance-line"><span>Monatssaldo</span><strong>{formatMoney(monthlyIncome - monthlyExpenses)}</strong></div><div className="finance-metrics"><div><span className="finance-label"><i className="finance-dot income" />Einnahmen</span><strong>{formatMoney(monthlyIncome)}</strong></div><div><span className="finance-label"><i className="finance-dot expense" />Ausgaben</span><strong>{formatMoney(monthlyExpenses)}</strong></div></div>{dashboard?.money.length === 0 && <p className="muted-footnote">Noch keine Buchungen in diesem Monat.</p>}{dashboard?.goals.length ? <div className="goals-list"><span className="eyebrow">SPARZIELE</span>{dashboard.goals.slice(0, 3).map((goal) => { const saved = Number(goal.saved); const target = Number(goal.target); const progress = target > 0 ? Math.min(100, Math.round(saved / target * 100)) : 0; return <div className="goal-row" key={goal.id}><div><span>{goal.name}</span><small>{formatMoney(saved)} / {formatMoney(target)}</small></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>; })}</div> : <p className="muted-footnote">Keine Sparziele hinterlegt.</p>}</>}
              {dashboard?.errors.goals && <small className="section-error">{dashboard.errors.goals}</small>}
            </Card>

            <Card id="fitness" className="content-card fitness-card">
              <SectionTitle eyebrow="MOVEMENT & RECOVERY" title="Fitness" detail="Training in diesem Monat" />
              {dashboardLoading && !dashboard ? <LoadingRows count={3} /> : dashboard?.errors.workouts ? <ErrorState text={dashboard.errors.workouts} /> : dashboard?.workoutCount ? <><div className="workout-summary"><span className="workout-icon"><Icon name="activity" size={20} /></span><div><strong>{dashboard.workoutCount}</strong><span>Einheiten erfasst</span></div></div><div className="workout-list">{dashboard.workouts.slice(0, 3).map((workout) => <div key={workout.id} className="workout-row"><span className="workout-date">{formatDate(workout.day, { day: "2-digit", month: "short" })}</span><strong>{workout.ex}</strong><span>{workout.kg ? `${workout.kg} kg` : `${workout.sets ?? 1} Sätze`}</span></div>)}</div></> : <EmptyState text="Noch keine Trainingseinheiten erfasst." compact />}
              <p className="muted-footnote">Im vorhandenen Datenmodell sind keine Fitnessziele hinterlegt.</p>
            </Card>

            <Card id="habits" className="content-card habits-card">
              <SectionTitle eyebrow="BUILD CONSISTENCY" title="Habits" detail={`${checkedHabits.size} von ${dashboard?.habits.length ?? 0} heute erledigt`} />
              {dashboardLoading && !dashboard ? <LoadingRows count={3} /> : dashboard?.errors.habits ? <ErrorState text={dashboard.errors.habits} /> : dashboard?.habits.length ? <div className="habit-list">{dashboard.habits.map((habit) => <div className="habit-row" key={habit.name}><span className={`habit-check ${checkedHabits.has(habit.name) ? "is-done" : ""}`}>{checkedHabits.has(habit.name) && <Icon name="check" size={13} />}</span><span>{habit.name}</span>{checkedHabits.has(habit.name) ? <span className="habit-state">Erledigt</span> : <button className="habit-action" type="button" disabled={habitBusy === habit.name || Boolean(habitBusy)} onClick={() => void checkHabit(habit.name)}>{habitBusy === habit.name ? "…" : "Abhaken"}</button>}</div>)}</div> : <EmptyState text="Noch keine Gewohnheiten angelegt." compact />}
            </Card>

            <Card className="content-card prayer-card">
              <SectionTitle eyebrow="DAILY RHYTHM" title="Prayer Times" detail="Dornum · heute" />
              {dashboardLoading && !dashboard ? <LoadingRows count={3} /> : dashboard?.prayers.length ? <div className="prayer-list">{dashboard.prayers.map((prayer) => <div className={`prayer-row ${nextPrayer?.title === prayer.title ? "is-next" : ""}`} key={prayer.title}><span className="prayer-bullet" /><strong>{prayer.title.replace("Gebet: ", "")}</strong><time>{prayer.time}</time>{nextPrayer?.title === prayer.title && <span className="next-badge">NEXT</span>}</div>)}</div> : <EmptyState text={dashboard?.errors.prayers ?? "Gebetszeiten sind nicht verfügbar."} compact />}
            </Card>
          </div>
        </div>

        <section id="assistant" className="assistant-area">
          <Card className="intelligence-card">
            <div className="intelligence-heading"><span className="intelligence-icon"><Icon name="spark" size={20} /></span><div><span className="eyebrow">JARVIS INTELLIGENCE</span><h2>Tagesbriefing</h2></div><span className="intelligence-live"><i /> LIVE</span></div>
            {intelligence ? <div className="intelligence-copy">{intelligence}</div> : <p className="intelligence-placeholder">Noch kein KI-Briefing erstellt. JARVIS kann deine vorhandenen Daten lesen und eine konkrete Tagesübersicht zusammenfassen.</p>}
            <button className="secondary-button" type="button" disabled={busy} onClick={askForBriefing}>{busy ? "JARVIS denkt nach…" : intelligence ? "Briefing aktualisieren" : "Tagesbriefing erstellen"}<Icon name="arrow" size={15} /></button>
          </Card>

          <Card className="chat-card">
            <SectionTitle eyebrow="DIRECT CHANNEL" title="AI Assistant" detail="Sprich mit JARVIS" action={<button className={`secondary-button voice-mode-button${voiceMode ? " is-active" : ""}`} type="button" onClick={toggleVoiceMode} aria-pressed={voiceMode} title={voiceMode ? "Voice-Modus beenden" : "Voice-Modus starten"}><Icon name="volume" size={15} />{voiceMode ? "Voice-Modus aktiv" : "Voice-Modus starten"}</button>} />
            <div className="chat-stream" aria-live="polite">{chat.length ? chat.map((message, index) => <div className={`chat-message ${message.role}`} key={`${index}-${message.role}`}><span className="chat-avatar">{message.role === "assistant" ? <Icon name="spark" size={14} /> : "Y"}</span><p>{message.text}</p></div>) : <EmptyState text="Stelle eine Frage zu deiner Planung, deinen Aufgaben oder Routinen." compact />}</div>
            <form className="chat-form" onSubmit={(event) => { event.preventDefault(); send(); }}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Frag JARVIS etwas …" aria-label="Nachricht an JARVIS" /><button className={`voice-input-button${listening ? " is-active" : ""}`} type="button" onClick={toggleListening} disabled={busy && !listening} aria-pressed={listening} aria-label={listening ? "Aufnahme abbrechen" : "Spracheingabe starten"} title={listening ? "Aufnahme abbrechen" : "Spracheingabe starten"}><Icon name={listening ? "stop" : "microphone"} size={18} /><span className="voice-input-label">{listening ? "Abbrechen" : "Sprechen"}</span></button><button className="send-button" type="submit" disabled={busy || !input.trim()} aria-label="Nachricht senden"><Icon name="arrow" /></button></form>
            {voiceTranscript && <p className="voice-transcript" aria-live="polite"><strong>Erkannt:</strong> {voiceTranscript}</p>}
            <div className="chat-voice-controls" aria-label="Sprachausgabe">
              <button className="voice-control-button" type="button" onClick={speakLatestReply} disabled={!speechSynthesisSupported || !chat.some((message) => message.role === "assistant")}><Icon name="volume" size={14} />Vorlesen</button>
              <button className="voice-control-button" type="button" onClick={() => speakText(lastSpokenTextRef.current)} disabled={!speechSynthesisSupported || !lastSpokenTextRef.current}><Icon name="repeat" size={14} />Wiederholen</button>
              <button className="voice-control-button" type="button" onClick={stopSpeaking} disabled={!speaking}><Icon name="stop" size={14} />Stoppen</button>
              <span className="voice-status" role="status" aria-live="polite">{listening ? "Hört zu · Deutsch" : busy ? "Verarbeitet" : speaking ? "Antwortet" : "Bereit · Deutsch"}{voiceError ? ` · ${voiceError}` : !speechRecognitionSupported ? " · Spracherkennung im Browser nicht verfügbar" : ""}</span>
            </div>
            <p className="voice-disclaimer">Nutzt die integrierten Sprachfunktionen des Browsers; Unterstützung und Verarbeitung hängen von Browser und Gerät ab.</p>
            {voiceError && <p className="voice-error" role="alert">{voiceError}</p>}
          </Card>
        </section>

        <Card className="content-card agents-card">
          <SectionTitle eyebrow="REPOSITORY WORKFLOW" title="Agenten-Aufträge" detail="OpenAI plant · Claude prüft · GitHub arbeitet erst nach deiner Freigabe" />
          <form className="agent-form" onSubmit={createJob}><textarea value={jobRequest} onChange={(event) => setJobRequest(event.target.value)} maxLength={6000} rows={3} placeholder="Beschreibe eine Repository-Änderung – keine Passwörter oder API-Schlüssel." /><button className="primary-button" type="submit" disabled={jobBusy || !jobRequest.trim()}>{jobBusy ? "Plan wird erstellt…" : "Plan erstellen"}<Icon name="arrow" size={15} /></button></form>
          {jobError && <p role="alert" className="inline-error">{jobError}</p>}
          <div className="agent-job-layout"><div className="job-list"><h3>Letzte Aufträge</h3>{jobs.length ? jobs.map((job) => <button key={job.id} className={`job-list-item${selectedJob === job.id ? " selected" : ""}`} type="button" onClick={() => { setSelectedJob(job.id); setJobError(""); }}><span className={`job-status-dot ${job.status}`} /><span><strong>{jobStatusLabel[job.status] ?? job.status}</strong><small>{job.plan?.summary ?? job.request_text}</small></span><Icon name="chevron" size={15} /></button>) : <p className="empty-copy">Noch keine Agenten-Aufträge.</p>}</div>
            {jobDetails && selectedJob === jobDetails.job.id && <article className="job-detail"><h3>{jobStatusLabel[jobDetails.job.status] ?? jobDetails.job.status}</h3><p>{jobDetails.job.plan?.summary ?? jobDetails.job.request_text}</p>{jobDetails.job.plan?.steps.map((step, index) => <p className="job-step" key={index}><strong>{index + 1}. {step.title}</strong><br />{step.description}</p>)}{jobDetails.job.review && <p className="review-copy"><strong>Claude-Prüfung:</strong> {jobDetails.job.review.summary}</p>}{jobDetails.job.review?.concerns.map((concern, index) => <p className="job-concern" key={index}>Hinweis: {concern}</p>)}{jobDetails.steps.map((step) => <p className="job-step" key={step.id}>{step.agent} · {step.name}: {step.summary ?? (step.error_code ? automationErrorMessage(step.error_code) : step.status)}</p>)}{jobDetails.job.evaluation && <p><strong>Ergebnis:</strong> {jobDetails.job.evaluation.summary}</p>}{jobDetails.job.evaluation?.limitations.map((item, index) => <p className="job-concern" key={index}>Einschränkung: {item}</p>)}{jobDetails.job.github_pr_url && <p><a className="subtle-link" href={jobDetails.job.github_pr_url} target="_blank" rel="noreferrer">Pull Request prüfen <Icon name="arrow" size={14} /></a></p>}{jobDetails.job.github_task_url && <p><a className="subtle-link" href={jobDetails.job.github_task_url} target="_blank" rel="noreferrer">GitHub-Aufgabe öffnen <Icon name="arrow" size={14} /></a></p>}{jobDetails.job.github_state && <p className="job-step">GitHub-Status: {jobDetails.job.github_state}</p>}{jobDetails.job.failure_code && <p role="alert" className="inline-error">{automationErrorMessage(jobDetails.job.failure_code)}</p>}{jobDetails.job.status === "failed" && !jobDetails.job.github_task_id && jobDetails.job.planning_attempt_count < 2 && /^(openai|claude)_|^provider_request_failed$/.test(jobDetails.job.failure_code ?? "") && <button className="secondary-button" disabled={jobActionBusy} onClick={() => void retryJob(jobDetails.job.id)}>{jobActionBusy ? "Wird wiederholt…" : "Planung erneut versuchen"}</button>}{jobDetails.job.status === "awaiting_approval" && <div className="approval-panel"><h4>Vorgeschlagener GitHub-Auftrag</h4><pre>{jobDetails.job.review?.prompt ?? jobDetails.job.plan?.prompt}</pre><p>Die Freigabe startet einen Agenten auf einem neuen Branch und fordert einen Pull Request an. Kein automatischer Merge oder Deploy.</p><button className="primary-button" type="button" disabled={jobActionBusy} onClick={() => { if (window.confirm("Diesen angezeigten Plan an den GitHub-Agenten übergeben? Es wird ein Branch/PR angefordert; kein automatischer Merge oder Deploy.")) void approveJob(jobDetails.job.id); }}>{jobActionBusy ? "Wird freigegeben…" : "Plan freigeben und Agent starten"}</button></div>}</article>}
          </div>
        </Card>

        <DevelopmentCenter password={pw} />

        <Card id="settings" className="content-card settings-card"><div><SectionTitle eyebrow="PREFERENCES" title="Settings" detail="Dashboard und Sitzung verwalten" /><p>Dein ausgewähltes Design wird auf diesem Gerät gespeichert.</p></div><div className="settings-actions"><button className="theme-toggle" type="button" onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")}><Icon name={theme === "dark" ? "sunMode" : "moon"} />{theme === "dark" ? "Light mode" : "Dark mode"}</button><button className="secondary-button" type="button" onClick={signOut}><Icon name="logout" size={16} />Abmelden</button></div></Card>
        <footer className="page-footer"><span><i className="status-dot" />JARVIS SYSTEM ONLINE</span><span>PERSONAL AI COMMAND CENTER · {formatDate(today, { year: "numeric" })}</span></footer>
      </main>
    </div>

    <nav className="mobile-nav" aria-label="Mobile Navigation">{primaryMobileNavigation.map((item) => navLink(item, true))}<button type="button" className={`nav-link nav-link-compact${moreOpen ? " is-active" : ""}`} onClick={() => setMoreOpen((value) => !value)} aria-expanded={moreOpen}><Icon name="grid" /><span>Mehr</span></button>{moreOpen && <div className="mobile-more">{navigation.filter((item) => !["dashboard", "my-day", "tasks", "assistant"].includes(item.id)).map((item) => navLink(item, true))}</div>}</nav>
  </div>;
}

function EmptyState({ text, compact = false, actionLabel, onAction }: { text: string; compact?: boolean; actionLabel?: string; onAction?: () => void }) {
  return <div className={`empty-state${compact ? " compact" : ""}`}><span className="empty-orb"><Icon name="spark" size={16} /></span><p>{text}</p>{actionLabel && onAction && <button className="text-button" onClick={onAction}>{actionLabel} <Icon name="arrow" size={13} /></button>}</div>;
}

function ErrorState({ text }: { text: string }) {
  return <div className="error-state" role="alert"><Icon name="activity" size={17} /><span>{text}</span></div>;
}
