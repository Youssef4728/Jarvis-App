import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeCentralActions, orchestrationActionsToExecutionActions } from "./execution-engine";

function createNoPersistenceClient() {
  const result = { data: null, error: null };
  const chain: any = {
    select() { return chain; },
    insert() { return chain; },
    update() { return chain; },
    eq() { return chain; },
    ilike() { return chain; },
    limit() { return chain; },
    order() { return chain; },
    maybeSingle: async () => result,
    single: async () => result,
    then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: [], error: null }).then(resolve); },
  };
  return {
    from() { return chain; },
  } as unknown as SupabaseClient;
}

test("execution engine converts and executes one batch of module actions", async () => {
  const actions = [
    { type: "add_task" as const, title: "Englisch lernen", due: "2026-11-20", priority: "normal" as const },
    { type: "add_event" as const, title: "Fußball", day: "2026-11-20", time: "16:00", category: "termin" },
  ];
  const calls: { kind: string; input: Record<string, unknown> }[] = [];
  const run = await executeCentralActions(
    "Plane morgen meinen Tag",
    "11111111-1111-4111-8111-111111111111",
    actions,
    {
      supabase: createNoPersistenceClient(),
      executor: async (kind, input) => {
        calls.push({ kind, input });
        return "gespeichert";
      },
    },
  );
  assert.equal(run.status, "completed");
  assert.equal(run.items.length, 2);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.kind), ["add_task", "add_event"]);
});

test("duplicate action keys are stable and approval actions do not execute", () => {
  const actions = [
    { type: "add_task" as const, title: "Englisch lernen", due: "2026-11-20", priority: "normal" as const },
  ];
  const first = orchestrationActionsToExecutionActions(actions);
  const second = orchestrationActionsToExecutionActions(actions);
  assert.equal(first[0].actionKey, second[0].actionKey);
  const approval = orchestrationActionsToExecutionActions([
    { type: "approval_required", reason: "financial_transaction" },
  ]);
  assert.equal(approval[0].kind, "approval_required");
  assert.equal(approval[0].requiresApproval, true);
});

test("failed actions are retried and report failure when attempts are exhausted", async () => {
  let attempts = 0;
  const run = await executeCentralActions(
    "Merke diesen Fakt",
    "22222222-2222-4222-8222-222222222222",
    [{ type: "save_fact", text: "Ich trainiere dienstags." }],
    {
      supabase: createNoPersistenceClient(),
      maxAttempts: 2,
      executor: async () => {
        attempts++;
        throw new Error("database unavailable");
      },
    },
  );
  assert.equal(run.status, "failed");
  assert.equal(run.items[0].status, "failed");
  assert.equal(run.items[0].attempts, 2);
  assert.equal(attempts, 2);
});
