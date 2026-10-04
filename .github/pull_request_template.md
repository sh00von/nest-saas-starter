## What and why

<!-- What does this change, and what problem does it solve? Link issues: Closes #123 -->

## How it was tested

<!-- New/updated tests, manual steps. -->

## Checklist

- [ ] `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` pass
- [ ] Schema changes include a committed migration (`pnpm db:generate`)
- [ ] New env vars are validated in `src/config/env.ts` and documented in `.env.example`
- [ ] README updated if behaviour or setup changed
