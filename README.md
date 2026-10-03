# Nest Starter

A production-minded NestJS 12 starter you can clone and build on:

- **Auth**: email + password (argon2), short-lived JWT access tokens, rotating refresh tokens with reuse detection, per-device sessions, roles
- **Database**: Drizzle ORM on PostgreSQL (local Docker, Neon, Supabase, RDS…) with committed SQL migrations
- **Billing**: Stripe Checkout, Customer Portal and a signature-verified webhook that mirrors subscriptions locally (optional)
- **API docs**: OpenAPI generated from your DTOs, rendered with [Scalar](https://scalar.com) at `/docs`
- **Hardening**: env validation (zod), global validation pipe, rate limiting, helmet, CORS, graceful shutdown
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

**Pick a Postgres.** The app only needs a `DATABASE_URL`:

| Option                               | Setup                                                                                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:local`                      | Nothing to install. Runs [PGlite](https://pglite.dev) (Postgres compiled to WASM) on port 5432, data in `./.pglite`. Matches the default `DATABASE_URL`. Great for development; not for production. |
| [Neon](https://neon.tech) / Supabase | Free hosted Postgres. Paste the connection string into `DATABASE_URL`.                                                                                                                              |
| `docker compose up -d`               | Real Postgres 17 in Docker; set `DATABASE_URL=postgres://postgres:postgres@localhost:5432/nest_starter`.                                                                                            |

Open <http://localhost:3000/docs> for the API reference. The raw spec is at `/openapi.json`, which you can feed to a client generator.

## How auth works

| Token                     | Lifetime                                    | Where it lives                                     |
| ------------------------- | ------------------------------------------- | -------------------------------------------------- |
| Access token (JWT, HS256) | `JWT_ACCESS_TTL_SECONDS` (15 min)           | Client memory → `Authorization: Bearer …`          |
| Refresh token (opaque)    | `REFRESH_TOKEN_TTL_DAYS` (30 days, sliding) | httpOnly cookie `refresh_token`, scoped to `/auth` |

- Every login creates a row in `sessions`. The refresh token is `<sessionId>.<secret>`, and only a SHA-256 hash of the secret is stored.
- `POST /auth/refresh` swaps the secret in one conditional `UPDATE`. If someone presents an **old** secret (a stolen token being replayed), the whole session is revoked, so the attacker and the victim are both signed out and the victim has to log in again.
- **Browsers** get the refresh token only as a cookie, so page JavaScript can never read it. **Mobile/CLI clients** send `x-token-transport: body` to receive it in the JSON response and send it back as `{ "refreshToken": "…" }`.
- Every route needs a token by default. Opt out with `@Public()`, and restrict with `@Roles('admin')`. Read the caller with `@CurrentUser()`.
- Access tokens are stateless: after logout, an issued access token keeps working until it expires. Keep the TTL short.

| Endpoint                                          |                                       |
| ------------------------------------------------- | ------------------------------------- |
| `POST /auth/register`, `POST /auth/login`         | Start a session (rate limited: 5/min) |
| `POST /auth/refresh`                              | Rotate tokens                         |
| `POST /auth/logout`, `POST /auth/logout-all`      | End this / every session              |
| `POST /auth/change-password`                      | Signs out every other session         |
| `GET /auth/sessions`, `DELETE /auth/sessions/:id` | Manage devices                        |
| `GET/PATCH /users/me`                             | Profile                               |
| `GET /users`, `GET /users/:id`                    | Admin only                            |

## Database

Schemas live in `src/database/schema/`. Inject the typed client with `@InjectDb() private db: Database`.

```bash
# after editing a schema file
pnpm db:generate     # writes a SQL migration to ./drizzle — review and commit it
pnpm db:migrate      # applies it (dev, via drizzle-kit)
pnpm db:studio       # browse data
```

In production, `node dist/database/migrate.js` (`pnpm db:migrate:prod`) applies migrations without needing drizzle-kit. The Docker image runs it on start. CI fails if a schema change has no committed migration.

## Stripe (optional)

Billing routes only exist when `STRIPE_SECRET_KEY` is set.

1. Create recurring prices in Stripe and list the allowed ones in `STRIPE_PRICE_IDS`.
2. Forward webhooks locally:
   ```bash
   stripe listen --forward-to localhost:3000/billing/webhook
   ```
   Put the printed `whsec_…` in `STRIPE_WEBHOOK_SECRET`.
3. `POST /billing/checkout { priceId }` → redirect to the returned `url`.
   `POST /billing/portal` → manage or cancel the subscription.
   `GET /billing/subscription` → the local mirror; gate features on `status`.

The webhook re-fetches each subscription from Stripe instead of trusting the event body, so retried or out-of-order events still end up with the latest state.

## Project layout

```
src/
  auth/        controller, service, token service, guards, DTOs
  users/       profile + admin endpoints
  billing/     Stripe checkout, portal, webhook
  database/    Drizzle module, schema/, migrate.ts, seed.ts
  health/      /health (liveness), /health/ready (DB check)
  common/      @Public, @Roles, @CurrentUser
  config/      env schema
  setup-app.ts global middleware + docs (shared by main.ts and e2e tests)
drizzle/       generated SQL migrations
```

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

Behind a load balancer, set `TRUST_PROXY=1` so rate limits and session IPs use the real client IP. If the frontend is on a different site, set `COOKIE_SAME_SITE=none` (HTTPS is required).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). MIT licensed.
