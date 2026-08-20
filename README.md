# BPMN 2.0 Builder

pnpm monorepo foundation for a BPMN 2.0 process builder (process list, bpmn-js editor, AI assistant).

## Structure

```
apps/web              Vite + React 19 SPA (list + editor)
packages/api-server   Express API + Vite middleware in dev
packages/db           Drizzle ORM (SQLite locally, Neon Postgres in production)
packages/domain       Canonical workflow domain types + validators
packages/bpmn-adapter BPMN ↔ workflow adapter
e2e                   Playwright E2E smoke tests
.github/workflows     GitHub Actions CI workflows
```

## Prerequisites

- Node 22 (pinned in `.nvmrc`)
- pnpm 10.14.0 (`corepack enable && corepack prepare pnpm@10.14.0 --activate`)

## Setup & Local Development

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm check # Runs lint + typecheck + test + build
pnpm dev   # Opens http://localhost:5173
```

## Validation & Verification Commands

| Command | Purpose |
|---------|---------|
| `pnpm check` | Runs lint, typecheck, the coverage-gated Vitest suite, and the production build |
| `pnpm lint` | ESLint across workspace with flat config (`eslint.config.js`) |
| `pnpm typecheck` | TypeScript check across all packages (`tsc --noEmit`) |
| `pnpm test` | Runs the complete Vitest suite |\n| `pnpm test:coverage` | Runs Vitest with enforced line, function, statement, and branch thresholds |
| `pnpm test:integration` | Vitest integration test run against disposable Postgres |
| `pnpm test:e2e` | Playwright critical journeys on desktop and mobile Chromium, including accessibility, visual regression, and tenant isolation |
| `pnpm quality:performance` | Runs Lighthouse against the production build and enforces performance, accessibility, and best-practice budgets |
| `pnpm build` | Production build across packages (`pnpm -r build`) |\n| `pnpm audit:deps` | Fails on high or critical production dependency vulnerabilities |

---

## Neon Database Layout & Migration Workflow

### Connection URLs
- `DATABASE_URL`: Pooled connection URL, used by the running application server.
- `DATABASE_URL_UNPOOLED`: Direct connection URL, used by Drizzle Kit and `pnpm db:migrate` to prevent connection pooler hangs during DDL execution.

### Neon Branching Model

```
Early Stage:
  main -------------> production (Neon production database)
  vercel-dev -------> development (local SQLite or disposable Postgres)
  preview/<branch> -> PR previews (isolated preview Neon database branch)

External Users Stage:
  Neon Production Project (Real user data)
  Neon Non-Production Project (Synthetic test data only)
  ├── staging branch (synthetic baseline data)
  └── preview/<branch> (cut from sanitized staging base)
```

> **CRITICAL SAFETY WARNING:** Branching preview databases directly from the production branch copies real user data into preview environments. Once external users exist, always isolate production into its own Neon project and cut preview branches from a sanitized staging database.

### Migration & Recovery Workflow
1. All schema changes ship as:
   - Drizzle schema modification in `packages/db/src/schema/`
   - Generated migration SQL via `pnpm db:generate` committed to git in `packages/db/migrations/`
   - Idempotent `IF NOT EXISTS` DDL constructs for baseline compatibility
   - Integration tests in `packages/db/src/integration.test.ts`
2. **Never run `drizzle-kit push`** against shared, preview, or production databases.
3. Migrations execute via `pnpm db:migrate` using `drizzle-orm/migrator`. On existing databases lacking `__drizzle_migrations`, the initial baseline migration safely initializes tracking without failing on pre-existing tables.
4. **Recovery from a Failed Migration**:
   - Forward-fix: Commit a new migration correcting the schema.
   - Rollback: Revert to the previous application release, inspect `__drizzle_migrations` table in Neon console, and execute compensating SQL manually if required.

---

## Vercel & Deployment Workflow

### Regional Co-location
- Compute region is configured in `vercel.json` as `regions: ["fra1"]` (Frankfurt).
- *Assumption*: Ensure the Neon project region is created in `fra1` (Frankfurt) so compute sits co-located next to the database.

### Build & Migration Configuration
- `vercel.json` builds the web workspace with `pnpm --filter @bpmn/web build`; the API function performs idempotent migrations before serving traffic.
- **Hard Prerequisite**: Before enabling preview builds in Vercel, Preview environment variables (`DATABASE_URL` and `DATABASE_URL_UNPOOLED`) must be explicitly scoped to an isolated preview database branch in Vercel Project Settings. If Preview inherits production credentials, preview builds will migrate the production database!

---

## Google OAuth Multi-Environment Setup

The Express API server runs a custom Google OAuth 2.0 flow using `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `SESSION_SECRET` (server-only).

### OAuth Client Isolation
- **Production**: Dedicated Google Cloud OAuth 2.0 Web Client ID & Secret. Redirect URI: `https://<your-domain>/api/auth/google/callback`.
- **Development / Staging / Preview**: Separate Google Cloud OAuth client.
- **Dynamic Vercel Preview Redirect Strategy**: Google OAuth requires exact registered redirect URIs. For dynamic preview URLs (`https://*-perlitten.vercel.app`), register a stable staging domain (`https://staging.example.com/api/auth/google/callback`) as the callback URI and forward the original preview origin via the `state` parameter cookie.

---

## E2E Testing & Test Authentication Strategy

Playwright E2E smoke tests require authenticating without exposing production Google OAuth secrets or hitting login walls.

- **Guarded Test Endpoint**: `POST /api/auth/test-session`
- **Security Rule**: The endpoint is **structurally prohibited** in `NODE_ENV=production`. If `process.env.NODE_ENV === 'production'`, the endpoint is not registered (returns HTTP 404), even if `ENABLE_TEST_AUTH=true`.
- **Registration**: Registered ONLY when `NODE_ENV !== 'production'` AND `ENABLE_TEST_AUTH === 'true'`. Prominently logs `[SECURITY WARNING]` at startup whenever registered.

---

## Environment Variable Matrix

| Variable | Local Dev | Preview (Vercel) | Production (Vercel) | Secrets Boundary |
|----------|-----------|------------------|---------------------|------------------|
| `DB_PROVIDER` | `sqlite` | `postgres` | `postgres` | Public |
| `DATABASE_URL` | `file:./data/bpmn.db` | Preview Pooled Neon URL | Production Pooled Neon URL | **SECRET** |
| `DATABASE_URL_UNPOOLED` | - | Preview Direct Neon URL | Production Direct Neon URL | **SECRET** |
| `GOOGLE_CLIENT_ID` | Dev OAuth Client ID | Staging OAuth Client ID | Production OAuth Client ID | Server-Only |
| `GOOGLE_CLIENT_SECRET` | Dev OAuth Secret | Staging OAuth Secret | Production OAuth Secret | **SECRET** (Server-Only) |
| `SESSION_SECRET` | Local Secret | Staging Session Secret | Production Session Secret | **SECRET** (Server-Only) |
| `AUTH_BASE_URL` | `http://localhost:5173` | Preview URL or Staging Domain | Production Domain | Public |
| `ENABLE_TEST_AUTH` | `true` (if testing) | `false` | `false` (Ignored in prod) | Public |

---

## Manual Dashboard Steps (Cannot be encoded in repository)

1. **Neon Console**:
   - Create Neon production project in region `fra1` (Frankfurt). Confirm region matches `vercel.json`.
   - Create a separate Neon staging/preview project or branching root.
2. **Vercel Project Settings**:
   - Link repository to Vercel.
   - Configure Environment Variables with scope isolation:
     - **Production**: Set production `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`.
     - **Preview**: Set isolated preview database URLs and staging OAuth credentials. **Do not let Preview inherit Production DB credentials!**
3. **Google Cloud Console**:
   - Create Web Application OAuth 2.0 Credentials for Production (`https://<prod-domain>/api/auth/google/callback`).
   - Create Web Application OAuth 2.0 Credentials for Staging / Preview.
4. **GitHub Repository Rules**:
   - Set branch protection on `main`: require Pull Request; require `quality`, `database`, `e2e`, `performance`, `dependency-review`, `codeql`, `secret-scan`, and `scorecard`; enforce conversation resolution; block force pushes and branch deletion.
   - Do NOT require pull request approvals (single-maintainer repository).

---

## Cloud quality gates

GitHub Actions is the authoritative verification environment. Every pull request runs:

- lint, strict TypeScript, production dependency audit, coverage thresholds, and build;
- PostgreSQL migration/integration tests;
- Playwright desktop and mobile critical journeys with WCAG and screenshot regression checks;
- Lighthouse performance budgets against the production build;
- an independent production dependency audit, CodeQL, Gitleaks, and OpenSSF Scorecard analysis.

Dependabot opens grouped weekly updates for pnpm and GitHub Actions. Coverage, Playwright failures, Lighthouse reports, and Scorecard results are retained as bounded GitHub Actions artifacts. All added services and tools are free for this public repository.
