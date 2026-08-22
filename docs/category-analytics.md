# Category and Analytics Contract — Milestone 10 Slices 9–13

## Status

**Slices 9–12 are production validated.** The deterministic category contract, legacy-safe migration, persisted `Transactions.category` field, explicit Mini App category assignment, read-only category visualization, Dashboard refinement, and transaction provenance were deployed and validated. Slice 13 extends Laporan with server-derived cash-flow analytics while preserving the same family and currency boundaries. Budgets and AI-driven automatic category persistence remain deferred.

## Goals

The contract must allow Falancé to classify actual transactions and summarize them without changing tenant isolation, mixing currencies, treating AI output as fact, or breaking existing rows. Category summaries must remain derived from server-resolved family transactions and must exclude `VOID` rows.

## Persisted field

The persisted field is `category`, stored as a stable uppercase code rather than a translated display label. The initial code set is:

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

Display labels are presentation data and may be localized later. Persisted values must remain stable across language changes. The schema version is `1`.

## Assignment semantics

`categorySuggestion` from the AI text or receipt parser remains a draft-only candidate. It is never written to `Transactions` automatically and never determines a financial total. Slice 10 lets the user select or edit an explicit category in the Mini App; the deterministic service validates the selected code before persistence. A future approval flow may also let the user accept or edit a suggestion, but AI suggestions remain non-authoritative.

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

## Slice 10 — Explicit category assignment

Slice 10 adds a category selector to Mini App transaction create/edit forms. The client sends only the selected stable code and the authenticated raw Telegram `initData`; the server resolves the family, validates the active member and transaction target, normalizes missing or blank values to `UNCATEGORIZED`, and persists through `FamilyService` and the central repository. Existing edits preserve the stored category when the category field is absent. Transaction list and detail views may display the persisted category label. AI `categorySuggestion` is not copied automatically into this field.

## Slice 11 — Read-only category analytics Dashboard

Slice 11 exposes category summaries through the authenticated Mini App report response and renders expense categories in the analytics presentation layer. Slice 12 moves the category visualization from Beranda to Laporan so the Dashboard can remain a family snapshot and activity surface. The server remains responsible for resolving the active family from validated Telegram `initData`, applying the selected report period, excluding `VOID`, and grouping by category and currency. No surface may add values across currencies. The category visual is descriptive only and does not imply a budget, saving account, forecast, recommendation, or AI insight.

## Slice 13 — Cash-flow analytics in Laporan

Slice 13 adds a server-derived cash-flow view to Laporan, with Income, Expense, and Net Cash Flow points grouped by month and currency for the selected period. The complete family transaction set is used for aggregation while the transaction detail list remains bounded independently. Empty periods remain explicit. Cash-flow visuals are descriptive only and do not imply a budget, savings account, forecast, recommendation, or AI insight.

## Slice 14 — Category filter and drill-down in Laporan

Slice 14 adds a presentation-only category filter to Laporan. Selecting a category from the server-derived chart scopes the visible transaction detail to the same category and currency within the already selected report period. The client does not recalculate category totals, alter transaction state, or send a family selector. Because the report detail list is independently bounded to the latest 50 active transactions, the UI must state that a drill-down is limited to the loaded report details when that boundary applies; the server-derived summary remains the authoritative total.

The `Lainnya` aggregate is not an authoritative persisted category and is not clickable as a single category. Any future complete category pagination or server-filtered detail endpoint requires a separate slice.

## Explicitly deferred

Budgets, payment methods, recurring liabilities, AI financial insight, and Mini App receipt upload remain deferred. Any future drill-down, category filter, or insight UI must preserve the same family/date/currency-scoped contract and undergo separate regression and production validation.
