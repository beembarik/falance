create table if not exists financial_plans (
  plan_id text primary key,
  family_id text not null references families(family_id),
  planning_type text not null check (planning_type in ('PLAN_INCOME', 'PLAN_EXPENSE', 'RECURRING_LIABILITY')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency = upper(currency) and length(currency) = 3),
  start_date date not null,
  end_date date,
  recurrence text not null check (recurrence in ('ONCE', 'MONTHLY')),
  description text not null check (char_length(description) between 1 and 200),
  category text,
  created_by_member_id text not null references members(member_id),
  created_at timestamptz not null,
  status text not null check (status in ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')),
  check (end_date is null or end_date >= start_date)
);

create index if not exists financial_plans_family_start_idx on financial_plans (family_id, start_date);
create index if not exists financial_plans_family_status_idx on financial_plans (family_id, status);
alter table financial_plans enable row level security;