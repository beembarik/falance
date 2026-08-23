-- Falancé Supabase migration rehearsal schema.
-- Apply only to a dedicated migration project after review. No production cutover.

create table if not exists settings (
  key text primary key,
  value text not null
);

create table if not exists families (
  family_id text primary key,
  family_name text not null,
  status text not null check (status in ('ACTIVE', 'SUSPENDED')),
  created_at timestamptz not null,
  created_by text not null,
  plan text not null
);

create table if not exists members (
  member_id text primary key,
  family_id text not null references families(family_id),
  telegram_user_id text not null,
  name text not null,
  username text,
  role text not null check (role in ('OWNER', 'ADMIN', 'MEMBER')),
  status text not null check (status in ('ACTIVE', 'SUSPENDED', 'LEFT')),
  joined_at timestamptz not null
);

create index if not exists members_family_status_idx on members (family_id, status);
create unique index if not exists members_family_telegram_active_idx on members (family_id, telegram_user_id) where status in ('ACTIVE', 'SUSPENDED');

create table if not exists invitations (
  invitation_id text primary key,
  family_id text not null references families(family_id),
  code text not null unique,
  created_by text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null check (status in ('PENDING', 'USED', 'EXPIRED', 'REVOKED')),
  used_by text,
  used_at timestamptz
);

create index if not exists invitations_family_status_idx on invitations (family_id, status);

create table if not exists pending_family_creations (
  telegram_user_id text primary key,
  family_name text,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'COMPLETED'))
);

create table if not exists pending_confirmations (
  confirmation_id text primary key,
  telegram_user_id text not null,
  family_id text not null references families(family_id),
  action text not null check (action in ('REVOKE_INVITATION', 'DEACTIVATE_MEMBER', 'ARCHIVE_FAMILY', 'VOID_TRANSACTION')),
  target text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null check (status in ('PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED'))
);

create index if not exists pending_confirmations_family_status_idx on pending_confirmations (family_id, status);
create index if not exists pending_confirmations_user_status_idx on pending_confirmations (telegram_user_id, status);

create table if not exists audit_log (
  audit_id text primary key,
  family_id text not null references families(family_id),
  actor_member_id text not null references members(member_id),
  actor_role text not null check (actor_role in ('OWNER', 'ADMIN', 'MEMBER')),
  action text not null check (action in ('CREATE_INVITATION', 'REVOKE_INVITATION', 'CHANGE_MEMBER_ROLE', 'DEACTIVATE_MEMBER', 'REACTIVATE_MEMBER', 'RENAME_FAMILY', 'ARCHIVE_FAMILY', 'REACTIVATE_FAMILY', 'CREATE_TRANSACTION', 'UPDATE_TRANSACTION', 'UPDATE_TRANSACTION_CATEGORY', 'VOID_TRANSACTION')),
  target_type text not null check (target_type in ('INVITATION', 'MEMBER', 'FAMILY', 'TRANSACTION')),
  target_id text not null,
  previous_value text,
  new_value text,
  created_at timestamptz not null
);

create index if not exists audit_log_family_created_idx on audit_log (family_id, created_at desc);

create table if not exists pending_transaction_drafts (
  draft_id text primary key,
  telegram_user_id text not null,
  family_id text not null references families(family_id),
  transaction_type text not null check (transaction_type in ('INCOME', 'EXPENSE')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency = upper(currency) and length(currency) = 3),
  transaction_date date not null,
  description text not null check (char_length(description) between 1 and 200),
  confidence text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  transaction_date_inferred boolean not null default false,
  category_suggestion text,
  description_suggestion text,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null check (status in ('PENDING', 'EDITING', 'COMPLETED', 'CANCELLED', 'EXPIRED'))
);

create index if not exists pending_transaction_drafts_user_status_idx on pending_transaction_drafts (telegram_user_id, status);
create index if not exists pending_transaction_drafts_family_status_idx on pending_transaction_drafts (family_id, status);

create table if not exists draft_approval_claims (
  draft_id text primary key references pending_transaction_drafts(draft_id),
  telegram_user_id text not null,
  family_id text not null references families(family_id),
  transaction_id text not null unique,
  claimed_at timestamptz not null,
  completed_at timestamptz,
  lease_until timestamptz not null,
  status text not null check (status in ('CLAIMED', 'COMPLETED'))
);

create index if not exists draft_approval_claims_family_idx on draft_approval_claims (family_id);

create table if not exists processed_telegram_updates (
  update_id bigint primary key check (update_id >= 0),
  claimed_at timestamptz not null,
  completed_at timestamptz,
  status text not null check (status in ('CLAIMED', 'COMPLETED'))
);

create table if not exists ai_vision_usage (
  usage_key text primary key,
  family_id text not null references families(family_id),
  telegram_user_id text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  last_claimed_at timestamptz not null,
  lease_until timestamptz not null,
  status text not null check (status in ('IN_FLIGHT', 'COMPLETED'))
);

create table if not exists ai_text_usage (
  usage_key text primary key,
  family_id text not null references families(family_id),
  telegram_user_id text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  last_claimed_at timestamptz not null,
  lease_until timestamptz not null,
  status text not null check (status in ('IN_FLIGHT', 'COMPLETED'))
);

create index if not exists ai_vision_usage_family_user_idx on ai_vision_usage (family_id, telegram_user_id);
create index if not exists ai_text_usage_family_user_idx on ai_text_usage (family_id, telegram_user_id);

create table if not exists transactions (
  transaction_id text primary key,
  family_id text not null references families(family_id),
  transaction_type text not null check (transaction_type in ('INCOME', 'EXPENSE')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency = upper(currency) and length(currency) = 3),
  transaction_date date not null,
  description text not null check (char_length(description) between 1 and 200),
  created_by_member_id text not null references members(member_id),
  created_at timestamptz not null,
  status text not null check (status in ('ACTIVE', 'VOID')),
  category text
);

create index if not exists transactions_family_date_idx on transactions (family_id, transaction_date desc);
create index if not exists transactions_family_status_idx on transactions (family_id, status);

-- Tables are intentionally protected from browser/anon access. The future adapter
-- must use a server-side credential and keep authorization in FamilyService.
alter table settings enable row level security;
alter table families enable row level security;
alter table members enable row level security;
alter table invitations enable row level security;
alter table pending_family_creations enable row level security;
alter table pending_confirmations enable row level security;
alter table audit_log enable row level security;
alter table pending_transaction_drafts enable row level security;
alter table draft_approval_claims enable row level security;
alter table processed_telegram_updates enable row level security;
alter table ai_vision_usage enable row level security;
alter table ai_text_usage enable row level security;
alter table transactions enable row level security;

-- No anon/authenticated policies are created here: access is deny-by-default.
-- Supabase service_role bypass is to be used only by the server-side adapter.
