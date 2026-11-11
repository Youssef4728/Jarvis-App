import { automationProviders } from "./providers";
import { supabaseAutomationStore } from "./store";
import type {
  AgentEvaluation,
  AutomationJob,
  AutomationProviders,
  AutomationStore,
  GithubTask,
} from "./types";
import { getGithubRepository, validateAutomationRequest, validateIdempotencyKey, validateJobId } from "./validation";

export class AutomationError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number = 400
  ) {
    super(code);
  }
}

function safeFailureCode(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (/^(openai|claude|github|automation)_[a-z0-9_]+$/.test(code)) return code;
  return "provider_request_failed";
}

function isDefinitiveGithubRejection(error: unknown): boolean {
  return error instanceof Error && /^github_http_(400|401|403|404|422)$/.test(error.message);
}

function statusFromGithub(task: GithubTask): "queued" | "in_progress" | "failed" | "completed" {
  if (task.state === "completed") return "completed";
  if (["failed", "timed_out", "cancelled"].includes(task.state)) return "failed";
  if (["queued"].includes(task.state)) return "queued";
  return "in_progress";
}

export function createAutomationController(
  store: AutomationStore = supabaseAutomationStore,
  providers: AutomationProviders = automationProviders
) {
  async function failPlanning(job: AutomationJob, stepId: string | null, error: unknown) {
    const failureCode = safeFailureCode(error);
    if (stepId) await store.finishStep(stepId, "failed", null, failureCode);
    const updated = await store.updateJob(job.id, ["planning"], { status: "failed", failure_code: failureCode, lease_expires_at: null });
    await store.addEvent(job.id, "planning_failed");
    if (!updated) throw new AutomationError("automation_transition_conflict", 409);
    return updated;
  }

  async function planJob(job: AutomationJob) {
    let activeStep: string | null = null;
    try {
      activeStep = await store.addStep(job.id, "Plan erstellen", "openai");
      const plan = await providers.createPlan(job.request_text);
      await store.finishStep(activeStep, "completed", plan.summary);
      activeStep = await store.addStep(job.id, "Plan prüfen", "claude");
      const review = await providers.reviewPlan(job.request_text, plan);
      await store.finishStep(activeStep, "completed", review.summary);
      await store.addEvent(job.id, "approval_required");
      const updated = await store.updateJob(job.id, ["planning"], {
        status: "awaiting_approval",
        plan,
        review,
        lease_expires_at: null,
      });
      if (!updated) throw new Error("automation_transition_conflict");
      return updated;
    } catch (error) {
      if (error instanceof AutomationError) throw error;
      return failPlanning(job, activeStep, error);
    }
  }

  async function createJob(requestValue: unknown, keyValue: unknown) {
    let request: string;
    let key: string;
    try {
      request = validateAutomationRequest(requestValue);
      key = validateIdempotencyKey(keyValue);
    } catch (error) {
      throw new AutomationError(error instanceof Error ? error.message : "request_invalid", 400);
    }
    let created;
    try {
      created = await store.createJob({ idempotency_key: key, request_text: request });
    } catch {
      throw new AutomationError("automation_store_unavailable", 503);
    }
    if (!created.created) return created.job;
    try {
      await store.addEvent(created.job.id, "job_created");
    } catch {
      throw new AutomationError("automation_store_unavailable", 503);
    }
    const now = new Date();
    const claimed = await store.claimPlanning(created.job.id, now.toISOString(), new Date(now.getTime() + 120_000).toISOString());
    if (!claimed) return (await store.getJob(created.job.id)) ?? created.job;
    const planningJob = await store.getJob(created.job.id);
    if (!planningJob) throw new AutomationError("job_not_found", 404);
    return planJob(planningJob);
  }

  async function retryPlanning(jobIdValue: string) {
    let jobId: string;
    try {
      jobId = validateJobId(jobIdValue);
    } catch {
      throw new AutomationError("job_id_invalid", 400);
    }
    const job = await store.getJob(jobId);
    if (!job) throw new AutomationError("job_not_found", 404);
    const retryableFailure = /^(openai|claude)_|^provider_request_failed$/.test(job.failure_code ?? "");
    if (job.status !== "failed" || job.github_task_id || !retryableFailure || job.planning_attempt_count >= 2) {
      throw new AutomationError("job_not_retryable", 409);
    }
    const reset = await store.updateJob(jobId, ["failed"], {
      status: "pending",
      plan: null,
      review: null,
      evaluation: null,
      failure_code: null,
      lease_expires_at: null,
    });
    if (!reset) throw new AutomationError("job_not_retryable", 409);
    await store.addEvent(jobId, "planning_retry_requested");
    return getJob(jobId);
  }

  async function approveJob(jobIdValue: string) {
    let jobId: string;
    try {
      jobId = validateJobId(jobIdValue);
      if (!process.env.GITHUB_USER_TOKEN) throw new Error("github_not_configured");
      getGithubRepository();
    } catch (error) {
      throw new AutomationError(error instanceof Error ? error.message : "github_not_configured", 503);
    }
    const job = await store.getJob(jobId);
    if (!job) throw new AutomationError("job_not_found", 404);
    const claimed = await store.updateJob(jobId, ["awaiting_approval"], { status: "dispatching" });
    if (!claimed) throw new AutomationError("job_not_approvable", 409);
    let stepId: string | null = null;
    let mayHaveSubmitted = false;
    let task: GithubTask;
    try {
      await store.addEvent(jobId, "github_dispatch_approved");
      stepId = await store.addStep(jobId, "GitHub Copilot Cloud Agent", "github");
      const prompt = [
        claimed.review?.prompt ?? claimed.plan?.prompt ?? "",
        `Claude-Prüfung: ${claimed.review?.summary ?? ""}`,
        claimed.review?.concerns.length ? `Zu beachten: ${claimed.review.concerns.join("; ")}` : "",
        "Die Umsetzung ist durch den Nutzer freigegeben. Arbeite ausschließlich im Repository und liefere einen Pull Request. Keine Migrationen ausführen, keine Secrets lesen oder ändern, nicht mergen und nicht deployen.",
      ].filter(Boolean).join("\n\n");
      mayHaveSubmitted = true;
      task = await providers.startGithubTask(prompt);
    } catch (error) {
      const failureCode = safeFailureCode(error);
      const uncertain = mayHaveSubmitted && !isDefinitiveGithubRejection(error);
      if (stepId) await store.finishStep(stepId, "failed", null, failureCode);
      await store.updateJob(jobId, ["dispatching"], {
        status: uncertain ? "dispatch_uncertain" : "failed",
        failure_code: uncertain ? "github_dispatch_uncertain" : failureCode,
      });
      await store.addEvent(jobId, uncertain ? "github_dispatch_uncertain" : "github_dispatch_failed");
      throw new AutomationError(uncertain ? "github_dispatch_uncertain" : failureCode, uncertain ? 502 : 422);
    }
    const state = statusFromGithub(task);
    let updated: AutomationJob | null;
    let pullRequest: { url: string | null; errorCode: string | null } = { url: null, errorCode: null };
    if (state === "completed") pullRequest = await getPullRequestUrl(task);
    try {
      updated = await store.updateJob(jobId, ["dispatching"], {
        status: state === "completed" ? "evaluating" : state,
        github_task_id: task.id,
        github_task_url: task.html_url,
        github_pr_url: pullRequest.url,
        github_state: task.state,
        github_artifacts: task.artifacts,
      });
    } catch {
      await store.updateJob(jobId, ["dispatching"], { status: "dispatch_uncertain", failure_code: "github_dispatch_uncertain" });
      await store.addEvent(jobId, "github_dispatch_uncertain");
      throw new AutomationError("github_dispatch_uncertain", 502);
    }
    if (!updated) {
      await store.updateJob(jobId, ["dispatching"], { status: "dispatch_uncertain", failure_code: "github_dispatch_uncertain" });
      await store.addEvent(jobId, "github_dispatch_uncertain");
      throw new AutomationError("github_dispatch_uncertain", 502);
    }
    if (stepId) await store.finishStep(stepId, "completed", `GitHub-Agent: ${task.state}`);
    await store.addEvent(jobId, "github_task_started");
    if (state === "completed") await evaluateCompletedJob(updated, task, pullRequest);
    return (await store.getJob(jobId)) ?? updated;
  }

  async function getPullRequestUrl(task: GithubTask): Promise<{ url: string | null; errorCode: string | null }> {
    try {
      return { url: await providers.getPullRequestUrl(task), errorCode: null };
    } catch (error) {
      return { url: null, errorCode: safeFailureCode(error) };
    }
  }

  async function evaluateCompletedJob(job: AutomationJob, task: GithubTask, pullRequest: { url: string | null; errorCode: string | null }) {
    const stepId = await store.addStep(job.id, "Ergebnis bewerten", "openai");
    try {
      const result = await providers.evaluateTask(task);
      const evaluation: AgentEvaluation = {
        ...result,
        limitations: [
          ...result.limitations,
          "JARVIS hat den Code-Diff und CI-Ergebnisse nicht unabhängig geprüft; Pull Request und Checks manuell kontrollieren.",
        ],
      };
      if (!pullRequest.url && task.artifacts.some((item) => item && typeof item === "object" && (item as { type?: unknown }).type === "pull")) {
        const reason = pullRequest.errorCode ? ` (${pullRequest.errorCode})` : "";
        evaluation.limitations.push(`Der Pull-Request-Link konnte nicht gelesen werden${reason}; prüfe die GitHub-Berechtigung Pull requests: read.`);
      }
      await store.finishStep(stepId, "completed", evaluation.summary);
      await store.updateJob(job.id, ["evaluating"], {
        status: "completed",
        evaluation,
        github_pr_url: pullRequest.url,
        github_state: task.state,
        github_artifacts: task.artifacts,
        github_task_url: task.html_url,
        failure_code: null,
      });
      await store.addEvent(job.id, "job_completed");
    } catch (error) {
      const failureCode = safeFailureCode(error);
      await store.finishStep(stepId, "failed", null, failureCode);
      await store.updateJob(job.id, ["evaluating"], { status: "failed", failure_code: failureCode });
      await store.addEvent(job.id, "evaluation_failed");
    }
  }

  async function getJob(jobIdValue: string) {
    let jobId: string;
    try {
      jobId = validateJobId(jobIdValue);
    } catch {
      throw new AutomationError("job_id_invalid", 400);
    }
    let job = await store.getJob(jobId);
    if (!job) throw new AutomationError("job_not_found", 404);
    const leaseExpired = !job.lease_expires_at || Date.parse(job.lease_expires_at) <= Date.now();
    if ((job.status === "pending" || job.status === "planning" && leaseExpired) && job.planning_attempt_count < 2) {
      const now = new Date();
      const claimed = await store.claimPlanning(jobId, now.toISOString(), new Date(now.getTime() + 120_000).toISOString());
      if (claimed) {
        const planningJob = await store.getJob(jobId);
        if (planningJob) await planJob(planningJob);
        job = (await store.getJob(jobId)) ?? job;
      }
    }
    if (job.github_task_id && ["queued", "in_progress"].includes(job.status)) {
      try {
        const task = await providers.getGithubTask(job.github_task_id);
        const state = statusFromGithub(task);
        if (state === "completed") {
          const pullRequest = await getPullRequestUrl(task);
          const claimed = await store.updateJob(jobId, ["queued", "in_progress"], {
            status: "evaluating",
            github_state: task.state,
            github_artifacts: task.artifacts,
            github_task_url: task.html_url,
            github_pr_url: pullRequest.url,
          });
          if (claimed) await evaluateCompletedJob(claimed, task, pullRequest);
        } else {
          await store.updateJob(jobId, ["queued", "in_progress"], {
            status: state,
            github_state: task.state,
            github_artifacts: task.artifacts,
            github_task_url: task.html_url,
            ...(state === "failed" ? { failure_code: `github_${task.state}` } : {}),
          });
        }
        job = (await store.getJob(jobId)) ?? job;
      } catch (error) {
        throw new AutomationError(safeFailureCode(error), 503);
      }
    }
    return { job, steps: await store.listSteps(jobId), events: await store.listEvents(jobId) };
  }

  async function listJobs() {
    return store.listJobs(50);
  }

  return { createJob, approveJob, retryPlanning, getJob, listJobs };
}

const controller = createAutomationController();
export const createAutomationJob = controller.createJob;
export const approveAutomationJob = controller.approveJob;
export const retryAutomationPlanning = controller.retryPlanning;
export const getAutomationJob = controller.getJob;
export const listAutomationJobs = controller.listJobs;
