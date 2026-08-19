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

The completed foundation includes Telegram identity resolution, `OWNER`, `ADMIN`, and `MEMBER` roles, central `Families`, `Members`, `Invitations`, `Pending Family Creations`, `Pending Confirmations`, `Audit Log`, and `Transactions` sheets, one-time expiring family-bound invitations, server-side family isolation, service-account authentication, the Sheets-only OAuth scope, retry-safe pending family creation, per-client registry initialization caching to avoid repeated Google Sheets quota usage, redacted server-side
 Google diagnostics, and automated coverage for authorization, failure behavior, and initialization caching.

The following are explicitly outside this milestone: member listing and administration, role promotion or demotion, member removal, invitation revocation, family renaming, family archival or deactivation, transaction commands, receipt OCR, AI categorization, AI summaries, budgets, dashboards, Mini App functionality, payment, subscriptions, and Supabase implementation.

Remaining manual validation consists of granting the service account access to the existing central spreadsheet, setting the required environment variables, deploying the webhook, and exercising family creation and invitation flows against the production spreadsheet. The smoke test must confirm that `/createfamily` creates an `ACTIVE` family row, an OWNER membership row, and a `COMPLETED` pending row without a `429 RESOURCE_EXHAUSTED` error. If a partial write is observed, the redacted operation log and the idempotent retry behavior should be used for recovery before continuing to Milestone 3.

## Milestone 3 — Family Management and Administration

Status: COMPLETE

This milestone turns the Milestone 2 membership and invitation foundation into a usable administrative system. It must be completed before transaction features depend on stable member lifecycle and role-management rules.

- [x] Authorized `/members` command or equivalent member-listing flow
- [x] Owner-controlled promotion and demotion between `MEMBER` and `ADMIN`
- [x] Safe member removal or deactivation with server-side family authorization
- [x] Owner/admin revocation of pending invitations
- [x] Owner-controlled family-name update
- [x] Safe family archival or deactivation rather than irreversible hard deletion
- [x] Interactive Y/N confirmation for destructive operations
- [x] Invariants preventing removal or demotion of the last OWNER and unauthorized cross-family changes
- [x] Audit fields and an append-only audit-log boundary for administrative changes
- [x] Tests for role permissions, member lifecycle, invitation revocation, family lifecycle, audit privacy, and cross-family rejection

Role management is implemented through `/changerole <member_id_or_username> <ADMIN|MEMBER>`. Safe member deactivation is implemented through `/deactivate <member_id_or_username>`, which creates a five-minute pending confirmation; `Y` changes an active non-OWNER member to `SUSPENDED` without hard deletion and `N` cancels. Reactivation is implemented through `/reactivate <member_id_or_username> CONFIRM`, which restores the existing `SUSPENDED` row to `ACTIVE` without generating a new `member_id`. Family-name updates are implemented through `/renamefamily <nama_baru>`, available only to OWNER with service-side normalization and validation. Family archival is implemented through `/archivefamily`, which creates the same Y/N confirmation before changing family status to `SUSPENDED` without deleting rows or data; `/reactivatefamily CONFIRM` restores the family to `ACTIVE`. Destructive invitation revocation also uses the pending Y/N confirmation flow. The service resolves the actor’s active family or original OWNER membership server-side, preserves family isolation, prevents duplicate active membership, expires pending confirmations after five minutes, blocks normal family operations while archived, rejects any role or lifecycle operation that would leave a family without an active OWNER, and appends successful administrative state changes to the privacy-preserving `Audit Log` boundary. Failed or rejected actions are not recorded as successful audit events.


Permanent hard deletion of a family and irreversible deletion of financial history are intentionally excluded until retention, backup, recovery, and ownership-transfer rules are defined. Those operations may require a later production-hardening decision.

The milestone depends on Milestone 2’s central spreadsheet, server-side `family_id` resolution, invitation validation, role model, and Google Sheets quota protection. It must be complete before transaction commands are implemented.

## Milestone 4 — Transaction Foundation

Status: IN PROGRESS

- [x] Transactions schema with mandatory `family_id`
- [x] Transaction entity and repository interface
- [x] Google Sheets transaction repository
- [x] Income and expense records
- [x] Amount, date, ownership, and family-isolation validation
- [x] Confirmation and persistence flows

The transaction foundation persists `INCOME` and `EXPENSE` records in the central `Transactions` worksheet. The service resolves `family_id` and `created_by_member_id` from active server-side membership, rejects archived families, validates amount/date/currency/description inputs, records transaction lifecycle actions in the append-only Audit Log, and lists only `ACTIVE` transactions from the requester’s family. Structured Telegram transaction management is implemented in Milestone 5; natural-language parsing remains planned for Milestone 6.

## Milestone 5 — Manual Transaction Input

Status: COMPLETE

- [ ] Natural-language transaction commands (moved to Milestone 6)
- [x] Structured `/addincome` and `/addexpense` input
- [x] Family-scoped `/transactions` listing
- [x] Cumulative multi-currency balance summary in `/transactions`
- [x] Add, edit, delete, cancel, and confirmation flows

Milestone 5 now accepts structured amount, optional currency, `YYYY-MM-DD` date, and description input through Telegram. `/transactions` shows a cumulative balance grouped by currency from active transactions, `/edittransaction` updates an active row in place, and `/voidtransaction` or `/canceltransaction` uses persisted Y/N confirmation before changing an active row to `VOID`. `family_id` and `created_by_member_id` continue to be resolved server-side by `FamilyService`; the command layer never accepts a family identifier. Natural-language parsing remains planned for Milestone 6.

## Milestone 6 — AI Text Parser

Status: IN PROGRESS

- [x] AI provider abstraction
- [x] Transaction extraction and deterministic validation
- [ ] Category and description suggestions
- [x] Failure fallback
- [x] Interactive Telegram draft preview, approval, cancellation, and manual edit flow

The first Milestone 6 slice accepts natural-language text from an active Telegram member, extracts a validated transaction draft through an optional server-only OpenAI-compatible provider, persists temporary draft state with a five-minute expiry, and shows inline `Ya`, `Edit`, and `Batalkan` actions. Approval calls the same deterministic transaction service used by structured commands; Edit uses `/editdraft` and requires a second approval before persistence. The AI layer never receives or controls `family_id`, `created_by_member_id`, authorization, or transaction status. Missing configuration, provider failures, invalid JSON, missing fields, and deterministic validation failures fall back to Indonesian clarification or availability messages.

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
