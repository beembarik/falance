# Falancé Telegram Integration

## Webhook

Telegram updates are received by `POST /api/telegram/webhook`. `GET /api/telegram/webhook` remains a health/status endpoint. The route validates the update shape, passes supported commands to the family service, and sends user-facing responses through the existing Telegram Bot API client.

Telegram credentials remain server-only. The bot token must not be exposed to browser code or included in user-visible messages.

## Milestone 2 commands

| Command | Behavior |
| --- | --- |
| `/start` | Returns the existing welcome response. |
| `/createfamily` | Starts or replaces a 15-minute pending family creation request. A user with active membership is rejected. The next text message supplies the family name. |
| `/invite` | Requires an active `OWNER` or `ADMIN` membership. The generated code is bound to that member’s server-resolved `family_id`. |
| `/join <code>` | Resolves the invitation by code, validates status and expiry, rejects an already-active member, creates membership for the invitation’s family, and consumes the code. |

## Identity and authorization

The backend uses the Telegram user ID from the verified update as the identity key. It looks up active membership in the central `Members` sheet and obtains the authorized `family_id` from that row.

> User-provided `family_id`, spreadsheet ID, or other storage identifier is never an authorization input.

Invitation joins are family-bound because the server obtains `family_id` from the invitation row after validating the code. The client supplies only the code and cannot select a different family.

## Roles

`OWNER` and `ADMIN` may create invitations. `MEMBER` may use normal family features but cannot create invitations. These checks are enforced in the family service rather than trusted to Telegram message wording or a future client interface.

## Out of scope

Financial transactions, receipt OCR, AI categorization and summaries, budgets, dashboards, the Telegram Mini App, payments, subscriptions, and Supabase are not implemented in Milestone 2.
