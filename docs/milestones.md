# Falancé Milestones

## Milestone 0 — Project Setup

Status: COMPLETE

Falancé uses Google Sheets as its initial storage implementation and Supabase as the planned future migration target. The Telegram Mini App and later financial features remain future work.

## Milestone 1 — Telegram Webhook

Status: COMPLETE

The Next.js webhook, `/start` command, environment handling, Telegram Bot API client, and error mapping are implemented. `GET /api/telegram/webhook` remains available for health checks.

## Milestone 2 — Family and Authorization Foundation

Status: COMPLETE in this implementation; production validation remains manual.

Milestone 2 uses one Google Spreadsheet per Falancé deployment. The central spreadsheet contains all families. `family_id` is the server-side tenant boundary, and no spreadsheet is created when a family registers.

The completed foundation includes Telegram identity resolution, `OWNER`, `ADMIN`, and `MEMBER` roles, the central `Families`, `Members`, `Invitations`, `Pending Family Creations`, and `Pending Confirmations` boundaries, one-time expiring family-bound invitations, server-side family isolation, service-account authentication, the Sheets-only OAuth scope, retry-safe pending family creation, per-client registry initialization caching to avoid repeated Google Sheets quota usage, redacted server-side Google diagnostics, and automated coverage for authorization, failure behavior, and initialization caching. Later milestones add `Audit Log`, `Transactions`, and `Pending Transaction Drafts` to this same central registry; they do not create a per-family spreadsheet.

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

The milestone depended on Milestone 2’s central spreadsheet, server-side `family_id` resolution, invitation validation, role model, and Google Sheets quota protection. It was completed before transaction commands were implemented.

## Milestone 4 — Transaction Foundation

Status: COMPLETE

- [x] Transactions schema with mandatory `family_id`
- [x] Transaction entity and repository interface
- [x] Google Sheets transaction repository
- [x] Income and expense records
- [x] Amount, date, ownership, and family-isolation validation
- [x] Confirmation and persistence flows

The transaction foundation persists `INCOME` and `EXPENSE` records in the central `Transactions` worksheet. The service resolves `family_id` and `created_by_member_id` from active server-side membership, rejects archived families, validates amount/date/currency/description inputs, rejects future ordinary transaction dates using `FALANCE_TIME_ZONE`, records transaction lifecycle actions in the append-only Audit Log, and lists only `ACTIVE` transactions from the requester’s family. Structured Telegram transaction management is implemented in Milestone 5, while natural-language parsing is implemented incrementally in Milestone 6.

## Milestone 5 — Manual Transaction Input

Status: COMPLETE

- [ ] Natural-language transaction commands (moved to Milestone 6)
- [x] Structured `/addincome` and `/addexpense` input
- [x] Family-scoped `/transactions` listing
- [x] Cumulative multi-currency balance summary in `/transactions`
- [x] Add, edit, void, cancel, and confirmation flows

Milestone 5 accepts structured amount, optional currency, `YYYY-MM-DD` date, and description input through Telegram. Ordinary transaction dates cannot be later than the current date in `FALANCE_TIME_ZONE`. `/transactions` shows a cumulative balance grouped by currency from active transactions, `/edittransaction` updates an active row in place, and `/voidtransaction` or `/canceltransaction` uses persisted Y/N confirmation before changing an active row to `VOID`. `family_id` and `created_by_member_id` continue to be resolved server-side by `FamilyService`; the command layer never accepts a family identifier. Natural-language parsing is implemented in Milestone 6.

## Milestone 6 — AI Text Parser

Status: COMPLETE

- [x] AI provider abstraction
- [x] Transaction extraction and deterministic validation
- [x] Category and description suggestions
- [x] Failure fallback
- [x] Interactive Telegram draft preview, approval, cancellation, and manual edit flow
- [x] Configurable business timezone and future-date validation for ordinary transactions
- [x] Transparent today-default for undated actual AI transactions with draft review label

The first Milestone 6 slice accepts natural-language text from an active Telegram member, extracts a validated transaction draft through an optional server-only OpenAI-compatible provider, persists temporary draft state with a five-minute expiry, and shows inline `Ya, simpan`, `Edit`, and `Batalkan` actions. Approval calls the same deterministic transaction service used by structured commands; Edit uses `/editdraft` and requires a second approval before persistence. If a clearly actual AI transaction omits a date, the parser uses the current business date from `FALANCE_TIME_ZONE` and labels the draft `(diasumsikan hari ini)` before approval. The draft may include a controlled category suggestion and concise description suggestion for review; these hints are not authoritative transaction fields and are cleared after manual editing. Ordinary future dates are rejected; explicit planned language is clarified rather than saved as an actual transaction. Planned transactions and recurring liabilities remain a separate future boundary and must not affect the actual balance before they occur. The AI layer never receives or controls `family_id`, `created_by_member_id`, authorization, or transaction status. Missing configuration, provider failures, invalid JSON, missing fields, future dates, planned language, and other deterministic validation failures fall back to Indonesian clarification or availability messages.

## Milestone 7 — Receipt Processing

Status: COMPLETE

Milestone 7 reuses the Milestone 6 interactive draft and deterministic service boundary. Receipt processing must accept Telegram images safely, extract transaction candidates through a server-side vision-capable provider, show a reviewable draft, and persist only after explicit user approval. The receipt parser must never determine `family_id`, member identity, authorization, or transaction status.

- [x] Telegram image handling with MIME, size, dimension, signature, and processing-limit validation
- [x] Server-side receipt extraction boundary and controlled category/description suggestions
- [x] Shared interactive draft preview, approval, edit, cancellation, and expiry
- [x] Persistence through the existing deterministic transaction service with family authorization
- [x] Tests for image validation, extraction fallback, draft preview, and existing family isolation/privacy boundaries
- [x] Production Telegram validation with a configured vision-capable provider

Production validation used OpenRouter with separate text and vision model configuration. The free provider path is suitable for limited validation, while provider rate limits and AI usage tracking remain future production-hardening concerns.

## Roadmap Prioritas Setelah Milestone 7

Urutan berikut disusun berdasarkan keputusan terakhir: Falancé harus tetap fungsional untuk satu sampai dua keluarga terlebih dahulu, production hardening harus selesai sebelum public beta, dan fitur AI usage, monetisasi, serta migrasi storage dilakukan setelah kebutuhan operasionalnya terbukti.

| Prioritas | Milestone | Fokus | Alasan urutan |
| --- | --- | --- | --- |
| P0 | Milestone 8 | Production Reliability and Security Hardening | Menutup risiko webhook, replay, konkurensi, quota, dan observability sebelum penggunaan lebih luas. |
| P1 | Milestone 9 | Reports, Multi-Channel Access, and Export | Memberikan nilai produk utama melalui Telegram, Mini App, CSV, print, dan PDF tanpa membuka spreadsheet pusat. |
| P1 | Milestone 10 | Telegram Mini App Expansion | Memperluas report surface menjadi workspace transaksi dan laporan mobile-first setelah boundary report stabil. |
| P2 | Milestone 11 | AI Usage, Quota, and Provider Reliability | Menyiapkan AI agar dapat digunakan secara terukur dan aman sebelum skala pengguna atau monetisasi. |
| P2 | Milestone 12 | Supabase Migration | Mengatasi bottleneck Google Sheets melalui migrasi repository yang kompatibel tanpa mengubah kontrak Telegram atau aturan `family_id`. |
| P3 | Milestone 13 | Monetization and Expansion | Menambahkan plan, quota komersial, onboarding, public beta, dan ekspansi setelah reliability serta storage scale-out siap. |

Milestone 8–13 di bawah ini adalah roadmap yang direncanakan, bukan pekerjaan yang sudah diimplementasikan. Setiap milestone harus mempertahankan satu deployment dengan isolasi server-side, role boundary yang sudah berlaku, soft-state untuk data penting, dan larangan membagikan Google Spreadsheet kepada pengguna.

## Milestone 8 — Production Reliability and Security Hardening

Status: IN PROGRESS — SLICE 3: in-process concurrency hardening

Milestone ini menyelesaikan risiko yang dapat menyebabkan request Telegram diproses berulang, webhook dipanggil oleh pihak yang tidak berwenang, operasi keluarga mengalami race condition, atau provider AI vision digunakan tanpa guard dasar. Tidak ada item pada milestone ini yang boleh melemahkan resolusi server-side `family_id`.

- [x] Timing log aman untuk webhook, Google Sheets, dan provider AI yang hanya aktif melalui `FALANCE_TIMING_LOGS`
- [x] Request-scoped memoization untuk membership dan family lookup tanpa mengubah authorization boundary
- [x] Reuse `GoogleSheetsClient` pada warm serverless instance agar registry initialization dan access-token cache tidak dibuat ulang untuk setiap webhook
- [x] AI response diagnostics untuk membedakan `no_content`, `invalid_json`, `schema_invalid`, `ready`, dan `needs_clarification` tanpa mencatat response content
- [x] Verifikasi `X-Telegram-Bot-Api-Secret-Token` pada webhook dengan konfigurasi server-only; deployment production wajib mengisi `FALANCE_TELEGRAM_WEBHOOK_SECRET` dan mengatur secret yang sama melalui Telegram `setWebhook`
- [x] Durable idempotensi `update_id` Telegram melalui worksheet pusat `Processed Telegram Updates`, dengan status `CLAIMED`/`COMPLETED`, duplicate suppression, dan lease lima menit untuk claim yang stale
- [x] In-process concurrency tests dan keyed locks untuk `/join`, pending confirmation, role change, member lifecycle, dan family lifecycle
- [ ] Cross-instance/Google Sheets race validation untuk `/join`, invitation, pending confirmation, dan operasi lifecycle anggota/keluarga
- [ ] Guard rate, ukuran, dan frekuensi untuk AI vision per user/family dengan fallback yang aman
- [ ] Review authorization, callback/draft ownership, input validation, dan cross-family rejection
- [ ] Monitoring operation label, error rate, latency, dan Google Sheets quota tanpa membocorkan credential atau data pengguna
- [ ] Runbook backup, recovery, partial-write retry, dan integritas data registry pusat
- [x] Regression tests untuk secret verification, duplicate suppression, stale-claim recovery, dan update ID validation
- [x] Regression tests untuk in-process race condition pada invitation join dan destructive confirmation
- [ ] Regression tests untuk cross-instance race condition, AI vision guard, dan privacy boundary lanjutan

Slice webhook authentication dan update_id idempotency sudah divalidasi end-to-end di production. Slice in-process concurrency sekarang memiliki keyed locks dan regression tests lintas dua `FamilyService` instance. Exit criterion Milestone 8 secara keseluruhan belum tercapai: concurrency lintas serverless instance/Google Sheets, AI vision guard, monitoring, quota, recovery, dan production replay testing masih terbuka.

## Milestone 9 — Reports, Multi-Channel Access, and Export

Status: PLANNED — PRIORITAS P1 setelah hardening P0

Reports must never expose the central Google Spreadsheet directly. Every report request resolves the user’s active membership and `family_id` server-side, then returns only data belonging to that family.

Report access follows this role boundary: all active roles may view reports through Telegram and the authenticated Mini App, while only `OWNER` and `ADMIN` may request or receive CSV, print, or PDF export artifacts.

- [ ] Monthly and category summaries
- [ ] Income, expense, balance, and family overview
- [ ] Date filtering and concise report commands in Telegram
- [ ] First authorized report views in the Telegram Mini App
- [ ] CSV export for authorized family data
- [ ] Print-friendly report view
- [ ] PDF export generated per authorized request
- [ ] Optional password protection selected before PDF export
- [ ] Password supplied through a secure request body or form, never a URL or log
- [ ] Password held ephemerally and never persisted in Sheets, logs, analytics, or download URLs
- [ ] Encrypted PDF validation, download expiry, and safe artifact cleanup
- [ ] Tests proving Telegram and Mini App views are available to authorized members, exports are restricted to OWNER and ADMIN, and no output can cross family boundaries

Planned transactions and recurring liabilities remain a separate forecast boundary. They must not affect actual balances before occurrence. AI insights are optional after the deterministic report core and are not a completion blocker for the first usable report release.

When password protection is selected, the backend must encrypt the PDF before delivery. The password must not be returned in the same download URL, stored with the report, or automatically echoed back to the user. The export authorization check must occur before report generation and before any artifact is created.

## Milestone 10 — Telegram Mini App Expansion

Status: PLANNED — PRIORITAS P1 setelah report surface Milestone 9 stabil

This milestone expands the first authorized report views into a broader application experience.

- [ ] Telegram authentication hardening beyond the initial report surface
- [ ] Authorized mobile-first transaction workspace
- [ ] Transactions, reports, and PWA support beyond the Milestone 9 report surface
- [ ] Pagination, filters, and interaction patterns for larger datasets
- [ ] Tests for session expiry, authorization, family isolation, and mobile interaction flows

## Milestone 11 — AI Usage, Quota, and Provider Reliability

Status: PLANNED — PRIORITAS P2 sebelum scaling AI atau monetisasi

The text parser and receipt parser continue to use separate text and vision model configuration. This milestone adds operational controls without allowing AI to determine identity, authorization, `family_id`, or transaction status.

- [ ] Server-side AI usage tracking by user and family with privacy-safe aggregation
- [ ] Configurable quotas and rate limits for text and vision workloads
- [ ] Provider timeout, retry, fallback, and degraded-mode behavior
- [ ] Cost and token observability without logging prompts, credentials, or sensitive receipt content
- [ ] Clear Indonesian user feedback for quota exhaustion and provider unavailability
- [ ] Tests proving quota isolation, provider failure safety, and no duplicate persistence
- [ ] Optional authorized AI report insights after deterministic reports are stable

## Milestone 12 — Supabase Migration

Status: PLANNED — PRIORITAS P2 setelah bottleneck Google Sheets terbukti atau sebelum scale-out

Supabase is the planned future storage implementation, not an immediate replacement. Google Sheets remains the active adapter until migration readiness is demonstrated for the current one-to-two-family operating scope.

- [ ] Supabase schema preserving mandatory `family_id` tenant boundaries and soft-state semantics
- [ ] Supabase repository implementing the existing business-facing repository contract
- [ ] Migration tooling, data validation, and reconciliation from the central registry
- [ ] Staged dual-read or shadow verification without changing Telegram authorization behavior
- [ ] Cutover, rollback, backup, and recovery procedure
- [ ] Production verification that Telegram commands, drafts, receipts, reports, and audit behavior remain compatible
- [ ] Explicit deprecation plan for Google Sheets only after migration acceptance

## Milestone 13 — Monetization and Expansion

Status: PLANNED — PRIORITAS P3 setelah Milestone 8–12 yang relevan selesai

Monetization and public expansion must not precede security hardening, usage controls, and a storage path suitable for growth.

- [ ] Family plans and entitlement model
- [ ] Monetization, billing, and subscription boundaries
- [ ] Plan-aware AI and export quotas
- [ ] Public beta onboarding, support, abuse prevention, and privacy operations
- [ ] Usage analytics and product metrics that preserve family privacy
- [ ] Expansion readiness across additional families and deployments

## Backlog Eksperimen Non-Commitment

Gemini Canvas Workflow dikeluarkan dari numbered milestone karena tidak merupakan dependency produk Falancé dan tidak boleh menggeser P0 production hardening, report delivery, AI reliability, atau Supabase migration. Eksperimen Canvas dapat dicatat terpisah bila ada kebutuhan produk yang jelas.