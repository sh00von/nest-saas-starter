# Nest Starter

A production-minded NestJS 12 starter you can clone and build on. Every feature is a self-contained module, so you can change, swap or delete one without touching the rest.

- **Auth**: email + password (argon2), short-lived JWT access tokens, rotating refresh tokens with reuse detection, per-device sessions, roles
- **Email**: verification and password reset over SMTP (printed to the console in development)
- **Google sign-in**: OAuth 2.0 with PKCE (optional)
- **Database**: Drizzle ORM on PostgreSQL (PGlite locally with no install, or Neon, Supabase, Docker, RDS…) with committed SQL migrations
- **Billing**: Stripe Checkout, Customer Portal, a signature-verified webhook, and cancellation on account deletion (optional)
- **API docs**: OpenAPI generated from your DTOs, rendered with [Scalar](https://scalar.com) at `/docs`
- **Hardening**: env validation (zod), validation pipe, rate limiting, CSRF-safe cookie routes, helmet, CORS, graceful shutdown
- **Tooling**: pnpm, Vitest (unit + e2e), oxlint, Prettier, GitHub Actions CI, multi-stage Dockerfile

## Quick start

```bash
pnpm install
cp .env.example .env            # then set JWT_ACCESS_SECRET
pnpm db:local                   # keep running in its own terminal (see below)
pnpm db:migrate
pnpm db:seed                    # optional: creates SEED_ADMIN_EMAIL as admin
pnpm start:dev
```

Open <http://localhost:3000/docs> for the API reference. The raw spec is at `/openapi.json` for client generators.

**Pick a Postgres.** The app only needs a `DATABASE_URL`:

| Option                               | Setup                                                                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:local`                      | Nothing to install. Runs [PGlite](https://pglite.dev) (Postgres compiled to WASM) on port 5432, data in `./.pglite`. Keep `DATABASE_POOL_MAX=1`. For development only. |
| [Neon](https://neon.tech) / Supabase | Free hosted Postgres. Paste the connection string into `DATABASE_URL` and set `DATABASE_POOL_MAX=10`.                                                                  |
| `docker compose up -d`               | Postgres 17 in Docker. `DATABASE_URL=postgres://postgres:postgres@localhost:5432/nest_starter`, `DATABASE_POOL_MAX=10`.                                                |

## Architecture

```
src/
  main.ts · app.module.ts · setup-app.ts   bootstrap, module list, global middleware + docs
  config/env.ts                            every env var, validated at startup
  database/                                Drizzle module, schema/ (one file per table), migrate, seed
  common/                                  shared, feature-agnostic code
    decorators/                            @Public(), @Roles(), @CurrentUser()
    guards/json-only.guard.ts              CSRF defence for cookie routes
    crypto/                                password hashing, random tokens
  modules/
    auth/                                  email/password auth
      controllers/                         auth · password · email-verification · sessions
      services/                            one job each (see below)
      guards/                              global JWT + roles guards
      dto/
    google-auth/                           "Sign in with Google"      (on when GOOGLE_CLIENT_ID is set)
    users/                                 profile, admin, account deletion, users.events.ts
    mail/                                  SMTP transport + templates/
    billing/                               Stripe                     (on when STRIPE_SECRET_KEY is set)
    health/                                liveness / readiness
drizzle/                                   generated SQL migrations
test/                                      e2e tests + utils/test-app.ts
```

**Rules that keep modules independent**

1. A module only imports another module's **exported services** (listed in its `exports`), never its internals.
2. Side effects go through **events** instead of direct calls. `users` emits `user.registered` and `user.deleting` (`modules/users/users.events.ts`). `auth` listens to send the verification email, and `billing` listens to cancel Stripe. The users module doesn't know either of them exists.
3. Optional features are switched on in `app.module.ts` by their env vars. To remove one, delete its folder and its line there.

**Auth services**: one responsibility per file:

| Service                    | Job                                                           |
| -------------------------- | ------------------------------------------------------------- |
| `AuthService`              | register, login, refresh; `startSession()` for other sign-ins |
| `AccessTokenService`       | sign / verify JWT access tokens                               |
| `SessionService`           | sessions + refresh tokens: create, rotate, revoke, list       |
| `PasswordService`          | change, forgot, reset password                                |
| `EmailVerificationService` | send and confirm verification links                           |
| `EmailTokenService`        | single-use tokens behind email links                          |
| `RefreshCookieService`     | the httpOnly refresh cookie                                   |

**Adding a feature module**: create `src/modules/<name>/` with `<name>.module.ts`, a controller, a service and `dto/`. Add tables in `src/database/schema/<name>.ts` (export them from `schema/index.ts`), run `pnpm db:generate`, and add the module to `app.module.ts`.

## How auth works

| Token                     | Lifetime                                    | Where it lives                                     |
| ------------------------- | ------------------------------------------- | -------------------------------------------------- |
| Access token (JWT, HS256) | `JWT_ACCESS_TTL_SECONDS` (15 min)           | Client memory → `Authorization: Bearer …`          |
| Refresh token (opaque)    | `REFRESH_TOKEN_TTL_DAYS` (30 days, sliding) | httpOnly cookie `refresh_token`, scoped to `/auth` |

- Every login creates a row in `sessions`. The refresh token is `<sessionId>.<secret>`, and only a SHA-256 hash of the secret is stored.
- `POST /auth/refresh` swaps the secret in one conditional `UPDATE`. If someone presents an **old** secret (a stolen token being replayed), the whole session is revoked.
- **Browsers** get the refresh token only as a cookie, so page JavaScript can never read it. Refreshing with the cookie returns the new token in the cookie. **Mobile/CLI clients** send `x-token-transport: body` on login/register and get the token in the JSON body. They refresh by sending `{ "refreshToken": "…" }` and get the next one in the body.
- Routes that read or set auth cookies require `Content-Type: application/json`, which a hostile site can't send cross-site without passing CORS (protects against login CSRF).
- Every route needs a token by default. Opt out with `@Public()`, and restrict with `@Roles('admin')`. Read the caller with `@CurrentUser()`.
- Access tokens are stateless: after logout, an issued access token keeps working until it expires. Keep the TTL short.

| Endpoint                                                    |                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| `POST /auth/register`, `POST /auth/login`                   | Start a session (rate limited: 5/min)                   |
| `POST /auth/refresh`                                        | Rotate tokens                                           |
| `POST /auth/logout`, `POST /auth/logout-all`                | End this / every session                                |
| `POST /auth/change-password`                                | Signs out every other session                           |
| `POST /auth/forgot-password`, `POST /auth/reset-password`   | Email a reset link / set a new password (signs out all) |
| `POST /auth/verify-email`, `POST /auth/verify-email/resend` | Confirm / resend the verification link                  |
| `GET /auth/sessions`, `DELETE /auth/sessions/:id`           | Manage devices                                          |
| `GET /auth/google`                                          | Sign in with Google (when enabled)                      |
| `GET/PATCH/DELETE /users/me`                                | Profile; delete account (needs password if one is set)  |
| `GET /users`, `GET /users/:id`                              | Admin only                                              |

## Email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`. Any SMTP provider works (Gmail app password, Resend, SES, Mailgun…). Without `SMTP_HOST`, development prints emails to the console. Production drops them with a warning, so login links never end up in logs.

Links point to your frontend: `FRONTEND_URL/verify-email?token=…` and `FRONTEND_URL/reset-password?token=…`. Those pages POST the token to the API. Edit the wording in `src/modules/mail/templates/`.

## Google sign-in (optional)

1. In Google Cloud Console → Credentials, create an **OAuth client ID** (Web application) with redirect URI `<API_URL>/auth/google/callback`.
2. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `API_URL`.
3. On the frontend, link to `GET <API_URL>/auth/google`. After sign-in, the user lands on `FRONTEND_URL/auth/callback` with the refresh cookie set. Call `POST /auth/refresh` to get an access token. Failures land on `FRONTEND_URL/login?error=google`.

Google accounts are linked by Google's user id in the `accounts` table. If an **unverified** password account already uses the same email, Google's proof of ownership wins: that password and its sessions are removed, so someone who registered an email they don't own can't keep access.

## Database

Schemas live in `src/database/schema/`, one file per table. Inject the typed client with `@InjectDb() private db: Database`.

```bash
# after editing a schema file
pnpm db:generate     # writes a SQL migration to ./drizzle; review and commit it
pnpm db:migrate      # applies it (dev, via drizzle-kit)
pnpm db:studio       # browse data
```

In production, `node dist/database/migrate.js` (`pnpm db:migrate:prod`) applies migrations without drizzle-kit, and the Docker image runs it on start. CI fails if a schema change has no committed migration.

## Stripe (optional)

Billing routes only exist when `STRIPE_SECRET_KEY` is set.

1. Create recurring prices in Stripe and list the allowed ones in `STRIPE_PRICE_IDS`.
2. Forward webhooks locally with `stripe listen --forward-to localhost:3000/billing/webhook`, and put the printed `whsec_…` in `STRIPE_WEBHOOK_SECRET`.
3. `POST /billing/checkout { priceId }` → redirect to the returned `url`.
   `POST /billing/portal` → manage or cancel the subscription.
   `GET /billing/subscription` → the local mirror; gate features on `status`.

The webhook re-fetches each subscription from Stripe instead of trusting the event body, so retried or out-of-order events still end up with the latest state. When a user deletes their account, their subscriptions are cancelled immediately. If Stripe can't be reached, the deletion is refused rather than leaving a subscription that keeps charging.

## Scripts

|                                                |                                            |
| ---------------------------------------------- | ------------------------------------------ |
| `pnpm start:dev`                               | Watch mode                                 |
| `pnpm test` / `pnpm test:e2e`                  | Unit / e2e (e2e needs a migrated database) |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Code quality                               |
| `pnpm db:*`                                    | See [Database](#database)                  |

## Deploying

```bash
docker build -t nest-starter .
docker run -p 3000:3000 --env-file .env nest-starter
```

Behind a load balancer, set `TRUST_PROXY=1` so rate limits and session IPs use the real client IP. If the frontend is on a different site, set `COOKIE_SAME_SITE=none` (HTTPS is required) and list it in `CORS_ORIGINS`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). MIT licensed.
