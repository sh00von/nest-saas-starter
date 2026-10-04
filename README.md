# Nest SaaS Starter

A production-minded NestJS 12 SaaS starter you can clone and build on. Every feature is a self-contained module, so you can change, swap or delete one without touching the rest.

- **Auth**: email + password (argon2), short-lived JWT access tokens, rotating refresh tokens with reuse detection, per-device sessions, roles
- **Email**: verification and password reset over SMTP
- **Google sign-in**: OAuth 2.0 with PKCE (optional)
- **Admin**: list users, change roles, ban / unban
- **File uploads**: direct-to-S3 with presigned URLs (optional)
- **Database**: Drizzle ORM on PostgreSQL (PGlite locally with no install, or Neon, Supabase, RDS…) with committed SQL migrations
- **Billing**: Stripe Checkout, Customer Portal, a signature-verified webhook, and cancellation on account deletion (optional)
- **API**: versioned under `/v1`, OpenAPI from your DTOs rendered with [Scalar](https://scalar.com) at `/docs`, one error format everywhere
- **Operations**: structured JSON logs with request IDs, health checks, graceful shutdown, rate limiting
- **Hardening**: env validation (zod), validation pipe, rate limiting, CSRF-safe cookie routes, helmet, CORS
- **Tooling**: pnpm, Vitest (unit + e2e), oxlint, Prettier, husky pre-commit, GitHub Actions CI, Dependabot

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

Everything else is optional and switched on by its env vars (see `.env.example`): S3, SMTP, Google, Stripe.

## Architecture

```
src/
  main.ts · app.module.ts · setup-app.ts   bootstrap, module list, global middleware + docs
  config/env.ts                            every env var, validated at startup
  database/                                Drizzle module, schema/ (one file per table), migrate, seed
  core/                                    infrastructure, no business logic
    logging/                               pino logger + request ids
    errors/                                global error filter (one response shape)
    throttling/                            rate limits
  common/                                  small shared helpers
    decorators/                            @Public(), @Roles(), @CurrentUser()
    guards/json-only.guard.ts              CSRF defence for cookie routes
    crypto/  url.ts  api-version.ts
  modules/                                 features, one folder each
    auth/                                  email/password auth
      controllers/                         auth · password · email-verification · sessions
      services/                            one job each (see below)
      guards/  listeners/  dto/
    users/                                 profile, account deletion, admin, users.events.ts
    mail/                                  MailService → MailTransport; templates/
    google-auth/                           Sign in with Google        (on when GOOGLE_CLIENT_ID is set)
    files/                                 S3 uploads                 (on when S3_BUCKET is set)
    billing/                               Stripe                     (on when STRIPE_SECRET_KEY is set)
    health/                                liveness / readiness
drizzle/                                   generated SQL migrations
test/                                      e2e tests + utils/test-app.ts
```

**Rules that keep modules independent**

1. A module only imports another module's **exported services** (listed in its `exports`), never its internals.
2. Side effects go through **events** instead of direct calls. `users` emits `user.registered`, `user.deleting` and `user.banned` (`modules/users/users.events.ts`). Listeners react: `auth` sends the verification email and ends a banned user's sessions; `billing` cancels Stripe and `files` deletes S3 objects before an account is deleted. The users module doesn't know any of them exist.
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

## API conventions

- **Versioning**: every route lives under `/v1`. Health checks (`/health`) and the Stripe webhook (`/billing/webhook`) are unversioned so their URLs never change. For a breaking change, add `@Version('2')` to the new handler and keep v1 running.
- **Errors** always look like this (`src/core/errors/all-exceptions.filter.ts`):
  ```json
  {
    "statusCode": 409,
    "error": "Conflict",
    "message": "Resource already exists",
    "requestId": "6f1c…",
    "path": "/v1/…",
    "timestamp": "2026-10-03T12:00:00.000Z"
  }
  ```
  `message` is a list for validation errors. Postgres unique and foreign-key violations become 409s. Unexpected errors are logged with their stack and returned as a plain 500 without internals.
- **Request IDs**: every response has an `x-request-id` header, also included in error bodies and on every log line for that request. A well-formed incoming `x-request-id` (e.g. from a load balancer) is reused.
- **Logs**: JSON lines via pino (`LOG_LEVEL`), readable output in development. Authorization headers and cookies are redacted.

## How auth works

| Token                     | Lifetime                                    | Where it lives                                        |
| ------------------------- | ------------------------------------------- | ----------------------------------------------------- |
| Access token (JWT, HS256) | `JWT_ACCESS_TTL_SECONDS` (15 min)           | Client memory → `Authorization: Bearer …`             |
| Refresh token (opaque)    | `REFRESH_TOKEN_TTL_DAYS` (30 days, sliding) | httpOnly cookie `refresh_token`, scoped to `/v1/auth` |

- Every login creates a row in `sessions`. The refresh token is `<sessionId>.<secret>`, and only a SHA-256 hash of the secret is stored.
- `POST /v1/auth/refresh` swaps the secret in one conditional `UPDATE`. If someone presents an **old** secret (a stolen token being replayed), the whole session is revoked.
- **Browsers** get the refresh token only as a cookie, so page JavaScript can never read it. Refreshing with the cookie returns the new token in the cookie. **Mobile/CLI clients** send `x-token-transport: body` on login/register and get the token in the JSON body. They refresh by sending `{ "refreshToken": "…" }` and get the next one in the body.
- Routes that read or set auth cookies require `Content-Type: application/json`, which a hostile site can't send cross-site without passing CORS (protects against login CSRF).
- Every route needs a token by default. Opt out with `@Public()`, and restrict with `@Roles('admin')`. Read the caller with `@CurrentUser()`.
- Access tokens are stateless: after logout, a ban or a role change, an issued access token keeps its old powers until it expires. Keep the TTL short.

| Endpoint (all under `/v1`)                             |                                                         |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `POST /auth/register`, `POST /auth/login`              | Start a session (rate limited: 5/min)                   |
| `POST /auth/refresh`                                   | Rotate tokens                                           |
| `POST /auth/logout`, `POST /auth/logout-all`           | End this / every session                                |
| `POST /auth/change-password`                           | Signs out every other session                           |
| `POST /auth/forgot-password`, `/auth/reset-password`   | Email a reset link / set a new password (signs out all) |
| `POST /auth/verify-email`, `/auth/verify-email/resend` | Confirm / resend the verification link                  |
| `GET /auth/sessions`, `DELETE /auth/sessions/:id`      | Manage devices                                          |
| `GET /auth/google`                                     | Sign in with Google (when enabled)                      |
| `GET/PATCH/DELETE /users/me`                           | Profile; delete account (needs password if one is set)  |
| `GET /admin/users`, `GET /admin/users/:id`             | Admin: list / view users                                |
| `PATCH /admin/users/:id/role`                          | Admin: change role                                      |
| `POST /admin/users/:id/ban`, `/unban`                  | Admin: block sign-in and end all sessions / restore     |
| `POST /files`, `POST /files/:id/complete`, …           | File uploads (when enabled)                             |

## Email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`. Any SMTP provider works (Gmail app password, Resend, SES, Mailgun…). Without `SMTP_HOST`, development prints emails to the console. Production drops them with a warning, so login links never end up in logs.

Emails are delivered immediately via SMTP. Links point to your frontend: `FRONTEND_URL/verify-email?token=…` and `FRONTEND_URL/reset-password?token=…`. Those pages POST the token to the API. Edit the wording in `src/modules/mail/templates/`.

## File uploads to S3 (optional)

Set `S3_BUCKET` and `S3_REGION` (plus `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`, or rely on an IAM role). The bucket's CORS must allow `PUT` from your frontend.

Files never pass through the API:

1. `POST /v1/files { filename, contentType, size }` → `{ file, uploadUrl, headers }`
2. The browser `PUT`s the bytes to `uploadUrl` with those headers. S3 itself rejects a different type or size, because both are signed into the URL.
3. `POST /v1/files/:id/complete` → the API checks the object landed and marks it `uploaded`.

Then `GET /v1/files`, `GET /v1/files/:id/download` (5-minute link), `DELETE /v1/files/:id`. Allowed types and max size come from `UPLOAD_ALLOWED_TYPES` and `UPLOAD_MAX_BYTES`. Objects are keyed `users/<userId>/<uuid>` and deleted along with the account. Uploads that are never completed leave a `pending` row and possibly an object behind. Add an S3 lifecycle rule or a cleanup job if that matters to you.

## Google sign-in (optional)

1. In Google Cloud Console → Credentials, create an **OAuth client ID** (Web application) with redirect URI `<API_URL>/v1/auth/google/callback`.
2. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `API_URL`.
3. On the frontend, link to `GET <API_URL>/v1/auth/google`. After sign-in, the user lands on `FRONTEND_URL/auth/callback` with the refresh cookie set. Call `POST /v1/auth/refresh` to get an access token. Failures land on `FRONTEND_URL/login?error=google`.

Google accounts are linked by Google's user id in the `accounts` table. If an **unverified** password account already uses the same email, Google's proof of ownership wins: that password and its sessions are removed, so someone who registered an email they don't own can't keep access.

## Database

Schemas live in `src/database/schema/`, one file per table. Inject the typed client with `@InjectDb() private db: Database`.

```bash
# after editing a schema file
pnpm db:generate     # writes a SQL migration to ./drizzle; review and commit it
pnpm db:migrate      # applies it (dev, via drizzle-kit)
pnpm db:studio       # browse data
```

In production, `node dist/database/migrate.js` (`pnpm db:migrate:prod`) applies migrations without drizzle-kit. CI fails if a schema change has no committed migration.

## Stripe (optional)

Billing routes only exist when `STRIPE_SECRET_KEY` is set.

1. Create recurring prices in Stripe and list the allowed ones in `STRIPE_PRICE_IDS`.
2. Forward webhooks locally with `stripe listen --forward-to localhost:3000/billing/webhook`, and put the printed `whsec_…` in `STRIPE_WEBHOOK_SECRET`.
3. `POST /v1/billing/checkout { priceId }` → redirect to the returned `url`.
   `POST /v1/billing/portal` → manage or cancel the subscription.
   `GET /v1/billing/subscription` → the local mirror; gate features on `status`.

The webhook re-fetches each subscription from Stripe instead of trusting the event body, so retried or out-of-order events still end up with the latest state. When a user deletes their account, their subscriptions are cancelled immediately. If Stripe can't be reached, the deletion is refused rather than leaving a subscription that keeps charging.

## Scripts

|                                                |                                                       |
| ---------------------------------------------- | ----------------------------------------------------- |
| `pnpm start:dev`                               | Watch mode                                            |
| `pnpm test` / `pnpm test:e2e`                  | Unit / e2e (e2e needs a migrated and seeded database) |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Code quality (also run on staged files at commit)     |
| `pnpm db:*`                                    | See [Database](#database)                             |

## Deploying

### Vercel (Serverless)

This starter is configured for zero-config Vercel Serverless deployment out of the box via [`vercel.json`](vercel.json) and [`api/index.ts`](api/index.ts):

1. Import this repository in [Vercel](https://vercel.com).
2. Set Environment Variables in Project Settings:
   - `DATABASE_URL`: your Neon or Supabase connection string (include `?sslmode=require`, pooled string recommended)
   - `DATABASE_POOL_MAX`: `1` (prevents serverless functions from exhausting database connection limits)
   - `JWT_ACCESS_SECRET`: at least 32 random characters
   - `API_URL`: your Vercel deployment URL (e.g. `https://your-project.vercel.app`)
   - `FRONTEND_URL`: your frontend application URL
   - Optional: Stripe, S3, SMTP, or Google OAuth keys
3. Apply database migrations to your remote database:
   ```bash
   pnpm db:migrate:prod
   ```

### Node / VPS / PaaS

```bash
pnpm build
pnpm db:migrate:prod
pnpm start:prod
```

Behind a load balancer or reverse proxy, set `TRUST_PROXY=1` so rate limits and session IPs use the real client IP. If the frontend is on a different site, set `COOKIE_SAME_SITE=none` (HTTPS is required) and list it in `CORS_ORIGINS`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). MIT licensed.
