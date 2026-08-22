# Kitchen Canon - Technical Architecture

This document describes the architecture as built. Features that are planned but not yet
implemented are explicitly marked **(planned)** — if something isn't marked, it exists in the code.

## Architecture Overview

**Architecture Pattern**: Client-Server with Progressive Web App (PWA)
- **Frontend**: React SPA with PWA install/caching support, built by Vite
- **Backend**: Node.js + Express REST API; in production it also serves the built frontend and media
- **Database**: SQLite via Prisma ORM (single-file DB, easy backups)
- **Hosting**: Docker Compose on a Raspberry Pi, fronted by host nginx for HTTPS; development happens on a Windows 11 PC
- **Accounts**: Multi-user with cookie-based sessions and per-user data isolation

```
┌─────────────────────────────────────┐
│        Phone / Browser              │
│  React PWA (service worker caches  │
│  app shell + selected API reads)   │
└───────────────┬─────────────────────┘
                │ HTTPS :443 (DuckDNS hostname)
┌───────────────▼─────────────────────┐
│      Raspberry Pi                    │
│  ┌───────────────────────────────┐  │
│  │  host nginx (TLS termination) │  │
│  │  - vhost per site (SNI)       │  │
│  │  - Let's Encrypt via certbot  │  │
│  └──────────────┬────────────────┘  │
│                 │ proxy_pass         │
│                 │ 127.0.0.1:8080     │
│  ┌──────────────▼────────────────┐  │
│  │  Docker: Node.js + Express    │  │
│  │  - /api/* REST endpoints      │  │
│  │  - /media/* (authed static)   │  │
│  │  - SPA static files + fallback│  │
│  └──────┬──────────────┬─────────┘  │
│         │ Prisma       │ fs         │
│  ┌──────▼─────┐  ┌─────▼─────────┐  │
│  │ SQLite DB  │  │ media files   │  │
│  │ (volume)   │  │ (volume)      │  │
│  └────────────┘  └───────────────┘  │
└─────────────────────────────────────┘
```

Inside the container a single Express process serves the API, the built SPA (with client-route
fallback to `index.html`), and authenticated media. The container binds to `127.0.0.1:8080`
only — it is never exposed to the LAN/WAN directly. **Host nginx** terminates TLS (Let's Encrypt
via certbot) and reverse-proxies the app on its own DuckDNS hostname, alongside other vhosts on
the same Pi (name-based/SNI routing). Express runs with `trust proxy = 1` in production so it
honors nginx's `X-Forwarded-Proto`/`X-Forwarded-For` (needed to issue `Secure` cookies and to
see real client IPs).

---

## Technology Stack

### Frontend (`frontend/`)

#### Core
- **React 19** with **Vite 7** (build + dev server with HMR)
- **React Router 7** — client-side routing; `ProtectedRoute` redirects anonymous users to login
- **TanStack Query (React Query) 5** — all server state: caching, invalidation on mutation
- **Tailwind CSS 4** — utility-first styling
- **Headless UI 2** — accessible overlay primitives only. `components/ui/Modal.tsx` (Dialog: focus
  trap, Escape/backdrop close, focus return) and `components/ui/Menu.tsx` (anchored dropdown menu)
  back every modal and dropdown; everything else is hand-rolled.
- **TypeScript** throughout

#### State management
- **React Query** for server data (recipes, meal plans, labels, ingredients, substitutions)
- **React Context** for auth only (`src/auth/AuthContext.tsx`: current user, login/logout, CSRF)
- Component-local `useState` for UI state (filters, cook-mode step/timers). No Zustand — local
  state has been sufficient so far.

#### PWA & offline (current status)
- **vite-plugin-pwa** (Workbox under the hood), `registerType: 'autoUpdate'`
  - Precaches the app shell (static assets)
  - Runtime caching of API reads: `/api/recipes*` stale-while-revalidate (7 days),
    `/api/courses|labels|meal-plans|meta` network-first (1 day)
- **Web App Manifest** — installable to home screen, standalone display, SVG icons
- **What works offline today**: viewing previously loaded recipes/meal plans (read-only)
- **(planned)** Offline *writes*: IndexedDB (e.g. Dexie) + a queued-mutation/background-sync
  layer so edits made offline sync when connectivity returns. Not implemented; React Query's
  persistence plus a mutation queue is the likely route. Note that cookie sessions and CSRF
  tokens need care here (queued mutations must replay with a fresh CSRF token).

#### Browser APIs
- **Clipboard API** — copy grocery list (`components/GroceryList.tsx`)
- **Web Audio API** — cook-mode timer completion beep (`pages/CookModePage.tsx`)
- **Screen Wake Lock API** — keeps the screen awake in cook mode (`hooks/useWakeLock.ts`);
  requires a secure context (HTTPS/localhost), otherwise cook mode shows a one-line notice
- **Touch events** — swipe left/right between cook-mode steps (`hooks/useSwipe.ts`,
  dependency-free touchstart/touchend deltas; vertical scrolling stays native)
- **(planned)** Web Share API for sharing recipes

#### Structure
- `src/pages/` — route-level pages (recipe list/detail/form, version history, cook mode,
  meal plan form/detail, meal history, import, substitutions, ingredients, login, signup)
- `src/components/` — RecipeForm, IngredientList, StepList, FilterPanel, GroceryList,
  RecipeSelector, RecipeMedia, StepMedia, ComboInput, ClassifyIngredientsPanel, etc.
- `src/components/ui/` — shared accessible primitives (`Modal`, `Menu`) wrapping Headless UI;
  all overlays/dropdowns build on these
- `src/api/` — one module per resource; `client.ts` is a fetch wrapper that prepends `/api`,
  sends credentials, and attaches the `x-csrf-token` header on mutations
- `src/hooks/` — React Query hooks (`useRecipes`, `useMealPlans`, `useScaling`, `useIngredients`)
- `src/utils/` — `resolveIngredientRefs` (renders `{ingredient:50%}` step tokens with scaled
  amounts), `exportRecipe` (.txt/.json download), ingredient alias localization

### Backend (`backend/`)

#### Runtime & framework
- **Node.js 20** + **Express 4** (TypeScript, compiled with `tsc`; dev uses `tsx watch`)
- **Prisma ORM** on **SQLite** — type-safe client; schema is the source of truth at
  `backend/prisma/schema.prisma`. SQLite caveat: no `mode: 'insensitive'` filters — names are
  normalized to lowercase instead.
- **Zod** — runtime validation of all request bodies/queries (`src/schemas/`, applied via
  `src/middleware/validate.ts`); also validates env config (`src/config.ts`)

#### Layering
```
routes/  (HTTP: parsing, status codes)  →  services/  (business logic, takes userId first)  →  Prisma
```
- `services/`: auth, recipe, meal-plan, grocery (list consolidation), import (parsing),
  dietary (allergen/diet computation), substitutions, export (bulk schema.org + proprietary
  full-backup JSON, `GET /api/export?format=schema-org|full`)
- Routes stay thin; all ownership scoping lives in services (`userId` is always the first
  argument), backed by isolation tests.

#### Middleware stack (in order, `src/app.ts`)
1. `helmet` (strict CSP in production; disabled in dev/test where Vite serves the frontend)
2. `cors` with `credentials: true` (`CORS_ORIGIN` only needed for split-origin hosting; the dev
   Vite proxy keeps requests same-origin)
3. `cookie-parser` signed with `SESSION_SECRET`
4. `express.json` (10 MB limit)
5. `morgan` logging (skipped in tests)
6. Public: `GET /api/health`, then `/api/auth/*` and `/api/shared/*` (mounted before the gates —
   the share token is the only credential, and its media route enforces its own ownership)
7. `/api` → CSRF validation (`csrf-csrf` double-submit) + `requireAuth` (sets `req.userId`)
8. `/media` → `requireAuth` + `express.static` (media is private to logged-in users)
9. Resource routers
10. Production only: static SPA + regex fallback to `index.html` for non-`/api`/`/media` paths
11. Central error handler (AppError / ZodError aware)

### API Design

RESTful JSON under `/api`. Mutations require the CSRF header; everything except health and auth
requires a session.

| Area | Endpoints |
|------|-----------|
| Health | `GET /api/health` (public) |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/auth/csrf` |
| Shared (public) | `GET /api/shared/:token` (latest-version recipe behind an active share; no personalNotes/user ids), `GET /api/shared/:token/media/:mediaId` (token-scoped media stream) — mounted before the CSRF/requireAuth gates |
| Recipes | `GET /api/recipes` (search/filter/pagination), `POST /api/recipes`, `GET /api/recipes/:id`, `PATCH /api/recipes/:id` (creates a new version), `DELETE /api/recipes/:id` (toggle archive), `DELETE /api/recipes/:id/permanent` |
| Versions | `GET /api/recipes/:id/versions`, `POST /api/recipes/:id/restore/:version` |
| Recipe extras | `GET /api/recipes/:id/dietary-info`, `GET /api/recipes/:id/substitutions`, `POST /api/recipes/:id/labels`, `POST /api/recipes/:id/courses`, `GET/POST/DELETE /api/recipes/:id/share` (share-link state / create / revoke) |
| Courses | `GET /api/courses` (static enum list) |
| Meta | `GET /api/meta` → `{ allergens, diets, allergenLabels, dietLabels }` (dietary vocabulary; single source of truth for the frontend, served from `constants/dietaryTags.ts`) |
| Labels | `GET /api/labels`, `POST /api/labels` |
| Meal plans | `GET /api/meal-plans`, `POST /api/meal-plans`, `GET /api/meal-plans/:id`, `PATCH /api/meal-plans/:id`, `PATCH /api/meal-plans/:id/grocery/:itemId` (toggle purchased), `POST /api/meal-plans/:id/recalculate` (recompute dietary info), `POST /api/meal-plans/:id/remake` (clone) |
| Import | `POST /api/import/url`, `POST /api/import/file` (multipart: .docx/.pdf/.txt) |
| Ingredients (catalog) | `GET /api/ingredients?q=` (typeahead), `POST /api/ingredients`, `PATCH /api/ingredients/:id`, `DELETE /api/ingredients/:id` |
| Substitutions | `GET /api/substitutions?from=`, `POST /api/substitutions`, `DELETE /api/substitutions/:id` |
| Media | `POST/GET /api/recipes/:id/media`, `DELETE /api/recipes/:id/media/:mediaId`, `POST/GET /api/steps/:stepId/media`, `DELETE /api/steps/:stepId/media/:mediaId`; files served at `GET /media/:filename` (authed) |

**(planned)** `GET /api/export` bulk export (schema.org + proprietary format). Today export is
client-side per-recipe (.txt/.json) in `frontend/src/utils/exportRecipe.ts`.

### Database Schema

Source of truth: `backend/prisma/schema.prisma`. Summary of models and intent:

| Model | Purpose / key fields |
|-------|----------------------|
| `User` | Account: unique lowercased `email`, `passwordHash` (bcrypt). Deleting cascades all owned data. |
| `Session` | Server-side session: opaque `id` (stored in signed cookie), `userId`, `expiresAt`. |
| `Recipe` | Owned by `userId`. `title`, `servings`, `source`, `archived`, notes (`authorNotes`/`personalNotes`). Versioning: `version`, `parentId` chain, `isLatest` flag — every edit creates a new row; restore copies an old version forward as the new latest. |
| `Ingredient` | Per recipe: `name` (standardized), `originalName`, `amount`/`unit`, `isOptional`, optional per-recipe `note` (brand/prep hint, display-only — excluded from matching/consolidation), `orderIndex`, optional `catalogId` link to `IngredientCatalog`. |
| `Step` | `orderIndex`, `instruction` (may embed `{ingredientName:50%}` percent-reference tokens), `timeMinutes` (Float), `isActiveTime`. Recipe total/active time is computed from steps. |
| `Media` | `'image' | 'video'`, `path` (`/media/{uuid}.{ext}`), attached to either a recipe or a step. |
| `CourseType` (enum) + `RecipeCourse` | Fixed course taxonomy (APPETIZER, SOUP, SALAD, BREAD, MAIN, SIDE, DESSERT, BREAKFAST, SNACK, DRINK, TOPPING) — replaced the earlier free-form `Category` model. Free-form tagging lives in `Label` instead. |
| `Label` + `RecipeLabel` | `type`: `'dietary' | 'allergen' | 'manual'`. Dietary/allergen labels are auto-computed from the ingredient catalog; manual labels are user-created. Nullable `userId` (null = global/seeded). |
| `IngredientCatalog` | Canonical ingredients with `allergens` and `diets` JSON arrays; powers dietary auto-labeling and typeahead. Nullable `userId` (null = global seed of ~258 entries; non-null = user's private entry, preferred on lookup). |
| `IngredientAlias` | Lowercased synonyms/stem variants → catalog entry; how free-text ingredient names resolve to the catalog. Nullable `userId`. |
| `IngredientSubstitution` | `fromIngredient` → `toIngredient` with `ratio` + notes. `isOfficial`/null `createdBy` = global; user-created rows are private and deletable. |
| `LocalizationMapping` | Locale-specific ingredient names (e.g. en-GB "coriander" → en-US "cilantro"). Nullable `userId`. |
| `MealPlan` | Owned by `userId`. `name`, `date`/`time` strings, `notes`, `cookedAt`, `dietaryInfo` JSON (`allergens`, `diets`, `unknownIngredients` — computed across recipes after substitutions; optional ingredients excluded from allergen detection). |
| `MealRecipe` | Recipe-in-plan: pins `recipeVersion` used, per-plan `servings`, `substitutions` JSON (`Record<ingredientId, { toIngredient, ratio }>`). |
| `GroceryItem` | Consolidated list rows (`ingredient`, `amount`, `unit`, `purchased`), regenerated from the plan's recipes. |
| `UserPreferences` | One per user (`locale`, `theme`). |
| `RecipeShare` | Public share link. `id` (uuid) doubles as the unguessable URL token; `recipeId` (any version row, resolved to the chain's latest at read), `userId` owner (cascade delete), `createdAt`, nullable `revokedAt` (set = dead link). Read via the public `/api/shared/:token` routes; never carries `personalNotes` or user ids to the viewer. |

Notable design points:
- **`orderIndex`** is the ordering field name everywhere (not `order`, a SQL keyword).
- **Versioning is row-copy**, not a diff log: simple, and meal plans pin `recipeVersion` so
  history shows what was actually cooked. All versions in a chain share one owner.
- The earlier idea of an `internalId` on ingredients for step references was dropped — steps
  reference ingredients by name token (`{butter:50%}`), resolved at render time on the client.

---

## Authentication & Multi-User Accounts

The app is multi-tenant: every user has their own private data, behind a login. Self-service signup is open by default, or gated behind an invite code when `SIGNUP_INVITE_CODE` is set (recommended for an internet-facing instance).

### Session & credential model
- **Passwords**: hashed with `bcryptjs` (cost 12). Login returns an identical 401 for unknown-email and wrong-password to avoid account enumeration.
- **Sessions**: server-side. A `Session` row (`id`, `userId`, `expiresAt`) is created on login/register; the opaque `id` is stored in a **signed, httpOnly** cookie (`kc_session`). `requireAuth` middleware looks the session up, verifies it is live, and derives `req.userId` from it — the client never sends or can forge a user id. Expired sessions are dropped lazily on lookup, plus opportunistic cleanup on login. Cookie `secure` flag follows `COOKIE_SECURE` (defaults to true in production; the Pi deploy sets it false for plain-HTTP LAN serving).
- **CSRF**: `csrf-csrf` double-submit token. A JS-readable `kc_csrf` cookie is issued by `GET /api/auth/csrf`; the SPA echoes it in an `x-csrf-token` header on POST/PATCH/DELETE. `sameSite=lax` on both cookies. Login/register are exempt (no session yet).

### Auth endpoints (`/api/auth`, public)
- `POST /register` — `{email, password, inviteCode?}` → creates user + session, sets cookies. The submitted `inviteCode` is always checked against `SIGNUP_INVITE_CODE` (constant-time, generic 403 on mismatch); the default empty `SIGNUP_INVITE_CODE` matches an empty code, so signup is open until a code is set.
- `POST /login` — `{email, password}` → sets cookies; 401 on bad credentials
- `POST /logout` — destroys the session, clears the cookie
- `GET /me` — current user, or 401
- `GET /csrf` — issues a CSRF token

### Rate limiting
Per-IP limits via `express-rate-limit` (`src/middleware/rateLimits.ts`), keyed off `trust proxy` so they see real client IPs behind nginx. Disabled when `NODE_ENV=test`. Login 10/15 min, register 5/hour, the rest of `/api/auth` 60/15 min, import (`/api/import/url`, `/file`) 20/hour, and the public share routes (`/api/shared/*`) 100/15 min — sized for a recipe page plus its media files. Over-limit responses are `429` with the app's `{ error }` shape and `RateLimit-*` headers.

All other `/api` routes sit behind `requireAuth` (and CSRF for mutations); `/media` is also gated. The auth routes are mounted before those gates.

### Data ownership
Two patterns scope data by user:
- **Private-only trees** — `Recipe` and `MealPlan` carry a non-null `userId`. Their children (`Ingredient`, `Step`, `Media`, `RecipeCourse`, `RecipeLabel`, `MealRecipe`, `GroceryItem`) inherit isolation through the parent. Reads use `where: { id, userId }` and return **404** (not 403) on a miss, so other users' data isn't even revealed to exist. Every version row in a recipe's version chain shares one owner.
- **Global-base + private-supplement** — `IngredientCatalog`, `IngredientAlias`, `Label`, `LocalizationMapping`, and `IngredientSubstitution` carry a **nullable** owner (`userId`, or `createdBy`/`isOfficial` for substitutions). `null` = global/seeded and visible to everyone; non-null = that user's private addition. Reads use `where: { OR: [{ userId: null }, { userId }] }`; the user's own entry is preferred on a tie (e.g. ingredient → catalog resolution). Because SQLite treats `NULL` as distinct in unique indexes, the composite uniques (e.g. `IngredientAlias @@unique([alias, userId])`) don't dedupe globals — global uniqueness relies on the controlled seed plus an app-level check before a private insert.

### Service pattern
`userId` is threaded as the first argument into the owning service/route functions (e.g. `recipeService.getRecipe(userId, id)`), set from `req.userId` after `requireAuth`. This keeps scoping uniform rather than scattered, and is backed by isolation tests in `backend/src/__tests__/isolation.test.ts`.

---

## File Storage & Media

- Uploads go through **multer** disk storage (20 MB limit, image/video MIME filter) into
  `MEDIA_STORAGE_PATH` as flat `{uuid}.{ext}` files; the DB stores the public path
  `/media/{filename}` on the `Media` row.
- Files are served by `express.static` behind `requireAuth` — media is not publicly readable.
  The one exception is `GET /api/shared/:token/media/:mediaId`, which streams a single file via
  `res.sendFile` only after confirming the media row belongs to the shared recipe's version chain
  (authorized by the share token, not a session); the authed `/media` static mount is not widened.
- Deleting media removes both the DB row and the file.
- **(planned)** A `StorageProvider` abstraction (upload/download/delete/getUrl) to enable
  S3/GCS later. Today filesystem access is direct; a cloud move means introducing that
  interface in `routes/media.ts` first.

## Recipe Parsing & Import (`services/import.service.ts`)

- **URL import**: `fetch` with a 10s timeout → extract **schema.org Recipe JSON-LD** (custom
  regex extraction — no cheerio dependency) → fall back to stripping HTML and running the text
  parser.
- **File import**: `.docx` via **mammoth**, `.pdf` via **pdf-parse**, plain text directly.
- **Custom text parser**: section-header detection with heuristics for ingredient vs. step
  lines; ingredient lines parsed by regex (unicode/slash fractions, units, "optional" flag).
  Two regex gotchas are encoded in tests: bullet-stripping must not eat standalone digits, and
  slash fractions must be matched before bare integers.
- **(planned)** OCR import of recipe photos (Tesseract). Given Pi hardware, client-side OCR
  (tesseract.js in the browser) is the more realistic option, feeding the same text parser.

## Configuration (`backend/src/config.ts`, Zod-validated)

| Env var | Default | Notes |
|---------|---------|-------|
| `NODE_ENV` | `development` | `production` enables SPA serving + secure cookies |
| `PORT` | `8080` | Dev sets `PORT=3000` in `backend/.env` to match the Vite proxy target |
| `DATABASE_URL` | `file:../data/database.db` | SQLite file (relative to `backend/`) |
| `MEDIA_STORAGE_PATH` | `../data/media` | Created on boot if missing |
| `SESSION_SECRET` | **required, no default** | ≥32 chars; signs session + CSRF cookies |
| `SESSION_TTL_HOURS` | `720` (30 days) | Session lifetime |
| `COOKIE_SECURE` | unset → true in prod | App is served over HTTPS via host nginx; stays `true` |
| `CORS_ORIGIN` | unset | Only needed for split-origin hosting |
| `SIGNUP_INVITE_CODE` | `''` (open signup) | register always checks `inviteCode` against this; empty matches an empty code, set it to gate signup |

---

## Hosting & Deployment

### Production: Docker Compose on Raspberry Pi

The only supported production deployment is the container. The image is a 3-stage build
(`Dockerfile`): build frontend → build backend (tsc + `prisma generate`) → slim runtime image
with prod deps, compiled backend, and the built frontend copied in.

On container start (`backend/docker-entrypoint.sh`):
1. `npx prisma db push` — apply schema to the SQLite file in the volume
2. `node dist/prisma/seed.js` — seed/refresh the global ingredient catalog
3. `exec node dist/server.js`

`docker-compose.yml`:
- Single `app` service bound to **`127.0.0.1:8080`** (loopback only — reachable solely through
  the host nginx reverse proxy, never directly from the LAN/WAN)
- Named volume `data` mounted at `/app/data` (database + media persist across rebuilds)
- `SESSION_SECRET` is required and read from a `.env` file next to the compose file
  (see `.env.example`); `COOKIE_SECURE` defaults to `true` (served over HTTPS)

### TLS / reverse proxy (host nginx)

The Pi already runs host nginx terminating HTTPS for another site, so the app is **not** given a
second `:443` from Docker. Instead a host nginx vhost (see `deploy/nginx/kitchencanon.conf`)
`proxy_pass`es a dedicated **DuckDNS** hostname to `http://127.0.0.1:8080`, with the cert issued
by `certbot --nginx`. DuckDNS is used (over the router's `*.tplinkdns.com` DDNS) because it is on
the Public Suffix List, so it gets its own Let's Encrypt rate-limit bucket. Only ports 80/443 are
forwarded at the router to the Pi; the old `:8080` forward is removed.

### Deploying: `scripts/deploy-to-pi.sh [--with-data [--force]] user@host [--invite-code CODE]`
1. Syncs the source tree to `~/kitchen-canon` on the Pi via `tar | ssh`
   (excludes `node_modules`, `.git`, build outputs, `data/`, and `.env` so the Pi's secret is
   never clobbered)
2. First deploy only: generates a `.env` on the Pi with a random `SESSION_SECRET`
   (`openssl rand -hex 32`). `SIGNUP_INVITE_CODE` is set from `--invite-code` if given, else a
   random one. On later deploys `--invite-code` sets/rotates just that line (other values, incl.
   `SESSION_SECRET`, are left untouched); omit it to leave the invite code as-is.
3. `docker compose up --build -d`
4. **Data copy is opt-in.** By default the script skips it (the Pi's DB is now authoritative —
   it holds accounts created via live signup). Pass `--with-data` to copy this machine's
   `data/database.db` and `data/media/` into the container. If the Pi already has a DB, the
   script first backs it up to `backups/pi-<timestamp>.db` on the dev machine (gitignored), warns
   that signup accounts will be lost, and requires a typed `yes`. `--with-data --force` skips that
   guard for non-interactive use.

App is then live at `https://<APP_DOMAIN>` (the DuckDNS hostname, via the nginx vhost). Updating
= re-run the script (without `--with-data`, so Pi data is left untouched).

> `backend/ecosystem.config.cjs` (PM2) is a leftover from a pre-Docker iteration and is not
> used by anything.

### Development (Windows 11 or any OS)

```powershell
# One-time setup
cd backend; npm install
cd ../frontend; npm install

# backend/.env  (SESSION_SECRET is required even in dev)
# NODE_ENV=development
# PORT=3000
# DATABASE_URL="file:../../data/database.db"   # or your preferred location
# MEDIA_STORAGE_PATH="../data/media"
# SESSION_SECRET=<any 32+ char string>

cd backend; npm run db:push; npm run db:seed

# Run both servers (root package.json uses concurrently)
cd ..; npm run dev
```

- Frontend: Vite on `http://localhost:5173`, proxying `/api` and `/media` to
  `http://localhost:3000` — so the backend **must** run on 3000 in dev (set `PORT=3000`).
- Phone testing on the LAN: `http://<pc-ip>:5173` (Vite binds `host: true`); allow Node through
  the Windows firewall when prompted.
- Useful backend scripts: `db:push`, `db:seed`, `db:migrate`, `db:backup`, `db:restore`, `test`.

---

## Testing

### Backend (`backend/src/__tests__/`, Vitest + Supertest)
- ~92 tests across 9 suites: health, recipes (CRUD/versioning/filtering), categories-labels,
  meal plans, grocery consolidation, import parsing, substitutions, auth, cross-user isolation.
- `setup.ts` creates a temp SQLite DB via `prisma db push`; each suite's `beforeEach` cleans
  tables in FK-safe order.
- `helpers/auth.ts` provides `createAuthedApi(app)` — an authed supertest agent that
  auto-attaches the `x-csrf-token` header — and `cleanupUsers()`.

### Frontend (Vitest + React Testing Library, jsdom)
- Component/page tests under `src/**/*.test.{ts,tsx}`; run with `npm test` (`vitest run`).

### Gaps
- No E2E suite (Playwright is the intended tool, especially for PWA/offline behavior).
- No CI pipeline (`.github/workflows` does not exist) — tests run locally.

---

## Future Migration Paths

### SQLite → PostgreSQL
1. Change the Prisma datasource provider and `DATABASE_URL`
2. Export/import data
3. Revisit SQLite-specific workarounds: lowercase-normalization instead of `mode: 'insensitive'`,
   and the NULL-in-unique-index behavior that the global/private supplement tables rely on
   (Postgres `NULLS NOT DISTINCT` could simplify this)

### Filesystem → S3/GCS media
Requires introducing the storage abstraction first (see File Storage above) — uploads, static
serving, and deletes all touch the filesystem directly today.

### Pi → Cloud hosting
The container is the unit of deployment, so any Docker host works (Fly.io, Railway, a VPS).
Put TLS in front and set `COOKIE_SECURE=true`. SQLite-on-volume remains fine for small scale;
move to Postgres if the host's volume story is weak.

---

## Security Considerations

### Current
- Cookie-based auth with server-side sessions; signed httpOnly cookies
- Password hashing with `bcryptjs`; enumeration-safe login
- CSRF double-submit protection on state-changing requests
- Per-user data isolation enforced in the service layer (404-on-miss), with test coverage
- Authenticated media serving (no public file reads)
- Zod input validation on every route; Prisma parameterized queries
- Upload validation (MIME filter, 20 MB limit); helmet security headers
- **Content-Security-Policy** in production: `default-src 'self'`, `script-src 'self'` (no
  `unsafe-inline` — the prod bundle has no inline scripts), `object-src 'none'`,
  `frame-ancestors 'self'`; `style-src` allows `'unsafe-inline'` for React/FLIP style attributes,
  and `img-src`/`media-src` allow `blob:`/`data:`. Disabled in dev/test (Vite serves the SPA there
  and HMR injects inline scripts)
- **Non-root container**: the production image runs as the unprivileged `node` user (uid 1000);
  `/app/data` is node-owned in the image so the named volume inherits it on first use
- **HTTPS in production**: TLS terminated by host nginx (Let's Encrypt/certbot) in front of the
  loopback-bound container; `COOKIE_SECURE=true`; Express `trust proxy = 1`
- **Rate limiting** on auth, import, and public share endpoints (`express-rate-limit`, per-IP)
- **Gated signup** via `SIGNUP_INVITE_CODE` (optional invite code on register)
- **SSRF protection on URL import**: user-supplied import URLs go through `src/utils/safeFetch.ts`
  — http(s)-only, no embedded credentials, hostname + DNS-resolution checks against private/
  reserved ranges (RFC1918, loopback, link-local incl. cloud metadata, CGNAT, ULA, multicast),
  manual redirect re-validation (max 3 hops), and 10 s / 2 MB / content-type response caps

### Future hardening
- Email verification / password reset; optional OAuth providers

---

## Performance Notes

- SQLite handles this workload comfortably; indexes exist on the hot foreign keys
  (`userId`, session lookups)
- Workbox runtime caching gives instant repeat loads of recipe reads
- Media is served with no image resizing/compression — adding `sharp` thumbnails on upload is
  the highest-value performance improvement if media volume grows
- Recipe list supports pagination server-side

---

## Summary of Key Technologies

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend framework | React 19 + TypeScript | SPA |
| Build tool | Vite 7 | Dev proxy to backend on :3000 |
| Styling | Tailwind CSS 4 | Custom components; Headless UI 2 for modal/menu primitives only |
| Server state | TanStack Query 5 | All API data |
| Client state | React Context (auth) + local state | No Zustand |
| Routing | React Router 7 | `ProtectedRoute` guard |
| PWA | vite-plugin-pwa (Workbox) | Shell precache + API read caching; offline writes planned |
| Backend | Node.js 20 + Express 4 | Single process serves API, SPA, media |
| Database | SQLite + Prisma | Schema at `backend/prisma/schema.prisma` |
| Validation | Zod | Requests + env config |
| Auth | bcryptjs + signed cookies + csrf-csrf | Server-side sessions |
| Uploads | multer | Flat UUID files in `MEDIA_STORAGE_PATH` |
| Import parsing | JSON-LD extraction, mammoth, pdf-parse, custom text parser | No cheerio/OCR (OCR planned) |
| Deployment | Docker Compose on Raspberry Pi | `scripts/deploy-to-pi.sh`; data in named volume |
| Testing | Vitest (+ Supertest, RTL) | No E2E/CI yet |
