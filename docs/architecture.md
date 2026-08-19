# Falancé Architecture

## Architectural decision

One Falancé deployment uses **one Google Spreadsheet** as its database. The spreadsheet configured by `GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID` is authoritative for every family in that deployment. Registering a family appends rows to this existing spreadsheet; it never creates a Google Drive file or a family-specific spreadsheet.

Google Sheets is an implementation detail behind the repository abstraction. Domain services depend on `FamilyRepository`, while `GoogleSheetsFamilyRepository` translates domain records into rows in the central spreadsheet. This keeps the business logic independent of Google Sheets and allows a future Supabase implementation without changing Telegram flows.

## Storage layout

The current Milestone 2 foundation creates or verifies only the following sheets:

| Sheet | Purpose |
| --- | --- |
| `Settings` | Deployment-level key/value settings. |
| `Families` | One row per family, without any spreadsheet identifier. |
| `Members` | Active and historical family memberships. |
| `Invitations` | Family-bound, one-time invitation records. |
| `Pending Family Creations` | Short-lived `/createfamily` requests. |

`Transactions`, `Categories`, `Accounts`, and `Audit Log` are reserved schema boundaries for future milestones and are not initialized by Milestone 2.

## Registry initialization and quota protection

The repository verifies the central registry through `GoogleSheetsClient.ensureRegistry()`. The client caches the in-flight and completed initialization promise per spreadsheet ID, so one client instance does not repeatedly read all five worksheet headers for every repository operation. If initialization fails, its failed cache entry is removed so a later request can retry initialization.

This cache is intentionally scoped to a client instance rather than treated as durable application state. A serverless cold start may initialize the registry again, but operations within the same warm request instance reuse the completed initialization. Registry initialization must remain lightweight because Google Sheets enforces per-user read quotas; repeated metadata and header reads can produce `429 RESOURCE_EXHAUSTED` errors.

Google API failures are logged server-side with a labeled operation, HTTP method, redacted path, status, and safe error reason. Request bodies, spreadsheet IDs, access tokens, service-account credentials, Telegram identifiers, and family data are never logged.

## Family isolation

`family_id` is the mandatory tenant and partition key for every family-owned table. The server resolves the Telegram identity to an active membership, obtains that membership’s `family_id`, and uses that value for all authorized operations.

> A Telegram client must never select a family by sending `family_id`, a spreadsheet ID, or another storage identifier. The backend must derive the family from the authenticated Telegram user or from a validated family-bound invitation.

Future family-owned tables, such as `Transactions`, must include `family_id` in their schema. A table that stores family-owned data without this key is not valid under this architecture.

## Report privacy and export boundary

Users must never receive direct access to the central Google Spreadsheet. Reports are derived views produced by authorized server-side queries and may be delivered through Telegram, the authenticated Mini App, or per-request export/print responses. Every channel must resolve the requester’s active membership and `family_id` on the server before reading report data.

`OWNER` and `ADMIN` may request CSV, print-friendly, or PDF exports. `MEMBER` may view authorized reports through Telegram and the authenticated Mini App but must be denied export requests before report generation or artifact creation. This is a role authorization rule, not a client-interface rule; the backend must enforce it on every export endpoint.

CSV, print-friendly HTML, and PDF exports are family-scoped artifacts, not spreadsheet links. Download URLs must be short-lived and must not contain `family_id`, spreadsheet IDs, report contents, or PDF passwords. A PDF password is optional and selected before export; when enabled, the backend encrypts the PDF, keeps the password ephemeral, and excludes it from logs, analytics, persistent Sheets data, and the download URL.

## Family creation

The `/createfamily` flow checks the Telegram identity and active membership, replaces the user’s bounded pending request, and waits for a family name. On submission, the server validates the pending request and expiry, rechecks membership, generates a `family_id`, and writes the `Families` and OWNER `Members` rows to the central spreadsheet. Pending state is marked `COMPLETED` only after those writes succeed.

No Drive API call, spreadsheet creation request, spreadsheet ID generation, or per-family initialization occurs during this flow. If a family row was written before a transient membership write failed, a retry reuses the existing family row rather than creating a duplicate.

## Authorization

The system preserves the three roles `OWNER`, `ADMIN`, and `MEMBER`. Owners and admins can create invitations. Members cannot create invitations. Joining resolves the family only from the invitation record, verifies that the invitation is pending and unexpired, rejects an already-active member, creates membership using the invitation’s `family_id`, and marks the code used. Current Milestone 3 administration also provides active-member listing, pending-invitation revocation, OWNER-only MEMBER↔ADMIN role changes, and OWNER-only soft member deactivation.

Member deactivation changes an active non-OWNER row to `SUSPENDED` rather than deleting it. The operation requires explicit `CONFIRM`, resolves the target from the OWNER’s server-resolved family, and rejects OWNER, inactive, and cross-family targets. Family renaming, family archival, and broader audit fields remain future work. Every lifecycle operation must preserve the same server-side `family_id` and role boundaries.

## Google authentication and scopes

The service account continues to authenticate with a signed JWT assertion. The only requested Google OAuth scope is:

`https://www.googleapis.com/auth/spreadsheets`

Drive scope and Drive API access are intentionally absent because the application reads and writes one existing spreadsheet and does not create files.

## Webhook boundary

Telegram updates enter through the Next.js route at `POST /api/telegram/webhook`. The health endpoint `GET /api/telegram/webhook` remains available. The route constructs the service with the central Google Sheets repository, while the Telegram client remains responsible only for Bot API communication.

## Future migration

Supabase is the planned future storage implementation. The repository contract is the migration boundary: Telegram handlers and family services should not depend directly on Google Sheets URLs, spreadsheet IDs, row numbers, or Google-specific response formats.
