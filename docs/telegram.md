# Falancé Telegram Integration

## Webhook

Telegram updates are received by `POST /api/telegram/webhook`. `GET /api/telegram/webhook` remains a health/status endpoint. The route validates the update shape, passes supported commands to the family service, and sends user-facing responses through the existing Telegram Bot API client.

Telegram credentials remain server-only. The bot token must not be exposed to browser code or included in user-visible messages.

## Milestone 2 commands

| Command | Behavior |
| --- | --- |
| `/start` | Returns the existing welcome response. |
| `/createfamily` | Starts or replaces a 15-minute pending family creation request. A user with active membership is rejected. The next text message supplies the family name. Family and OWNER membership writes are retried idempotently, and pending state is completed only after both writes succeed. |
| `/invite` | Requires an active `OWNER` or `ADMIN` membership. The generated code is bound to that member’s server-resolved `family_id` and displayed as inline code for easy copying. |
| `/join <code>` | Resolves the invitation by code, validates status and expiry, rejects an already-active member, creates membership for the invitation’s family, and consumes the code. |

## Milestone 3 commands

| Command | Behavior |
| --- | --- |
| `/members` | Lists the server-resolved family name and active members, including each opaque `member_id` needed for administrative targeting. Each member ID is displayed as inline code for easy copying, without exposing the central spreadsheet or Telegram user IDs. Available to active OWNER, ADMIN, and MEMBER users. |
| `/revokeinvite <code>` then `Y`/`N` | Revokes a `PENDING` invitation belonging to the requester’s family after an interactive confirmation. Available only to `OWNER` and `ADMIN`; `Y` confirms and `N` cancels. |
| `/changerole <member_id_or_username> <ADMIN|MEMBER>` | Changes an active member’s role between `MEMBER` and `ADMIN`. Available only to the family `OWNER`; the target is resolved from the OWNER’s server-resolved family. `OWNER` cannot be changed. |
| `/deactivate <member_id_or_username>` then `Y`/`N` | Soft-deactivates an active non-OWNER member by changing status to `SUSPENDED` after an interactive confirmation. Available only to `OWNER`; `Y` confirms and `N` cancels. |
| `/reactivate <member_id_or_username> CONFIRM` | Reactivates a `SUSPENDED` membership by changing its status to `ACTIVE` without creating a new row or member ID. Available only to `OWNER`; explicit `CONFIRM` is required and the target must belong to the OWNER’s server-resolved family. |
| `/renamefamily <nama_baru>` | Updates the family name for the OWNER’s server-resolved family. Repeated whitespace is normalized and the name must contain 1–80 characters. |
| `/archivefamily` then `Y`/`N` | Changes the family status to `SUSPENDED` without deleting the family row or data after an interactive confirmation. Available only to `OWNER`; `Y` confirms and `N` cancels. Normal family commands are blocked until reactivation. |
| `/reactivatefamily CONFIRM` | Changes a `SUSPENDED` family back to `ACTIVE` without creating a new family ID. Available only to the original active membership OWNER. |

The command list is updated only after the handler and authorization tests are implemented. Destructive commands create a server-persisted pending confirmation with a five-minute expiry; only `Y` or `N` from the same Telegram user can resolve it. Future administrative commands must preserve the same server-side family boundary. Role and member-lifecycle commands accept a member ID shown by `/members` or a Telegram username where supported, but never a client-supplied `family_id`.

## Identity and authorization

The backend uses the Telegram user ID from the verified update as the identity key. It looks up active membership in the central `Members` sheet and obtains the authorized `family_id` from that row.

> User-provided `family_id`, spreadsheet ID, or other storage identifier is never an authorization input.

Invitation joins are family-bound because the server obtains `family_id` from the invitation row after validating the code. The client supplies only the code and cannot select a different family.

## Create-family completion and troubleshooting

A successful `/createfamily` flow must produce an `ACTIVE` row in `Families`, an `OWNER` row in `Members`, and a `COMPLETED` row in `Pending Family Creations`. If `Families` is present but `Members` is empty and pending remains `PENDING`, the flow experienced a partial write; do not delete the family row before checking whether a retry can complete the existing family safely.

The Google Sheets client caches registry initialization per spreadsheet ID for the lifetime of a client instance. This prevents every repository operation from repeating the metadata and eight worksheet-header reads.
 A production `429 RESOURCE_EXHAUSTED` error with the quota metric `Read requests` indicates repeated Google Sheets reads, not a Telegram authorization failure or a missing per-family spreadsheet.

Diagnostic failures are logged server-side using an operation label such as `createMember` or `completePendingFamilyCreation`, an HTTP status, and a redacted API path. Logs must not contain Telegram identifiers, family names, row values, spreadsheet IDs, bearer tokens, or private keys.

## Milestone 4 transaction foundation

The transaction foundation is implemented below the Telegram command layer. The service accepts validated income and expense inputs, resolves the requester’s active family and creator membership server-side, persists rows in the central `Transactions` worksheet, records successful creation in the append-only `Audit Log`, and lists only active transactions from the resolved family. Archived families cannot create or list transactions, and transaction rows use soft `VOID` state rather than hard deletion.

Structured transaction commands are introduced in the Milestone 5 section below. Milestone 6 adds an interactive natural-language draft flow; existing family-management commands remain unchanged.

## Milestone 5 transaction input

| Command | Behavior |
| --- | --- |
| `/addincome <amount_minor> [CURRENCY] <YYYY-MM-DD> <deskripsi>` | Creates an `INCOME` transaction for the requester’s server-resolved family. The amount may use plain digits or unambiguous three-digit separators such as `150.000`; currency defaults to `IDR`. The created transaction ID is displayed as inline code. |
| `/addexpense <amount_minor> [CURRENCY] <YYYY-MM-DD> <deskripsi>` | Creates an `EXPENSE` transaction for the requester’s server-resolved family using the same validation rules. The created transaction ID is displayed as inline code. |
| `/transactions` | Shows a readable balance summary grouped by currency, then lists up to the 50 most recent `ACTIVE` transactions belonging to the requester’s server-resolved family, including opaque transaction IDs displayed as inline code. `VOID` transactions are excluded from both the summary and list. |
| `/edittransaction <transaction_id> <INCOME|EXPENSE> <amount_minor> [CURRENCY] <YYYY-MM-DD> <deskripsi>` | Updates an active transaction in place after resolving and validating the transaction within the requester’s server-resolved family. The original transaction ID, family ID, creator member ID, and creation timestamp are preserved, and the resulting ID is displayed as inline code. |
| `/voidtransaction <transaction_id>` | Requests persisted Y/N confirmation, then changes the active transaction status to `VOID` without deleting its row. The transaction ID in the prompt is displayed as inline code. |
| `/canceltransaction <transaction_id>` | Alias for `/voidtransaction`. |

The command layer never accepts `family_id`; `FamilyService` resolves both `family_id` and `created_by_member_id` from the active membership. Invalid amount, date, currency, or description input is rejected in Indonesian. Ordinary transaction dates must be today or earlier according to the configurable `FALANCE_TIME_ZONE` environment variable, which defaults to `UTC`; future obligations belong to a planned-transaction feature and do not enter the actual balance. The service records successful creation in the append-only `Audit Log`. The balance summary is cumulative across all active transactions, does not reset monthly, excludes `VOID`, and never converts or mixes different currencies. Identifier values use Telegram HTML inline-code formatting, and dynamic content is HTML-escaped before sending.

For date handling, the server uses the IANA timezone from `FALANCE_TIME_ZONE`; this same business date is supplied to the AI parser for relative-date resolution and is used by service validation to reject future ordinary transactions. When an AI message clearly describes an actual transaction but omits a date, the parser may default to the current business date; the draft explicitly labels the date as `(diasumsikan hari ini)` before approval. The draft may also show a controlled category suggestion and an optional concise description suggestion. These are review-only hints: they do not determine authorization, transaction status, or final persistence, and manual editing clears them. Explicit planning language such as `rencana`, `akan`, `nanti`, `terjadwal`, `rutin`, or `recurring` is not converted into an actual transaction. For natural-language parsing, the AI provider is configured only on the server through `FALANCE_AI_API_BASE`, `FALANCE_AI_API_KEY`, and `FALANCE_AI_MODEL`. These values must never be exposed to Telegram or client code. The provider may extract only transaction fields; it must not determine family identity, member identity, authorization, or persistence status.

Milestone 6 accepts non-command natural-language transaction text from active members and creates a server-persisted draft in `Pending Transaction Drafts` when the optional AI provider is configured. The bot shows a readable recap with inline `Ya, simpan`, `Edit`, and `Batalkan` buttons. If the recap is correct, the user presses `Ya, simpan`; no `/addincome` or `/addexpense` command needs to be sent. When a clearly actual transaction omits a date, the parser uses the current business date and the recap labels it `(diasumsikan hari ini)` so the user can review the assumption. The recap may include a controlled category suggestion and a concise description suggestion; both are optional review hints and do not become authoritative transaction fields. Explicit planning language is clarified rather than saved as an actual transaction. `Edit` changes the draft to manual-edit mode and instructs the user to send `/editdraft <INCOME|EXPENSE> <amount_minor> [CURRENCY] <YYYY-MM-DD> <deskripsi>`; manual editing clears stale AI suggestions, and the revised draft then shows `Kirim draft`, `Edit lagi`, and `Batalkan` actions. `Kirim draft` and `Ya, simpan` call the same deterministic service boundary, which validates the draft, resolves the family from current membership, persists the transaction, and marks the draft `COMPLETED`. Drafts expire after five minutes, and stale or foreign callback IDs are rejected. Missing fields, invalid values, provider failures, and unavailable configuration produce Indonesian fallback messages. Edit and soft-cancellation operations remain family-scoped, record the appropriate audit action, and never perform hard deletion.

## Planned report access

Milestone 8 will add authorized Telegram summaries as one of three report channels, alongside authenticated Mini App views and CSV, print, or PDF export. All active members may view reports through Telegram and the Mini App, but only `OWNER` and `ADMIN` may request or receive CSV, print, or PDF export artifacts. The exact report commands are not implemented in the current milestone. Any future report command must resolve the requester’s active membership and `family_id` server-side and must never expose the Google Spreadsheet directly.

If a user requests a password-protected PDF, the password must be collected through a secure interaction, used only during server-side export, and excluded from Telegram logs, URLs, and persistent storage. The bot must not echo the password in a confirmation message.

## Roles

`OWNER` and `ADMIN` may create invitations. Invitation revocation is available to both roles and uses a server-persisted Y/N confirmation that expires after five minutes. Only `OWNER` may change an active member between `MEMBER` and `ADMIN`; the `OWNER` role is immutable through role management. Only `OWNER` may deactivate an active non-OWNER member, and the operation uses the same Y/N confirmation flow; deactivation writes soft-state `SUSPENDED` rather than deleting the row. Only `OWNER` may reactivate a `SUSPENDED` membership, with explicit `CONFIRM`; reactivation restores the original row and `member_id`. Only `OWNER` may rename, archive, or reactivate the family. The service rejects any operation that would remove or demote the last active `OWNER`.
 Family archival writes status `SUSPENDED` while retaining the family and member rows; normal commands are blocked until `/reactivatefamily CONFIRM`. `MEMBER` may use normal family features but cannot create invitations, change roles, deactivate members, reactivate memberships, rename the family, or manage family archival. These checks are enforced in the family service rather than trusted to Telegram message wording or a future client interface. Successful administrative changes append an `Audit Log` record containing the actor’s opaque `member_id`, role, action, family boundary, opaque target identifier, allowed state transition, and timestamp. Telegram user IDs, family names, invitation codes, request bodies, and credentials are excluded; audit persistence failure does not roll back the primary state change.

## Out of scope

Receipt OCR, AI categorization and summaries, budgets, dashboards, the Telegram Mini App, payments, subscriptions, and Supabase are not implemented. Milestone 3 administration and Milestone 4 transaction foundation are complete, Milestone 5 structured transaction management is complete, and Milestone 6 interactive AI draft confirmation is in progress.
