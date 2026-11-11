const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[a-zA-Z0-9:_-]{1,180}$/;
const SECRET_PATTERNS = [
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|passwd|secret|credential)\s*[:=]\s*\S+/i,
  /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\b(?:postgres(?:ql)?|https?):\/\/[^/\s:@]+:[^@\s]+@/i,
];

const SECRET_EXFILTRATION_PATTERN =
  /\b(?:print|show|dump|exfiltrate|publish|post|send|copy)\s+(?:all\s+)?(?:the\s+)?(?:secrets?|passwords?|api[_ -]?keys?|tokens?|credentials?)\b/i;

export function validateAutomationRequest(value: unknown): string {
  if (typeof value !== "string") throw new Error("request_invalid");
  const request = value.trim();
  if (!request || request.length > 6000) throw new Error("request_invalid");
  if (SECRET_PATTERNS.some((pattern) => pattern.test(request))) throw new Error("request_may_contain_secret");
  if (SECRET_EXFILTRATION_PATTERN.test(request)) throw new Error("request_may_expose_secret");
  return request;
}

export function validateIdempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !IDEMPOTENCY_PATTERN.test(value)) throw new Error("idempotency_key_invalid");
  return value;
}

export function validateJobId(value: string): string {
  if (!UUID_PATTERN.test(value)) throw new Error("job_id_invalid");
  return value.toLowerCase();
}

export function getGithubRepository(): { owner: string; repo: string; baseRef: string } {
  const repository = process.env.GITHUB_REPOSITORY ?? "";
  const [owner, repo, ...extra] = repository.split("/");
  const baseRef = process.env.GITHUB_CLOUD_AGENT_BASE_REF ?? "main";
  if (
    extra.length ||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(owner ?? "") ||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(repo ?? "") ||
    !/^[A-Za-z0-9._/-]{1,200}$/.test(baseRef) ||
    baseRef.startsWith("/") ||
    baseRef.includes("..")
  ) {
    throw new Error("github_configuration_missing");
  }
  return { owner, repo, baseRef };
}
