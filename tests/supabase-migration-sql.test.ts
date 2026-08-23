import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("claim_ai_usage checks the dynamic query record explicitly", () => {
  const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/0002_atomic_operations.sql"), "utf8");
  const start = migration.indexOf("create or replace function claim_ai_usage");
  const end = migration.indexOf("revoke all on function claim_telegram_update");
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const functionBody = migration.slice(start, end);
  assert.match(functionBody, /if usage_row is null then/);
  assert.doesNotMatch(functionBody, /if not found then/);
});
