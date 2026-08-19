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

## Family isolation

`family_id` is the mandatory tenant and partition key for every family-owned table. The server resolves the Telegram identity to an active membership, obtains that membership’s `family_id`, and uses that value for all authorized operations.

> A Telegram client must never select a family by sending `family_id`, a spreadsheet ID, or another storage identifier. The backend must derive the family from the authenticated Telegram user or from a validated family-bound invitation.

Future family-owned tables, such as `Transactions`, must include `family_id` in their schema. A table that stores family-owned data without this key is not valid under this architecture.

## Family creation

The `/createfamily` flow checks the Telegram identity and active membership, replaces the user’s bounded pending request, and waits for a family name. On submission, the server validates the pending request and expiry, rechecks membership, generates a `family_id`, and writes the `Families` and OWNER `Members` rows to the central spreadsheet. Pending state is marked `COMPLETED` only after those writes succeed.

No Drive API call, spreadsheet creation request, spreadsheet ID generation, or per-family initialization occurs during this flow. If a family row was written before a transient membership write failed, a retry reuses the existing family row rather than creating a duplicate.

## Authorization

The system preserves the three roles `OWNER`, `ADMIN`, and `MEMBER`. Owners and admins can create invitations. Members cannot create invitations. Joining resolves the family only from the invitation record, verifies that the invitation is pending and unexpired, rejects an already-active member, creates membership using the invitation’s `family_id`, and marks the code used.

## Google authentication and scopes

The service account continues to authenticate with a signed JWT assertion. The only requested Google OAuth scope is:

`https://www.googleapis.com/auth/spreadsheets`

Drive scope and Drive API access are intentionally absent because the application reads and writes one existing spreadsheet and does not create files.

## Webhook boundary

Telegram updates enter through the Next.js route at `POST /api/telegram/webhook`. The health endpoint `GET /api/telegram/webhook` remains available. The route constructs the service with the central Google Sheets repository, while the Telegram client remains responsible only for Bot API communication.

## Future migration

Supabase is the planned future storage implementation. The repository contract is the migration boundary: Telegram handlers and family services should not depend directly on Google Sheets URLs, spreadsheet IDs, row numbers, or Google-specific response formats.
