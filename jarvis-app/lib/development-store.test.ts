import assert from "node:assert/strict";
import test from "node:test";
import { createDevelopmentStore, DevelopmentStoreError } from "./development/store";

test("vision revision creation calls only the privileged idempotent RPC", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: { id: "revision-id", title: "JARVIS" }, error: null };
    },
  };
  const store = createDevelopmentStore(client as never);
  const result = await store.createVisionRevision({
    title: "JARVIS",
    content: "Persist the user vision.",
    idempotencyKey: "vision:initial-001",
  });
  const call = calls[0];
  assert.equal(result.id, "revision-id");
  assert.equal(call?.name, "create_master_vision_revision");
  assert.equal(call?.args.p_actor, "user");
  assert.equal(call?.args.p_idempotency_key, "vision:initial-001");
});

test("development item creation preserves structured fields and dependency references", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: { id: "task-id", status: "backlog" }, error: null };
    },
  };
  const store = createDevelopmentStore(client as never);
  const result = await store.createItem({
    visionRevisionId: "vision-id",
    parentId: "milestone-id",
    type: "task",
    title: "Add restart recovery",
    description: "Resume persisted work after interruption.",
    priority: 0,
    acceptanceCriteria: ["A restart restores the task state."],
    testRequirements: ["Exercise retry and recovery paths."],
    affectedComponents: ["worker", "queue"],
    estimatedEffortMinutes: 120,
    dependencies: ["prerequisite-id"],
    idempotencyKey: "task:restart-recovery-v1",
  });

  assert.equal(result.id, "task-id");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, "create_development_item");
  assert.deepEqual(calls[0]?.args, {
    p_vision_revision_id: "vision-id",
    p_parent_id: "milestone-id",
    p_item_type: "task",
    p_title: "Add restart recovery",
    p_description: "Resume persisted work after interruption.",
    p_priority: 0,
    p_acceptance_criteria: ["A restart restores the task state."],
    p_test_requirements: ["Exercise retry and recovery paths."],
    p_affected_components: ["worker", "queue"],
    p_estimated_effort_minutes: 120,
    p_idempotency_key: "task:restart-recovery-v1",
    p_dependencies: ["prerequisite-id"],
    p_actor: "user",
  });
});

test("database transition conflicts map to a safe client error", async () => {
  const client = {
    rpc: async () => ({
      data: null,
      error: { code: "40001", message: "development_item_conflict: details must not escape" },
    }),
  };
  const store = createDevelopmentStore(client as never);
  await assert.rejects(
    store.transitionItem("11111111-1111-4111-8111-111111111111", "ready", "in_progress", ""),
    (error: unknown) => {
      assert.ok(error instanceof DevelopmentStoreError);
      assert.equal(error.code, "development_item_conflict");
      assert.equal(error.httpStatus, 409);
      assert.equal(error.message, "development_item_conflict");
      return true;
    },
  );
});
