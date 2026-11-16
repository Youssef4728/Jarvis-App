# JARVIS Development Roadmap

Priorities are ordered by safety, dependency, and user value. Production changes require a separate explicit release approval.

## Phase 0 — Audit and design

- [x] Inspect current repository, app, data model, agent workflow, tests, and deployment setup.
- [x] Record current limitations and migration state.
- [ ] Verify Vercel project settings and production environment-variable names through the connected Vercel account.
- [ ] Verify live database schema without applying migrations.
- [x] Add the requested architecture, agent, self-evolution, security, operations, and backlog documents.

## Phase 1 — Foundation and durable development backlog

- [ ] Store versioned Master Vision revisions with author, time, and active revision.
- [ ] Store goals, milestones, dependency-aware tasks, acceptance criteria, test requirements, effort, and affected components.
- [ ] Record task transitions, progress, failures, approvals, and check evidence in an append-only event trail.
- [ ] Finish and validate the Development Center view; UI/API now cover vision revisions and structured tasks, pending local database validation.
- [ ] Add API/domain tests and an additive migration; do not apply it to production without approval.
- [ ] Validate the migration against local PostgreSQL; current local Supabase initialization is failing before migration execution.
- [ ] Keep transition to Completed disabled until check and independent-review evidence are recorded against a commit.

## Phase 2 — Orchestration and permission model

- [ ] Introduce a typed agent registry and task contracts.
- [ ] Route requests through a main orchestrator with explicit context and tool scopes.
- [ ] Add action-level server-side policy and approval records while retaining the existing login until a migration plan is reviewed.
- [ ] Correlate provider calls, steps, errors, and usage to a persistent task.

## Phase 3 — Safe autonomous development

- [ ] Integrate coding, testing, and independent review roles.
- [ ] Work only on isolated branches and bind evidence to commit SHA.
- [ ] Require preview deployment and user release approval before production.
- [ ] Add cancellation, safe retry, and clear failure recovery.

## Phase 4 — Persistent workers

- [ ] Compare existing account capabilities and costs before selecting a worker provider.
- [ ] Implement atomic claims, leases, heartbeats, bounded retry, cancellation, and concurrency limits.
- [ ] Resume work after process restart and report stale/blocked work.
- [ ] Keep long-running development work outside Vercel request handlers.

## Phase 5 — Release and observability

- [ ] Verify preview URL, test evidence, migrations, risks, and rollback before requesting release approval.
- [ ] Track model/API usage and configured resource limits.
- [ ] Add pause/stop controls and operational alerts.

## Phase 6 — Personal intelligence and domain centers

- [ ] User-controlled knowledge, provenance, retention, and project/decision links.
- [ ] Improve daily/weekly planning using available time, goals, events, and task priorities.
- [ ] Extend finance/income, business opportunities, fitness/recovery, and education as separate domain modules with reusable shared patterns.
- [ ] Add document ingestion only after access, retention, and deletion behavior are defined.

## Phase 7 — Continuous improvement

- [ ] Periodic read-only system audits and technical-debt suggestions.
- [ ] Backlog updates based on measured results and explicit user constraints.
- [ ] Expand agent roles only when monitoring shows a clear benefit.

## Release gates

Every phase that changes production data or behavior requires tests, review, a preview, migration/rollback notes, and explicit production approval. Never deploy automatically from a worker.
