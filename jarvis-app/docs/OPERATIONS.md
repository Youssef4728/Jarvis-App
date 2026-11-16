# JARVIS Operations

## Repository and app

- Repository: this Git repository.
- Next.js app and Vercel root intended by the project layout: jarvis-app.
- Production branch: main. Development work belongs on isolated feature branches.
- Vercel cron schedules are in vercel.json; current morning/evening handlers call the conversational agent and Telegram. They are not durable workers.

## Local development

- Install from the lockfile with npm ci.
- Start locally with npm run dev.
- Run automated tests with npm test.
- Check types with npm run typecheck.
- Build the production app with npm run build.
- Keep .env.local untracked. Never paste its contents into logs or commits.
- In this Codespace, set SUPABASE_HOME to a writable temporary directory for CLI calls.

## Required runtime configuration

Names and use are documented in .env.example. Core UI/data access needs SUPABASE_URL, SUPABASE_SERVICE_KEY, and APP_PASSWORD. Chat needs ANTHROPIC_API_KEY. Planning/review and GitHub agent dispatch also need OPENAI_API_KEY, JARVIS_GITHUB_TOKEN, and GITHUB_REPOSITORY. CRON_SECRET protects scheduled routes. Telegram variables enable notifications. ALPACA_* are optional placeholders.

Check presence and environment scope in the hosting account without printing values. A successful build does not prove runtime secrets or external integrations work.

## Supabase

- The app uses the server-side service key.
- schema.sql and schema_v2.sql define current domain data.
- The task-priority and automation-job migrations are documented as pending against live Supabase in the current README.
- Never run SQL against production as part of app startup or routine tests.
- Before any production migration: inspect live schema read-only, backup/restore plan, review additive SQL, test locally, request explicit approval, apply once, verify, and record result.
- The self-evolution migration is additive and has not been applied. Local validation is currently blocked by a Supabase Postgres initialization timeout before migration execution. Do not treat this as a successful migration test.
- Rollback before user data exists can remove the new objects in reverse dependency order. After vision/task data exists, do not drop these tables; disable the feature, export/backup the data, and prefer a reviewed forward fix.

## Deploy and recovery

- Push development work only to its feature branch and inspect the Vercel Preview result.
- Production is changed only after the user approves the exact commit and release packet.
- Review Vercel build/runtime logs without exposing environment values.
- Roll back through the previous known-good Vercel deployment or revert the release commit; do not rewrite shared history.
- After a production deployment, test login, protected API behavior, dashboard sections, provider integrations, and mobile layout with authorized test data.

## Known limits

- Automated tests use mocks, not production records.
- There is no persistent independent worker or general development-task queue yet.
- The Development Center and its API are implemented on the feature branch, but require migration 20261116_development_foundation.sql before their database actions work.
- The status API does not allow marking work completed until commit-bound checks and independent review evidence are implemented.
- The live database may not have the pending priority and automation migrations.
- Environment-variable presence in local development does not establish Production availability.
- Record incidents, blockers, deployment IDs, commits, and next action in the development backlog without recording secrets.
