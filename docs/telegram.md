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

## Authentication

Telegram user identity is based on Telegram user ID.

Unknown users must not gain access to family data.

Users must be invited/registered before accessing a family.

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