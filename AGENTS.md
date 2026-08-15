<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Falance Project — Agent Instructions

## Project Overview

Falance is a Telegram-based personal finance tracking application.

The project should prioritize:

- simplicity
- reliability
- low operating cost
- mobile-first usage
- maintainable architecture
- clear separation of concerns

## Technology Stack

- Next.js
- TypeScript
- Supabase
- PostgreSQL
- Telegram Bot API
- Vercel
- pnpm

## Important Rules

Before modifying the codebase:

1. Read the relevant documentation in `docs/`.
2. Inspect the existing implementation before creating new abstractions.
3. Do not introduce a new library when an existing dependency can solve the problem.
4. Do not rewrite working code unnecessarily.
5. Keep changes small and focused.
6. Preserve existing behavior unless the task explicitly requires changing it.

## Project Documentation

Use these documents as the project source of truth:

- `docs/architecture.md` — system architecture
- `docs/database.md` — database schema and data rules
- `docs/telegram.md` — Telegram bot behavior
- `docs/milestones.md` — development roadmap
- `docs/decisions.md` — architectural decisions

When implementation conflicts with documentation:

1. Identify the conflict.
2. Explain the conflict.
3. Update the documentation if the new implementation is intentional.

## Database Rules

- Supabase/PostgreSQL is the source of truth for persistent application data.
- Never modify the database schema without checking `docs/database.md`.
- Prefer migrations over manual database changes.
- Never expose service-role credentials to the client.
- Respect Row Level Security.

## Telegram Bot Rules

All Telegram-specific behavior must follow:

`docs/telegram.md`

Do not duplicate Telegram business logic across multiple routes or services.

## Security

Never commit:

- API keys
- Telegram bot tokens
- Supabase service-role keys
- passwords
- private credentials
- `.env` files containing secrets

Use environment variables for secrets.

## Code Quality

Prefer:

- TypeScript
- small functions
- explicit types
- reusable utilities
- server-side operations for sensitive logic
- simple solutions over unnecessary abstraction

Avoid:

- `any` unless genuinely necessary
- premature optimization
- unnecessary dependencies
- duplicated business logic
- giant components
- mixing database logic with UI components

## Agent Workflow

Before implementing a feature:

1. Understand the request.
2. Inspect the relevant files.
3. Read relevant documentation.
4. Determine the smallest appropriate change.
5. Implement the change.
6. Run relevant checks/tests.
7. Report what changed and any remaining issues.

## Documentation Updates

If a change affects:

- architecture
- database schema
- Telegram behavior
- project milestones
- important technical decisions

update the appropriate file in `docs/`.

## Git

Keep commits focused and meaningful.

Do not revert unrelated user changes.

Do not modify files unrelated to the current task unless required.

---

## Current Development Priorities

Refer to:

`docs/milestones.md`

The agent should prioritize the current milestone rather than implementing speculative future features.