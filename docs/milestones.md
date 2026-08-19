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

The completed foundation includes Telegram identity resolution, `OWNER`, `ADMIN`, and `MEMBER` roles, central `Families`, `Members`, `Invitations`, `Pending Family Creations`, and `Settings` sheets, one-time expiring family-bound invitations, server-side family isolation, service-account authentication, the Sheets-only OAuth scope, retry-safe pending family creation, per-client registry initialization caching to avoid repeated Google Sheets quota usage, redacted server-side Google diagnostics, and automated coverage for authorization, failure behavior, and initialization caching.

The following are explicitly outside this milestone: member listing and administration, role promotion or demotion, member removal, invitation revocation, family renaming, family archival or deactivation, transactions, receipt OCR, AI categorization, AI summaries, budgets, dashboards, Mini App functionality, payment, subscriptions, and Supabase implementation.

Remaining manual validation consists of granting the service account access to the existing central spreadsheet, setting the required environment variables, deploying the webhook, and exercising family creation and invitation flows against the production spreadsheet. The smoke test must confirm that `/createfamily` creates an `ACTIVE` family row, an OWNER membership row, and a `COMPLETED` pending row without a `429 RESOURCE_EXHAUSTED` error. If a partial write is observed, the redacted operation log and the idempotent retry behavior should be used for recovery before continuing to Milestone 3.

## Milestone 3 — Family Management and Administration

Status: IN PROGRESS

This milestone turns the Milestone 2 membership and invitation foundation into a usable administrative system. It must be completed before transaction features depend on stable member lifecycle and role-management rules.

- [x] Authorized `/members` command or equivalent member-listing flow
- [x] Owner-controlled promotion and demotion between `MEMBER` and `ADMIN`
- [x] Safe member removal or deactivation with server-side family authorization
- [x] Owner/admin revocation of pending invitations
- [ ] Owner-controlled family-name update
- [ ] Safe family archival or deactivation rather than irreversible hard deletion
- [ ] Explicit confirmation for destructive or privilege-changing operations
- [ ] Invariants preventing removal of the last OWNER or unauthorized cross-family changes
- [ ] Audit fields or an audit-log boundary for administrative changes
- [ ] Tests for role permissions, member lifecycle, invitation revocation, family lifecycle, and cross-family rejection

Role management is implemented through `/changerole <member_id_or_username> <ADMIN|MEMBER>`. Safe member deactivation is implemented through `/deactivate <member_id_or_username> CONFIRM`, which changes an active non-OWNER member to `SUSPENDED` without hard deletion. The service resolves the actor’s active family server-side, permits only the OWNER to change roles or deactivate members, rejects OWNER and cross-family targets, and requires explicit confirmation for deactivation. Family renaming, archival, broader destructive-operation confirmation, and administrative audit fields remain outstanding.

Permanent hard deletion of a family and irreversible deletion of financial history are intentionally excluded until retention, backup, recovery, and ownership-transfer rules are defined. Those operations may require a later production-hardening decision.

The milestone depends on Milestone 2’s central spreadsheet, server-side `family_id` resolution, invitation validation, role model, and Google Sheets quota protection. It must be complete before transaction commands are implemented.

## Milestone 4 — Transaction Foundation

- [ ] Transactions schema with mandatory `family_id`
- [ ] Transaction entity and repository interface
- [ ] Google Sheets transaction repository
- [ ] Income and expense records
- [ ] Amount, date, ownership, and family-isolation validation
- [ ] Confirmation and persistence flows

## Milestone 5 — Manual Transaction Input

- [ ] Natural Telegram text commands
- [ ] Structured transaction input
- [ ] Add, edit, delete, cancel, and confirmation flows

## Milestone 6 — AI Text Parser

- [ ] AI provider abstraction
- [ ] Transaction extraction and validation
- [ ] Category and description suggestions
- [ ] Failure fallback

## Milestone 7 — Receipt Processing

- [ ] Telegram image handling
- [ ] Receipt extraction and confirmation
- [ ] Persistence with family authorization

## Milestone 8 — Reports, Multi-Channel Access, Export, and AI Analysis

Status: PLANNED

Reports must never expose the central Google Spreadsheet directly. Every report request resolves the user’s active membership and `family_id` server-side, then returns only data belonging to that family.

Report access follows this role boundary: `OWNER` and `ADMIN` may view reports and request CSV, print, or PDF exports; `MEMBER` may view reports through Telegram and the authenticated Mini App but may not request or receive export artifacts.

- [ ] Monthly and category summaries
- [ ] Income, expense, balance, and family overview
- [ ] Date filtering and authorized AI insights
- [ ] Concise report and summary commands in Telegram
- [ ] Report views in the authorized Telegram Mini App
- [ ] CSV export for authorized family data
- [ ] Print-friendly report view
- [ ] PDF export generated per authorized request
- [ ] Optional password protection selected before PDF export
- [ ] Password supplied through a secure request body or form, never a URL or log
- [ ] Password held ephemerally and never persisted in Sheets, logs, analytics, or download URLs
- [ ] Encrypted PDF validation, download expiry, and safe artifact cleanup
- [ ] Tests proving Telegram and Mini App views are available to authorized members, exports are restricted to OWNER and ADMIN, and no output can cross family boundaries

When password protection is selected, the backend must encrypt the PDF before delivery. The password must not be returned in the same download URL, stored with the report, or automatically echoed back to the user. The default unprotected PDF option remains available only after the user explicitly chooses it. The export authorization check must occur before report generation and before any artifact is created.

## Milestone 9 — Telegram Mini App Expansion

Milestone 8 includes the first authorized Mini App report views. This milestone expands the Mini App into a broader application experience.

- [ ] Telegram authentication hardening
- [ ] Authorized mobile-first transaction workspace
- [ ] Transactions, reports, and PWA support beyond the Milestone 8 report surface
- [ ] Pagination, filters, and interaction patterns for larger datasets

## Milestone 10 — Gemini Canvas Workflow

- [ ] Canvas experimentation and documentation
- [ ] Evaluation of production suitability

## Milestone 11 — Production Hardening

- [ ] Security and authorization review
- [ ] Input validation, rate limiting, logging, monitoring, backups, and recovery
- [ ] Google Sheets quota and data-integrity review

## Milestone 12 — Supabase Migration

- [ ] Supabase schema and repository
- [ ] Migration tooling, data migration, verification, and cutover
