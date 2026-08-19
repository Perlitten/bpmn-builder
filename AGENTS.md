# AGENTS.md

Guidance for coding agents (Jules, Claude Code, Cursor) working in this repository.

## Stack

pnpm 10 monorepo on Node 22.

- `apps/web` - Vite + React 19 SPA (process list + bpmn-js editor)
- `packages/api-server` - Express API, Vite middleware in dev
- `packages/db` - Drizzle ORM (SQLite locally, Neon Postgres in production)
- `packages/domain` - canonical workflow domain types + validators
- `packages/bpmn-adapter` - BPMN to workflow adapter

## Commands

- install: `pnpm install`
- dev: `pnpm dev` (API + SPA share one server on http://localhost:5173)
- build: `pnpm build`
- test: `pnpm test` (Vitest)
- migrations: `pnpm db:migrate`, `pnpm db:generate`

## Environment

Copy `.env.example` to `.env`. Sign-in needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SESSION_SECRET (`openssl rand -hex 32`). Database is `DB_PROVIDER=sqlite` with `DATABASE_URL=file:./data/bpmn.db` locally, `DB_PROVIDER=postgres` with a Neon `DATABASE_URL` in production. Migrations run on startup.

## Rules

- ALWAYS keep the API failing closed: no session returns HTTP 401, missing OAuth env returns 503.
- ALWAYS scope processes to the signed-in user. Rows without `user_id` are orphans and are never listed.
- NEVER commit real secrets. `.env.example` documents the shape only.
- ALWAYS set the git author email to the address linked to the GitHub account before committing, otherwise Vercel blocks the deployment with "commit author could not be matched to a GitHub account". Run once: `git config user.email "61577193+Perlitten@users.noreply.github.com"`

## Operational & Governance Policies

- Never push directly to `main`. Always deliver a feature branch and a pull request.
- Never request, print, log, commit, or modify production credentials.
- Never point tests or migrations at production or any shared database.
- Never run `drizzle-kit push` against a shared, staging, preview-base, or production database.
- Every schema change ships as: Drizzle schema change, generated SQL migration, tests, migration risk assessment, rollback or forward-fix note.
- Migrations must be backward-compatible; use expand/contract for destructive changes.
- Keep database and auth code server-only. Never expose a secret to the Vite client bundle - in this repo that means never putting a secret behind a `VITE_` prefix.
- Do not refactor unrelated code. Do not add dependencies without justifying them.
- Preserve existing public APIs unless the task explicitly changes them.
- Before finishing any task run `pnpm check`; for UI changes also run `pnpm test:e2e` and verify mobile, desktop, loading, empty, error, success, keyboard, and basic accessibility states.
- PR description must cover: what changed, why, tests run, migration details, environment-variable changes, risks, rollback/forward-fix plan.

## Deployment

Vercel serves the built SPA and routes `/api/*` to an Express Function. Production branch is `main`; every other branch produces a preview deployment.
