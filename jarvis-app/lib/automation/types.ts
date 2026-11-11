export type JobStatus =
  | "pending"
  | "planning"
  | "awaiting_approval"
  | "dispatching"
  | "dispatch_uncertain"
  | "queued"
  | "in_progress"
  | "evaluating"
  | "completed"
  | "failed";

export type StepStatus = "running" | "completed" | "failed";

export type PlanStep = {
  title: string;
  description: string;
};

export type AgentPlan = {
  summary: string;
  prompt: string;
  steps: PlanStep[];
};

export type AgentReview = {
  summary: string;
  concerns: string[];
  prompt: string;
};

export type AgentEvaluation = {
  summary: string;
  outcome: "completed" | "needs_review";
  limitations: string[];
};

export type AutomationJob = {
  id: string;
  idempotency_key: string;
  request_text: string;
  status: JobStatus;
  planning_attempt_count: number;
  lease_expires_at: string | null;
  plan: AgentPlan | null;
  review: AgentReview | null;
  evaluation: AgentEvaluation | null;
  github_task_id: string | null;
  github_task_url: string | null;
  github_pr_url: string | null;
  github_state: string | null;
  github_artifacts: unknown[];
  failure_code: string | null;
  created_at: string;
  updated_at: string;
};

export type AutomationStep = {
  id: string;
  job_id: string;
  name: string;
  agent: "openai" | "claude" | "github";
  status: StepStatus;
  summary: string | null;
  error_code: string | null;
  started_at: string;
  finished_at: string | null;
};

export type AutomationEvent = {
  id: number;
  job_id: string;
  type: string;
  created_at: string;
};

export type GithubTask = {
  id: string;
  state: string;
  html_url: string | null;
  artifacts: unknown[];
};

export interface AutomationProviders {
  createPlan(request: string): Promise<AgentPlan>;
  reviewPlan(request: string, plan: AgentPlan): Promise<AgentReview>;
  evaluateTask(task: GithubTask): Promise<AgentEvaluation>;
  startGithubTask(prompt: string): Promise<GithubTask>;
  getGithubTask(taskId: string): Promise<GithubTask>;
  getPullRequestUrl(task: GithubTask): Promise<string | null>;
}

export interface AutomationStore {
  createJob(input: Pick<AutomationJob, "idempotency_key" | "request_text">): Promise<{ job: AutomationJob; created: boolean }>;
  claimPlanning(jobId: string, now: string, leaseExpiresAt: string): Promise<boolean>;
  getJob(jobId: string): Promise<AutomationJob | null>;
  listJobs(limit: number): Promise<AutomationJob[]>;
  updateJob(
    jobId: string,
    expected: JobStatus[],
    patch: Partial<AutomationJob>
  ): Promise<AutomationJob | null>;
  addStep(jobId: string, name: string, agent: AutomationStep["agent"]): Promise<string>;
  finishStep(stepId: string, status: StepStatus, summary: string | null, errorCode?: string): Promise<void>;
  listSteps(jobId: string): Promise<AutomationStep[]>;
  addEvent(jobId: string, type: string): Promise<void>;
  listEvents(jobId: string): Promise<AutomationEvent[]>;
}
