import assert from "node:assert/strict";
import test from "node:test";

import { createSupabaseImportPlan } from "../src/lib/migration/supabase-import-plan";
import type { MigrationSnapshot } from "../src/lib/migration/supabase-rehearsal";

function healthySnapshot(): MigrationSnapshot {
  return {
    sheets: {
      Settings: [{ key: "business_timezone", value: "UTC" }],
      Families: [{ family_id: "family-test", family_name: "Test Family", status: "ACTIVE", created_at: "2026-01-01T00:00:00.000Z", created_by: "user-test", plan: "FREE" }],
      Members: [{ member_id: "member-test", family_id: "family-test", telegram_user_id: "user-test", name: "Test User", role: "OWNER", status: "ACTIVE", joined_at: "2026-01-01T00:00:00.000Z" }],
      Invitations: [],
      "Pending Family Creations": [{ telegram_user_id: "pending-user", created_at: "2026-01-01T00:00:00.000Z", expires_at: "2026-01-01T01:00:00.000Z" }],
      "Pending Confirmations": [],
      "Audit Log": [],
      "Pending Transaction Drafts": [],
      "Draft Approval Claims": [],
      "Processed Telegram Updates": [],
      "AI Vision Usage": [],
      "AI Text Usage": [],
      Transactions: [],
    },
  };
}

test("creates deterministic foreign-key-safe batches and preserves legacy pending rows", () => {
  const plan = createSupabaseImportPlan(healthySnapshot());
  assert.deepEqual(plan.batches.map((batch) => batch.table), ["settings", "families", "members", "pending_family_creations"]);
  assert.equal(plan.batches[0]?.onConflict, "key");
  assert.equal(plan.batches[3]?.rows[0]?.status, "PENDING");
});

test("refuses to create an import plan from an unhealthy snapshot", () => {
  const snapshot = healthySnapshot();
  snapshot.sheets.Members = [{ ...snapshot.sheets.Members[0], member_id: "", family_id: "missing-family" }];
  assert.throws(() => createSupabaseImportPlan(snapshot), /rehearsal is unhealthy/);
});
