# Falancé Milestones

## Milestone 0 — Project Setup

Status: COMPLETE

Falancé uses Google Sheets as its initial storage implementation and Supabase as the planned future migration target. The Telegram Mini App read-only report surface is implemented in Milestone 9 Slice 2; broader Mini App workspace features and later financial features remain future work.

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

Status: OPERATIONALLY READY — DEFERRED PRE-PUBLIC-BETA VALIDATION

Milestone ini menyelesaikan risiko yang dapat menyebabkan request Telegram diproses berulang, webhook dipanggil oleh pihak yang tidak berwenang, operasi keluarga mengalami race condition, atau provider AI vision digunakan tanpa guard dasar. Tidak ada item pada milestone ini yang boleh melemahkan resolusi server-side `family_id`.

- [x] Timing log aman untuk webhook, Google Sheets, dan provider AI yang hanya aktif melalui `FALANCE_TIMING_LOGS`
- [x] Request-scoped memoization untuk membership dan family lookup tanpa mengubah authorization boundary
- [x] Reuse `GoogleSheetsClient` pada warm serverless instance agar registry initialization dan access-token cache tidak dibuat ulang untuk setiap webhook
- [x] AI response diagnostics untuk membedakan `no_content`, `invalid_json`, `schema_invalid`, `ready`, dan `needs_clarification` tanpa mencatat response content
- [x] Verifikasi `X-Telegram-Bot-Api-Secret-Token` pada webhook dengan konfigurasi server-only; deployment production wajib mengisi `FALANCE_TELEGRAM_WEBHOOK_SECRET` dan mengatur secret yang sama melalui Telegram `setWebhook`
- [x] Durable idempotensi `update_id` Telegram melalui worksheet pusat `Processed Telegram Updates`, dengan status `CLAIMED`/`COMPLETED`, duplicate suppression, dan lease lima menit untuk claim yang stale
- [x] In-process concurrency tests dan keyed locks untuk `/join`, pending confirmation, role change, member lifecycle, dan family lifecycle
- [ ] Cross-instance/Google Sheets race validation untuk `/join`, invitation, pending confirmation, dan operasi lifecycle anggota/keluarga — **ditunda sampai tersedia dua akun Telegram uji; wajib sebelum public beta**
- [x] Guard cooldown, rolling-window quota, in-flight lease, dan fallback aman untuk AI vision per active user/family dengan state durable pada worksheet pusat `AI Vision Usage`
- [x] Review authorization, callback/draft ownership, input validation, dan cross-family rejection
- [x] Durable draft approval claim pada worksheet pusat `Draft Approval Claims`, dengan deterministic transaction ID, completion recovery, lease 60 detik, dan keyed lock draft lifecycle
- [x] Monitoring operation label, error rate, latency, dan Google Sheets quota tanpa membocorkan credential atau data pengguna
- [x] Runbook backup, recovery, partial-write retry, dan integritas data registry pusat
- [x] Regression tests untuk secret verification, duplicate suppression, stale-claim recovery, dan update ID validation
- [x] Regression tests untuk in-process race condition pada invitation join dan destructive confirmation
- [x] Regression tests untuk AI vision guard pada Telegram photo boundary dan registry schema
- [x] Regression tests untuk durable draft approval claim, parallel suppression, stale lease recovery, dan completed-claim recovery
- [x] Regression tests untuk partial-write recovery dan privacy-safe registry integrity report
- [ ] Regression tests untuk cross-instance race condition dan privacy boundary lanjutan — **wajib sebelum public beta**

Slice webhook authentication dan update_id idempotency sudah divalidasi end-to-end di production. Slice in-process concurrency sekarang memiliki keyed locks dan regression tests lintas dua `FamilyService` instance. Review authorization/privacy untuk callback ownership dan draft ownership telah selesai, dan durable draft approval claim sekarang menyimpan `CLAIMED`/`COMPLETED` state, lease 60 detik, serta deterministic `transaction_id` untuk recovery tanpa membuat transaction baru. Monitoring operation label, error-rate, latency, dan Google Sheets 429 quota signal sekarang tersedia melalui timing logs yang privacy-safe dan terdokumentasi pada `docs/monitoring.md`. Partial-write recovery untuk `/createfamily` dan `/join` kini memiliki retry semantics yang eksplisit, dan `npm run check:registry` memeriksa header, duplicate key, enum, foreign reference, active OWNER, serta consistency transaction/claim tanpa mencetak row values. Prosedur backup, restoration, dan recovery terdokumentasi pada `docs/backup-recovery.md`. Karena Google Sheets tidak menyediakan compare-and-swap, claim worksheet ini belum menjadi jaminan atomic cross-instance uniqueness; validasi race lintas instance dan keputusan storage primitive dengan conditional write tetap terbuka. Pengujian production dengan dua user berbeda yang berebut invitation ditunda karena belum tersedia dua akun Telegram uji; pengujian ini harus diulang sebelum public beta. AI vision guard sekarang memiliki cooldown 30 detik, maksimum 5 claim per rolling window 1 jam, dan lease in-flight 60 detik secara default; seluruh nilai dapat dikonfigurasi melalui environment server-only. Milestone 8 sekarang **operationally ready untuk pengujian satu sampai dua keluarga** setelah production registry integrity check menghasilkan `healthy: true` dan `issues: []`. Dua exit item tetap ditunda dan wajib diselesaikan sebelum public beta: validasi race lintas serverless instance dengan dua akun Telegram berbeda serta production replay testing setelah recovery. Google Sheets tetap belum menyediakan compare-and-swap atau unique conditional write; keputusan storage primitive dengan conditional write tetap berada pada backlog hardening/scale-out.

## Milestone 9 — Reports, Multi-Channel Access, and Export

Status: COMPLETE — operationally validated; category analytics continued in M10 Slice 11

Reports must never expose the central Google Spreadsheet directly. Every report request resolves the user’s active membership and `family_id` server-side, then returns only data belonging to that family. Slice 1 menyediakan `/report` untuk bulan berjalan atau periode `YYYY-MM`, dengan agregasi multi-currency, income, expense, saldo, transaction count, dan exclusion untuk `VOID` atau transaksi di luar periode. Slice 2 menambahkan Mini App terautentikasi dengan filter bulan atau rentang tanggal maksimal 366 hari dan detail transaksi maksimal 50 row. Slice 3 menambahkan CSV export family-scoped yang tidak dibatasi 50 row dan hanya dapat diminta oleh `OWNER` atau `ADMIN`. Slice 4 menambahkan print-friendly HTML report dengan authorization yang sama. Slice 5 menambahkan server-side PDF export berbasis PDFKit, optional password protection dengan PDF version 1.7ext3, password ephemeral, dan direct streaming tanpa persistent artifact. Setelah production WebView testing, delivery CSV/PDF menggunakan encrypted short-lived HTTPS action URL melalui `Telegram.WebApp.downloadFile()` dan print menggunakan `Telegram.WebApp.openLink()`, dengan authorization ulang pada GET download route.

Report access follows this role boundary: all active roles may view reports through Telegram and the authenticated Mini App, while only `OWNER` and `ADMIN` may request or receive CSV, print, or PDF export artifacts.

- [x] Category schema and deterministic summary contract moved to M10 Slice 9; read-only Dashboard visualization continues in M10 Slice 11. `categorySuggestion` AI remains non-authoritative.
- [x] Income, expense, balance, and family overview
- [x] Date filtering and concise report commands in Telegram
- [x] Read-only Telegram reports sebagai slice pertama sebelum Mini App dan export
- [x] Mini App auth/API/UI implementation dengan validated Telegram `initData` dan family-scoped report response
- [x] Mini App date-range filter maksimal 366 hari dan bounded transaction detail list maksimal 50 row
- [x] Role-safe CSV export untuk `OWNER` dan `ADMIN`, dengan unbounded transaction detail list dan server-side CSV safeguards
- [x] Print-friendly report view untuk `OWNER` dan `ADMIN`, dengan HTML escaping dan browser print stylesheet
- [x] PDF export generated server-side per authorized request, dengan optional server-side PDF password
- [x] Regression tests untuk report family isolation, role permission, date filters, CSV serialization, print HTML escaping, PDF encryption, signed action URL, GET download authorization, dan WebView delivery
- [x] First authorized report views in the Telegram Mini App
- [x] CSV export for authorized family data
- [x] PDF export generated per authorized request
- [x] Optional password protection selected before PDF export
- [x] Password supplied over HTTPS to a prepare endpoint; plaintext tidak dimasukkan ke URL atau log
- [x] Password held ephemerally dan encrypted di dalam short-lived token; tidak dipersist pada Sheets, logs, atau analytics
- [x] Encrypted PDF validation; download expiry dan artifact cleanup belum relevan karena PDF tidak dipersist sebagai artifact
- [x] Tests proving Telegram and Mini App views are available to authorized members, exports are restricted to OWNER and ADMIN, dan no output can cross family boundaries
- [x] Production operational validation oleh OWNER untuk CSV, print, PDF tanpa password, dan PDF dengan password

Planned transactions and recurring liabilities remain a separate forecast boundary. They must not affect actual balances before occurrence. AI insights are optional after the deterministic report core and are not a completion blocker for the first usable report release.

When password protection is selected, the backend must encrypt the PDF before delivery. The password must not be returned in the same download URL, stored with the report, or automatically echoed back to the user. The export authorization check must occur before report generation and before any artifact is created.

## Milestone 10 — Telegram Mini App Expansion

Status: IN PROGRESS — SLICES 1–12 IMPLEMENTED LOCALLY; SLICES 9–11 PRODUCTION VALIDATED

This milestone expands the first authorized report view into a family-finance workspace while preserving the existing server-side authorization boundary. The Mini App is mobile-first but not mobile-only: the same component and domain-data system should adapt to Telegram phone, tablet, desktop, and ordinary browser fallback contexts.

The target experience is **open → understand the family’s financial condition → record a transaction → finish**. The visual direction follows the Falancé logo rather than the black logo background: warm brand green as the primary color, lavender-purple as a restrained identity accent, coral as a controlled expense/attention accent, off-white application background, white cards, soft shadows, accessible contrast, generous whitespace, and one-handed mobile interaction.

Every family selector or family context control must remain server-authorized. The browser must never provide `family_id` as an authorization input. A Mini App write must validate raw Telegram `initData`, resolve the active membership and family on the server, enforce the role boundary, and call `FamilyService`; the UI must never write directly to Google Sheets.

### Mini App screen and slice roadmap

| Slice | Scope | Boundary | Status |
| --- | --- | --- | --- |
| 1 | Read-only Dashboard summary using the authoritative report payload: family name, viewer role, selected period, transaction count, and per-currency balance cards | Existing report API; no client-selected family and no write path | Complete |
| 2 | App shell, Falancé brand tokens, responsive layout, bottom navigation (`Beranda`, `Transaksi`, `+`, `Laporan`, `Akun`), and loading/empty/error states | UI and navigation only; no new persistence | Complete; production validated |
| 3 | Read-only Transaksi workspace with income/expense/all filters, period navigation, transaction list, and transaction detail | Existing family-scoped report/service reads; bounded initial list with a later pagination boundary | Complete; production validated |
| 4 | Dedicated Laporan screen with summary, period comparison where data is available, and progressive disclosure for OWNER/ADMIN exports | Existing report and export authorization; MEMBER remains view-only | Complete; production validated |
| 5 | Read-only Akun & Keluarga screen with profile context, optional Telegram avatar viewer, family name, role, active members, and permission-aware presentation | Existing family service reads plus validated `photo_url` from viewer `initData`; administrative mutations remain server-side | Complete; production validated |
| 6 | Minimal Tambah Transaksi flow for `INCOME`/`EXPENSE`, amount, currency, date, and description | New Mini App write endpoint using validated `initData` and `FamilyService`; no category/payment method, no client-controlled family ID, and no automatic retry | Implemented locally; production validation pending |
| 7 | Transaction detail/edit and soft-void interactions with explicit confirmation semantics | `PATCH` edit endpoint plus request-confirm-cancel endpoint using `PendingConfirmation`; no hard deletion and no client-controlled family ID | Implemented locally; validation pending |
| 8 | Family administration actions from the Account screen: create invitation, rename family, change MEMBER/ADMIN role, and deactivate active members | Existing service authorization, role checks, audit, Y/N confirmation for deactivation, and last-OWNER invariant; no client-controlled family ID | Implemented locally; production validation pending |
| 9 | Category and analytics contract preparation before category summaries or budget UI | Accepted stable category codes, deterministic family/currency-scoped summaries, legacy fallback, legacy-safe Transactions migration, service-level assignment, and no use of AI `categorySuggestion` as authoritative data | Complete; production registry validated (`healthy: true`, `issues: []`) |
| 10 | Explicit category assignment in Mini App transaction create/edit flow | Authenticated category selector using stable codes and Indonesian labels; server-side validation, family isolation, legacy fallback, and persisted service/repository writes; no category summaries, budgets, or AI auto-persistence | Complete; production validated |
| 11 | Read-only category analytics on the Mini App Dashboard | Server-derived category summaries filtered by active family and selected period, grouped by currency; horizontal expense chart with top categories and multi-currency separation; no budgets, AI insight, or client-side financial calculation | Complete; production validated |
| 12 | Dashboard refinement and transaction provenance | Simplify Beranda into family financial snapshot plus recent activity, move category chart presentation to Laporan, display server-resolved creator name on transaction list/detail, clarify surplus/deficit terminology, and reduce duplicate primary actions; no account/transfer/savings model | Implemented locally; production validation pending |

### Explicitly deferred from the current Mini App scope

- Category summaries were introduced and production validated in M10 Slice 11. Slice 12 refines their presentation by treating Laporan as the analytics surface while keeping summaries server-derived, ACTIVE-only, family-scoped, period-scoped, and separated by currency; the accepted contract is in [`docs/category-analytics.md`](category-analytics.md). Slices 9–11 are production validated.
- `payment_method` remains deferred because it is not part of the current transaction model or worksheet.
- Budget totals, per-category budget progress, and the `/budget` surface remain deferred until category and budget schemas exist.
- AI financial insight remains a later layer over server-derived structured metrics; AI must never be the source of financial totals.
- Scan Struk AI from the Mini App remains deferred; the existing Telegram receipt flow is not implicitly exposed as a browser upload endpoint.
- Planned transactions and recurring liabilities remain outside actual balance calculations.
- PWA/offline support, larger-dataset pagination, durable cross-instance transaction idempotency, and cross-instance validation remain separate hardening concerns.
- Avatar Telegram viewer sudah berfungsi pada production setelah direct URL/proxy fallback; mekanisme ini tidak mengambil avatar anggota keluarga lain dan tidak menjadi authorization input.

### Exit criteria

Milestone 10 is complete only when the core Mini App screens have loading, empty, error, accessibility, responsive, session-expiry, authorization, and family-isolation coverage; all writes use the existing service boundary; multi-currency balances are never mixed; and production validation confirms the Mini App works in the intended Telegram contexts. Budget, AI insight, account/transfer/savings, and Mini App receipt scanning remain explicitly deferred; Slices 11–12 are read-only analytics and presentation refinements, not a budget or savings model.

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