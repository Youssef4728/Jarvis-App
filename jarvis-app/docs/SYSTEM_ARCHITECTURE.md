# JARVIS System Architecture

## Current baseline

- Next.js App Router and TypeScript app in this directory.
- A client-side dashboard with sections for the day, tasks, calendar, finance, fitness, habits, prayers, chat, and settings.
- Server routes use a shared APP_PASSWORD header and a server-side Supabase service key.
- Supabase stores routines, events, breaks, tasks, facts, money entries, savings goals, gym logs, habits, and habit checks.
- Claude powers the conversational tool agent. OpenAI plans automation jobs, Claude reviews plans, and a GitHub Copilot cloud agent is dispatched only after approval.
- Automation jobs, steps, and events have an additive SQL migration, but the repository documentation records that it has not been applied to the live database.
- Vercel hosts the Next.js app and scheduled morning/evening routes. Current schedules send Telegram messages; they are not a general-purpose durable worker.
- Tests use mocks. They do not prove live database, provider, GitHub, Telegram, or browser behavior.
- A feature-branch slice now includes an authenticated Development API/store, an initial self-evolution migration, validation/tests, and a Development Center UI. Its migration has not passed a local database run because the local Supabase container fails before migrations execute.

## Target architecture

    Dashboard / Telegram
             |
    Authenticated API and policy checks
             |
    Assistant + Orchestrator
       |       |       |
    Planning Research Domain agents
       |       |       |
    Persistent goal/task system ---- Audit and approval records
             |
    Durable queue + scheduler + bounded workers
             |
    Domain services / GitHub branches and PRs / preview deploys
             |
    Supabase (system of record) + external providers

### Frontend

Keep the existing Next.js dashboard and visual design. Add working centers incrementally. The Development Center should read the same persisted goals, tasks, events, checks, approvals, and usage data as the worker system.

### API and application services

Keep HTTP handlers thin. Put authorization, validation, state transitions, domain logic, provider calls, and persistence in separate modules. Each state-changing operation must be idempotent where retries are possible and must emit an audit event.

### Persistence

Supabase remains the system of record. Reuse current domain tables where they model the data correctly. Add tables through reviewed, additive migrations. Never apply a production migration from application startup or an agent task.

The new development records use versioned vision rows, hierarchical work items, immutable dependency edges, and an append-only event table. Service-role writes go through idempotent database functions; task completion remains disabled until test/review evidence is persisted.

### Execution

Vercel serves the UI and bounded request/cron handlers. A separate worker service is required for long-running coding, research, and test jobs. It must use persisted leases, heartbeats, cancellation, rate limits, and resource budgets. Select a provider only after comparing existing account capability, secrets, cost, and recovery behavior.

### Integrations

Anthropic and OpenAI provide model calls; GitHub provides isolated branches, cloud-agent tasks, pull requests, and checks; Telegram provides notifications. Each integration has an explicit timeout, retry policy, error mapping, and permission boundary.

## Design constraints

- No second task queue if the existing automation-job model can be safely extended.
- Domain records remain separate from execution/job records.
- User-authored goals and vision revisions are distinct from generated task plans.
- Secrets are server-only; service-role credentials never enter client code or an external coding agent.
- Every worker transition is durable before the next external side effect.
- External APIs are treated as unreliable and potentially non-idempotent.
