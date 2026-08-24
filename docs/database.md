# Falancé Database

## Storage model

The current storage implementation is one existing Google Spreadsheet per Falancé deployment. It is the backend database, not a direct user-facing interface. All families share this spreadsheet and are isolated logically by `family_id`. Route construction now goes through a repository factory whose default backend remains `google-sheets`; the factory rejects unsupported backends until a separately validated adapter is available.

The service account needs access to the spreadsheet identified by `GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID`. It does not need Google Drive access, a Drive folder, or permission to create spreadsheets.

## Registry initialization and quota behavior

Before accessing a registry sheet, the repository asks `GoogleSheetsClient` to verify the central worksheet set and headers. Initialization is cached per spreadsheet ID within the client instance, including concurrent calls that share the same in-flight promise. Subsequent repository reads and writes on that client do not repeat the metadata and thirteen-header read sequence.

A new serverless cold start may perform initialization again. This is expected, but repeated initialization within one warm client instance is avoided because Google Sheets applies read quotas per user. A `429 RESOURCE_EXHAUSTED` response indicates that the request budget was exceeded; it is not evidence of a missing family or a per-family spreadsheet.

Operational failures are reported through redacted server-side logs. The log includes the operation name, HTTP method, redacted API path, status, and safe Google error fields. Row values, credentials, bearer tokens, spreadsheet IDs, and Telegram identifiers are excluded.

## Milestone 2 schema

### Settings

| Column | Meaning |
| --- | --- |
| `key` | Deployment setting name. |
| `value` | Deployment setting value. |

### Families

| Column | Meaning |
| --- | --- |
| `family_id` | Server-generated family tenant identifier. |
| `family_name` | Display name. |
| `status` | `ACTIVE` or `SUSPENDED`. |
| `created_at` | ISO-8601 creation timestamp. |
| `created_by` | Telegram user ID of the creator. |
| `plan` | Current plan label. |

There is deliberately no `spreadsheet_id` column. The central spreadsheet ID belongs to deployment configuration, not to a family.

## Supabase migration rehearsal

The repository includes a local-only migration rehearsal command:

```bash
npm run rehearse:migration -- --input /path/to/sanitized-registry-snapshot.json --output /path/to/rehearsal-report.json
```

The snapshot must contain a top-level `sheets` object whose keys are the thirteen authoritative worksheet names and whose values are arrays of row objects. The rehearsal validates primary keys, required fields, enums, positive transaction amounts, non-negative AI request counts, family/member references, unknown worksheets, row counts, and deterministic SHA-256 digests of canonical rows. The report contains only worksheet names, counts, digests, and issue codes; it does not print row values. The command does not connect to Google, Supabase, or production and does not perform a cutover.

After a healthy rehearsal, an operator may create a local import plan from the same sanitized snapshot:

```bash
npm run prepare:supabase-import -- --input /path/to/sanitized-registry-snapshot.json --output /path/to/local-import-plan.json --local-only
```

The `--local-only` confirmation is mandatory. This command only projects validated rows into foreign-key-safe, idempotent upsert batches; it does not execute SQL, contact Supabase, or change any deployment configuration. The resulting plan may contain snapshot values and must remain in the operator's protected local workspace.

The intended future cutover remains non-destructive: export a controlled snapshot, rehearse and reconcile it locally, import with idempotent upserts into a locked Supabase schema, compare counts and canonical digests, freeze writes for a final delta, then switch the repository backend flag. Google Sheets must remain available as a read-only rollback source until the Supabase path is production-validated.

The primary Supabase REST write client and factory activation seam are now implemented for non-production acceptance. Setting `FALANCE_PERSISTENCE_BACKEND=supabase` is accepted only on Vercel Preview or local development when `FALANCE_SUPABASE_URL` and `FALANCE_SUPABASE_SERVICE_ROLE_KEY` are present; Vercel Production and production runtimes fail closed instead of switching storage. The client sends writes and atomic RPC calls only from the server-side repository boundary, redacts provider error bodies, and preserves the existing domain authorization responsibility in `FamilyService`. This activation seam does not itself authorize a production cutover; it exists to support non-production adapter acceptance.

### Shadow-read validation

Shadow-read mode is opt-in through `FALANCE_SHADOW_READS=true`, `FALANCE_SHADOW_SUPABASE_URL`, and the server-only `FALANCE_SHADOW_SUPABASE_SERVICE_ROLE_KEY`. It is valid only when `FALANCE_PERSISTENCE_BACKEND` remains `google-sheets`: Google Sheets is the authoritative primary repository, while the Supabase read adapter is a secondary comparator. The factory additionally permits shadow-read only on Vercel Preview or local development; it fails closed to Google Sheets on Vercel Production or any other production runtime, even if the flag and shadow credentials are accidentally present. Read methods return the Google result immediately and compare the Supabase result asynchronously; a secondary timeout, malformed response, or mismatch never changes the user response or authorization decision. Diagnostics contain only the operation label and short SHA-256 digests, never family IDs, Telegram IDs, row values, credentials, or provider responses. All write and claim methods are delegated only to Google Sheets, so shadow mode is not dual-write and cannot migrate data by itself. Disable the flag after the observation window and review mismatch/secondary-failure counts before any cutover decision.

### Supabase atomic operations

Migration `0002_atomic_operations.sql` defines server-side atomic primitives for the cross-instance race-sensitive paths: Telegram `update_id` claims, draft approval claims, one-time invitation consumption, and independent text/vision AI quota claims. Each function performs its read-and-condition-and-write sequence in one PostgreSQL transaction; claim rows are locked with `FOR UPDATE`, while stale leases may be reclaimed and completed claims remain terminal. The AI function preserves the existing cooldown, rolling-window, and lease semantics and counts every claimed attempt, including provider failures.

The functions are `security invoker`, have no public execute permission, and are granted only to `service_role`. The future adapter must call them only from the server-side persistence layer. Telegram authorization and `family_id` resolution remain responsibilities of `FamilyService`; RPC parameters must never be populated from an unverified browser field. The dynamic `claim_ai_usage` lookup explicitly checks whether `usage_row` is null before inserting, avoiding reliance on `IF NOT FOUND` after dynamic SQL. The dedicated test-project scenario at `scripts/live-supabase-write-validation.sql` exercises import projection, conditional claims, completion, quota counters, and cleanup with a `live_migration_` fixture namespace. The migration does not change the active backend, Telegram commands, or user-facing behavior.

### Members

| Column | Meaning |
| --- | --- |
| `member_id` | Server-generated membership identifier. |
| `family_id` | Mandatory tenant key. |
| `telegram_user_id` | Telegram identity. |
| `name` | Telegram display name captured at membership creation. |
| `username` | Telegram username, when available. |
| `role` | `OWNER`, `ADMIN`, or `MEMBER`. |
| `status` | Membership status, including `ACTIVE`. |
| `joined_at` | ISO-8601 membership timestamp. |

### Invitations

| Column | Meaning |
| --- | --- |
| `invitation_id` | Server-generated invitation identifier. |
| `family_id` | Family to which the code belongs. |
| `code` | One-time normalized invitation code. |
| `created_by` | Telegram user ID of the owner or admin. |
| `created_at` | ISO-8601 creation timestamp. |
| `expires_at` | Expiration timestamp. |
| `used_at` | Timestamp at which the code was consumed, when used. |
| `used_by` | Telegram user ID that consumed it, when used. |
| `status` | `PENDING`, `USED`, `EXPIRED`, or `REVOKED`. |

### Pending Family Creations

| Column | Meaning |
| --- | --- |
| `telegram_user_id` | Telegram identity that initiated the request. |
| `family_name` | Optional captured family name; the current two-step flow supplies it at completion. |
| `created_at` | ISO-8601 request timestamp. |
| `expires_at` | Request expiry, currently 15 minutes after creation. |
| `status` | `PENDING` or `COMPLETED`. |

### Pending Confirmations

| Column | Meaning |
| --- | --- |
| `confirmation_id` | Server-generated pending confirmation identifier. |
| `telegram_user_id` | Telegram identity that created the pending action. |
| `family_id` | Server-resolved family boundary for the action. |
| `action` | `REVOKE_INVITATION`, `DEACTIVATE_MEMBER`, `ARCHIVE_FAMILY`, or `VOID_TRANSACTION`. |
| `target` | Server-resolved invitation code, member ID, or family ID required to complete the action. |
| `created_at` | ISO-8601 creation timestamp. |
| `expires_at` | Confirmation expiry, currently five minutes after creation. |
| `status` | `PENDING`, `COMPLETED`, `CANCELLED`, or `EXPIRED`. |

### Processed Telegram Updates

| Column | Meaning |
| --- | --- |
| `update_id` | Non-negative Telegram update identifier used as the global replay key for this bot deployment. |
| `claimed_at` | Timestamp at which the webhook claimed the update for processing. |
| `completed_at` | Timestamp at which handler effects and Telegram response delivery completed, when successful. |
| `status` | `CLAIMED` while processing or within the five-minute lease, and `COMPLETED` after successful handling. |

This worksheet is deployment-scoped and intentionally has no `family_id`, because Telegram `update_id` is global to the bot rather than family data. The webhook claims an update before dispatching to the command handler; a completed or non-stale claimed update is ignored. A stale claim may be reclaimed after five minutes. The in-process lock prevents concurrent duplicate claims within one warm instance; durable worksheet state protects retries across warm requests, while full cross-instance atomicity remains a future Google Sheets scalability boundary.

### Audit Log

| Column | Meaning |
| --- | --- |
| `audit_id` | Server-generated append-only audit identifier. |
| `family_id` | Server-resolved family boundary. |
| `actor_member_id` | Opaque `member_id` of the actor; Telegram user ID is excluded. |
| `actor_role` | Actor role at the time of the successful action. |
| `action` | Administrative action such as `CHANGE_MEMBER_ROLE`, `DEACTIVATE_MEMBER`, or `ARCHIVE_FAMILY`. |
| `target_type` | `INVITATION`, `MEMBER`, or `FAMILY`. |
| `target_id` | Opaque target identifier; invitation code and request body are excluded. |
| `previous_value` | Allowed prior state such as `ACTIVE`, `SUSPENDED`, `MEMBER`, or `ADMIN`; family names are excluded. |
| `new_value` | Allowed resulting state; sensitive values are excluded. |
| `created_at` | ISO-8601 timestamp of the successful state change. |

Audit rows are appended only after the primary administrative write succeeds. Audit persistence is deliberately non-blocking: if the audit append fails, the primary state change remains successful and only a safe operation label is emitted to diagnostics. Failed authorization, invalid confirmation, cancelled actions, and expired actions are not recorded as successful audit events.

### Pending Transaction Drafts

| Column | Meaning |
| --- | --- |
| `draft_id` | Opaque server-generated draft identifier. |
| `telegram_user_id` | Telegram identity that created the draft; server-only authorization key. |
| `family_id` | Server-resolved family boundary; never accepted from Telegram input. |
| `transaction_type` | `INCOME` or `EXPENSE`. |
| `amount_minor` | Positive integer amount in the smallest currency unit. |
| `currency` | Three-letter uppercase currency code. |
| `transaction_date` | Valid `YYYY-MM-DD` date that is today or earlier in the configured `FALANCE_TIME_ZONE` for ordinary transactions. |
| `description` | Normalized 1–200 character description. |
| `confidence` | AI extraction confidence: `HIGH`, `MEDIUM`, or `LOW`. |
| `created_at` | Draft creation timestamp. |
| `expires_at` | Five-minute draft expiry timestamp. |
| `status` | `PENDING`, `EDITING`, `COMPLETED`, `CANCELLED`, or `EXPIRED`. |

Pending drafts are temporary server state. A natural-language message creates or replaces the user’s active draft; `Ya`/`Kirim draft` validates and persists a transaction, `Edit` changes the draft to manual-edit mode, and cancellation or expiry preserves the row without persisting a transaction. AI category and description suggestions are review-only metadata for the draft response; they are not authoritative transaction fields, are cleared by manual draft editing, and are not added to the final `Transactions` schema or actual balance calculation. The draft repository filters by the server-resolved Telegram identity, and the service verifies the active family before any update or approval.

### Draft Approval Claims

| Column | Meaning |
| --- | --- |
| `draft_id` | Unique draft approval key. |
| `telegram_user_id` | Server-resolved approving Telegram identity. |
| `family_id` | Server-resolved family boundary for the draft. |
| `transaction_id` | Deterministic transaction identifier derived from the draft ID for retry recovery. |
| `claimed_at` | Timestamp at which approval processing acquired the claim. |
| `completed_at` | Timestamp at which transaction persistence and approval completion succeeded, when completed. |
| `lease_until` | Expiry of the in-flight claim; a stale claim may be reclaimed. |
| `status` | `CLAIMED` while approval is in progress or `COMPLETED` after recovery-safe completion. |

Approval claims are durable server state used before transaction creation. The service serializes draft lifecycle operations in a warm instance, persists the claim and a deterministic `transaction_id`, avoids creating another transaction when a completed claim is recovered, completes the claim after transaction persistence, and then marks the draft `COMPLETED`. A 60-second lease permits recovery when a serverless execution stops after claiming. Google Sheets does not provide a compare-and-swap primitive for the read-then-update sequence, so this worksheet improves durable retry recovery and in-process suppression but is not a final guarantee of atomic cross-instance uniqueness; cross-instance validation and a storage primitive with conditional writes remain Milestone 8 hardening work.

### AI Usage worksheets

`AI Vision Usage` and `AI Text Usage` are separate durable quota worksheets. The separation preserves the existing vision rows while allowing text workload policy to evolve independently.

| Column | Meaning |
| --- | --- |
| `usage_key` | Server-created combination of resolved `family_id` and Telegram user key. |
| `family_id` | Server-resolved family boundary. It is never supplied by the browser or treated as client authorization. |
| `telegram_user_id` | Server-side workload owner key used for per-user/per-family quota enforcement; it is not returned to browser, Telegram, or diagnostic logs. |
| `window_started_at` | Beginning of the current rolling quota window. |
| `request_count` | Number of claimed attempts in the active window, including provider failures. |
| `last_claimed_at` | Timestamp of the most recent claim. |
| `lease_until` | Expiry of the in-flight claim; stale claims may be reclaimed. |
| `status` | `IN_FLIGHT` while the AI workload is running or `COMPLETED` after the handler finishes. |

The text policy defaults to a five-second cooldown, thirty attempts per one-hour rolling window, and a sixty-second lease. It is configured through `FALANCE_AI_TEXT_COOLDOWN_SECONDS`, `FALANCE_AI_TEXT_WINDOW_SECONDS`, `FALANCE_AI_TEXT_MAX_REQUESTS`, and `FALANCE_AI_TEXT_LEASE_SECONDS`. A natural-language request claims before provider invocation and completes in `finally`; `/addincome` and `/addexpense` bypass this text quota. Vision retains its existing independent policy and worksheet.

These worksheets intentionally do not contain prompts, raw provider responses, token counts, API keys, receipt bytes, family names, or display names. Registry integrity checks validate their shape, unique key, family/member references, status, and non-negative request count without emitting row values. Warm-instance keyed locks reduce same-instance races, but Google Sheets read-then-update remains non-atomic across serverless instances.

### Transactions

| Column | Meaning |
| --- | --- |
| `transaction_id` | Server-generated transaction identifier. |
| `family_id` | Mandatory server-resolved family tenant identifier. |
| `transaction_type` | `INCOME` or `EXPENSE`. |
| `amount_minor` | Positive safe integer amount in the smallest currency unit, capped by the service validation limit. |
| `currency` | Normalized three-letter ISO currency code; defaults to `IDR`. |
| `transaction_date` | Valid calendar date in `YYYY-MM-DD` format that is not later than the current business date for ordinary transactions. |
| `description` | Whitespace-normalized description containing 1–200 characters. |
| `created_by_member_id` | Opaque active membership identifier of the creating member. |
| `created_at` | ISO-8601 creation timestamp. |
| `status` | `ACTIVE` or `VOID`; transaction history is not hard-deleted. |
| `category` | Stable uppercase category code; legacy or blank values resolve to `UNCATEGORIZED`. |

Transactions are appended to the central registry by the repository and read back by `family_id`. Every active `OWNER`, `ADMIN`, and `MEMBER` may create a transaction for their server-resolved family. Successful creation appends a privacy-preserving `CREATE_TRANSACTION` entry to the `Audit Log`; structured Telegram transaction commands and VOID confirmation flows are implemented, while AI draft approval reuses the same service boundary. Category assignment is authoritative only when supplied through a validated service input; an AI `categorySuggestion` remains review-only metadata.

### Mini App data-contract boundary

The current Mini App may safely consume the family-scoped transaction and report fields: transaction type, amount, currency, transaction date, description, category, status, family name, role, and aggregate counts/balances. These values must continue to be resolved and shaped by the service/API layer rather than read directly by browser components.

The current repository contract includes `category` as the final Transactions field, with legacy rows migrated or read as `UNCATEGORIZED`. `categorySuggestion` and `descriptionSuggestion` still belong only to temporary AI drafts and must not be treated as persisted transaction data. M10 Slice 10 exposes explicit category selection in authenticated Mini App create/edit forms and displays the persisted category in transaction list/detail views. M10 Slice 11 exposes deterministic category summaries in the authenticated report response and a read-only Dashboard expense visualization. Summaries remain grouped by category and currency, exclude `VOID`, and never imply budget progress or AI insight. M10 Slice 9 defines the stable category-code, migration, and deterministic summary contract in [`docs/category-analytics.md`](category-analytics.md), and its registry migration is production validated.

The Mini App transaction POST/PATCH endpoints use the same transaction contract and validation rules as the Telegram path, resolve `family_id` from the authenticated member on the server, and persist through `FamilyService` and the repository. The client must never submit `family_id` as a tenant selector.

## Registry integrity and recovery

`npm run check:registry` membaca seluruh worksheet registry pusat dan menghasilkan report metadata yang hanya berisi `healthy`, `rowCounts`, worksheet, row number, field, dan issue code. Pemeriksaan mencakup header schema, duplicate key, enum/status, foreign reference, active OWNER invariant, orphan member, dan consistency antara `Draft Approval Claims` dengan `Transactions`. Report tidak mengeluarkan row values, credential, spreadsheet ID, Telegram ID, atau family name.

Backup dan restoration dilakukan secara manual dan terkontrol oleh operator melalui Google Sheets atau prosedur administrasi yang disetujui. Aplikasi tidak membuat spreadsheet baru melalui Drive API. Snapshot harus mencakup seluruh worksheet pada satu titik waktu dan tidak boleh menggabungkan worksheet dari snapshot berbeda tanpa reconciliation. Lihat [`docs/backup-recovery.md`](backup-recovery.md) untuk runbook, partial-write retry matrix, dan recovery decision tree.

M12 non-production acceptance telah lulus pada guarded Preview dengan Supabase-primary: account/report read mengembalikan HTTP 200, transaksi test berhasil dibuat, diubah, dan di-void, kemudian fixture dibersihkan. Data test diimpor manual melalui CSV sanitized karena service-role import access tidak tersedia pada sandbox. Hasil ini hanya memvalidasi adapter dan alur Mini App pada Preview; Google Sheets tetap menjadi Production source of truth dan tidak ada cutover yang tersirat.

`/createfamily` memiliki recovery terhadap family row yang sudah tertulis tetapi membership belum selesai. `/join` menandai invitation `USED` lebih dahulu, lalu membuat membership; retry oleh Telegram identity yang sama menyelesaikan membership yang hilang tanpa menggunakan invitation kedua. Durable draft approval menggunakan lease dan deterministic transaction ID. Untuk operasi yang tidak memiliki idempotency key domain, operator harus melakukan read-only inspection sebelum retry manual.

## Isolation rule

Every family-owned table must include `family_id` as a mandatory partition key. The application must obtain this value from a server-side membership or validated invitation lookup, never from untrusted Telegram request data.

## Family-management boundary

The registry stores the membership, invitation, pending-confirmation, and Audit Log records needed for authorization and administration. Milestone 3 lifecycle operations use server-side membership authorization, preserve `family_id`, and record successful administrative state changes without sensitive Telegram or request data.

Hard deletion of a family or irreversible deletion of its financial history is not part of the current schema contract. A future implementation should prefer explicit lifecycle statuses and retention rules until backup, recovery, ownership transfer, and audit requirements are settled.

## Reporting and export boundary

Reports are derived, family-scoped read models and must not expose the central spreadsheet or its identifiers. Telegram summaries and authenticated Mini App report views are available to authorized active members. CSV files, print-friendly HTML pages, and server-side PDFs are export artifacts restricted to `OWNER` and `ADMIN`. Every report or export request must resolve the requester’s `family_id` server-side before reading or generating data.

The export role check must occur before report generation and before an artifact is created. A `MEMBER` request for CSV, print, or PDF must be rejected even if the request comes from a trusted Mini App session or a direct API call. The print endpoint returns escaped HTML with a browser print stylesheet. The PDF endpoint generates bytes in memory, optionally encrypts them with the request-body password, streams them directly, and does not create or persist a PDF artifact.

Export artifacts should be short-lived and cleaned up after delivery or expiry. A PDF may be exported without a password or with an optional password chosen immediately before export. When enabled, the password is used only during server-side PDF generation/encryption; it is not stored in Sheets, report metadata, logs, analytics, URLs, or persistent download records.

## Future boundaries

Receipt parsing, AI analysis, budgets, dashboards, Supabase storage, payments, and subscriptions are outside Milestone 2. The transaction foundation is implemented in Milestone 4, transaction commands are implemented in Milestones 5–7, and Telegram reports, authenticated Mini App report views, role-safe CSV export, and print/PDF export are implemented in Milestone 9. M10 Slice 9 category persistence/migration is production validated, and Slice 10 provides explicit category assignment in the Mini App; category summaries and budget analytics remain future boundaries. All schemas and read models must preserve the `family_id` rule.
