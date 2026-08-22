# Changelog

All notable changes to Falancé are documented in this file.

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
