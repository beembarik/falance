import assert from "node:assert/strict";
import test from "node:test";

import { SupabaseReadRepository, type SupabaseReadClient, type SupabaseReadQuery } from "../src/lib/family/supabase-read-repository";

type Row = Record<string, unknown>;

class FakeQuery implements SupabaseReadQuery {
  private rows: Row[];
  constructor(rows: Row[]) { this.rows = rows; }
  select(): SupabaseReadQuery { return this; }
  eq(column: string, value: string | number): SupabaseReadQuery { this.rows = this.rows.filter((row) => row[column] === value); return this; }
  in(column: string, values: readonly string[]): SupabaseReadQuery { this.rows = this.rows.filter((row) => values.includes(String(row[column]))); return this; }
  order(column: string, options?: { ascending?: boolean }): SupabaseReadQuery {
    const direction = options?.ascending === false ? -1 : 1;
    this.rows.sort((left, right) => String(left[column]).localeCompare(String(right[column])) * direction);
    return this;
  }
  limit(count: number): SupabaseReadQuery { this.rows = this.rows.slice(0, count); return this; }
  async maybeSingle() { return { data: this.rows[0] ?? null, error: null }; }
  async returns() { return { data: this.rows, error: null }; }
}

class FakeClient implements SupabaseReadClient {
  private readonly tables: Record<string, Row[]>;
  constructor(tables: Record<string, Row[]>) { this.tables = tables; }
  from(table: string): SupabaseReadQuery { return new FakeQuery((this.tables[table] ?? []).map((row) => ({ ...row }))); }
}

test("maps Supabase family and all family-scoped transactions to domain objects", async () => {
  const repository = new SupabaseReadRepository(new FakeClient({
    families: [{ family_id: "family-test", family_name: "Test Family", status: "ACTIVE", created_at: "2026-01-01T00:00:00.000Z", created_by: "user-test", plan: "FREE" }],
    transactions: [
      { transaction_id: "txn-active", family_id: "family-test", transaction_type: "EXPENSE", amount_minor: 1000, currency: "IDR", transaction_date: "2026-01-02", description: "Active", created_by_member_id: "member-test", created_at: "2026-01-02T00:00:00.000Z", status: "ACTIVE", category: "FOOD" },
      { transaction_id: "txn-void", family_id: "family-test", transaction_type: "EXPENSE", amount_minor: 2000, currency: "IDR", transaction_date: "2026-01-03", description: "Void", created_by_member_id: "member-test", created_at: "2026-01-03T00:00:00.000Z", status: "VOID" },
      { transaction_id: "txn-other", family_id: "family-other", transaction_type: "INCOME", amount_minor: 3000, currency: "IDR", transaction_date: "2026-01-04", description: "Other", created_by_member_id: "member-other", created_at: "2026-01-04T00:00:00.000Z", status: "ACTIVE" },
    ],
  }));

  assert.deepEqual(await repository.findFamilyById("family-test"), { familyId: "family-test", familyName: "Test Family", status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "user-test", plan: "FREE" });
  assert.deepEqual(await repository.findTransactionsByFamilyId("family-test"), [
    { transactionId: "txn-active", familyId: "family-test", transactionType: "EXPENSE", amountMinor: 1000, currency: "IDR", transactionDate: "2026-01-02", description: "Active", createdByMemberId: "member-test", createdAt: "2026-01-02T00:00:00.000Z", status: "ACTIVE", category: "FOOD" },
    { transactionId: "txn-void", familyId: "family-test", transactionType: "EXPENSE", amountMinor: 2000, currency: "IDR", transactionDate: "2026-01-03", description: "Void", createdByMemberId: "member-test", createdAt: "2026-01-03T00:00:00.000Z", status: "VOID", category: "UNCATEGORIZED" },
  ]);
});

test("matches production read filters for active family, all family members, and editing drafts", async () => {
  const repository = new SupabaseReadRepository(new FakeClient({
    families: [
      { family_id: "family-active", family_name: "Active", status: "ACTIVE", created_at: "2026-01-01T00:00:00.000Z", created_by: "user-test", plan: "FREE" },
      { family_id: "family-suspended", family_name: "Suspended", status: "SUSPENDED", created_at: "2026-01-01T00:00:00.000Z", created_by: "user-test", plan: "FREE" },
    ],
    members: [
      { member_id: "member-owner", family_id: "family-active", telegram_user_id: "user-test", name: "Owner", username: "", role: "OWNER", status: "ACTIVE", joined_at: "2026-01-01T00:00:00.000Z" },
      { member_id: "member-left", family_id: "family-active", telegram_user_id: "left-user", name: "Left", role: "MEMBER", status: "LEFT", joined_at: "2026-01-02T00:00:00.000Z" },
    ],
    pending_transaction_drafts: [{ draft_id: "draft-editing", telegram_user_id: "user-test", family_id: "family-active", transaction_type: "EXPENSE", amount_minor: 1000, currency: "IDR", transaction_date: "2026-01-01", description: "Draft", confidence: "HIGH", created_at: "2026-01-01T00:00:00.000Z", expires_at: "2026-01-01T01:00:00.000Z", status: "EDITING" }],
  }));

  assert.equal((await repository.findFamilyByCreatedBy("user-test"))?.familyId, "family-active");
  assert.deepEqual((await repository.findMembersByFamilyId("family-active"))[0].username, null);
  assert.equal((await repository.findMembersByFamilyId("family-active")).length, 2);
  assert.equal((await repository.findPendingTransactionDraft("user-test"))?.draftId, "draft-editing");
});

test("does not provide write operations in the read-only adapter", () => {
  const repository = new SupabaseReadRepository(new FakeClient({}));
  assert.throws(() => repository.createTransaction({} as never), /read-only adapter/);
  assert.throws(() => repository.claimTextUsage("family-test", "user-test", "2026-01-01T00:00:00.000Z", 5, 3600, 30, 60), /read-only adapter/);
});
