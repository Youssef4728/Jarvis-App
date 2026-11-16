# JARVIS Master Vision

## Purpose

JARVIS is a personal AI operating system. It helps its user organize life, connect information across domains, make plans, and carry out approved work. The user sets direction and retains control over consequential actions.

JARVIS should turn a high-level goal into an understandable, persistent plan; carry out suitable work in small verified steps; recover its state after interruptions; and explain progress, cost, uncertainty, and blockers.

## Product principles

1. **User direction, user control.** JARVIS may analyze, research, plan, and prepare work within its configured permissions. Production changes, irreversible database actions, external commitments, purchases, and financial transactions require explicit approval.
2. **Continuity.** Goals, tasks, decisions, results, and blockers must survive a browser, server, or worker restart.
3. **Evidence over claims.** A task is complete only when its acceptance criteria and required checks pass. A written plan, generated code, or successful API response alone is not proof of completion.
4. **Small reversible steps.** Preserve existing features, work on isolated branches, prefer additive migrations, and provide a rollback path.
5. **Least privilege.** Agents receive only the data, tools, and actions required for their assigned task.
6. **Transparent operation.** Record who or what acted, why, with what approval, and what result followed. Never expose secrets in UI, logs, commits, or agent context unnecessarily.
7. **One source of truth per concern.** Reuse existing tables and services when appropriate; avoid duplicate queues, memories, or domain records.
8. **Cost-aware autonomy.** Bound retries, runtime, model usage, and external calls. Pause at configured limits.

## Personal system

- **Personal Life:** tasks, priorities, calendar, routines, habits, reminders, goals, and daily/weekly planning.
- **AI Assistant:** natural conversation, approved context retrieval, task creation, agent coordination, research, and progress reports.
- **Money and Income:** income and expenses, budgets, savings, forecasts, opportunities, business workflows, and investment tracking. No autonomous trades, transfers, or commitments.
- **Fitness and Health:** training history and planning, performance, football/endurance, recovery, sleep, and nutrition. It does not replace clinical care.
- **Education and Learning:** study plans, source documents, summaries, quizzes, spaced repetition, exam simulations, and knowledge-gap tracking.
- **Personal Knowledge:** user-controlled facts, goals, projects, decisions, documents, provenance, retention, and deletion.
- **Automation:** visible, pausable schedules and workflows with execution history and notifications.
- **Development Center:** current vision, goals, backlog, dependencies, task/agent status, checks, approvals, costs, and next steps.

## Self-evolution

For each approved vision, JARVIS audits the current system, identifies gaps, proposes a dependency-aware roadmap, and creates tasks with acceptance criteria, test requirements, affected components, and risk. Work proceeds through analysis, plan, isolated implementation, tests, independent review, and a documented completion or blocker. Production remains a separate approval boundary.

Long-running work belongs in a durable worker and queue, not in a short-lived web request. A scheduler may claim eligible work; leases, idempotency, bounded retries, cancellation, and audit events protect against duplicate or unobservable execution.

## Multi-agent model

A main orchestrator routes requests to narrowly scoped planning, research, coding, testing, review, personal planning, finance, business, fitness, education, and automation capabilities. Agents share a task model and permission policy, not unrestricted access. Specialized agents may be added when they have a defined contract and measurable value.

## Success criteria

JARVIS can persist a vision and roadmap, create and prioritize dependent tasks, assign them to bounded agents, execute work independently of an open chat, resume safely after interruption, prove completion with checks and review, create preview deployments, and require explicit approval for production. The user can inspect progress, cost, decisions, approvals, and blockers at any time.

## Scope discipline

Build the foundation before adding more domain screens. Do not create feature placeholders that cannot perform their stated action. Prefer a complete, observable workflow over a broad but disconnected collection of panels.
