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

export interface SupabaseImportTransport {
  upsert(table: string, rows: Record<string, unknown>[], onConflict: string): Promise<{ ok: boolean; status: number }>;
}

export interface SupabaseImportReport {
  version: 1;
  sourceSheets: string[];
  batchesApplied: number;
  rowsApplied: number;
}

const ALLOWED_TABLES = new Set([
  "settings",
  "families",
  "members",
  "invitations",
  "pending_family_creations",
  "pending_confirmations",
  "audit_log",
  "pending_transaction_drafts",
  "draft_approval_claims",
  "processed_telegram_updates",
  "ai_vision_usage",
  "ai_text_usage",
  "transactions",
]);

export async function applySupabaseImport(plan: SupabaseImportPlan, transport: SupabaseImportTransport): Promise<SupabaseImportReport> {
  if (plan.version !== 1 || !Array.isArray(plan.batches)) throw new Error("Supabase import plan is invalid.");

  let batchesApplied = 0;
  let rowsApplied = 0;
  for (const batch of plan.batches) {
    if (!ALLOWED_TABLES.has(batch.table) || !batch.onConflict || !Array.isArray(batch.rows)) throw new Error("Supabase import plan contains an invalid batch.");
    if (batch.rows.length === 0) continue;
    const result = await transport.upsert(batch.table, batch.rows, batch.onConflict);
    if (!result.ok) throw new Error(`Supabase import failed for table ${batch.table}.`);
    batchesApplied += 1;
    rowsApplied += batch.rows.length;
  }

  return { version: 1, sourceSheets: [...plan.sourceSheets], batchesApplied, rowsApplied };
}
