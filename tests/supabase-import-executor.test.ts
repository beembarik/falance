import assert from "node:assert/strict";
import test from "node:test";
import { applySupabaseImport } from "../src/lib/migration/supabase-import-executor.ts";

test("applies non-empty batches in plan order and returns metadata only", async () => {
  const calls: Array<{ table: string; count: number; onConflict: string }> = [];
  const report = await applySupabaseImport({
    version: 1,
    sourceSheets: ["Families", "Members", "Transactions"],
    batches: [
      { table: "families", onConflict: "family_id", rows: [{ family_id: "opaque-family" }] },
      { table: "members", onConflict: "member_id", rows: [] },
      { table: "transactions", onConflict: "transaction_id", rows: [{ transaction_id: "opaque-transaction" }] },
    ],
  }, {
    async upsert(table, rows, onConflict) {
      calls.push({ table, count: rows.length, onConflict });
      return { ok: true, status: 201 };
    },
  });

  assert.deepEqual(calls, [
    { table: "families", count: 1, onConflict: "family_id" },
    { table: "transactions", count: 1, onConflict: "transaction_id" },
  ]);
  assert.deepEqual(report, {
    version: 1,
    sourceSheets: ["Families", "Members", "Transactions"],
    batchesApplied: 2,
    rowsApplied: 2,
  });
});

test("stops at the first failed batch without exposing row data", async () => {
  const calls: string[] = [];
  await assert.rejects(() => applySupabaseImport({
    version: 1,
    sourceSheets: ["Families", "Members"],
    batches: [
      { table: "families", onConflict: "family_id", rows: [{ family_id: "opaque-family" }] },
      { table: "members", onConflict: "member_id", rows: [{ member_id: "opaque-member" }] },
    ],
  }, {
    async upsert(table) {
      calls.push(table);
      return { ok: false, status: 409 };
    },
  }), /Supabase import failed for table families/);
  assert.deepEqual(calls, ["families"]);
});

test("rejects an unknown table before network access", async () => {
  let called = false;
  await assert.rejects(() => applySupabaseImport({
    version: 1,
    sourceSheets: ["Unknown"],
    batches: [{ table: "unknown", onConflict: "id", rows: [{ id: "opaque" }] }],
  }, {
    async upsert() {
      called = true;
      return { ok: true, status: 201 };
    },
  }), /invalid batch/);
  assert.equal(called, false);
});
