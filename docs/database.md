# Falancé Database

## Storage

Initial storage:
Google Sheets

Future storage:
Supabase

The application must access financial data through a repository abstraction.

## Family Registry

The central registry is a dedicated Google Spreadsheet, configured with
`GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID`. It contains `Families`, `Members`,
`Invitations`, and `Pending Family Creations` sheets. It is application metadata, not a
family financial spreadsheet.

Family spreadsheets are separate Google Drive files created in the dedicated folder
configured by `GOOGLE_FALANCE_DRIVE_FOLDER_ID`. The service account needs access to both
the registry and this folder.

Families include `family_id`, `family_name`, `spreadsheet_id`, `status`, `created_at`,
`created_by`, and `plan`. `family_id` is the stable application identifier; the Google
`spreadsheet_id` is replaceable storage metadata.

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

Member statuses are ACTIVE, SUSPENDED, and LEFT. Telegram user IDs are persisted as
strings. The registry membership index is used to resolve family access server-side.
Pending family-creation records expire after 15 minutes; a new `/createfamily` replaces
the previous pending record, so an abandoned flow cannot block future creation.

### Invitations

- invitation_id
- family_id
- code
- created_by
- created_at
- expires_at
- status
- used_by
- used_at

Invitation statuses are PENDING, USED, EXPIRED, and REVOKED. Invitations are validated
before membership creation and are single-use in application logic. The expiry duration is
configured with `FALANCE_INVITATION_EXPIRY_HOURS` (24 hours by default).

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
