# Falancé Database

## Storage model

The current storage implementation is one existing Google Spreadsheet per Falancé deployment. It is the backend database, not a direct user-facing interface. All families share this spreadsheet and are isolated logically by `family_id`.

The service account needs access to the spreadsheet identified by `GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID`. It does not need Google Drive access, a Drive folder, or permission to create spreadsheets.

## Registry initialization and quota behavior

Before accessing a registry sheet, the repository asks `GoogleSheetsClient` to verify the central worksheet set and headers. Initialization is cached per spreadsheet ID within the client instance, including concurrent calls that share the same in-flight promise. Subsequent repository reads and writes on that client do not repeat the metadata and five-header read sequence.

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
| `action` | `REVOKE_INVITATION`, `DEACTIVATE_MEMBER`, or `ARCHIVE_FAMILY`. |
| `target` | Server-resolved invitation code, member ID, or family ID required to complete the action. |
| `created_at` | ISO-8601 creation timestamp. |
| `expires_at` | Confirmation expiry, currently five minutes after creation. |
| `status` | `PENDING`, `COMPLETED`, `CANCELLED`, or `EXPIRED`. |

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

## Isolation rule

Every future family-owned table must include `family_id` as a mandatory partition key. For example, a future transaction table must begin with `transaction_id` and `family_id`. The application must obtain this value from a server-side membership or validated invitation lookup, never from untrusted Telegram request data.

## Family-management boundary

The registry stores the membership, invitation, pending-confirmation, and Audit Log records needed for authorization and administration. Milestone 3 lifecycle operations use server-side membership authorization, preserve `family_id`, and record successful administrative state changes without sensitive Telegram or request data.

Hard deletion of a family or irreversible deletion of its financial history is not part of the current schema contract. A future implementation should prefer explicit lifecycle statuses and retention rules until backup, recovery, ownership transfer, and audit requirements are settled.

## Reporting and export boundary

Reports are derived, family-scoped read models and must not expose the central spreadsheet or its identifiers. Telegram summaries and authenticated Mini App report views are available to authorized active members. CSV files, print-friendly pages, and PDFs are export artifacts restricted to `OWNER` and `ADMIN`. Every report or export request must resolve the requester’s `family_id` server-side before reading or generating data.

The export role check must occur before report generation and before an artifact is created. A `MEMBER` request for CSV, print, or PDF must be rejected even if the request comes from a trusted Mini App session or a direct API call.

Export artifacts should be short-lived and cleaned up after delivery or expiry. A PDF may be exported without a password or with an optional password chosen immediately before export. When enabled, the password is used only during server-side PDF generation/encryption; it is not stored in Sheets, report metadata, logs, analytics, URLs, or persistent download records.

## Future boundaries

Transactions, categories, accounts, audit events, receipt parsing, AI analysis, budgets, dashboards, Supabase storage, payments, and subscriptions are outside Milestone 2. Reports and exports are planned for Milestone 8, while the first authenticated Mini App report views are also delivered there; their eventual schemas and read models must preserve the `family_id` rule.
