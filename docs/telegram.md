# Falancé Telegram Integration

## Webhook

Telegram updates are received by `POST /api/telegram/webhook`. `GET /api/telegram/webhook` remains a health/status endpoint. The route validates the update shape, passes supported commands to the family service, and sends user-facing responses through the existing Telegram Bot API client.

Telegram credentials remain server-only. The bot token must not be exposed to browser code or included in user-visible messages.

## Milestone 2 commands

| Command | Behavior |
| --- | --- |
| `/start` | Returns the existing welcome response. |
| `/createfamily` | Starts or replaces a 15-minute pending family creation request. A user with active membership is rejected. The next text message supplies the family name. Family and OWNER membership writes are retried idempotently, and pending state is completed only after both writes succeed. |
| `/invite` | Requires an active `OWNER` or `ADMIN` membership. The generated code is bound to that member’s server-resolved `family_id`. |
| `/join <code>` | Resolves the invitation by code, validates status and expiry, rejects an already-active member, creates membership for the invitation’s family, and consumes the code. |

## Milestone 3 commands

| Command | Behavior |
| --- | --- |
| `/members` | Lists active members of the requester’s server-resolved family, including each opaque `member_id` needed for administrative targeting, without exposing the central spreadsheet or Telegram user IDs. Available to active OWNER, ADMIN, and MEMBER users. |
| `/revokeinvite <code>` | Revokes a `PENDING` invitation belonging to the requester’s family. Available only to `OWNER` and `ADMIN`. |
| `/changerole <member_id_or_username> <ADMIN|MEMBER>` | Changes an active member’s role between `MEMBER` and `ADMIN`. Available only to the family `OWNER`; the target is resolved from the OWNER’s server-resolved family. `OWNER` cannot be changed. |
| `/deactivate <member_id_or_username> CONFIRM` | Soft-deactivates an active non-OWNER member by changing status to `SUSPENDED`. Available only to `OWNER`; explicit `CONFIRM` is required and the target must belong to the OWNER’s server-resolved family. |
| `/reactivate <member_id> CONFIRM` | Reactivates a `SUSPENDED` membership by changing its status to `ACTIVE` without creating a new row or member ID. Available only to `OWNER`; explicit `CONFIRM` is required and the target must belong to the OWNER’s server-resolved family. |

The command list is updated only after the handler and authorization tests are implemented. Future administrative commands must preserve the same server-side family boundary. Role changes accept a member ID shown by `/members` or a Telegram username, but never a client-supplied `family_id`.

## Identity and authorization

The backend uses the Telegram user ID from the verified update as the identity key. It looks up active membership in the central `Members` sheet and obtains the authorized `family_id` from that row.

> User-provided `family_id`, spreadsheet ID, or other storage identifier is never an authorization input.

Invitation joins are family-bound because the server obtains `family_id` from the invitation row after validating the code. The client supplies only the code and cannot select a different family.

## Create-family completion and troubleshooting

A successful `/createfamily` flow must produce an `ACTIVE` row in `Families`, an `OWNER` row in `Members`, and a `COMPLETED` row in `Pending Family Creations`. If `Families` is present but `Members` is empty and pending remains `PENDING`, the flow experienced a partial write; do not delete the family row before checking whether a retry can complete the existing family safely.

The Google Sheets client caches registry initialization per spreadsheet ID for the lifetime of a client instance. This prevents every repository operation from repeating the metadata and five worksheet-header reads. A production `429 RESOURCE_EXHAUSTED` error with the quota metric `Read requests` indicates repeated Google Sheets reads, not a Telegram authorization failure or a missing per-family spreadsheet.

Diagnostic failures are logged server-side using an operation label such as `createMember` or `completePendingFamilyCreation`, an HTTP status, and a redacted API path. Logs must not contain Telegram identifiers, family names, row values, spreadsheet IDs, bearer tokens, or private keys.

## Planned report access

Milestone 8 will add authorized Telegram summaries as one of three report channels, alongside authenticated Mini App views and CSV, print, or PDF export. All active members may view reports through Telegram and the Mini App, but only `OWNER` and `ADMIN` may request or receive CSV, print, or PDF export artifacts. The exact report commands are not implemented in the current milestone. Any future report command must resolve the requester’s active membership and `family_id` server-side and must never expose the Google Spreadsheet directly.

If a user requests a password-protected PDF, the password must be collected through a secure interaction, used only during server-side export, and excluded from Telegram logs, URLs, and persistent storage. The bot must not echo the password in a confirmation message.

## Roles

`OWNER` and `ADMIN` may create or revoke invitations. Only `OWNER` may change an active member between `MEMBER` and `ADMIN`; the `OWNER` role is immutable through role management. Only `OWNER` may deactivate an active non-OWNER member, and the operation requires explicit `CONFIRM`; deactivation writes soft-state `SUSPENDED` rather than deleting the row. Only `OWNER` may reactivate a `SUSPENDED` membership, also with explicit `CONFIRM`; reactivation restores the original row and `member_id`. `MEMBER` may use normal family features but cannot create invitations, change roles, deactivate members, or reactivate memberships. These checks are enforced in the family service rather than trusted to Telegram message wording or a future client interface.

## Out of scope

Financial transactions, receipt OCR, AI categorization and summaries, budgets, dashboards, the Telegram Mini App, payments, subscriptions, and Supabase are not implemented in Milestone 2. Member removal, family renaming, and family archival remain outside Milestone 2 and are planned for Milestone 3.
