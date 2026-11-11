import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type {
  AgentEvaluation,
  AgentPlan,
  AgentReview,
  AutomationProviders,
  GithubTask,
  PlanStep,
} from "./types";
import { retryReadOnly } from "./retry";
import { getGithubRepository } from "./validation";

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "prompt", "steps"],
  properties: {
    summary: { type: "string" },
    prompt: { type: "string" },
    steps: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description"],
        properties: { title: { type: "string" }, description: { type: "string" } },
      },
    },
  },
} as const;

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "concerns", "prompt"],
  properties: {
    summary: { type: "string" },
    concerns: { type: "array", items: { type: "string" } },
    prompt: { type: "string" },
  },
} as const;

const EVALUATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "outcome", "limitations"],
  properties: {
    summary: { type: "string" },
    outcome: { type: "string", enum: ["completed", "needs_review"] },
    limitations: { type: "array", items: { type: "string" } },
  },
} as const;

function openAiClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error("openai_not_configured");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 25_000, maxRetries: 0 });
}

function anthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("claude_not_configured");
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 25_000, maxRetries: 0 });
}

function parseJson<T>(value: string | null | undefined, errorCode: string): T {
  if (!value) throw new Error(errorCode);
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(errorCode);
  }
}

function requireText(value: unknown, errorCode: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 8000) throw new Error(errorCode);
  return value.trim();
}

function validatePlan(value: AgentPlan): AgentPlan {
  const summary = requireText(value?.summary, "openai_plan_invalid");
  const prompt = requireText(value?.prompt, "openai_plan_invalid");
  if (!Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 8) throw new Error("openai_plan_invalid");
  const steps: PlanStep[] = value.steps.map((step) => ({
    title: requireText(step?.title, "openai_plan_invalid"),
    description: requireText(step?.description, "openai_plan_invalid"),
  }));
  return { summary, prompt, steps };
}

function validateReview(value: AgentReview): AgentReview {
  const summary = requireText(value?.summary, "claude_review_invalid");
  const prompt = requireText(value?.prompt, "claude_review_invalid");
  if (!Array.isArray(value.concerns) || value.concerns.length > 10) throw new Error("claude_review_invalid");
  return {
    summary,
    prompt,
    concerns: value.concerns.map((item) => requireText(item, "claude_review_invalid")),
  };
}

function validateEvaluation(value: AgentEvaluation): AgentEvaluation {
  const summary = requireText(value?.summary, "openai_evaluation_invalid");
  if (value?.outcome !== "completed" && value?.outcome !== "needs_review") throw new Error("openai_evaluation_invalid");
  if (!Array.isArray(value.limitations) || value.limitations.length > 10) throw new Error("openai_evaluation_invalid");
  return {
    summary,
    outcome: value.outcome,
    limitations: value.limitations.map((item) => requireText(item, "openai_evaluation_invalid")),
  };
}

async function openAiJson<T>(system: string, input: string, schemaName: string, schema: Record<string, unknown>): Promise<T> {
  const response = await openAiClient().chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    max_completion_tokens: 1800,
    response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
    messages: [{ role: "system", content: system }, { role: "user", content: input }],
  });
  return parseJson<T>(response.choices[0]?.message.content, `${schemaName}_invalid`);
}

function githubHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2026-03-10",
    "Content-Type": "application/json",
  };
}

function githubToken(): string {
  const token = process.env.GITHUB_USER_TOKEN;
  if (!token) throw new Error("github_not_configured");
  return token;
}

function parseGithubTask(data: unknown): GithubTask {
  if (!data || typeof data !== "object") throw new Error("github_response_invalid");
  const result = data as { id?: unknown; state?: unknown; html_url?: unknown; artifacts?: unknown };
  if (typeof result.id !== "string" || typeof result.state !== "string") throw new Error("github_response_invalid");
  const artifacts = Array.isArray(result.artifacts) ? result.artifacts.slice(0, 20).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const artifact = item as { provider?: unknown; type?: unknown; data?: unknown };
    if (artifact.provider !== "github" || !["pull", "branch"].includes(String(artifact.type)) || !artifact.data || typeof artifact.data !== "object") return [];
    const raw = artifact.data as Record<string, unknown>;
    const safeData: Record<string, string | number> = {};
    if (typeof raw.id === "number" && Number.isSafeInteger(raw.id)) safeData.id = raw.id;
    for (const key of ["global_id", "head_ref", "base_ref"]) {
      if (typeof raw[key] === "string" && raw[key].length <= 200) safeData[key] = raw[key];
    }
    return [{ provider: "github", type: artifact.type, data: safeData }];
  }) : [];
  let htmlUrl: string | null = null;
  if (typeof result.html_url === "string") {
    try {
      const url = new URL(result.html_url);
      if (url.protocol === "https:" && url.hostname === "github.com") htmlUrl = url.href;
    } catch {
      htmlUrl = null;
    }
  }
  return {
    id: result.id,
    state: result.state,
    html_url: htmlUrl,
    artifacts,
  };
}

async function githubRequest(path: string, init?: RequestInit): Promise<unknown> {
  const execute = async () => {
    let response: Response;
    try {
      response = await fetch(`https://api.github.com${path}`, {
        ...init,
        headers: { ...githubHeaders(githubToken()), ...init?.headers },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error(init?.method === "POST" ? "github_dispatch_network_error" : "fetch_failed");
    }
    if (!response.ok) throw new Error(`github_http_${response.status}`);
    return response.json();
  };
  return init?.method === "POST" ? execute() : retryReadOnly(execute);
}

export const automationProviders: AutomationProviders = {
  async createPlan(request) {
    const value = await openAiJson<AgentPlan>(
      "Du bist der Chef-Agent von JARVIS. Zerlege den Auftrag in einen kleinen, sicheren und konkreten Implementierungsplan für einen Coding-Agenten. Änderungen ausschließlich über einen neuen Branch und Pull Request. Niemals mergen, deployen, Secrets ändern, produktive Daten verändern oder Migrationen ausführen. Gib nur das JSON-Schema zurück.",
      request,
      "jarvis_plan",
      PLAN_SCHEMA
    );
    return validatePlan(value);
  },
  async reviewPlan(request, plan) {
    const response = await anthropicClient().messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 1800,
      system: "Du prüfst einen JARVIS-Implementierungsplan auf Risiken, Scope und Umsetzbarkeit. Keine Änderungen ausführen. Niemals Secrets weitergeben, Migrationen ausführen, mergen oder deployen. Antworte ausschließlich als valides JSON mit summary (string), concerns (string array) und prompt (string).",
      messages: [{ role: "user", content: JSON.stringify({ request, plan }) }],
    });
    const text = response.content.map((item) => item.type === "text" ? item.text : "").join("");
    return validateReview(parseJson<AgentReview>(text, "claude_review_invalid"));
  },
  async evaluateTask(task) {
    const value = await openAiJson<AgentEvaluation>(
      "Du bewertest ehrlich den Abschlussstatus eines Coding-Agenten. Ein Agentenstatus completed beweist weder Tests noch korrekte Umsetzung. Benenne diese Grenzen ausdrücklich, wenn keine CI-Ergebnisse vorliegen. Gib nur das JSON-Schema zurück.",
      JSON.stringify({ state: task.state, task_url: task.html_url, artifacts: task.artifacts }),
      "jarvis_evaluation",
      EVALUATION_SCHEMA
    );
    return validateEvaluation(value);
  },
  async startGithubTask(prompt) {
    const { owner, repo, baseRef } = getGithubRepository();
    const data = await githubRequest(`/agents/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tasks`, {
      method: "POST",
      body: JSON.stringify({
        prompt: `${prompt}\n\nSicherheitsvorgaben: nur auf einem neuen Branch arbeiten und einen Pull Request gegen ${baseRef} erstellen. Keine Änderungen direkt am Basisbranch, keine Merges, Deployments, produktiven Datenänderungen oder Migrationen ausführen. Geheimnisse niemals lesen, kopieren oder protokollieren.`,
        base_ref: baseRef,
        create_pull_request: true,
        ...(process.env.GITHUB_CLOUD_AGENT_MODEL ? { model: process.env.GITHUB_CLOUD_AGENT_MODEL } : {}),
      }),
    });
    return parseGithubTask(data);
  },
  async getGithubTask(taskId) {
    const { owner, repo } = getGithubRepository();
    const data = await githubRequest(
      `/agents/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tasks/${encodeURIComponent(taskId)}`
    );
    return parseGithubTask(data);
  },
  async getPullRequestUrl(task) {
    const pullArtifact = task.artifacts.find((item) => {
      if (!item || typeof item !== "object") return false;
      const artifact = item as { type?: unknown };
      return artifact.type === "pull";
    }) as { data?: Record<string, unknown> } | undefined;
    const nodeId = pullArtifact?.data?.global_id;
    if (typeof nodeId !== "string" || !nodeId) return null;
    const response = await githubRequest("/graphql", {
      method: "POST",
      body: JSON.stringify({
        query: "query($id: ID!) { node(id: $id) { ... on PullRequest { url } } }",
        variables: { id: nodeId },
      }),
    }) as { data?: { node?: { url?: unknown } | null } };
    const urlValue = response.data?.node?.url;
    if (typeof urlValue !== "string") return null;
    try {
      const url = new URL(urlValue);
      return url.protocol === "https:" && url.hostname === "github.com" ? url.href : null;
    } catch {
      return null;
    }
  },
};
