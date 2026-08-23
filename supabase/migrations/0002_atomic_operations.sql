-- Atomic server-side operations for the Supabase persistence adapter.
-- These functions are intentionally callable only with the service role.

create or replace function claim_telegram_update(
  p_update_id bigint,
  p_claimed_at timestamptz,
  p_lease_ms bigint
) returns boolean
language plpgsql
security invoker
as $$
declare
  current_row processed_telegram_updates%rowtype;
  lease_until timestamptz := p_claimed_at + make_interval(secs => p_lease_ms / 1000.0);
begin
  if p_update_id < 0 or p_lease_ms < 0 then return false; end if;

  select * into current_row
    from processed_telegram_updates
   where update_id = p_update_id
   for update;

  if not found then
    insert into processed_telegram_updates(update_id, claimed_at, completed_at, status)
    values (p_update_id, p_claimed_at, null, 'CLAIMED');
    return true;
  end if;

  if current_row.status = 'COMPLETED' then return false; end if;
  if current_row.claimed_at + make_interval(secs => p_lease_ms / 1000.0) > p_claimed_at then return false; end if;

  update processed_telegram_updates
     set claimed_at = p_claimed_at, completed_at = null, status = 'CLAIMED'
   where update_id = p_update_id;
  return true;
end;
$$;

create or replace function claim_draft_approval(
  p_draft_id text,
  p_telegram_user_id text,
  p_family_id text,
  p_transaction_id text,
  p_claimed_at timestamptz,
  p_lease_ms bigint
) returns boolean
language plpgsql
security invoker
as $$
declare
  current_row draft_approval_claims%rowtype;
  lease_until timestamptz := p_claimed_at + make_interval(secs => p_lease_ms / 1000.0);
begin
  if p_draft_id is null or p_telegram_user_id is null or p_family_id is null or p_transaction_id is null or p_lease_ms < 0 then return false; end if;

  select * into current_row
    from draft_approval_claims
   where draft_id = p_draft_id
   for update;

  if not found then
    insert into draft_approval_claims(draft_id, telegram_user_id, family_id, transaction_id, claimed_at, completed_at, lease_until, status)
    values (p_draft_id, p_telegram_user_id, p_family_id, p_transaction_id, p_claimed_at, null, lease_until, 'CLAIMED');
    return true;
  end if;

  if current_row.status = 'COMPLETED' or current_row.lease_until > p_claimed_at then return false; end if;

  update draft_approval_claims
     set telegram_user_id = p_telegram_user_id,
         family_id = p_family_id,
         transaction_id = p_transaction_id,
         claimed_at = p_claimed_at,
         completed_at = null,
         lease_until = lease_until,
         status = 'CLAIMED'
   where draft_id = p_draft_id;
  return true;
end;
$$;

create or replace function consume_invitation(
  p_code text,
  p_used_by text,
  p_used_at timestamptz
) returns boolean
language sql
security invoker
as $$
  update invitations
     set status = 'USED', used_by = p_used_by, used_at = p_used_at
   where code = p_code
     and status = 'PENDING'
     and expires_at > p_used_at
  returning true;
$$;

create or replace function claim_ai_usage(
  p_usage_key text,
  p_family_id text,
  p_telegram_user_id text,
  p_claimed_at timestamptz,
  p_cooldown_ms bigint,
  p_window_ms bigint,
  p_max_requests integer,
  p_lease_ms bigint,
  p_is_text boolean
) returns boolean
language plpgsql
security invoker
as $$
declare
  current_key text;
  previous_window timestamptz;
  previous_count integer;
  previous_claim timestamptz;
  previous_lease timestamptz;
  next_window timestamptz;
  next_count integer;
  table_name text := case when p_is_text then 'ai_text_usage' else 'ai_vision_usage' end;
  usage_row record;
begin
  if p_usage_key is null or p_family_id is null or p_telegram_user_id is null
     or p_cooldown_ms < 0 or p_window_ms < 0 or p_max_requests < 1 or p_lease_ms < 0 then return false; end if;

  execute format('select usage_key, window_started_at, request_count, last_claimed_at, lease_until from %I where usage_key = $1 for update', table_name)
    into usage_row using p_usage_key;

  if usage_row is null then
    execute format('insert into %I(usage_key, family_id, telegram_user_id, window_started_at, request_count, last_claimed_at, lease_until, status) values ($1,$2,$3,$4,1,$4,$4 + make_interval(secs => $5 / 1000.0),''IN_FLIGHT'')', table_name)
      using p_usage_key, p_family_id, p_telegram_user_id, p_claimed_at, p_lease_ms;
    return true;
  end if;

  previous_lease := usage_row.lease_until;
  if previous_lease > p_claimed_at then return false; end if;
  previous_claim := usage_row.last_claimed_at;
  if previous_claim + make_interval(secs => p_cooldown_ms / 1000.0) > p_claimed_at then return false; end if;

  previous_window := usage_row.window_started_at;
  previous_count := usage_row.request_count;
  if previous_window + make_interval(secs => p_window_ms / 1000.0) < p_claimed_at then
    next_window := p_claimed_at;
    next_count := 1;
  else
    next_window := previous_window;
    next_count := previous_count + 1;
    if next_count > p_max_requests then return false; end if;
  end if;

  execute format('update %I set window_started_at=$1, request_count=$2, last_claimed_at=$3, lease_until=$3 + make_interval(secs => $4 / 1000.0), status=''IN_FLIGHT'' where usage_key=$5', table_name)
    using next_window, next_count, p_claimed_at, p_lease_ms, p_usage_key;
  return true;
end;
$$;

revoke all on function claim_telegram_update(bigint, timestamptz, bigint) from public;
revoke all on function claim_draft_approval(text, text, text, text, timestamptz, bigint) from public;
revoke all on function consume_invitation(text, text, timestamptz) from public;
revoke all on function claim_ai_usage(text, text, text, timestamptz, bigint, bigint, integer, bigint, boolean) from public;
grant execute on function claim_telegram_update(bigint, timestamptz, bigint) to service_role;
grant execute on function claim_draft_approval(text, text, text, text, timestamptz, bigint) to service_role;
grant execute on function consume_invitation(text, text, timestamptz) to service_role;
grant execute on function claim_ai_usage(text, text, text, timestamptz, bigint, bigint, integer, bigint, boolean) to service_role;
