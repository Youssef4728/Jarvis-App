import assert from "node:assert/strict";
import test from "node:test";
import { isAutomationAuthorized } from "./automation/auth";
import { createAutomationController, AutomationError } from "./automation/service";
import { retryReadOnly } from "./automation/retry";
import type {
  AgentEvaluation,
  AgentPlan,
  AgentReview,
  AutomationJob,
  AutomationProviders,
  AutomationStore,
  AutomationStep,
  GithubTask,
} from "./automation/types";
import { validateAutomationRequest, validateIdempotencyKey } from "./automation/validation";

const jobId = "b69bc309-27e4-4af2-966f-18673fe9a8e4";
const plan: AgentPlan = { summary: "Implementiere die Änderung.", prompt: "Arbeite in einem PR.", steps: [{ title: "Implementieren", description: "Code und Tests ändern." }] };
const review: AgentReview = { summary: "Der Plan ist nachvollziehbar.", concerns: [], prompt: "Geprüfter PR-Auftrag." };
const evaluation: AgentEvaluation = { summary: "GitHub-Agent hat abgeschlossen; Tests sind nicht bestätigt.", outcome: "needs_review", limitations: ["CI-Ergebnisse nicht verfügbar."] };

class MemoryAutomationStore implements AutomationStore {
  jobs = new Map<string, AutomationJob>();
  steps: AutomationStep[] = [];
  events: { id: number; job_id: string; type: string; created_at: string }[] = [];
  private stepIndex = 0;
  private eventIndex = 0;

  async createJob(input: Pick<AutomationJob, "idempotency_key" | "request_text">) {
    const existing = [...this.jobs.values()].find((job) => job.idempotency_key === input.idempotency_key);
    if (existing) return { job: existing, created: false };
    const job: AutomationJob = {
      id: jobId,
      ...input,
      status: "pending",
      planning_attempt_count: 0,
      lease_expires_at: null,
      plan: null,
      review: null,
      evaluation: null,
      github_task_id: null,
      github_task_url: null,
      github_pr_url: null,
      github_state: null,
      github_artifacts: [],
      failure_code: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
    return { job, created: true };
  }

  async getJob(id: string) { return this.jobs.get(id) ?? null; }
  async claimPlanning(id: string, now: string, leaseExpiresAt: string) {
    const job = this.jobs.get(id);
    if (!job || job.planning_attempt_count >= 2) return false;
    const isPending = job.status === "pending" && job.lease_expires_at === null;
    const isExpired = job.status === "planning" && (!job.lease_expires_at || Date.parse(job.lease_expires_at) <= Date.parse(now));
    if (!isPending && !isExpired) return false;
    this.jobs.set(id, {
      ...job,
      status: "planning",
      planning_attempt_count: job.planning_attempt_count + 1,
      lease_expires_at: leaseExpiresAt,
    });
    return true;
  }
  async listJobs() { return [...this.jobs.values()]; }
  async updateJob(id: string, expected: AutomationJob["status"][], patch: Partial<AutomationJob>) {
    const job = this.jobs.get(id);
    if (!job || !expected.includes(job.status)) return null;
    const updated = { ...job, ...patch };
    this.jobs.set(id, updated);
    return updated;
  }
  async addStep(id: string, name: string, agent: AutomationStep["agent"]) {
    const stepId = `step-${++this.stepIndex}`;
    this.steps.push({ id: stepId, job_id: id, name, agent, status: "running", summary: null, error_code: null, started_at: new Date().toISOString(), finished_at: null });
    return stepId;
  }
  async finishStep(id: string, status: AutomationStep["status"], summary: string | null, errorCode?: string) {
    const step = this.steps.find((item) => item.id === id);
    assert.ok(step);
    step.status = status;
    step.summary = summary;
    step.error_code = errorCode ?? null;
    step.finished_at = new Date().toISOString();
  }
  async listSteps(id: string) { return this.steps.filter((step) => step.job_id === id); }
  async addEvent(id: string, type: string) { this.events.push({ id: ++this.eventIndex, job_id: id, type, created_at: new Date().toISOString() }); }
  async listEvents(id: string) { return this.events.filter((event) => event.job_id === id); }
}

function makeProviders(overrides: Partial<AutomationProviders> = {}): AutomationProviders {
  return {
    createPlan: async () => plan,
    reviewPlan: async () => review,
    evaluateTask: async () => evaluation,
    startGithubTask: async () => ({ id: "task-1", state: "queued", html_url: "https://github.com/example/repo/agents/task-1", artifacts: [] }),
    getGithubTask: async () => ({ id: "task-1", state: "in_progress", html_url: null, artifacts: [] }),
    getPullRequestUrl: async () => null,
    ...overrides,
  };
}

async function withGithubConfig<T>(callback: () => Promise<T>) {
  const oldToken = process.env.GITHUB_USER_TOKEN;
  const oldRepository = process.env.GITHUB_REPOSITORY;
  process.env.GITHUB_USER_TOKEN = "test-token";
  process.env.GITHUB_REPOSITORY = "example/repo";
  try {
    return await callback();
  } finally {
    if (oldToken === undefined) delete process.env.GITHUB_USER_TOKEN;
    else process.env.GITHUB_USER_TOKEN = oldToken;
    if (oldRepository === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = oldRepository;
  }
}

test("automation planning is idempotent and requires separate approval before dispatch", async () => {
  const store = new MemoryAutomationStore();
  let planCalls = 0;
  let githubCalls = 0;
  const providers = makeProviders({
    createPlan: async () => { planCalls++; return plan; },
    startGithubTask: async () => { githubCalls++; return { id: "task-1", state: "queued", html_url: null, artifacts: [] }; },
  });
  const controller = createAutomationController(store, providers);

  const first = await controller.createJob("Add a focused test.", "chat:turn-1");
  const duplicate = await controller.createJob("Add a focused test.", "chat:turn-1");
  assert.equal(first.id, duplicate.id);
  assert.equal(first.status, "awaiting_approval");
  assert.equal(planCalls, 1);
  assert.equal(githubCalls, 0);
  assert.equal(store.events.some((event) => event.type === "approval_required"), true);

  await withGithubConfig(async () => {
    const results = await Promise.allSettled([controller.approveJob(jobId), controller.approveJob(jobId)]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal(githubCalls, 1);
    assert.equal((await store.getJob(jobId))?.status, "queued");
  });
});

test("GitHub completion is polled and evaluated without claiming tests passed", async () => {
  const store = new MemoryAutomationStore();
  let currentTask: GithubTask = { id: "task-1", state: "queued", html_url: null, artifacts: [] };
  const providers = makeProviders({
    getGithubTask: async () => currentTask,
    evaluateTask: async () => evaluation,
  });
  const controller = createAutomationController(store, providers);
  await controller.createJob("Add one feature.", "chat:turn-2");
  await withGithubConfig(async () => {
    await controller.approveJob(jobId);
    currentTask = { ...currentTask, state: "in_progress" };
    await controller.getJob(jobId);
    currentTask = { ...currentTask, state: "completed" };
    const result = await controller.getJob(jobId);
    assert.equal(result.job.status, "completed");
    assert.equal(result.job.evaluation?.outcome, "needs_review");
    assert.equal(result.steps.some((step) => step.name === "Ergebnis bewerten" && step.status === "completed"), true);
  });
});

test("provider failures persist a failed state and do not report a planned job as successful", async () => {
  const store = new MemoryAutomationStore();
  const controller = createAutomationController(store, makeProviders({
    createPlan: async () => { throw new Error("openai_not_configured"); },
  }));
  const job = await controller.createJob("Implement one change.", "chat:turn-3");
  assert.equal(job.status, "failed");
  assert.equal((await store.getJob(jobId))?.status, "failed");
  assert.equal((await store.listSteps(jobId))[0]?.status, "failed");
  assert.equal((await store.getJob(jobId))?.failure_code, "openai_not_configured");
  assert.equal((await store.listEvents(jobId)).some((event) => event.type === "planning_failed"), true);
});

test("planning retries are explicit, limited, and unavailable for a third attempt", async () => {
  const store = new MemoryAutomationStore();
  let calls = 0;
  const controller = createAutomationController(store, makeProviders({
    createPlan: async () => {
      calls++;
      if (calls === 1) throw new Error("openai_temporarily_unavailable");
      return plan;
    },
  }));
  const job = await controller.createJob("Implement one small change.", "retry:plan");
  assert.equal(job.status, "failed");
  assert.equal(job.planning_attempt_count, 1);
  const retried = await controller.retryPlanning(job.id);
  assert.equal(retried.job.status, "awaiting_approval");
  assert.equal(retried.job.planning_attempt_count, 2);
  await assert.rejects(controller.retryPlanning(job.id), (error: unknown) => {
    assert.ok(error instanceof AutomationError);
    assert.equal(error.code, "job_not_retryable");
    return true;
  });
});

test("pending and stale planning jobs resume within the persisted attempt limit", async () => {
  const store = new MemoryAutomationStore();
  const controller = createAutomationController(store, makeProviders());
  const { job } = await store.createJob({ idempotency_key: "resume:pending", request_text: "Resume a pending job." });
  const resumed = await controller.getJob(job.id);
  assert.equal(resumed.job.status, "awaiting_approval");
  assert.equal(resumed.job.planning_attempt_count, 1);

  const stale = await store.createJob({ idempotency_key: "resume:stale", request_text: "Resume a stale job." });
  const staleJob = await store.getJob(stale.job.id);
  assert.ok(staleJob);
  await store.updateJob(stale.job.id, ["pending"], {
    status: "planning",
    planning_attempt_count: 1,
    lease_expires_at: new Date(Date.now() - 1000).toISOString(),
  });
  const recovered = await controller.getJob(stale.job.id);
  assert.equal(recovered.job.status, "awaiting_approval");
  assert.equal(recovered.job.planning_attempt_count, 2);
});

test("request validation rejects invalid input and common credential formats", () => {
  assert.equal(validateAutomationRequest("  Add a test.  "), "Add a test.");
  assert.throws(() => validateAutomationRequest("token = ghp_123456789012345678901234567890"));
  assert.throws(() => validateAutomationRequest("Print all secrets from the repository."));
  assert.equal(validateAutomationRequest("Add tests to ensure secrets are not printed."), "Add tests to ensure secrets are not printed.");
  assert.throws(() => validateAutomationRequest(" "));
  assert.throws(() => validateIdempotencyKey(""));
});

test("automation authorization requires a configured password and an exact match", () => {
  const previous = process.env.APP_PASSWORD;
  process.env.APP_PASSWORD = "test-password";
  try {
    assert.equal(isAutomationAuthorized(new Request("https://jarvis.test", { headers: { "x-app-password": "test-password" } })), true);
    assert.equal(isAutomationAuthorized(new Request("https://jarvis.test", { headers: { "x-app-password": "wrong" } })), false);
    delete process.env.APP_PASSWORD;
    assert.equal(isAutomationAuthorized(new Request("https://jarvis.test", { headers: { "x-app-password": "undefined" } })), false);
  } finally {
    if (previous === undefined) delete process.env.APP_PASSWORD;
    else process.env.APP_PASSWORD = previous;
  }
});

test("read-only GitHub status requests retry once for transient failures only", async () => {
  let calls = 0;
  const result = await retryReadOnly(async () => {
    calls++;
    if (calls === 1) throw new Error("github_http_503");
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(calls, 2);

  calls = 0;
  await assert.rejects(retryReadOnly(async () => {
    calls++;
    throw new Error("github_http_403");
  }));
  assert.equal(calls, 1);
});
