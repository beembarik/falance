# Telegram Integration

## Bot

Brand:
Falancé

Current bot username:
@Falance_Bot

## Planned Interaction

Telegram Bot:
- /start
- /help
- /rekap
- /family
- /invite
- natural-language transaction input
- receipt image input

## Family Commands

Milestone 2 supports `/createfamily`, `/invite`, and `/join <code>`. An unregistered user
starts family creation with `/createfamily` and then sends the family name. The creator is
persisted as OWNER. OWNER and ADMIN may generate a one-time, expiring invitation; MEMBER
may not. `/join` validates the invitation and resolves membership server-side.

`/start` checks the user's membership. Unregistered users receive the family creation/join
guidance; registered users receive their role confirmation.

## Authentication

Telegram user identity is based on Telegram user ID.

Unknown users must not gain access to family data.

Users must be invited/registered before accessing a family.

Telegram user IDs, not usernames, are the identity key. Telegram updates supply the user
identity server-side; no command accepts a trusted family or spreadsheet ID.

## Mini App

The Telegram Mini App will provide:

- family dashboard
- transaction list
- add transaction
- reports
- family management
- financial analysis

The Mini App communicates with the Next.js backend.

Authorization must be validated server-side.

## Webhook

Production:

Telegram
→ HTTPS webhook
→ Next.js API route

Development may use a secure tunnel such as ngrok or Cloudflare Tunnel.

## Security

Telegram credentials must remain server-side.

Never expose the bot token to browser code.
