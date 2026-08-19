# Falancé Milestones

## Milestone 0 — Project Setup

Status: IN PROGRESS

Falancé uses Google Sheets as its initial storage implementation and Supabase as the planned future migration target. The Telegram Mini App and later financial features remain future work.

## Milestone 1 — Telegram Webhook

Status: COMPLETE

The Next.js webhook, `/start` command, environment handling, Telegram Bot API client, and error mapping are implemented. `GET /api/telegram/webhook` remains available for health checks.

## Milestone 2 — Family and Authorization Foundation

Status: COMPLETE in this implementation; production validation remains manual.

Milestone 2 uses one Google Spreadsheet per Falancé deployment. The central spreadsheet contains all families. `family_id` is the server-side tenant boundary, and no spreadsheet is created when a family registers.

The completed foundation includes Telegram identity resolution, `OWNER`, `ADMIN`, and `MEMBER` roles, central `Families`, `Members`, `Invitations`, `Pending Family Creations`, and `Settings` sheets, one-time expiring family-bound invitations, server-side family isolation, service-account authentication, the Sheets-only OAuth scope, retry-safe pending family creation, and automated coverage for authorization and failure behavior.

The following are explicitly outside this milestone: transactions, receipt OCR, AI categorization, AI summaries, budgets, dashboards, Mini App functionality, payment, subscriptions, and Supabase implementation.

Remaining manual validation consists of granting the service account access to the existing central spreadsheet, setting the required environment variables, deploying the webhook, and exercising family creation and invitation flows against the production spreadsheet.

## Milestone 3 — Transaction Foundation

- [ ] Transactions schema with mandatory `family_id`
- [ ] Transaction entity and repository interface
- [ ] Google Sheets transaction repository
- [ ] Income and expense records
- [ ] Amount, date, ownership, and family-isolation validation
- [ ] Confirmation and persistence flows

## Milestone 4 — Manual Transaction Input

- [ ] Natural Telegram text commands
- [ ] Structured transaction input
- [ ] Add, edit, delete, cancel, and confirmation flows

## Milestone 5 — AI Text Parser

- [ ] AI provider abstraction
- [ ] Transaction extraction and validation
- [ ] Category and description suggestions
- [ ] Failure fallback

## Milestone 6 — Receipt Processing

- [ ] Telegram image handling
- [ ] Receipt extraction and confirmation
- [ ] Persistence with family authorization

## Milestone 7 — Reports and AI Analysis

- [ ] Monthly and category summaries
- [ ] Income, expense, balance, and family overview
- [ ] Date filtering and authorized AI insights

## Milestone 8 — Telegram Mini App

- [ ] Telegram authentication
- [ ] Authorized mobile-first dashboard
- [ ] Transactions, reports, and PWA support

## Milestone 9 — Gemini Canvas Workflow

- [ ] Canvas experimentation and documentation
- [ ] Evaluation of production suitability

## Milestone 10 — Production Hardening

- [ ] Security and authorization review
- [ ] Input validation, rate limiting, logging, monitoring, backups, and recovery
- [ ] Google Sheets quota and data-integrity review

## Milestone 11 — Supabase Migration

- [ ] Supabase schema and repository
- [ ] Migration tooling, data migration, verification, and cutover
