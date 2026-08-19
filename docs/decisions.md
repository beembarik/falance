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

Supabase is the planned future storage implementation. Milestone 2 deliberately does not introduce Supabase, transactions, financial parsing, AI, dashboards, Mini App functionality, payment, or subscription systems.
