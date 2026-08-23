import { rehearseSupabaseMigration, type MigrationSnapshot } from "./supabase-rehearsal";

export interface SupabaseImportBatch {
  table: string;
  onConflict: string;
  rows: Record<string, unknown>[];
}

export interface SupabaseImportPlan {
  version: 1;
  sourceSheets: string[];
  batches: SupabaseImportBatch[];
}

const TABLE_ORDER: readonly [string, string, string][] = [
  ["Settings", "settings", "key"],
  ["Families", "families", "family_id"],
  ["Members", "members", "member_id"],
  ["Invitations", "invitations", "invitation_id"],
  ["Pending Family Creations", "pending_family_creations", "telegram_user_id"],
  ["Pending Confirmations", "pending_confirmations", "confirmation_id"],
  ["Audit Log", "audit_log", "audit_id"],
  ["Pending Transaction Drafts", "pending_transaction_drafts", "draft_id"],
  ["Draft Approval Claims", "draft_approval_claims", "draft_id"],
  ["Processed Telegram Updates", "processed_telegram_updates", "update_id"],
  ["AI Vision Usage", "ai_vision_usage", "usage_key"],
  ["AI Text Usage", "ai_text_usage", "usage_key"],
  ["Transactions", "transactions", "transaction_id"],
];

const COLUMNS: Record<string, readonly string[]> = {
  settings: ["key", "value"],
  families: ["family_id", "family_name", "status", "created_at", "created_by", "plan"],
  members: ["member_id", "family_id", "telegram_user_id", "name", "username", "role", "status", "joined_at"],
  invitations: ["invitation_id", "family_id", "code", "created_by", "created_at", "expires_at", "status", "used_by", "used_at"],
  pending_family_creations: ["telegram_user_id", "family_name", "created_at", "expires_at", "status"],
  pending_confirmations: ["confirmation_id", "telegram_user_id", "family_id", "action", "target", "created_at", "expires_at", "status"],
  audit_log: ["audit_id", "family_id", "actor_member_id", "actor_role", "action", "target_type", "target_id", "previous_value", "new_value", "created_at"],
  pending_transaction_drafts: ["draft_id", "telegram_user_id", "family_id", "transaction_type", "amount_minor", "currency", "transaction_date", "description", "confidence", "transaction_date_inferred", "category_suggestion", "description_suggestion", "created_at", "expires_at", "status"],
  draft_approval_claims: ["draft_id", "telegram_user_id", "family_id", "transaction_id", "claimed_at", "completed_at", "lease_until", "status"],
  processed_telegram_updates: ["update_id", "claimed_at", "completed_at", "status"],
  ai_vision_usage: ["usage_key", "family_id", "telegram_user_id", "window_started_at", "request_count", "last_claimed_at", "lease_until", "status"],
  ai_text_usage: ["usage_key", "family_id", "telegram_user_id", "window_started_at", "request_count", "last_claimed_at", "lease_until", "status"],
  transactions: ["transaction_id", "family_id", "transaction_type", "amount_minor", "currency", "transaction_date", "description", "created_by_member_id", "created_at", "status", "category"],
};

export function createSupabaseImportPlan(snapshot: MigrationSnapshot): SupabaseImportPlan {
  const rehearsal = rehearseSupabaseMigration(snapshot);
  if (!rehearsal.healthy) throw new Error("Supabase import refused because migration rehearsal is unhealthy.");

  const batches = TABLE_ORDER.map(([sheet, table, onConflict]) => ({
    table,
    onConflict,
    rows: (snapshot.sheets[sheet] ?? []).map((row) => projectRow(table, row)),
  })).filter((batch) => batch.rows.length > 0);

  return { version: 1, sourceSheets: TABLE_ORDER.map(([sheet]) => sheet), batches };
}

function projectRow(table: string, source: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const column of COLUMNS[table] ?? []) if (source[column] !== undefined) row[column] = source[column];
  if (table === "pending_family_creations" && row.status === undefined) row.status = "PENDING";
  return row;
}
