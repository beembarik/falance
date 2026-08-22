import { strict as assert } from "node:assert";
import test from "node:test";

import {
  buildCategorySummaries,
  CATEGORY_LABELS,
  normalizeTransactionCategory,
} from "../src/lib/family/category-analytics";
import type { Transaction } from "../src/lib/family/types";

const baseTransaction: Transaction = {
  transactionId: "txn_base",
  familyId: "fam_a",
  transactionType: "EXPENSE",
  amountMinor: 10000,
  currency: "IDR",
  transactionDate: "2026-08-10",
  description: "Base",
  createdByMemberId: "mem_a",
  createdAt: "2026-08-10T00:00:00.000Z",
  status: "ACTIVE",
};

test("normalizes only the accepted persisted category codes", () => {
  assert.equal(normalizeTransactionCategory("food"), "FOOD");
  assert.equal(normalizeTransactionCategory("not-authoritative"), "UNCATEGORIZED");
  assert.equal(CATEGORY_LABELS.FOOD, "Makanan & Minuman");
});

test("builds family-scoped category summaries without mixing currencies", () => {
  const summaries = buildCategorySummaries([
    { ...baseTransaction, transactionId: "txn_food_idr", category: "FOOD" },
    { ...baseTransaction, transactionId: "txn_income_idr", transactionType: "INCOME", amountMinor: 50000, category: "INCOME" },
    { ...baseTransaction, transactionId: "txn_food_usd", currency: "USD", amountMinor: 20, category: "FOOD" },
    { ...baseTransaction, transactionId: "txn_unknown", category: "not-authoritative" },
    { ...baseTransaction, transactionId: "txn_void", status: "VOID", category: "FOOD" },
    { ...baseTransaction, transactionId: "txn_foreign", familyId: "fam_b", category: "FOOD" },
    { ...baseTransaction, transactionId: "txn_outside", transactionDate: "2026-09-01", category: "FOOD" },
  ], { familyId: "fam_a", startDate: "2026-08-01", endDate: "2026-08-31" });

  assert.deepEqual(summaries, [
    {
      category: "FOOD",
      label: "Makanan & Minuman",
      currency: "IDR",
      incomeMinor: 0,
      expenseMinor: 10000,
      netMinor: -10000,
      transactionCount: 1,
    },
    {
      category: "INCOME",
      label: "Gaji & Pendapatan",
      currency: "IDR",
      incomeMinor: 50000,
      expenseMinor: 0,
      netMinor: 50000,
      transactionCount: 1,
    },
    {
      category: "UNCATEGORIZED",
      label: "Belum dikategorikan",
      currency: "IDR",
      incomeMinor: 0,
      expenseMinor: 10000,
      netMinor: -10000,
      transactionCount: 1,
    },
    {
      category: "FOOD",
      label: "Makanan & Minuman",
      currency: "USD",
      incomeMinor: 0,
      expenseMinor: 20,
      netMinor: -20,
      transactionCount: 1,
    },
  ]);
});
