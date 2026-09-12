import assert from "node:assert/strict";
import test from "node:test";

import { buildPlanningForecast, PlanningValidationError, validateFinancialPlanInput } from "../src/lib/family/planning";
import { buildFinancialReport, getFinancialReportPeriod } from "../src/lib/family/report";
import type { FinancialPlan } from "../src/lib/family/types";

const recurringLiability: FinancialPlan = {
  planId: "plan_1",
  familyId: "fam_1",
  planningType: "RECURRING_LIABILITY",
  amountMinor: 1_500_000,
  currency: "IDR",
  startDate: "2026-09-15",
  endDate: "2026-11-15",
  recurrence: "MONTHLY",
  description: "Sewa rumah",
  createdByMemberId: "mem_1",
  createdAt: "2026-09-12T00:00:00.000Z",
  status: "ACTIVE",
};

test("accepts future recurring liabilities without applying actual-date rules", () => {
  validateFinancialPlanInput({
    planningType: "RECURRING_LIABILITY",
    amountMinor: 1_500_000,
    currency: "IDR",
    startDate: "2026-09-15",
    recurrence: "MONTHLY",
    description: "Sewa rumah",
  });
});

test("rejects a recurring plan with an invalid date range", () => {
  assert.throws(() => validateFinancialPlanInput({
    planningType: "PLAN_EXPENSE",
    amountMinor: 100,
    startDate: "2026-10-01",
    endDate: "2026-09-01",
    description: "Invalid",
  }), PlanningValidationError);
});

test("expands monthly plans and keeps them separate from actual transactions", () => {
  const forecast = buildPlanningForecast([recurringLiability], "2026-09-01", "2026-11-30", "fam_1");

  assert.deepEqual(forecast.map((line) => line.date), ["2026-09-15", "2026-10-15", "2026-11-15"]);
  assert.equal(forecast.every((line) => line.amountMinor === BigInt(1_500_000)), true);
  assert.equal(forecast[0].planningType, "RECURRING_LIABILITY");
});

test("does not include paused plans in the forecast", () => {
  const forecast = buildPlanningForecast([{ ...recurringLiability, status: "PAUSED" }], "2026-09-01", "2026-11-30");
  assert.deepEqual(forecast, []);
});

test("compares planned and actual amounts without mixing currencies", () => {
  const report = buildFinancialReport([
    { transactionId: "txn_1", familyId: "fam_1", transactionType: "EXPENSE", amountMinor: 500_000, currency: "IDR", transactionDate: "2026-09-20", description: "Belanja", createdByMemberId: "mem_1", createdAt: "2026-09-20T00:00:00.000Z", status: "ACTIVE" },
  ], getFinancialReportPeriod("2026-09"), undefined, "fam_1", undefined, [recurringLiability]);

  assert.deepEqual(report.plannedActual.map((summary) => [summary.currency, summary.plannedExpenseMinor, summary.actualExpenseMinor]), [["IDR", BigInt(1_500_000), BigInt(500_000)]]);
});