export const TASK_PRIORITIES = ["high", "normal", "low"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = ["open", "completed", "all"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_DATE_PERIODS = ["today", "tomorrow", "this_week", "date", "range"] as const;
export type TaskDatePeriod = (typeof TASK_DATE_PERIODS)[number];

export function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && TASK_PRIORITIES.some((priority) => priority === value);
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && TASK_STATUSES.some((status) => status === value);
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getLocalDate(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(now);
}

export function addCalendarDays(date: string, days: number): string {
  if (!isIsoDate(date) || !Number.isInteger(days)) throw new Error("Ungültiges Datum.");
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

export function getCalendarWeek(date: string): { startDate: string; endDate: string } {
  if (!isIsoDate(date)) throw new Error("Ungültiges Datum.");
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const mondayOffset = (weekday + 6) % 7;
  return {
    startDate: addCalendarDays(date, -mondayOffset),
    endDate: addCalendarDays(date, 6 - mondayOffset),
  };
}

export function resolveTaskDateRange(input: unknown, now = new Date()): { startDate: string; endDate: string } {
  if (!input || typeof input !== "object") throw new Error("Ungültiger Datumsfilter.");
  const filter = input as { period?: unknown; date?: unknown; start_date?: unknown; end_date?: unknown };
  if (typeof filter.period !== "string" || !TASK_DATE_PERIODS.some((period) => period === filter.period)) {
    throw new Error("Ungültiger Datumszeitraum.");
  }
  if (filter.period === "today") {
    const date = getLocalDate(now);
    return { startDate: date, endDate: date };
  }
  if (filter.period === "tomorrow") {
    const date = addCalendarDays(getLocalDate(now), 1);
    return { startDate: date, endDate: date };
  }
  if (filter.period === "this_week") return getCalendarWeek(getLocalDate(now));
  if (filter.period === "date") {
    if (!isIsoDate(filter.date)) throw new Error("Das Datum muss ein gültiges Datum im Format YYYY-MM-DD sein.");
    return { startDate: filter.date, endDate: filter.date };
  }
  if (!isIsoDate(filter.start_date) || !isIsoDate(filter.end_date)) {
    throw new Error("Datumsfilter müssen gültige Daten im Format YYYY-MM-DD enthalten.");
  }
  if (filter.start_date > filter.end_date) throw new Error("Das Startdatum darf nicht nach dem Enddatum liegen.");
  return { startDate: filter.start_date, endDate: filter.end_date };
}

export function sortTasksByPriorityAndDue<T extends { priority?: string | null; due: string | null }>(tasks: T[]): T[] {
  const priorityOrder: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };
  return [...tasks].sort((a, b) => {
    const priorityDifference =
      (priorityOrder[isTaskPriority(a.priority) ? a.priority : "normal"]) -
      (priorityOrder[isTaskPriority(b.priority) ? b.priority : "normal"]);
    if (priorityDifference) return priorityDifference;
    if (a.due === b.due) return 0;
    if (a.due === null) return 1;
    if (b.due === null) return -1;
    return a.due.localeCompare(b.due);
  });
}

export function taskCreationKey(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const task = input as { title?: unknown; due?: unknown; priority?: unknown };
  if (typeof task.title !== "string" || !task.title.trim()) return null;
  if (task.due != null && task.due !== "" && !isIsoDate(task.due)) return null;
  if (task.priority != null && !isTaskPriority(task.priority)) return null;
  return JSON.stringify([
    task.title.trim().replace(/\s+/g, " ").toLocaleLowerCase("de"),
    task.due || null,
    task.priority ?? "normal",
  ]);
}

export function runTaskCreationOnce<T>(cache: Map<string, Promise<T>>, input: unknown, create: () => Promise<T>): Promise<T> {
  const key = taskCreationKey(input);
  if (!key) return create();
  let creation = cache.get(key);
  if (!creation) {
    creation = create();
    cache.set(key, creation);
  }
  return creation;
}
