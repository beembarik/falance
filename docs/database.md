# Falancé Database

## Storage

Initial storage:
Google Sheets

Future storage:
Supabase

The application must access financial data through a repository abstraction.

## Planned Entities

### Families

- family_id
- name
- created_at
- created_by

### Members

- member_id
- family_id
- telegram_user_id
- display_name
- role
- status
- joined_at

Roles:
- OWNER
- ADMIN
- MEMBER

### Transactions

- transaction_id
- family_id
- created_by
- type
- amount
- currency
- category
- description
- transaction_date
- source
- created_at

Types:
- INCOME
- EXPENSE

Sources:
- TEXT
- RECEIPT
- MINI_APP
- OTHER

### Categories

- category_id
- family_id
- name
- type
- is_active

## Important Rule

Every family-owned entity must contain `family_id`.

All reads and writes must be scoped to the authenticated user's family.

## Migration

Google Sheets implementation must eventually be replaceable by a Supabase implementation without changing Telegram or Mini App business logic.