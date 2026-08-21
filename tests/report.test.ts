import assert from "node:assert/strict";
import test from "node:test";

import { buildFinancialReport, getFinancialReportPeriod, ReportPeriodError } from "../src/lib/family/report";
import type { Transaction } from "../src/lib/family/types";

const period = getFinancialReportPeriod("2026-08");

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    transactionId: "txn_default",
    familyId: "fam_1",
    transactionType: "EXPENSE",
    amountMinor: 1000,
    currency: "IDR",
    transactionDate: "2026-08-19",
    description: "Test",
    createdByMemberId: "mem_1",
    createdAt: "2026-08-19T00:00:00.000Z",
    status: "ACTIVE",
    ...overrides,
  };
}

test("builds a calendar-month period with business-independent boundaries", () => {
  assert.deepEqual(getFinancialReportPeriod("2026-02"), {
    month: "2026-02",
    startDate: "2026-02-01",
    endDate: "2026-02-28",
    label: "Februari 2026",
  });
});

test("rejects invalid report periods", () => {
  assert.throws(() => getFinancialReportPeriod("2026-13"), ReportPeriodError);
  assert.throws(() => getFinancialReportPeriod("2026-8"), ReportPeriodError);
});

test("aggregates active transactions by currency and excludes VOID or out-of-period rows", () => {
  const report = buildFinancialReport([
    transaction({ transactionId: "txn_income", transactionType: "INCOME", amountMinor: 500000 }),
    transaction({ transactionId: "txn_expense", amountMinor: 125000 }),
    transaction({ transactionId: "txn_usd", amountMinor: 10, currency: "USD" }),
    transaction({ transactionId: "txn_void", amountMinor: 900000, status: "VOID" }),
    transaction({ transactionId: "txn_old", amountMinor: 900000, transactionDate: "2026-07-31" }),
  ], period);

  assert.equal(report.transactionCount, 3);
  assert.deepEqual(report.currencies.map((summary) => ({
    currency: summary.currency,
    incomeMinor: summary.incomeMinor,
    expenseMinor: summary.expenseMinor,
    netMinor: summary.netMinor,
    transactionCount: summary.transactionCount,
  })), [
    { currency: "IDR", incomeMinor: BigInt(500000), expenseMinor: BigInt(125000), netMinor: BigInt(375000), transactionCount: 2 },
    { currency: "USD", incomeMinor: BigInt(0), expenseMinor: BigInt(10), netMinor: BigInt(-10), transactionCount: 1 },
  ]);
});

test("returns an empty report when the selected month has no active transactions", () => {
  const report = buildFinancialReport([transaction({ transactionDate: "2026-07-31" })], period);
  assert.equal(report.transactionCount, 0);
  assert.deepEqual(report.currencies, []);
});
