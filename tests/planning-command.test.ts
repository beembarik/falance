import assert from "node:assert/strict";
import test from "node:test";

import { parsePlanningCommand, PlanningCommandError } from "../src/lib/telegram/planning-command";

test("parses a monthly planned expense command", () => {
  assert.deepEqual(parsePlanningCommand("/planexpense 1.500.000 IDR 2026-10-01 MONTHLY Sewa rumah", "/planexpense", "PLAN_EXPENSE"), {
    planningType: "PLAN_EXPENSE",
    amountMinor: 1_500_000,
    currency: "IDR",
    startDate: "2026-10-01",
    recurrence: "MONTHLY",
    description: "Sewa rumah",
  });
});

test("rejects incomplete planning commands", () => {
  assert.throws(() => parsePlanningCommand("/liability 100000", "/liability", "RECURRING_LIABILITY"), PlanningCommandError);
});