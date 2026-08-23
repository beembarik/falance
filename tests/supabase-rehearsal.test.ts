import assert from "node:assert/strict";
import test from "node:test";

import { rehearseSupabaseMigration, type MigrationSnapshot } from "../src/lib/migration/supabase-rehearsal";

const healthySnapshot: MigrationSnapshot = {
  sheets: {
    Settings: [{ key: "timezone", value: "Asia/Jakarta" }],
    Families: [{ family_id: "family-test", family_name: "Test Family", status: "ACTIVE", created_at: "2026-01-01T00:00:00.000Z", created_by: "user-test", plan: "FREE" }],
    Members: [{ member_id: "member-test", family_id: "family-test", telegram_user_id: "user-test", name: "Test User", role: "OWNER", status: "ACTIVE", joined_at: "2026-01-01T00:00:00.000Z" }],
    Invitations: [],
    "Pending Family Creations": [],
    "Pending Confirmations": [],
    "Audit Log": [],
    "Pending Transaction Drafts": [],
    "Draft Approval Claims": [],
    "Processed Telegram Updates": [],
    "AI Vision Usage": [],
    "AI Text Usage": [],
    Transactions: [{ transaction_id: "txn-test", family_id: "family-test", transaction_type: "EXPENSE", amount_minor: 1000, currency: "IDR", transaction_date: "2026-01-01", description: "Test", created_by_member_id: "member-test", created_at: "2026-01-01T00:00:00.000Z", status: "ACTIVE" }],
  },
};

test("reports a healthy migration rehearsal without row values", () => {
  const report = rehearseSupabaseMigration(healthySnapshot);

  assert.equal(report.healthy, true);
  assert.deepEqual(report.issues, []);
  assert.equal(report.rowCounts.Families, 1);
  assert.match(report.digests.Transactions, /^[a-f0-9]{64}$/);
  assert.equal("family_name" in report, false);
  assert.equal(JSON.stringify(report).includes("Test Family"), false);
});

test("detects duplicate keys and orphan references", () => {
  const snapshot: MigrationSnapshot = {
    sheets: {
      ...healthySnapshot.sheets,
      Members: [
        healthySnapshot.sheets.Members[0],
        { ...healthySnapshot.sheets.Members[0], name: "Second Test User" },
      ],
      Transactions: [
        { ...healthySnapshot.sheets.Transactions[0], transaction_id: "txn-orphan", created_by_member_id: "member-missing" },
      ],
    },
  };

  const report = rehearseSupabaseMigration(snapshot);

  assert.equal(report.healthy, false);
  assert.ok(report.issues.some((issue) => issue.code === "DUPLICATE_PRIMARY_KEY"));
  assert.ok(report.issues.some((issue) => issue.code === "ORPHAN_MEMBER_REFERENCE"));
});

test("detects unknown sheets and invalid enums", () => {
  const snapshot: MigrationSnapshot = {
    sheets: {
      ...healthySnapshot.sheets,
      Unknown: [{ id: "unexpected" }],
      Families: [{ ...healthySnapshot.sheets.Families[0], status: "INVALID" }],
    },
  };

  const report = rehearseSupabaseMigration(snapshot);

  assert.equal(report.healthy, false);
  assert.ok(report.issues.some((issue) => issue.code === "UNKNOWN_SHEET"));
  assert.ok(report.issues.some((issue) => issue.code === "INVALID_ENUM"));
});

test("produces the same digest when row order changes", () => {
  const reversed: MigrationSnapshot = {
    sheets: Object.fromEntries(Object.entries(healthySnapshot.sheets).map(([name, rows]) => [name, [...rows].reverse()])),
  };

  const first = rehearseSupabaseMigration(healthySnapshot);
  const second = rehearseSupabaseMigration(reversed);

  assert.deepEqual(first.digests, second.digests);
});
