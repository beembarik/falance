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

Supabase is the planned future storage implementation. Milestone 2 deliberately did not introduce Supabase or transaction commands. The Milestone 4 transaction foundation now provides central transaction persistence and service authorization; financial parsing, AI, payment, and subscription systems remain future work. Milestone 9 now provides authenticated Telegram/Mini App reports and role-safe CSV, print, and server-side PDF export. Milestone 10 begins with a read-only Dashboard surface derived from the same authoritative report payload; persisted category summaries and their read-only analytics presentation are defined by ADR-011, while Slice 12 refines their placement into Laporan.

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

PDF password protection is optional and selected before export. When selected, the server prepares an encrypted short-lived action token from the HTTPS request, uses the password only during in-memory PDF generation, and never stores or logs the plaintext password. The PDF is generated in memory and streamed directly; no artifact cleanup lifecycle is needed unless future storage is introduced. Download responses are `no-store` and contain no family identifiers, spreadsheet identifiers, report content, or plaintext password. Milestone 10 Dashboard work reuses the same report authorization and does not introduce a client-controlled family selector or write path.

## ADR-010: Falancé Mini App design system and workspace expansion

**Status:** Accepted for Milestone 10 planning; implementation incremental.

The Telegram Mini App uses one responsive component system rather than separate product implementations for phone, tablet, desktop, and ordinary browser fallback. The primary target is a mobile-first Telegram experience with an AppShell, bottom navigation, a prominent add-transaction action, progressive disclosure, accessible touch targets, and explicit loading, empty, and error states. On wider viewports, the same domain components may use a wider grid or navigation rail/sidebar without duplicating business logic.

The visual system follows the Falancé logo while excluding the black logo background from the application palette. Brand green is the primary action and navigation color; lavender-purple is a restrained identity accent; coral is used for expense and attention semantics; the application background is off-white; surfaces are white; text uses a dark green-neutral rather than pure black; and shadows remain soft. Proposed starting tokens are `#267A5A`/`#31946F`/`#61B89C` for green, `#8E72D6` for purple, `#F28A7C` for coral, `#FAFBF8` for the application background, and `#223029` for primary text. These values are design starting points and may be adjusted after implementation screenshots and accessibility checks.

The authenticated viewer’s Telegram `photo_url` may be used as an optional avatar on the Mini App Account surface when it is present in the validated raw `initData`. When Telegram omits that field, the server may issue a short-lived encrypted same-origin avatar proxy URL bound to the validated Telegram user and retrieve the current profile photo through the Bot API. The URL is not accepted as a separate client authorization input, bot credentials are never exposed to the browser, the URL is not stored in Google Sheets, and it is not used to infer identity or family membership. If the photo is unavailable, invalid, inaccessible, or fails to load, the UI falls back to initials. Avatars for other family members are intentionally not fetched or inferred in this slice.

The Dashboard, Transaksi, Laporan, and Akun/Keluarga surfaces may be expanded using the existing family-scoped report and service boundaries. A Mini App write path is a separate security-sensitive slice: raw Telegram `initData` is validated server-side, membership and `family_id` are resolved server-side, role rules are enforced in `FamilyService`, and the client never writes directly to Google Sheets or supplies a family identifier as authorization. Multi-currency balances must remain separated and must never be added together as if they shared one currency.

Persisted transaction categories, payment methods, budgets, category summaries, AI financial insight, and Mini App receipt scanning are not implied by this UI decision. Persisted categories and read-only category summaries now have a separately accepted contract in ADR-011; budgets, AI insight, and receipt scanning still require their own user-facing authorization and operational decisions before being shown as authoritative product data.

## ADR-011: Category and analytics contract before persistence

**Status:** Accepted; M10 Slices 9–14 production validated.

Falancé will use stable uppercase category codes with separate display labels rather than persisting translated labels. The proposed initial code set and deterministic summary shape are defined in [`docs/category-analytics.md`](category-analytics.md). Existing AI `categorySuggestion` values remain draft-only candidates and cannot be persisted or used as the source of financial totals without explicit user approval and service validation.

Category analytics must be grouped by both category and normalized ISO currency. It must include only active transactions in the server-resolved family and selected inclusive date range, exclude `VOID` rows, and calculate income, expense, net, and transaction count using integer minor units. Amounts in different currencies must never be combined.

The implementation appends `category` as the final column of the existing central `Transactions` worksheet, migrates legacy rows by writing `UNCATEGORIZED`, reads absent values with the same fallback, and writes only validated stable codes through the repository. The operator completed the central registry backup and production integrity check with `healthy: true` and `issues: []`. M10 Slice 10 exposes explicit category selection in authenticated Mini App create/edit flows and has been production validated. M10 Slice 11 exposes read-only summaries and expense distribution per currency in the analytics presentation layer; M10 Slice 12 places that visualization in Laporan while keeping Beranda focused on snapshot and activity; M10 Slice 13 adds cash-flow points using the same period/currency boundary. A future Supabase mapping must preserve the same codes and legacy semantics. No per-family spreadsheet or Drive API is introduced.

This ADR authorizes the read-only category summary and per-currency expense visualization in M10 Slice 11, with the Laporan placement validated in M10 Slice 12. It does not authorize budgets, payment methods, recurring liabilities, AI financial insight, or Mini App receipt scanning. Those remain separate decisions and implementation slices.

## ADR-012: Dashboard snapshot, report analytics, and transaction provenance

**Status:** Accepted; M10 Slices 12–14 production validated.

Falancé will keep Beranda focused on a family financial snapshot and recent family activity. Category analytics belong to Laporan, where users explicitly seek analysis and export. Moving the presentation of the category chart does not remove or weaken the server-side category summary contract introduced by ADR-011.

Transaction provenance is a presentation concern backed by the existing `createdByMemberId`. The server may resolve that opaque member reference to the display name of an active or historical member in the same family and return only a safe display field such as `createdByName`. Telegram IDs, raw member identifiers, credentials, and family selectors must not be sent to the browser for this purpose. Missing names use a generic fallback.

The period value `income - expense` must be labeled as `Surplus periode`, `Defisit periode`, or `Arus bersih`, not as an account balance, until Falancé has an opening-balance and account model. This slice does not introduce saving transactions, accounts, transfers, savings rates, or savings goals. Any future savings feature must be built on an explicit account/money-bucket and transfer contract.

The slice may reduce duplicate primary CTAs on Beranda while preserving the persistent bottom-navigation `+` action. All existing family isolation, multi-currency separation, and FamilyService/repository boundaries remain unchanged.

## ADR-013: Server-derived cash-flow analytics per currency

**Status:** Accepted; M10 Slices 13–14 production validated.

Falancé will expose a read-only cash-flow view in Laporan using server-derived monthly points for the selected report period. Each point contains `INCOME`, `EXPENSE`, and `NET` values plus transaction count, grouped by normalized currency. The server resolves the active family from validated Telegram `initData`, filters only `ACTIVE` transactions within the inclusive period, and never combines amounts from different currencies.

The Mini App may render income and expense bars and a surplus/deficit net label from this response. It must not calculate financial totals from raw transaction rows, treat net cash flow as an account balance, or infer savings. Empty periods must remain explicit. This slice does not introduce accounts, transfers, savings goals, budgets, forecasts, or AI insight.

## ADR-014: Read-only category filter and bounded drill-down

**Status:** Accepted; M10 Slice 14 production validated.

The Laporan category chart may act as a presentation control. Selecting a persisted category and currency filters the already loaded report transaction details for the selected period; the client does not recalculate category totals or mutate transactions. The filter uses the server-derived category code and the chart currency together, so the same category in two currencies can never be conflated.

The report detail list remains independently bounded to the latest 50 active transactions. When that boundary applies, the UI must disclose that the drill-down covers the loaded detail rows while the server-derived category summary remains authoritative. The synthetic `Lainnya` bucket is not a persisted category and is not clickable. Complete server-filtered pagination is a future slice.

## ADR-015: Branded report preview and consolidated export actions

**Status:** Accepted; M10 Slice 15 in development.

Laporan Mini App will expose one export entry point from the active period summary rather than separate export cards. The entry point opens a server-generated print preview that acts as the export workspace and provides screen-only controls for print, CSV, and PDF, including optional PDF password preparation. The preview keeps the selected period and family-scoped report context.

The print preview is a presentation layer only. Every export action remains OWNER/ADMIN-only and must be backed by signed short-lived report tokens with repeated server-side authorization. The preview must not accept client-controlled family IDs, spreadsheet IDs, Telegram IDs, or storage identifiers. The server supplies the generation timestamp using `FALANCE_TIME_ZONE`; the browser clock is not authoritative for report metadata.

The preview uses Falancé green, lavender-purple, and coral as semantic accents with grayscale-readable text and a toolbar hidden from printed output. The symbol-only Falancé mark is used as a transparent favicon and must not include the source image's black background.
