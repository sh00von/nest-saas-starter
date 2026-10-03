# Contributing

Thanks for helping out!

1. Fork and create a branch from `main`.
2. `pnpm install`, `cp .env.example .env`, start Postgres (`pnpm db:local`, or see the README), then `pnpm db:migrate`.
3. Make your change. If you touch a schema, run `pnpm db:generate` and commit the migration.
4. Before pushing, make sure these all pass (CI runs the same):
   ```bash
   pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
   ```
5. Open a PR describing **what** changed and **why**. Keep PRs focused, one feature or fix each.

## Guidelines

- Keep the starter small. Features that not every app needs should be optional modules (like `billing/`), enabled by configuration.
- Add or update tests for behavior changes. Auth and billing changes need e2e coverage.
- Security issues: please open a private security advisory on GitHub instead of a public issue.
