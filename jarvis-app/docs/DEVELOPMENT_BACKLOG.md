# JARVIS Persistent Development Backlog

This checked-in backlog is the initial durable project record. Until a database-backed backlog is implemented and explicitly migrated, this file is the source of truth for roadmap task status. Do not mirror tasks into an untracked queue. Runtime task execution is currently not enabled.

## Status key

Backlog, Ready, In Progress, Testing, Review, Blocked, Awaiting Approval, Completed, Failed.

## Current checkpoint

- Current production commit: 4dee1be (Dashboard 2.0; Vercel reported deployment success).
- Current development branch: feature/self-evolution-foundation.
- Latest implementation commit: `20c524b` (`feat: add JARVIS development center foundation`) on `feature/self-evolution-foundation`.
- Current task: SE-002 local schema validation; SE-004's unit-test acceptance criteria are complete.
- Database migrations: pending; none applied by this development work.
- Verification on this branch: 75 tests passed; TypeScript check passed; the Next.js production build passed.
- Local database validation: blocked because the Supabase Postgres container failed during initialization with a Realtime connection-pool timeout; the CLI stopped its local containers before applying this migration.
- External blocker from release verification: Vercel account connection is not available in this session, so Production variables and public domain were not inspected.

## Backlog

| ID | Priority | Status | Depends on | Task and acceptance criteria |
|---|---|---|---|---|
| SE-001 | P0 | Completed | — | Persist the Master Vision, architecture, agents, self-evolution, roadmap, security, and operations docs. All describe current reality and target boundaries. |
| SE-002 | P0 | Blocked | SE-001 | Additive Supabase schema is drafted with constraints, indexes, service-role-only RPC writes, and append-only events. Validate it against a local database and add rollback notes. Blocker: local Supabase Postgres initialization times out before migrations run. No production migration was applied. |
| SE-003 | P0 | Testing | SE-002 schema contract | Implemented typed validation, authenticated snapshot/create/transition API, idempotent RPC contracts, and dependency/status rules. Live database validation remains blocked. |
| SE-004 | P0 | Completed | SE-003 | Unit tests cover vision and task validation, dependency cycles, status transitions, API authorization, safe RPC conflicts, and the structured create-item RPC payload. Event persistence still depends on SE-002 local-schema validation. |
| SE-005 | P1 | Testing | SE-003 | Development Center UI now reads snapshots, creates versioned visions and structured goals/tasks, advances safe statuses, and shows loading/error/empty/events. Verify it against local Supabase once the local database starts. |
| SE-006 | P1 | Backlog | SE-002, SE-003 | Add an import/bootstrap path for the checked-in initial backlog and vision that is idempotent and never overwrites newer user edits. |
| SE-007 | P1 | Backlog | SE-004 | Review the migration against current schemas and document safe local validation, backup, rollback, and manual production approval steps. |
| SE-008 | P1 | Backlog | SE-003 | Record provider calls, exact commit references, test evidence, reviewer results, and cost/usage estimates on development tasks. |
| SE-009 | P1 | Backlog | SE-003, SE-008 | Define agent registry and typed contracts with per-role tools, data scopes, budgets, and approval boundaries. |
| SE-010 | P1 | Backlog | SE-009 | Route user requests through a main orchestrator; add deterministic routing and tests before adding specialist agents. |
| SE-011 | P1 | Backlog | SE-009 | Add independent read-only review and testing roles; bind outcomes to exact diffs and commit SHAs. |
| SE-012 | P1 | Backlog | SE-009, SE-011 | Add coding-agent flow on isolated branches, with tests, review, PR, preview, and no auto-merge. |
| SE-013 | P1 | Backlog | SE-002, SE-008 | Compare worker hosting options, existing account capabilities, operational burden, and costs. Do not enable a paid service without approval. |
| SE-014 | P1 | Backlog | SE-013 | Implement durable queue claims, lease heartbeat/expiry, bounded retries, cancellation, concurrency limits, and recovery tests. |
| SE-015 | P1 | Backlog | SE-014 | Run a non-production worker independently of the dashboard and verify restart/resume and duplicate-side-effect behavior. |
| SE-016 | P1 | Backlog | SE-003, SE-014 | Add global pause/stop, stale-task alerts, and batched Telegram/dashboard notifications with audit history. |
| SE-017 | P1 | Blocked | Vercel account connection | Read-only inspect Vercel project root, production branch, environment-variable names/scopes, domain, and latest logs. Never reveal values. |
| SE-018 | P2 | Backlog | SE-003, SE-009 | Add user-controlled knowledge records with source/provenance, retention, access scope, and deletion behavior. |
| SE-019 | P2 | Backlog | SE-018 | Add document upload/analysis only after storage limits, access control, retention, and deletion are specified. |
| SE-020 | P2 | Backlog | SE-009, SE-018 | Improve personal planning using goals, task priority, calendar, routines, and available time; expose reasoning and uncertainty. |
| SE-021 | P2 | Backlog | SE-018 | Extend money/income data into budgets, recurring costs, income sources, opportunities, and forecasts. No transaction execution. |
| SE-022 | P2 | Backlog | SE-021 | Add business opportunity research/evaluation/strategy/execution/analysis workflow with evidence and user-approved external actions. |
| SE-023 | P2 | Backlog | SE-018 | Extend fitness records to training load, recovery, sleep, nutrition, and progress without medical claims. |
| SE-024 | P2 | Backlog | SE-018 | Add education plans, materials, mastery evidence, quizzes, spaced repetition, and knowledge-gap review. |
| SE-025 | P2 | Backlog | SE-003, SE-009 | Add visible, pausable automations with schedules, run history, bounded actions, and notification controls. |
| SE-026 | P2 | Backlog | SE-008, SE-014 | Add per-task/provider resource and cost budgets, stop-before-limit behavior, and user-visible usage totals. |
| SE-027 | P2 | Backlog | SE-005, SE-017 | Run authorized live checks for login, API auth, Supabase sections, chat, agent jobs, prayer times, navigation, themes, and mobile layouts. |
| SE-028 | P1 | Ready | SE-004, SE-008 | Add check/review evidence records tied to a commit SHA; only then enable the transition to Completed. The current status API intentionally blocks completion without evidence. |

## Update protocol

For each task, record status, implementation commit, tests/review evidence, migration state, blocker, and the next eligible task. Mark Blocked only with a concrete external prerequisite. Never mark a task Completed based solely on generated text or code existence.
