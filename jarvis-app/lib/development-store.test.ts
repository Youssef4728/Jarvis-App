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
