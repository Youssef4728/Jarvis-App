import {
  DEVELOPMENT_STATUSES,
  type DevelopmentItemInput,
  type DevelopmentStatus,
  type VisionRevisionInput,
} from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,160}$/;
const ITEM_TYPES = new Set(["goal", "milestone", "task"]);
const TRANSITIONS: Record<DevelopmentStatus, readonly DevelopmentStatus[]> = {
  backlog: ["ready", "blocked", "cancelled"],
  ready: ["in_progress", "blocked", "awaiting_approval", "cancelled"],
  in_progress: ["testing", "blocked", "awaiting_approval", "failed"],
  testing: ["in_progress", "review", "blocked", "failed"],
  // Completion is disabled until the separate evidence/review endpoint exists.
  review: ["in_progress", "blocked", "awaiting_approval", "failed"],
  blocked: ["ready", "in_progress", "cancelled"],
  awaiting_approval: ["ready", "in_progress", "cancelled"],
  completed: [],
  failed: ["ready", "cancelled"],
  cancelled: [],
};

function requiredText(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new Error(name + "_invalid");
  }
  return value.trim();
}

function validateStringList(value: unknown, name: string, maxItems: number, maxLength: number, minItems = 0): string[] {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) throw new Error(name + "_invalid");
  return value.map((item) => requiredText(item, name, maxLength));
}

function validateKey(value: unknown): string {
  if (typeof value !== "string" || !IDEMPOTENCY_KEY.test(value)) throw new Error("idempotency_key_invalid");
  return value;
}

export function validateVisionRevision(value: unknown): VisionRevisionInput {
  if (!value || typeof value !== "object") throw new Error("vision_invalid");
  const input = value as Record<string, unknown>;
  return {
    title: requiredText(input.title, "vision_title", 160),
    content: requiredText(input.content, "vision_content", 40000),
    idempotencyKey: validateKey(input.idempotencyKey),
  };
}

export function validateDevelopmentItem(value: unknown): DevelopmentItemInput {
  if (!value || typeof value !== "object") throw new Error("development_item_invalid");
  const input = value as Record<string, unknown>;
  if (typeof input.visionRevisionId !== "string" || !UUID.test(input.visionRevisionId)) throw new Error("vision_revision_id_invalid");
  if (input.parentId !== undefined && input.parentId !== null && (typeof input.parentId !== "string" || !UUID.test(input.parentId))) {
    throw new Error("parent_id_invalid");
  }
  if (typeof input.type !== "string" || !ITEM_TYPES.has(input.type)) throw new Error("item_type_invalid");
  if (!Number.isInteger(input.priority) || Number(input.priority) < 0 || Number(input.priority) > 3) throw new Error("priority_invalid");
  if (input.description !== undefined && (typeof input.description !== "string" || input.description.length > 12000)) {
    throw new Error("description_invalid");
  }
  const estimated = input.estimatedEffortMinutes;
  if (input.type === "task" && estimated == null) throw new Error("estimated_effort_required");
  if (estimated !== undefined && estimated !== null && (!Number.isInteger(estimated) || Number(estimated) < 1 || Number(estimated) > 100000)) {
    throw new Error("estimated_effort_invalid");
  }
  const dependencies = validateStringList(input.dependencies, "dependencies", 50, 36);
  if (dependencies.some((id) => !UUID.test(id))) throw new Error("dependencies_invalid");
  if (new Set(dependencies).size !== dependencies.length) throw new Error("dependencies_duplicate");
  return {
    visionRevisionId: input.visionRevisionId,
    parentId: input.parentId as string | null | undefined,
    type: input.type as DevelopmentItemInput["type"],
    title: requiredText(input.title, "title", 200),
    description: typeof input.description === "string" ? input.description : "",
    priority: Number(input.priority) as DevelopmentItemInput["priority"],
    acceptanceCriteria: validateStringList(input.acceptanceCriteria, "acceptance_criteria", 50, 1000, 1),
    testRequirements: validateStringList(input.testRequirements, "test_requirements", 50, 1000, 1),
    affectedComponents: validateStringList(input.affectedComponents, "affected_components", 50, 160, 1),
    estimatedEffortMinutes: estimated as number | null | undefined,
    dependencies,
    idempotencyKey: validateKey(input.idempotencyKey),
  };
}

export function canTransitionDevelopmentItem(from: DevelopmentStatus, to: DevelopmentStatus): boolean {
  return DEVELOPMENT_STATUSES.includes(from) && TRANSITIONS[from].includes(to);
}

export function assertAcyclicDependencies(graph: Map<string, string[]>, itemId: string, dependencies: string[]): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (current: string): void => {
    if (current === itemId) throw new Error("dependency_cycle");
    if (visiting.has(current)) throw new Error("dependency_cycle");
    if (visited.has(current)) return;
    visiting.add(current);
    for (const dependency of graph.get(current) ?? []) visit(dependency);
    visiting.delete(current);
    visited.add(current);
  };
  for (const dependency of dependencies) visit(dependency);
}
