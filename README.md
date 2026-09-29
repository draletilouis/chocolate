# Cocoa Production System

A simple recording system for a chocolate factory production line. Workers open a station, choose a batch, confirm the input, enter the weights they measured, and the system calculates the balance (measured output, useful output, waste, by-products, unaccounted variance, yield and percentages). Split outputs are assigned destinations separately; only what is carried forward becomes the input of the next station.

Stack: Next.js (App Router), React, TypeScript, Tailwind CSS v4, Lucide icons, and PostgreSQL. The browser store is an authenticated API client; PostgreSQL is the source of truth. Reset the demo dataset from **Setup → Alert thresholds → Reset sample data**.

The UI follows the existing StockMaster (Lefori) visual language: a fast system font stack, navy primary with orange accent, a white 260px sidebar with an orange-edged active item, a fixed top bar with the page title, white sectioned cards, pill sub-navigation, uppercase slate table headers, pill status badges, and a bottom navigation bar on phones. The shared classes live in `src/app/globals.css` and are used through `src/components/ui.tsx` and `src/components/Shell.tsx`.

## Authentication

Sign-in is server-side and follows the StockMaster (Lefori) implementation:

- **Accounts** live in PostgreSQL (`users`), passwords are bcrypt hashes (`BCRYPT_ROUNDS`). Credential rule as in StockMaster: a 4-digit PIN or a password of 8+ characters (max 72 bytes).
- **Sessions** are rows in `sessions` referenced by a signed `httpOnly` cookie (`cocoa.sid`, `SameSite=Lax`, `Secure` in production, 30-day rolling expiry, idle timeout `SESSION_IDLE_MINUTES`). Sign-out, password changes, deactivation and password resets invalidate sessions server-side.
- **Protection**: `src/middleware.ts` rejects API calls without a validly signed cookie; `src/app/(app)/layout.tsx` validates every page request against the database and redirects to `/login`; every route handler re-checks through `getSession`. State-changing requests must come from the same origin (CSRF guard).
- **Lockout**: `LOGIN_MAX_ATTEMPTS` failed sign-ins per account (and `LOGIN_IP_MAX_ATTEMPTS` per IP) within `LOGIN_LOCKOUT_MINUTES` → HTTP 429. Responses never reveal whether an email exists.
- **Recovery**: `/login/reset` — a 6-digit emailed code (15 min, 5 attempts) → short-lived reset token (5 min) → new password. Needs `SMTP_*`; in development without SMTP the code is printed to the server log and returned to the page.
- **Roles**: `admin` (production manager) manages accounts under **Setup → Users** (create with a temporary password, deactivate/reactivate, change role, issue a temporary password); `operator` records at stations. New and reset accounts must choose their own password at first sign-in (`/account/password`).
- **Audit trail**: `audit_logs` records authentication/admin events plus `batch.hold.placed`, `batch.hold.released`, `batch.corrected`, and `batch.completed` with actor, request, IP, user agent, and metadata.
- **Headers**: CSP, `X-Frame-Options`, `nosniff`, referrer policy, HSTS (production) from `next.config.ts`.

API: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password`, `POST /api/auth/password-reset/{request|verify|confirm}`, `GET|POST /api/users`, `PATCH /api/users/:id`, and the authenticated domain routes under `/api/state`, `/api/batches`, `/api/lots`, `/api/recipes/:id/versions`, and `/api/config/*`. `GET /api/health` is intentionally public for load balancers.

Domain storage is relational at the entity level (`batches`, `lots`, `recipes`, `products`, `pack_sizes`, `suppliers`, `routes`, `output_categories`, `thresholds`) with JSONB aggregates for station records, outputs/destinations, holds/corrections, lot uses, and recipe versions. This keeps the existing pure logic in `src/lib/balance.ts`, `src/lib/stations.ts`, and `src/lib/derive.ts` unchanged while making every write server-authorized and transactional.

## Run locally

1. Copy `.env.example` to `.env.local` and fill in the PostgreSQL connection and a `SESSION_SECRET` (`npm run generate-secret`). Optionally set `POSTGRES_SCHEMA` to keep the application tables in their own schema.
2. Create the tables and the first admin (`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`; `SEED_DEMO_USERS=true` also adds the demo staff with password `cocoa123`):

```bash
npm install
npm run init-db
npm run dev
```

Open `http://127.0.0.1:3100` and sign in. The bootstrap admin is asked to choose a new password on first sign-in.

Production: use the included `Dockerfile` and `deploy/docker-compose.yml`, which place the app behind Caddy HTTPS and a dedicated PostgreSQL role. Set `NODE_ENV=production`, an HTTPS `APP_URL`, `TRUST_PROXY=true`, `SEED_DEMO_USERS=false`, a strong session secret, and SMTP settings. See [`deploy/README.md`](deploy/README.md). `GET /api/health` is the readiness check; schedule `npm run prune-sessions` and `scripts/backup-db.ps1`.

## Checks

```bash
npm run typecheck
node browser-check.cjs   # needs the dev server running against an initialised database; uses Playwright with Microsoft Edge
```

## Layout

- `src/lib/stations.ts` – the 10 stations, their groups, predefined output rows (worded as on the factory's paper forms), allowed destinations and default next stations
- `src/lib/balance.ts` – mass-balance and packaging calculations
- `src/lib/store.tsx` – authenticated API client and state cache (no localStorage persistence)
- `src/server/domain.ts` – transactional PostgreSQL domain operations and seed/reset mapping
- `src/server/migrations.mjs` and `migrations/*.sql` – numbered, transactional schema migrations
- `src/app/api/[...resource]/route.ts` – authenticated domain API and role checks
- `src/app/api/health/route.ts` – database-backed health endpoint
- `src/lib/derive.ts` – queues, next input, alerts, traceability helpers, and where a batch's starting weight went (`batchOutcomes`: every output that left the line, unaccounted weight and material still in process, adding up to 100% of the start)
- `src/components/BatchFlow.tsx` – stage-by-stage and "where the batch went" tables, each output as a share of the batch's starting weight (bag weight for a sack), used on reports, the batch page and the completion screen
- `src/components/Shell.tsx` – sidebar (desktop) and bottom navigation (mobile)
- `src/app/production/**` – production line, station queues, batch timeline, station recording flow
- `src/app/materials`, `recipes`, `reports`, `setup` – supporting screens
