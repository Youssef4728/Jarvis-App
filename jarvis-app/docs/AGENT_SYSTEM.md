# JARVIS Agent System

## Current behavior

The existing automation workflow is narrow and approval-gated:

1. OpenAI creates a proposed plan.
2. Claude reviews and may revise the proposal.
3. JARVIS stores the plan and waits for approval.
4. The user can dispatch a GitHub cloud-agent task.
5. JARVIS polls/evaluates the GitHub result.

This is not yet a general orchestrator, persistent background worker, code-review system, or proof that the resulting pull request passes CI.

## Target agent contracts

| Agent | Input | Output | Allowed actions |
|---|---|---|---|
| Main Orchestrator | User request and authorized context | Routing and task graph | Read task/context; create bounded tasks |
| Planning | Vision, audit findings, constraints | Dependencies, priorities, estimates, acceptance criteria | Read repository metadata; propose tasks |
| Research | Research question and source requirements | Sourced findings, uncertainty, risks | Read public sources; save cited result |
| Coding | Approved task, scoped files, acceptance criteria | Branch/commit/PR and change summary | Edit isolated branch; no production merge |
| Testing | Diff and test requirements | Commands, results, failures | Run bounded checks; no release approval |
| Review | Diff, task, policy | Findings and approve/reject recommendation | Read-only repository review |
| Finance / Business | User-authorized financial context | Analysis, options, risks, proposed tasks | Read scoped data; never transact |
| Fitness / Education / Personal Planning | Scoped personal records and goal | Recommendation or plan | Read only required domain data; request confirmation before sensitive writes |
| Automation | Schedule and workflow definition | Execution result and event | Execute only preapproved, pausable workflows |

## Shared rules

- Each task declares agent role, allowed tools, allowed data scope, runtime and cost budgets.
- The orchestrator does not grant permissions by prompt alone; server-side policy enforces them.
- Agent outputs are untrusted input. Validate structure, lengths, links, and identifiers before persistence or display.
- Provider failures, timeouts, rate limits, and uncertain side effects receive distinct statuses.
- Planning does not imply approval to execute. A generated plan must not dispatch a coding agent by itself.
- Testing and review evidence must be linked to the exact commit SHA.
- No agent may merge to the production branch or apply a production migration.
- Agent additions require a defined contract, tests, and a least-privilege review.
