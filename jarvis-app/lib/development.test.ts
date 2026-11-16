import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAcyclicDependencies,
  canTransitionDevelopmentItem,
  validateDevelopmentItem,
  validateVisionRevision,
} from "./development/validation";

const uuidA = "11111111-1111-4111-8111-111111111111";
const uuidB = "22222222-2222-4222-8222-222222222222";

test("vision revisions require bounded content and an idempotency key", () => {
  assert.deepEqual(validateVisionRevision({
    title: "JARVIS",
    content: "Build a controlled personal AI system.",
    idempotencyKey: "vision:initial-001",
  }), {
    title: "JARVIS",
    content: "Build a controlled personal AI system.",
    idempotencyKey: "vision:initial-001",
  });
  assert.throws(() => validateVisionRevision({ title: "", content: "text", idempotencyKey: "vision:initial-001" }), /vision_title_invalid/);
  assert.throws(() => validateVisionRevision({ title: "JARVIS", content: " ", idempotencyKey: "vision:initial-001" }), /vision_content_invalid/);
});

test("development items validate IDs, priorities, criteria, and dependencies", () => {
  const valid = {
    visionRevisionId: uuidA,
    type: "task",
    title: "Add durable backlog",
    priority: 0,
    acceptanceCriteria: ["Task state is saved"],
    testRequirements: ["Unit tests pass"],
    affectedComponents: ["lib/development"],
    estimatedEffortMinutes: 60,
    dependencies: [uuidB],
    idempotencyKey: "task:backlog-001",
  };
  assert.equal(validateDevelopmentItem(valid).priority, 0);
  assert.throws(() => validateDevelopmentItem({ ...valid, priority: 5 }), /priority_invalid/);
  assert.throws(() => validateDevelopmentItem({ ...valid, visionRevisionId: "not-a-uuid" }), /vision_revision_id_invalid/);
  assert.throws(() => validateDevelopmentItem({ ...valid, dependencies: [uuidB, uuidB] }), /dependencies_duplicate/);
  assert.throws(() => validateDevelopmentItem({ ...valid, acceptanceCriteria: [] }), /acceptance_criteria_invalid/);
  assert.throws(() => validateDevelopmentItem({ ...valid, estimatedEffortMinutes: null }), /estimated_effort_required/);
});

test("development transitions cannot skip verification or reopen completed work", () => {
  assert.equal(canTransitionDevelopmentItem("backlog", "ready"), true);
  assert.equal(canTransitionDevelopmentItem("in_progress", "completed"), false);
  assert.equal(canTransitionDevelopmentItem("testing", "review"), true);
  assert.equal(canTransitionDevelopmentItem("review", "completed"), false);
  assert.equal(canTransitionDevelopmentItem("completed", "in_progress"), false);
});

test("dependency validation rejects self and transitive cycles", () => {
  const graph = new Map<string, string[]>([
    [uuidA, [uuidB]],
    [uuidB, []],
  ]);
  assert.doesNotThrow(() => assertAcyclicDependencies(graph, "33333333-3333-4333-8333-333333333333", [uuidA]));
  assert.throws(() => assertAcyclicDependencies(graph, uuidB, [uuidA]), /dependency_cycle/);
  assert.throws(() => assertAcyclicDependencies(graph, uuidA, [uuidA]), /dependency_cycle/);
});
