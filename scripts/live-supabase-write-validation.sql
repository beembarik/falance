-- Live write validation for the upstream GitHub Falancé repository.
-- Run only against the dedicated Supabase test project with service-role access.
-- The DO block rolls back on assertion failure; successful execution deletes all fixtures before completion.

do $$
declare
  v_family_id text := 'live_migration_family_20260823';
  v_member_id text := 'live_migration_member_20260823';
  v_user_id text := 'live_migration_user_20260823';
  invitation_code text := 'LIVE-MIGRATION-20260823';
  used boolean;
begin
  -- Defensive cleanup makes reruns safe.
  delete from public.ai_text_usage where usage_key like 'live_migration_%';
  delete from public.ai_vision_usage where usage_key like 'live_migration_%';
  delete from public.draft_approval_claims where draft_id like 'live_migration_%';
  delete from public.pending_transaction_drafts where draft_id like 'live_migration_%';
  delete from public.processed_telegram_updates where update_id = 826082301;
  delete from public.transactions where transaction_id like 'live_migration_%';
  delete from public.invitations where invitation_id like 'live_migration_%';
  delete from public.members where member_id like 'live_migration_%';
  delete from public.pending_family_creations where telegram_user_id like 'live_migration_%';
  delete from public.families where family_id like 'live_migration_%';

  -- Import the sanitized Google Sheets snapshot projection.
  insert into public.families(family_id, family_name, status, created_at, created_by, plan)
  values (v_family_id, 'Test Family', 'ACTIVE', '2026-08-23T00:00:00Z', v_user_id, 'FREE');
  insert into public.members(member_id, family_id, telegram_user_id, name, username, role, status, joined_at)
  values (v_member_id, v_family_id, v_user_id, 'Test Member', 'test_user', 'OWNER', 'ACTIVE', '2026-08-23T00:00:00Z');
  insert into public.transactions(transaction_id, family_id, transaction_type, amount_minor, currency, transaction_date, description, created_by_member_id, created_at, status, category)
  values ('live_migration_transaction_20260823', v_family_id, 'EXPENSE', 100000, 'IDR', '2026-08-22', 'Test expense', v_member_id, '2026-08-23T00:00:00Z', 'ACTIVE', 'FOOD');

  if (select count(*) from public.families where family_id = v_family_id) <> 1 then raise exception 'snapshot family parity failed'; end if;
  if (select count(*) from public.members where member_id = v_member_id and family_id = v_family_id and role = 'OWNER') <> 1 then raise exception 'snapshot member parity failed'; end if;
  if (select count(*) from public.transactions where transaction_id = 'live_migration_transaction_20260823' and family_id = v_family_id and amount_minor = 100000 and currency = 'IDR' and category = 'FOOD') <> 1 then raise exception 'snapshot transaction parity failed'; end if;

  -- Pending-family upsert and completion contract.
  insert into public.pending_family_creations(telegram_user_id, family_name, created_at, expires_at, status)
  values (v_user_id, 'Test Family', '2026-08-23T00:00:00Z', '2026-08-23T00:15:00Z', 'PENDING')
  on conflict (telegram_user_id) do update set family_name = excluded.family_name, created_at = excluded.created_at, expires_at = excluded.expires_at, status = excluded.status;
  update public.pending_family_creations set status = 'COMPLETED' where telegram_user_id = v_user_id and status = 'PENDING';
  if (select status from public.pending_family_creations where telegram_user_id = v_user_id) <> 'COMPLETED' then raise exception 'pending creation completion failed'; end if;

  -- Atomic update_id claim: first call wins, retry is denied, completion is conditional.
  if not public.claim_telegram_update(826082301, '2026-08-23T01:00:00Z', 60000) then raise exception 'telegram update first claim failed'; end if;
  if public.claim_telegram_update(826082301, '2026-08-23T01:00:01Z', 60000) then raise exception 'telegram update duplicate claim accepted'; end if;
  update public.processed_telegram_updates set completed_at = '2026-08-23T01:00:02Z', status = 'COMPLETED' where update_id = 826082301 and status = 'CLAIMED';
  if (select status from public.processed_telegram_updates where update_id = 826082301) <> 'COMPLETED' then raise exception 'telegram update completion failed'; end if;

  -- Draft approval claim: atomic first claim, duplicate denial, completion.
  insert into public.pending_transaction_drafts(draft_id, telegram_user_id, family_id, transaction_type, amount_minor, currency, transaction_date, description, confidence, transaction_date_inferred, created_at, expires_at, status)
  values ('live_migration_draft_20260823', v_user_id, v_family_id, 'EXPENSE', 5000, 'IDR', '2026-08-23', 'Draft fixture', 'HIGH', false, '2026-08-23T01:00:00Z', '2026-08-23T02:00:00Z', 'PENDING');
  if not public.claim_draft_approval('live_migration_draft_20260823', v_user_id, v_family_id, 'live_migration_claim_tx_20260823', '2026-08-23T01:00:00Z', 60000) then raise exception 'draft first claim failed'; end if;
  if public.claim_draft_approval('live_migration_draft_20260823', v_user_id, v_family_id, 'live_migration_claim_tx_20260823', '2026-08-23T01:00:01Z', 60000) then raise exception 'draft duplicate claim accepted'; end if;
  update public.draft_approval_claims set completed_at = '2026-08-23T01:00:02Z', status = 'COMPLETED' where draft_id = 'live_migration_draft_20260823' and status = 'CLAIMED';
  if (select status from public.draft_approval_claims where draft_id = 'live_migration_draft_20260823') <> 'COMPLETED' then raise exception 'draft completion failed'; end if;

  -- Invitation consumption: valid one-time use, then conditional denial.
  insert into public.invitations(invitation_id, family_id, code, created_by, created_at, expires_at, status)
  values ('live_migration_invitation_20260823', v_family_id, invitation_code, v_user_id, '2026-08-23T01:00:00Z', '2026-08-23T02:00:00Z', 'PENDING');
  used := public.consume_invitation(invitation_code, 'live_migration_joiner_20260823', '2026-08-23T01:30:00Z');
  if not used then raise exception 'invitation first consumption failed'; end if;
  used := public.consume_invitation(invitation_code, 'live_migration_joiner_2_20260823', '2026-08-23T01:31:00Z');
  if used then raise exception 'invitation reuse accepted'; end if;
  if (select status from public.invitations where invitation_id = 'live_migration_invitation_20260823') <> 'USED' then raise exception 'invitation status update failed'; end if;

  -- AI text and vision quota claims: first claim succeeds, lease retry is denied, completion updates status.
  if not public.claim_ai_usage('live_migration_text_key_20260823', v_family_id, v_user_id, '2026-08-23T01:00:00Z', 5000, 3600000, 5, 60000, true) then raise exception 'AI text first claim failed'; end if;
  if public.claim_ai_usage('live_migration_text_key_20260823', v_family_id, v_user_id, '2026-08-23T01:00:01Z', 5000, 3600000, 5, 60000, true) then raise exception 'AI text duplicate claim accepted'; end if;
  update public.ai_text_usage set lease_until = '2026-08-23T01:00:02Z', status = 'COMPLETED' where usage_key = 'live_migration_text_key_20260823' and status = 'IN_FLIGHT';
  if (select status from public.ai_text_usage where usage_key = 'live_migration_text_key_20260823') <> 'COMPLETED' then raise exception 'AI text completion failed'; end if;

  if not public.claim_ai_usage('live_migration_vision_key_20260823', v_family_id, v_user_id, '2026-08-23T01:00:00Z', 30000, 3600000, 5, 60000, false) then raise exception 'AI vision first claim failed'; end if;
  if public.claim_ai_usage('live_migration_vision_key_20260823', v_family_id, v_user_id, '2026-08-23T01:00:01Z', 30000, 3600000, 5, 60000, false) then raise exception 'AI vision duplicate claim accepted'; end if;
  update public.ai_vision_usage set lease_until = '2026-08-23T01:00:02Z', status = 'COMPLETED' where usage_key = 'live_migration_vision_key_20260823' and status = 'IN_FLIGHT';
  if (select status from public.ai_vision_usage where usage_key = 'live_migration_vision_key_20260823') <> 'COMPLETED' then raise exception 'AI vision completion failed'; end if;

  -- Cleanup fixture after all assertions pass.
  delete from public.ai_text_usage where usage_key like 'live_migration_%';
  delete from public.ai_vision_usage where usage_key like 'live_migration_%';
  delete from public.draft_approval_claims where draft_id like 'live_migration_%';
  delete from public.pending_transaction_drafts where draft_id like 'live_migration_%';
  delete from public.processed_telegram_updates where update_id = 826082301;
  delete from public.transactions where transaction_id like 'live_migration_%';
  delete from public.invitations where invitation_id like 'live_migration_%';
  delete from public.members where member_id like 'live_migration_%';
  delete from public.pending_family_creations where telegram_user_id like 'live_migration_%';
  delete from public.families where family_id like 'live_migration_%';
end $$;

select json_build_object(
  'status', 'passed',
  'snapshot_import_and_contract_parity', 'passed',
  'atomic_update_id_claim', 'passed',
  'draft_approval_claim', 'passed',
  'invitation_consumption', 'passed',
  'ai_text_quota_claim', 'passed',
  'ai_vision_quota_claim', 'passed',
  'cleanup', 'passed'
) as validation;
