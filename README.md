# BPMN 2.0 Builder

pnpm monorepo foundation for a BPMN 2.0 process builder (list, bpmn-js editor, AI assistant stub).

## Structure

```
apps/web              Vite + React 19 SPA (list + editor)
packages/api-server   Express API + Vite middleware in dev
packages/db           Drizzle ORM (SQLite now, Neon Postgres later)
packages/domain       Canonical workflow domain types + validators
packages/bpmn-adapter BPMN ↔ workflow adapter stubs
```

## Prerequisites

- Node 22
- pnpm 10

## Setup

```bash
cp .env.example .env
pnpm install
```

## Dev

```bash
pnpm dev
```

Opens **http://localhost:5173** — API and SPA share one server (trigger-chains style).

## Database switch

| Env | Purpose |
|-----|---------|
| `DB_PROVIDER=sqlite` + `DATABASE_URL=file:./data/bpmn.db` | Local SQLite (default) |
| `DB_PROVIDER=postgres` + `DATABASE_URL=postgresql://...` | Neon Postgres |

Migrations run on startup; manual migrate: `pnpm db:migrate`.

## Private Vercel deployment

Vercel serves the built Vite SPA and routes `/api/*` to an Express Function. Root Routing
Middleware protects the page, assets, and API with HTTP Basic authentication; the API repeats the
same check as defense in depth. Set `DB_PROVIDER=postgres`, a Neon `DATABASE_URL`, `APP_USER`, and
`APP_PASSWORD` as encrypted Vercel environment variables. The deployment fails closed with HTTP
503 when `APP_PASSWORD` is missing.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start API + web |
| `pnpm build` | Build all packages |
| `pnpm test` | Run Vitest smoke tests |
| `pnpm db:migrate` | Apply DB migrations |
| `pnpm db:generate` | Generate Drizzle migrations |

## API

- `GET /api/health`
- `GET /api/processes` — `q`, `kind=all|process|template`, `sort=updated|name`, `page`, `limit` (default 20, max 100). Response `{ processes, total, page, limit }`
- `POST /api/processes`
- `GET /api/processes/:id`
- `PATCH /api/processes/:id`
