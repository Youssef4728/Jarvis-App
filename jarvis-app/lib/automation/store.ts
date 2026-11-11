import { getSupabaseClient } from "../supabase";
import type {
  AutomationEvent,
  AutomationJob,
  AutomationStep,
  AutomationStore,
  JobStatus,
  StepStatus,
} from "./types";

function fail(code: string): never {
  throw new Error(code);
}

export const supabaseAutomationStore: AutomationStore = {
  async createJob(input) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("automation_jobs")
      .insert({ ...input, status: "pending" })
      .select("*")
      .single();
    if (error?.code === "23505") {
      const existing = await supabase.from("automation_jobs").select("*").eq("idempotency_key", input.idempotency_key).maybeSingle();
      if (existing.error || !existing.data) fail("automation_store_unavailable");
      return { job: existing.data as AutomationJob, created: false };
    }
    if (error || !data) fail("automation_store_unavailable");
    return { job: data as AutomationJob, created: true };
  },
  async getJob(jobId) {
    const { data, error } = await getSupabaseClient().from("automation_jobs").select("*").eq("id", jobId).maybeSingle();
    if (error) fail("automation_store_unavailable");
    return (data as AutomationJob | null) ?? null;
  },
  async claimPlanning(jobId, now, leaseExpiresAt) {
    const { data, error } = await getSupabaseClient().rpc("claim_automation_job_planning", {
      p_job_id: jobId,
      p_now: now,
      p_lease_expires_at: leaseExpiresAt,
    });
    if (error) fail("automation_store_unavailable");
    return data === true;
  },
  async listJobs(limit) {
    const { data, error } = await getSupabaseClient()
      .from("automation_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) fail("automation_store_unavailable");
    return data as AutomationJob[];
  },
  async updateJob(jobId, expected, patch) {
    const { data, error } = await getSupabaseClient()
      .from("automation_jobs")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .in("status", expected)
      .select("*")
      .maybeSingle();
    if (error) fail("automation_store_unavailable");
    return (data as AutomationJob | null) ?? null;
  },
  async addStep(jobId, name, agent) {
    const { data, error } = await getSupabaseClient()
      .from("automation_job_steps")
      .insert({ job_id: jobId, name, agent, status: "running" })
      .select("id")
      .single();
    if (error || !data) fail("automation_store_unavailable");
    return data.id as string;
  },
  async finishStep(stepId, status: StepStatus, summary: string | null, errorCode?: string) {
    const { error } = await getSupabaseClient()
      .from("automation_job_steps")
      .update({ status, summary, error_code: errorCode ?? null, finished_at: new Date().toISOString() })
      .eq("id", stepId)
      .eq("status", "running");
    if (error) fail("automation_store_unavailable");
  },
  async listSteps(jobId) {
    const { data, error } = await getSupabaseClient()
      .from("automation_job_steps")
      .select("*")
      .eq("job_id", jobId)
      .order("started_at");
    if (error || !data) fail("automation_store_unavailable");
    return data as AutomationStep[];
  },
  async addEvent(jobId, type) {
    const { error } = await getSupabaseClient().from("automation_job_events").insert({ job_id: jobId, type });
    if (error) fail("automation_store_unavailable");
  },
  async listEvents(jobId) {
    const { data, error } = await getSupabaseClient()
      .from("automation_job_events")
      .select("id,job_id,type,created_at")
      .eq("job_id", jobId)
      .order("created_at");
    if (error || !data) fail("automation_store_unavailable");
    return data as AutomationEvent[];
  },
};

export function isJobStatus(value: string): value is JobStatus {
  return [
    "pending",
    "planning",
    "awaiting_approval",
    "dispatching",
    "dispatch_uncertain",
    "queued",
    "in_progress",
    "evaluating",
    "completed",
    "failed",
  ].includes(value);
}
