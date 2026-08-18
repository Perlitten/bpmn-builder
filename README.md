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

## Auth (Google only)

Sign-in is Google OAuth 2.0. Sessions are httpOnly cookies on the API server. Processes are scoped to the signed-in user. Existing sqlite rows without `user_id` stay in the database as orphans and are never listed.

```bash
cp .env.example .env
# generate SESSION_SECRET
openssl rand -hex 32
```

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) create an OAuth 2.0 **Web application** client:

| Field | Local value |
| ----- | ----------- |
| Authorized JavaScript origins | `http://localhost:5173` |
| Authorized redirect URIs | `http://localhost:5173/api/auth/google/callback` |

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `SESSION_SECRET` in `.env`. Restart `pnpm --filter @bpmn/api-server dev`. If those vars are missing, the app fails closed: sign-in shows a setup hint and process APIs return 401.

## Database switch

| Env | Purpose |
|-----|---------|
| `DB_PROVIDER=sqlite` + `DATABASE_URL=file:./data/bpmn.db` | Local SQLite (default) |
| `DB_PROVIDER=postgres` + `DATABASE_URL=postgresql://...` | Neon Postgres |

Migrations run on startup; manual migrate: `pnpm db:migrate`.

## Private Vercel deployment

Vercel serves the built Vite SPA and routes `/api/*` to an Express Function. Sign-in is Google OAuth; set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `DB_PROVIDER=postgres`, and a Neon `DATABASE_URL` as encrypted environment variables. Add the production callback `https://<host>/api/auth/google/callback` in the Google Cloud OAuth client. The API fails closed with HTTP 401 without a session, and Google start returns 503 when OAuth env is missing.

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
- `GET /api/auth/status` — `{ configured, callbackUrl }`
- `GET /api/auth/google` — redirect to Google
- `GET /api/auth/google/callback`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/processes` — signed-in user only. `q`, `kind=all|process|template`, `sort=updated|name`, `page`, `limit` (default 20, max 100). Response `{ processes, total, page, limit }`
- `POST /api/processes`
- `GET /api/processes/:id`
- `PATCH /api/processes/:id`
