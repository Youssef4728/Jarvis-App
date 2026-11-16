# Self-Evolution Engine

## Lifecycle

1. **Vision intake:** save a versioned user vision and capture its desired outcomes and constraints.
2. **System audit:** record repository revision, existing capabilities, data/schema state, tests, deployment configuration, and known blockers.
3. **Gap analysis:** map desired outcomes to existing, partial, and missing capabilities.
4. **Roadmap:** create milestones and a dependency graph; identify approvals and external prerequisites.
5. **Task creation:** every task has an ID, title, description, priority, status, dependencies, acceptance criteria, test requirements, affected components, effort estimate, and error/progress history.
6. **Claim:** a worker atomically claims an eligible task with a lease and idempotency key.
7. **Inspect and plan:** load only task-relevant context and produce an implementation plan.
8. **Implement:** use an isolated branch and scoped working tree.
9. **Verify:** run declared tests, typecheck, build, and security checks as appropriate.
10. **Review:** an independent read-only reviewer inspects the exact diff and evidence.
11. **Persist:** store result, commit/PR references, checks, events, usage, and next action.
12. **Continue or stop:** claim the next eligible task, or pause on approval, missing capability, budget, or repeated failure.

## Task states

Backlog -> Ready -> In Progress -> Testing -> Review -> Completed

Other states: Blocked, Awaiting Approval, Failed, Cancelled. State changes are validated transitions, written with an audit event, and never inferred from generated prose.

## Recovery and duplicate protection

- Persist task state before and after each external side effect.
- Claim with an atomic database operation and expiring lease.
- Use idempotency keys for task creation and safe repeated requests.
- Heartbeat long work; a new worker may reclaim only an expired lease.
- Do not blindly retry an uncertain non-idempotent provider call.
- Apply bounded exponential backoff to safe reads and explicitly retryable operations.
- Respect cancellation and stop flags before starting another side effect.

## Completion evidence

A task can be marked complete only when its acceptance criteria are checked and the required test/review evidence is attached to the task's exact commit. A failed or skipped check cannot be described as passing. Documentation-only tasks still require content and link review.

The first database/API slice deliberately does not allow a transition to Completed. That transition stays disabled until evidence records and exact-commit review are implemented.

## First implementation boundary

Start with persisted vision revisions and a dependency-aware development backlog. Add an authenticated read/write API with validation, audit events, and tests. Keep the worker and code execution disabled until authorization, leases, budgets, cancellation, and recovery are implemented.
