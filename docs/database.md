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

## Isolation rule

Every future family-owned table must include `family_id` as a mandatory partition key. For example, a future transaction table must begin with `transaction_id` and `family_id`. The application must obtain this value from a server-side membership or validated invitation lookup, never from untrusted Telegram request data.

## Family-management boundary

Milestone 2 stores the membership and invitation records needed for authorization and joining. It does not yet define the complete lifecycle behavior for member removal, role changes, invitation revocation, family renaming, or family archival. Those operations are planned for Milestone 3 and must use server-side membership authorization, preserve `family_id`, and record enough state to support recovery and auditing.

Hard deletion of a family or irreversible deletion of its financial history is not part of the current schema contract. A future implementation should prefer explicit lifecycle statuses and retention rules until backup, recovery, ownership transfer, and audit requirements are settled.

## Reporting and export boundary

Reports are derived, family-scoped read models and must not expose the central spreadsheet or its identifiers. Telegram summaries, authenticated Mini App report views, CSV files, print-friendly pages, and PDFs must all be generated only after server-side membership authorization resolves the requester’s `family_id`.

Export artifacts should be short-lived and cleaned up after delivery or expiry. A PDF may be exported without a password or with an optional password chosen immediately before export. When enabled, the password is used only during server-side PDF generation/encryption; it is not stored in Sheets, report metadata, logs, analytics, URLs, or persistent download records.

## Future boundaries

Transactions, categories, accounts, audit events, receipt parsing, AI analysis, budgets, dashboards, Supabase storage, payments, and subscriptions are outside Milestone 2. Reports and exports are planned for Milestone 8, while the first authenticated Mini App report views are also delivered there; their eventual schemas and read models must preserve the `family_id` rule.
