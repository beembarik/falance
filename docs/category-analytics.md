# Category and Analytics Contract — Milestone 10 Slice 9

## Status

**Accepted for implementation in Milestone 10 Slice 9; production validation pending.** This slice adds deterministic domain semantics, a legacy-safe migration path, and service-level category assignment. It does not expose category UI, budgets, or category summaries in production reports yet.

## Goals

The contract must allow Falancé to classify actual transactions and summarize them without changing tenant isolation, mixing currencies, treating AI output as fact, or breaking existing rows. Category summaries must remain derived from server-resolved family transactions and must exclude `VOID` rows.

## Proposed persisted field

The proposed field is `category`, stored as a stable uppercase code rather than a translated display label. The initial code set is:

| Code | Display label |
| --- | --- |
| `UNCATEGORIZED` | Belum dikategorikan |
| `FOOD` | Makanan & Minuman |
| `SHOPPING` | Belanja |
| `HOUSEHOLD` | Rumah Tangga |
| `UTILITIES` | Tagihan & Utilitas |
| `TRANSPORTATION` | Transportasi |
| `HEALTH` | Kesehatan |
| `EDUCATION` | Pendidikan |
| `ENTERTAINMENT` | Hiburan |
| `INCOME` | Gaji & Pendapatan |
| `OTHER` | Lainnya |

Display labels are presentation data and may be localized later. Persisted values must remain stable across language changes. The schema version is currently proposed as `1`.

## Assignment semantics

`categorySuggestion` from the AI text or receipt parser remains a draft-only candidate. It is never written to `Transactions` automatically and never determines a financial total. A future approval flow may let the user accept or edit a suggestion, after which a deterministic service validates the selected code before persistence.

Manual category assignment must use the same service and repository boundary as transaction creation and editing. The browser or Telegram client must not supply `family_id` as a tenant selector. The service must resolve the family from the authenticated member and validate that the target transaction belongs to that family.

Existing transactions created before schema migration should read as `UNCATEGORIZED` when no category value is present. No automatic AI backfill is allowed. Any operator-assisted backfill must be explicit, auditable, reversible, and family-scoped.

## Analytics response contract

A category summary is grouped by both `category` and `currency`. The domain shape is:

| Field | Meaning |
| --- | --- |
| `category` | Stable category code. |
| `label` | Current display label for the code. |
| `currency` | Normalized ISO 4217 currency code. |
| `incomeMinor` | Sum of active income amounts in minor units. |
| `expenseMinor` | Sum of active expense amounts in minor units. |
| `netMinor` | `incomeMinor - expenseMinor`. |
| `transactionCount` | Number of included active transactions. |

The aggregation function must filter by the server-resolved `family_id`, optional inclusive date bounds, and `status = ACTIVE`. It must never combine IDR, USD, or any other currencies into a single total. Empty categories need not be returned; a category with an invalid or missing persisted value is normalized to `UNCATEGORIZED` during the compatibility period.

## Migration boundary

The current repository now defines `category` as the final `Transactions` column and migrates legacy ten-column rows by appending `UNCATEGORIZED`. The repository reads missing legacy values as `UNCATEGORIZED` and writes normalized codes for new or explicitly categorized transactions. The service-level assignment method validates the family-scoped active transaction before persistence and records an audit event. Supabase mapping must use the same stable code and legacy-read semantics when that migration is implemented.

The migration must include a dry-run integrity report, a backup of the complete central registry, a rollback procedure, and tests for legacy rows, duplicate headers, invalid enum values, family isolation, VOID exclusion, and per-currency grouping. No per-family spreadsheet may be created, and no Drive API is introduced.

## Authorization and roles

All active family members may view a future family-scoped category summary. Category mutations should follow the existing transaction mutation boundary and may be restricted by the final product decision; no role expansion is implied by this proposal. Existing export authorization remains unchanged: only `OWNER` and `ADMIN` may export report artifacts.

## Explicitly out of scope

This slice does not add category selectors to create/edit forms, category summaries to the Dashboard or Report screens, budgets, payment methods, recurring liabilities, AI financial insight, or Mini App receipt upload. Category UI and summaries still require their own authorization review and production validation.
