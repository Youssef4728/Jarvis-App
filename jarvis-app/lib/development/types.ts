export const DEVELOPMENT_STATUSES = [
  "backlog", "ready", "in_progress", "testing", "review", "blocked",
  "awaiting_approval", "completed", "failed", "cancelled",
] as const;

export type DevelopmentStatus = typeof DEVELOPMENT_STATUSES[number];
export type DevelopmentItemType = "goal" | "milestone" | "task";
export type DevelopmentPriority = 0 | 1 | 2 | 3;

export type VisionRevisionInput = {
  title: string;
  content: string;
  idempotencyKey: string;
};

export type DevelopmentItemInput = {
  visionRevisionId: string;
  parentId?: string | null;
  type: DevelopmentItemType;
  title: string;
  description?: string;
  priority: DevelopmentPriority;
  acceptanceCriteria: string[];
  testRequirements: string[];
  affectedComponents: string[];
  estimatedEffortMinutes?: number | null;
  dependencies: string[];
  idempotencyKey: string;
};
