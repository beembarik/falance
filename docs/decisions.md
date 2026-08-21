# Falancé Architecture Decisions

## ADR-001: One deployment, one spreadsheet

**Status:** Accepted for Milestone 2.

One Falancé deployment uses one existing Google Spreadsheet containing all families. Google Sheets is the current backend data store. A new family is represented by rows in `Families`, `Members`, and related central sheets; it does not receive a new spreadsheet.

The earlier one-family-one-spreadsheet design is obsolete. It required Google Drive file creation and failed in production when the service account reached its Drive storage quota. Removing provisioning eliminates that failure mode and reduces the required Google permissions.

## ADR-002: `family_id` is the tenant boundary

**Status:** Accepted.

`family_id` is a server-generated, mandatory partition key for family-owned data. The backend resolves Telegram user ID to active membership to family ID before performing family operations. Client-supplied family IDs and spreadsheet IDs are ignored as authorization inputs.

This rule applies to all future family-owned tables, including transactions, categories, accounts, and audit records.

## ADR-003: Repository abstraction

**Status:** Accepted.

Business logic depends on `FamilyRepository`, not on Google Sheets APIs. `GoogleSheetsFamilyRepository` is the current implementation and always uses the configured central spreadsheet. A future Supabase repository can implement the same business-facing contract.

## ADR-004: Service-account Sheets access

**Status:** Accepted.

The service account remains the authentication mechanism for the existing spreadsheet. The narrow OAuth scope is `https://www.googleapis.com/auth/spreadsheets`. Drive scope, OAuth user consent, refresh-token flows, shared drives, and dedicated storage accounts are not required for this architecture.

## ADR-005: Bounded pending family creation

**Status:** Accepted.

A `/createfamily` request is retained for 15 minutes. A new request replaces the prior pending request for that Telegram user. Pending state is completed only after the family and OWNER membership writes succeed. The repository treats family and membership writes as idempotent by their server-generated identifiers and reuses an existing family created by the same user when retrying a partial write.

## ADR-006: Future storage migration

**Status:** Planned.

Supabase is the planned future storage implementation. Milestone 2 deliberately did not introduce Supabase or transaction commands. The Milestone 4 transaction foundation now provides central transaction persistence and service authorization; financial parsing, AI, dashboards, payment, and subscription systems remain future work. The Milestone 9 report surface now includes authenticated Mini App views and role-safe CSV export.

## ADR-007: Quota-aware registry initialization and safe diagnostics

**Status:** Accepted for Milestone 2.

The central registry must not be reinitialized on every repository operation. `GoogleSheetsClient` caches the in-flight and completed initialization promise per spreadsheet ID for the lifetime of a client instance. Failed initialization is removed from the cache so a later request can retry. This reduces repeated metadata and worksheet-header reads while preserving correct initialization on serverless cold starts.

The decision responds to a production `429 RESOURCE_EXHAUSTED` failure caused by repeated Google Sheets read requests. The repository keeps the existing one-spreadsheet architecture and does not add a second data store or bypass authorization. Google failures use labeled, redacted server-side diagnostics containing only the operation, method, redacted path, status, and safe error details; request bodies and credentials are never logged.

## ADR-008: Family Management and Administration as a separate milestone

**Status:** Accepted and implemented in Milestone 3.

Family creation, invitation, and join behavior provide the Milestone 2 foundation, while member lifecycle and family administration are a distinct capability. Member listing, role promotion or demotion, member removal, invitation revocation, family renaming, and family archival were implemented in Milestone 3 with explicit authorization, confirmation, recovery, last-OWNER, and audit semantics before transaction commands are introduced.

Hard deletion remains deferred until retention, backup, recovery, and ownership-transfer rules are defined.

## ADR-009: Private multi-channel reporting and optional PDF protection

**Status:** Accepted; Telegram reports, authenticated Mini App views, role-safe CSV export, print-friendly HTML, and server-side PDF export implemented in Milestone 9. Category summaries remain deferred.

The central Google Spreadsheet remains a private backend and is never shared directly with family members. Reports are delivered through controlled channels: Telegram summaries, authenticated Mini App views, per-request CSV, print-friendly HTML reports, and server-side PDF exports. Every export is authorized server-side; PDF bytes are generated in memory and streamed without persistence. All active members may view authorized reports through Telegram or the Mini App, but only `OWNER` and `ADMIN` may request export artifacts. Every channel must authorize the requester server-side and resolve the family from membership rather than client input.

The export role check occurs before report generation and artifact creation. A MEMBER request must be rejected even if it bypasses the normal interface and calls an export endpoint directly.

PDF password protection is optional and selected before export. When selected, the server encrypts the generated PDF using the request-body password, uses it only for that export operation, and never stores or logs it. The PDF is generated in memory and streamed directly; no artifact cleanup lifecycle is needed unless future storage is introduced. Download responses are `no-store` and contain no family identifiers, spreadsheet identifiers, report content, or password.
