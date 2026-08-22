# Changelog

All notable changes to Falancé are documented in this file.

## [0.7.1] — 2026-08-23

### Fixed

- Replaced placeholder `F` marks in the Mini App header and empty states with the transparent Falancé symbol asset used by the favicon.
- Updated print preview branding to load the same transparent symbol asset instead of a CSS-generated placeholder mark.
- Embedded the same transparent symbol asset in server-generated PDF exports, including password-protected PDFs.

### Security and integrity

- Kept report export authorization, encrypted short-lived action tokens, server-side family resolution, and ephemeral PDF password handling unchanged.

### Verification

- `npm run lint` passes.
- `npm run build` passes.
- `npm test` passes with 196 tests.
- `git diff --check` passes.

[0.7.1]: https://github.com/beembarik/falance/releases/tag/v0.7.1

## [0.7.0] — 2026-08-23

### Added

- Added a single `Buka tampilan cetak` entry inside the active-period report summary for OWNER and ADMIN users, removing the separate export card from the Mini App Laporan page.
- Added a branded, server-rendered Falancé print-preview workspace with server-generated timestamp, printer-friendly report sections, and non-printing controls for print, CSV, PDF, and optional password-protected PDF export.
- Added signed CSV and PDF actions inside the preview workspace while retaining five-minute encrypted action tokens and server-side authorization on every download.
- Added transparent Falancé symbol assets for browser and Apple icons, with the supplied black presentation background excluded.

### Changed

- Preserved report API category codes for client compatibility while rendering stable human-readable category labels in print output.
- Added PDF preparation from a signed print-preview token, with repeated OWNER/ADMIN authorization and no plaintext password in URLs, logs, or Sheets.
- Documented the M10 Slice 15 export and branding contract across the Mini App, category analytics, milestone roadmap, and decision log.

### Security and integrity

- Export remains restricted to the server-resolved family and OWNER/ADMIN roles; MEMBER users do not receive the preview entry point.
- Print, CSV, and PDF actions remain encrypted, signed, short-lived, and re-authorized through `FamilyService`/`getFinancialExportReport`.
- The central single-spreadsheet architecture, Telegram `initData` validation, multi-currency separation, no-client-controlled-family-ID invariant, and ephemeral PDF password handling remain unchanged.

### Verification

- M10 Slice 15 implementation gates passed locally.
- `npm run lint` passes.
- `npm run build` passes.
- `npm test` passes with 196 tests.
- `git diff --check` passes.

[0.7.0]: https://github.com/beembarik/falance/releases/tag/v0.7.0

## [0.6.0] — 2026-08-22

### Added

- Added read-only category filtering in the authenticated Mini App Laporan.
- Added category drill-down from the expense chart to matching loaded transaction details, scoped by category, currency, and selected report period.

### Changed

- Added an explicit filter reset control and empty state for category drill-down.
- Kept the synthetic `Lainnya` aggregation non-clickable because it is not a persisted category.
- Preserved the report detail boundary of 50 latest transactions and disclosed that boundary when drill-down is active.

### Security and integrity

- Category filtering remains presentation-only: it does not mutate transactions, recalculate authoritative totals in the browser, or accept a client-controlled family selector.
- Preserved server-side family resolution, active-transaction and period boundaries, multi-currency separation, central single-spreadsheet storage, FamilyService/repository boundaries, and role-safe export behavior.

### Verification

- M10 Slice 14 was validated in the production Mini App.
- `npm run lint` passes.
- `npm run build` passes.
- `npm test` passes with 193 tests.
- `git diff --check` passes.

[0.6.0]: https://github.com/beembarik/falance/releases/tag/v0.6.0

## [0.5.0] — 2026-08-22

### Added

- Added server-derived cash-flow analytics to the authenticated Mini App Laporan, with monthly Income, Expense, and Net Cash Flow points per currency.
- Added per-currency cash-flow visualization with explicit empty states and no cross-currency totals.

### Changed

- Extended the report API with precise minor-unit cash-flow values serialized as strings.
- Kept transaction detail limits independent from full-period analytics aggregation.
- Preserved the existing category analytics, provenance, export, and Dashboard/Laporan information architecture.

### Security and integrity

- Cash-flow aggregation remains restricted to the server-resolved family, the selected inclusive report period, and `ACTIVE` transactions; `VOID` rows and other families are excluded.
- No account, transfer, savings, budget, forecast, or AI insight semantics were introduced by this release.
- Preserved the central single-spreadsheet architecture, FamilyService/repository boundary, Telegram `initData` validation, multi-currency separation, and no-client-controlled-family-ID invariant.

### Verification

- M10 Slice 13 was validated in the production Mini App.
- `npm run lint` passes.
- `npm run build` passes.
- `npm test` passes with 193 tests.
- `git diff --check` passes.

[0.5.0]: https://github.com/beembarik/falance/releases/tag/v0.5.0

## [0.4.0] — 2026-08-22

### Added

- Added server-resolved transaction provenance in authenticated Mini App report data, exposing a safe creator display name without sending Telegram IDs or raw member identifiers to the browser.
- Added the M10 Slice 12 Dashboard refinement: Beranda now focuses on the family financial snapshot and recent activity, while category analytics is presented in Laporan.

### Changed

- Moved the read-only expense-by-category visualization from Beranda to Laporan to keep the first screen focused and fast to understand.
- Added `dicatat oleh <nama>` to transaction list and detail views, with a generic `Member` fallback when a display name cannot be resolved.
- Renamed period net values from `Saldo` to `Surplus` or `Defisit` to avoid implying an account balance before an opening-balance and account model exists.
- Reduced competing Dashboard actions by keeping `Tambah transaksi` as the primary Beranda action and making the transaction-list action secondary.
- Kept CSV, print, and PDF export behavior unchanged while preserving their existing OWNER/ADMIN authorization boundary.

### Security and integrity

- Preserved server-side Telegram `initData` validation, family resolution, family isolation, central single-spreadsheet storage, FamilyService/repository write boundaries, audit behavior, soft-void semantics, and the no-client-controlled-family-ID invariant.
- Preserved per-currency aggregation without combining IDR, USD, or other currencies into a single financial total.
- Explicitly kept account/transfer/savings, budget, payment method, receipt upload, and AI insight features out of this release.

### Verification

- Slice 12 was validated in the production Mini App: category chart placement and transaction provenance behavior were confirmed.
- `npm run lint` passes.
- `npm run build` passes.
- `npm test` passes with 192 tests.
- `git diff --check` passes.

[0.4.0]: https://github.com/beembarik/falance/releases/tag/v0.4.0

## [0.3.0] — 2026-08-22

### Added

- Expanded the Telegram Mini App from a read-only workspace into a family-finance workflow with transaction creation, editing, and soft-void confirmation.
- Added family administration from the Mini App Account screen for invitation creation, family-name updates, MEMBER/ADMIN role changes, and member deactivation with durable five-minute confirmation.
- Added ready-to-share invitation messages in the Mini App and Telegram `/invite` response, including the configured bot deep link and the exact `/join FAL-XXX` instruction.
- Added copyable `/join FAL-XXX` controls in both Mini App and Telegram output.

### Changed

- Added `FALANCE_TELEGRAM_BOT_USERNAME` as the public bot username configuration used to build invitation links.
- Added ISO 4217 currency validation at the authoritative service boundary so unsupported three-letter values such as `IDE` are rejected.
- Stabilized Mini App transaction edit authorization by refreshing raw Telegram `initData` when the edit form opens.
- Improved Dashboard navigation by separating the report action from the transaction-list action.
- Updated README and Telegram/Mini App documentation for the current M10 scope.

### Security and integrity

- Preserved server-side family resolution from verified Telegram membership and invitation state.
- Preserved the central single-spreadsheet architecture; no client-supplied `family_id` is trusted for authorization.
- Preserved service/repository write boundaries, audit logging, last-OWNER protection, soft-state deactivation/void semantics, and durable confirmation rules.

### Verification

- `npm run lint` passes.
- `npm run build` passes.
- `npm test` passes with 179 tests.
- `git diff --check` passes.

[0.3.0]: https://github.com/beembarik/falance/releases/tag/v0.3.0
