# Falancé Milestones

## Milestone 0 — Project Setup

Status: IN PROGRESS

- [x] Project concept defined
- [x] Brand selected: Falancé
- [x] Telegram bot selected: @Falance_Bot
- [x] Architecture direction defined
- [x] Google Sheets selected as initial storage
- [x] Supabase selected as future migration target
- [x] Telegram Mini App selected as dashboard
- [ ] Next.js project initialized
- [ ] Agent rules configured

---

## Milestone 1 — Telegram Webhook

Status: COMPLETE

Goals:

- [x] Telegram webhook endpoint
- [x] /start command
- [x] Basic text response
- [x] Environment variables
- [x] Error handling
- [ ] Local webhook testing

---

## Milestone 2 — Family & Authorization Foundation

Status: IN PROGRESS

Architecture:

- One Falancé deployment uses one Google Spreadsheet
- All families share the same spreadsheet
- `family_id` is the server-side family isolation / tenant boundary
- No spreadsheet is created when a new family registers
- Google Sheets is treated as the backend data store
- Users do not receive spreadsheet IDs or storage identifiers
- Supabase remains the future storage migration target

Goals:

- [x] Telegram user identity
- [x] Family entity
- [x] Member entity
- [x] Owner role
- [x] Admin role
- [x] Member role
- [x] Invitation system
- [x] One-time invitation codes
- [x] Invitation expiry
- [x] Server-side family resolution
- [x] Family isolation using `family_id`
- [x] Central Google Sheets registry
- [x] Google service-account authentication
- [ ] Refactor from per-family spreadsheet provisioning to single-spreadsheet architecture
- [ ] Remove Google Drive provisioning
- [ ] Remove per-family spreadsheet IDs
- [ ] Update database schemas
- [ ] Update repository implementation
- [ ] Update tests
- [ ] Production family creation test
- [ ] Production invitation/join test

---

## Milestone 3 — Transaction Foundation

- [ ] Transactions schema
- [ ] Transaction entity
- [ ] Transaction repository interface
- [ ] Google Sheets transaction repository
- [ ] Income
- [ ] Expense
- [ ] Categories
- [ ] Amount validation
- [ ] Date validation
- [ ] Transaction ownership / family isolation
- [ ] Confirmation flow
- [ ] Transaction persistence

---

## Milestone 4 — Manual Transaction Input

- [ ] Natural Telegram text commands
- [ ] Structured transaction input
- [ ] Add income
- [ ] Add expense
- [ ] Edit transaction
- [ ] Delete/cancel transaction
- [ ] Confirmation
- [ ] Error handling
- [ ] User-friendly responses

---

## Milestone 5 — AI Text Parser

- [ ] AI provider abstraction
- [ ] AI transaction extraction
- [ ] Amount extraction
- [ ] Date extraction
- [ ] Category suggestion
- [ ] Description extraction
- [ ] Validation
- [ ] Confirmation
- [ ] Persistence
- [ ] AI failure fallback

---

## Milestone 6 — Receipt Processing

- [ ] Telegram image handling
- [ ] Image download
- [ ] Vision model abstraction
- [ ] Receipt extraction
- [ ] Merchant extraction
- [ ] Date extraction
- [ ] Item/total extraction
- [ ] Category suggestion
- [ ] Transaction confirmation
- [ ] Persistence
- [ ] Invalid receipt handling

---

## Milestone 7 — Reports & AI Analysis

- [ ] Monthly summary
- [ ] Category summary
- [ ] Income vs expense
- [ ] Balance
- [ ] Family financial overview
- [ ] Date-range filtering
- [ ] AI financial analysis
- [ ] AI spending insights
- [ ] Report authorization
- [ ] Family isolation verification

---

## Milestone 8 — Telegram Mini App

- [ ] Telegram Mini App
- [ ] Telegram authentication
- [ ] Server-side user verification
- [ ] Family authorization
- [ ] Dashboard
- [ ] Transactions
- [ ] Add transaction
- [ ] Edit transaction
- [ ] Reports
- [ ] Mobile-first UI
- [ ] PWA support

---

## Milestone 9 — Gemini Canvas Workflow

- [ ] Google Sheets Canvas experimentation
- [ ] Dashboard experimentation
- [ ] Analytics workflow
- [ ] UI inspiration
- [ ] Document useful Canvas patterns
- [ ] Evaluate whether Canvas-generated workflows should remain part of production architecture

---

## Milestone 10 — Production Hardening

- [ ] Security review
- [ ] Authorization review
- [ ] Family isolation review
- [ ] Input validation review
- [ ] Error handling
- [ ] Rate limiting
- [ ] Logging
- [ ] Monitoring
- [ ] Backup strategy
- [ ] Google Sheets quota review
- [ ] Data integrity review
- [ ] Recovery strategy

---

## Milestone 11 — Supabase Migration

- [ ] Supabase schema
- [ ] Supabase repository
- [ ] Migration tooling
- [ ] Data migration
- [ ] Verification
- [ ] Performance comparison
- [ ] Switch repository implementation
- [ ] Retain Google Sheets export/backup strategy if appropriate