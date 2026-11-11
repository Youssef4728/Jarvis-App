import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TOOLS, runTool } from "./tools";
import {
  addCalendarDays,
  getCalendarWeek,
  getLocalDate,
  isIsoDate,
  resolveTaskDateRange,
  runTaskCreationOnce,
  sortTasksByPriorityAndDue,
} from "./task-utils";

const taskId = "b69bc309-27e4-4af2-966f-18673fe9a8e4";

function createClient(result: { data: any; error: { message: string } | null }) {
  const calls: {
    table?: string;
    selected?: string;
    insert?: unknown;
    update?: unknown;
    filters: [string, unknown][];
    orders: [string, unknown?][];
  } = { filters: [], orders: [] };
  const query = {
    select(columns: string) {
      calls.selected = columns;
      return query;
    },
    insert(values: unknown) {
      calls.insert = values;
      return query;
    },
    update(values: unknown) {
      calls.update = values;
      return query;
    },
    eq(column: string, value: unknown) {
      calls.filters.push([column, value]);
      return query;
    },
    gte(column: string, value: unknown) {
      calls.filters.push([`${column} >=`, value]);
      return query;
    },
    lte(column: string, value: unknown) {
      calls.filters.push([`${column} <=`, value]);
      return query;
    },
    order(column: string, options?: unknown) {
      calls.orders.push([column, options]);
      return query;
    },
    async single() {
      return result;
    },
    async maybeSingle() {
      return result;
    },
    then(resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  const client = {
    from(table: string) {
      calls.table = table;
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

test("add_task defaults priority and due without an explicit date", async () => {
  const inserted = { id: taskId, text: "Mathe lernen", due: null, done: false, priority: "normal" };
  const { client, calls } = createClient({ data: inserted, error: null });

  const result = JSON.parse(await runTool("add_task", { title: " Mathe lernen " }, client));

  assert.deepEqual(calls.insert, { text: "Mathe lernen", due: null, done: false, priority: "normal" });
  assert.deepEqual(result.task, { id: taskId, title: "Mathe lernen", due: null, priority: "normal", status: "offen" });
});

test("add_task accepts an explicitly extracted date and priority", async () => {
  const { client, calls } = createClient({
    data: { id: taskId, text: "Englisch lernen", due: "2026-10-25", done: false, priority: "high" },
    error: null,
  });

  const result = JSON.parse(await runTool("add_task", {
    title: "Englisch lernen",
    due: "2026-10-25",
    priority: "high",
  }, client));
  assert.deepEqual(calls.insert, { text: "Englisch lernen", due: "2026-10-25", done: false, priority: "high" });
  assert.equal(result.task.due, "2026-10-25");
  assert.equal(result.task.priority, "high");
});

test("add_task accepts each supported priority", async (t) => {
  for (const priority of ["high", "normal", "low"]) {
    await t.test(priority, async () => {
      const { client, calls } = createClient({
        data: { id: taskId, text: "Task", due: null, done: false, priority },
        error: null,
      });
      await runTool("add_task", { title: "Task", priority }, client);
      assert.equal((calls.insert as { priority: string }).priority, priority);
    });
  }
});

test("add_task rejects invalid priorities and dates before database access", async () => {
  const { client, calls } = createClient({ data: null, error: null });

  await assert.rejects(runTool("add_task", { title: "Task", priority: "urgent" }, client), /Ungültige Priorität/);
  await assert.rejects(runTool("add_task", { title: "Task", due: "2026-02-30" }, client), /gültiges Datum/);
  await assert.rejects(runTool("add_task", { title: "Task", due: "25. Oktober" }, client), /gültiges Datum/);
  await assert.rejects(runTool("add_task", { title: "   " }, client), /Aufgabentitel/);
  assert.equal(calls.table, undefined);
});

test("add_task surfaces insert errors", async () => {
  const { client } = createClient({ data: null, error: { message: "database unavailable" } });
  await assert.rejects(runTool("add_task", { title: "Task" }, client), /database unavailable/);
});

test("list_tasks returns open tasks with priority order and due-date order", async () => {
  const rows = [
    { id: "low", text: "Low", due: "2026-10-20", done: false, priority: "low" },
    { id: "normal-later", text: "Normal later", due: "2026-10-21", done: false, priority: "normal" },
    { id: "high", text: "High", due: null, done: false, priority: "high" },
    { id: "normal-first", text: "Normal first", due: "2026-10-19", done: false, priority: "normal" },
  ];
  const { client, calls } = createClient({ data: rows, error: null });

  const result = JSON.parse(await runTool("list_tasks", {}, client));
  assert.deepEqual(calls.filters, [["done", false]]);
  assert.deepEqual(result.map((task: { id: string }) => task.id), ["high", "normal-first", "normal-later", "low"]);
  assert.equal(result[0].due, null);
  assert.equal(result[0].priority, "high");
});

test("list_tasks surfaces errors instead of returning an empty list", async () => {
  const { client } = createClient({ data: null, error: { message: "read failed" } });
  await assert.rejects(runTool("list_tasks", {}, client), /read failed/);
});

test("list_completed_tasks selects completed tasks and includes priority", async () => {
  const { client, calls } = createClient({
    data: [{ id: taskId, text: "Done", due: "2026-10-20", done: true, priority: "high" }],
    error: null,
  });

  test("list_completed_tasks is registered for read-only completed-task requests", () => {
    const tool = TOOLS.find((entry) => entry.name === "list_completed_tasks");
    assert.ok(tool);
    assert.deepEqual(tool.input_schema, { type: "object", properties: {} });
  });

  const result = JSON.parse(await runTool("list_completed_tasks", {}, client));
  assert.deepEqual(calls.filters, [["done", true]]);
  assert.equal(calls.selected, "id,text,due,done,priority");
  assert.deepEqual(result[0], { id: taskId, title: "Done", due: "2026-10-20", priority: "high", status: "erledigt" });
});

test("list_completed_tasks preserves empty-list and database-error behavior", async (t) => {
  await t.test("empty", async () => {
    const { client } = createClient({ data: [], error: null });
    assert.equal(await runTool("list_completed_tasks", {}, client), "[]");
  });
  await t.test("database error", async () => {
    const { client } = createClient({ data: null, error: { message: "read failed" } });
    await assert.rejects(runTool("list_completed_tasks", {}, client), /read failed/);
  });
});

test("list_tasks_by_date filters open, completed, and all statuses inclusively", async (t) => {
  for (const [status, expectedStatusFilter] of [
    ["open", ["done", false]],
    ["completed", ["done", true]],
    ["all", null],
  ] as const) {
    await t.test(status, async () => {
      const { client, calls } = createClient({ data: [], error: null });
      assert.equal(await runTool("list_tasks_by_date", {
        period: "range",
        start_date: "2026-10-19",
        end_date: "2026-10-25",
        status,
      }, client), "[]");
      assert.deepEqual(calls.filters.slice(0, 2), [["due >=", "2026-10-19"], ["due <=", "2026-10-25"]]);
      assert.deepEqual(calls.filters[2] ?? null, expectedStatusFilter);
      assert.deepEqual(calls.orders, [["due", undefined]]);
    });
  }
});

test("list_tasks_by_date excludes null due dates through inclusive due bounds", async () => {
  const { client, calls } = createClient({ data: [], error: null });

  await runTool("list_tasks_by_date", { period: "date", date: "2026-10-20", status: "all" }, client);
  assert.deepEqual(calls.filters, [["due >=", "2026-10-20"], ["due <=", "2026-10-20"]]);
});

test("list_tasks_by_date rejects invalid dates, reversed ranges, and status values", async () => {
  const { client, calls } = createClient({ data: [], error: null });
  await assert.rejects(runTool("list_tasks_by_date", { period: "date", date: "2026-02-30", status: "all" }, client), /gültiges Datum/);
  await assert.rejects(runTool("list_tasks_by_date", { period: "range", start_date: "2026-10-21", end_date: "2026-10-20", status: "all" }, client), /Startdatum/);
  await assert.rejects(runTool("list_tasks_by_date", { period: "date", date: "2026-10-20", status: "done" }, client), /Ungültiger Aufgabenstatus/);
  assert.equal(calls.table, undefined);
});

test("list_tasks_by_date surfaces database errors", async () => {
  const { client } = createClient({ data: null, error: { message: "date query failed" } });
  await assert.rejects(runTool("list_tasks_by_date", { period: "this_week", status: "completed" }, client), /date query failed/);
});

test("update_task_priority validates UUID and priority and confirms the updated row", async (t) => {
  for (const priority of ["high", "normal", "low"]) {
    await t.test(priority, async () => {
      const { client, calls } = createClient({ data: { id: taskId, priority }, error: null });
      const result = JSON.parse(await runTool("update_task_priority", { task_id: taskId.toUpperCase(), priority }, client));
      assert.deepEqual(calls.update, { priority });
      assert.deepEqual(calls.filters, [["id", taskId]]);
      assert.equal(result.priority, priority);
    });
  }
});

test("update_task_priority rejects invalid input, reports missing tasks, and surfaces errors", async (t) => {
  await t.test("invalid UUID", async () => {
    const { client, calls } = createClient({ data: null, error: null });
    await assert.rejects(runTool("update_task_priority", { task_id: "bad", priority: "high" }, client), /gültige Aufgaben-ID/);
    assert.equal(calls.table, undefined);
  });
  await t.test("invalid priority", async () => {
    const { client, calls } = createClient({ data: null, error: null });
    await assert.rejects(runTool("update_task_priority", { task_id: taskId, priority: "urgent" }, client), /Ungültige Priorität/);
    assert.equal(calls.table, undefined);
  });
  await t.test("not found", async () => {
    const { client } = createClient({ data: null, error: null });
    assert.equal(await runTool("update_task_priority", { task_id: taskId, priority: "high" }, client), "nicht gefunden");
  });
  await t.test("database error", async () => {
    const { client } = createClient({ data: null, error: { message: "update failed" } });
    await assert.rejects(runTool("update_task_priority", { task_id: taskId, priority: "high" }, client), /update failed/);
  });
});

test("complete_task retains its exact-ID update behavior", async () => {
  const { client, calls } = createClient({ data: { id: taskId, done: true }, error: null });
  assert.equal(await runTool("complete_task", { task_id: taskId }, client), "erledigt");
  assert.deepEqual(calls.update, { done: true });
  assert.deepEqual(calls.filters, [["id", taskId], ["done", false]]);
});

test("complete_task normalizes uppercase UUIDs", async () => {
  const { client, calls } = createClient({ data: { id: taskId, done: true }, error: null });
  assert.equal(await runTool("complete_task", { task_id: taskId.toUpperCase() }, client), "erledigt");
  assert.deepEqual(calls.filters, [["id", taskId], ["done", false]]);
});

test("complete_task rejects invalid UUIDs before database access", async () => {
  const { client, calls } = createClient({ data: null, error: null });
  await assert.rejects(runTool("complete_task", { task_id: "invalid" }, client), /gültige Aufgaben-ID/);
  assert.equal(calls.table, undefined);
});

test("complete_task reports missing rows and database errors", async (t) => {
  await t.test("not found", async () => {
    const { client } = createClient({ data: null, error: null });
    assert.equal(await runTool("complete_task", { task_id: taskId }, client), "nicht gefunden");
  });
  await t.test("database error", async () => {
    const { client } = createClient({ data: null, error: { message: "update failed" } });
    await assert.rejects(runTool("complete_task", { task_id: taskId }, client), /update failed/);
  });
});

test("date helpers use Berlin local calendar dates and Monday-to-Sunday weeks", async (t) => {
  await t.test("Berlin date around UTC midnight", () => {
    assert.equal(getLocalDate(new Date("2026-10-19T22:30:00.000Z")), "2026-10-20");
    assert.equal(getLocalDate(new Date("2026-10-25T23:30:00.000Z")), "2026-10-26");
  });
  await t.test("Monday and Sunday week bounds", () => {
    assert.deepEqual(getCalendarWeek("2026-10-19"), { startDate: "2026-10-19", endDate: "2026-10-25" });
    assert.deepEqual(getCalendarWeek("2026-10-25"), { startDate: "2026-10-19", endDate: "2026-10-25" });
  });
  await t.test("weekend boundaries and calendar arithmetic", () => {
    assert.deepEqual(getCalendarWeek("2026-10-24"), { startDate: "2026-10-19", endDate: "2026-10-25" });
    assert.equal(addCalendarDays("2026-12-31", 1), "2027-01-01");
  });
  await t.test("strict ISO validation", () => {
    assert.equal(isIsoDate("2026-02-28"), true);
    assert.equal(isIsoDate("2026-02-30"), false);
    assert.equal(isIsoDate("25.10.2026"), false);
  });
  await t.test("relative periods resolve in Berlin local time", () => {
    const now = new Date("2026-10-24T22:30:00.000Z");
    assert.deepEqual(resolveTaskDateRange({ period: "today" }, now), { startDate: "2026-10-25", endDate: "2026-10-25" });
    assert.deepEqual(resolveTaskDateRange({ period: "tomorrow" }, now), { startDate: "2026-10-26", endDate: "2026-10-26" });
    assert.deepEqual(resolveTaskDateRange({ period: "this_week" }, now), { startDate: "2026-10-19", endDate: "2026-10-25" });
  });
  await t.test("concrete date and explicit range resolve inclusively", () => {
    assert.deepEqual(resolveTaskDateRange({ period: "date", date: "2026-10-25" }), { startDate: "2026-10-25", endDate: "2026-10-25" });
    assert.deepEqual(resolveTaskDateRange({ period: "range", start_date: "2026-10-19", end_date: "2026-10-25" }), { startDate: "2026-10-19", endDate: "2026-10-25" });
  });
});

test("new task functions do not issue delete operations", async () => {
  const { client, calls } = createClient({ data: [], error: null });
  await runTool("list_tasks_by_date", { period: "range", start_date: "2026-10-19", end_date: "2026-10-25", status: "all" }, client);
  assert.equal(calls.update, undefined);
  assert.equal(calls.insert, undefined);
});

test("duplicate add_task calls in an agent run share one creation promise", async () => {
  const cache = new Map<string, Promise<string>>();
  const input = { title: "  Mathe   lernen ", due: "2026-10-20", priority: "high" };
  let calls = 0;
  const create = async () => {
    calls += 1;
    return "created";
  };

  const results = await Promise.all([
    runTaskCreationOnce(cache, input, create),
    runTaskCreationOnce(cache, { ...input, title: "mathe lernen" }, create),
  ]);
  assert.deepEqual(results, ["created", "created"]);
  assert.equal(calls, 1);
});

test("task deduplication does not merge distinct due dates or priorities", async () => {
  const cache = new Map<string, Promise<string>>();
  let calls = 0;
  const create = async () => String(++calls);
  await runTaskCreationOnce(cache, { title: "Task", due: "2026-10-20", priority: "normal" }, create);
  await runTaskCreationOnce(cache, { title: "Task", due: "2026-10-21", priority: "normal" }, create);
  await runTaskCreationOnce(cache, { title: "Task", due: "2026-10-20", priority: "high" }, create);
  assert.equal(calls, 3);
});

test("delete_task is not registered", () => {
  assert.equal(TOOLS.some((tool) => tool.name === "delete_task"), false);
});
