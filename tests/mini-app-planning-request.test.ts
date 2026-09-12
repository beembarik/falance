import assert from "node:assert/strict";
import test from "node:test";

import { parseMiniAppPlanningInput } from "../src/lib/telegram/mini-app-planning-request";

test("parses a Mini App recurring liability payload", () => {
  assert.deepEqual(parseMiniAppPlanningInput({
    planningType: "RECURRING_LIABILITY",
    amountMinor: "1.500.000",
    currency: "idr",
    startDate: "2026-10-01",
    recurrence: "MONTHLY",
    description: "Sewa rumah",
  }), {
    planningType: "RECURRING_LIABILITY",
    amountMinor: 1_500_000,
    currency: "IDR",
    startDate: "2026-10-01",
    recurrence: "MONTHLY",
    description: "Sewa rumah",
  });
});

test("rejects invalid Mini App planning types", () => {
  const result = parseMiniAppPlanningInput({
    planningType: "ACTUAL_EXPENSE",
    amountMinor: "100000",
    startDate: "2026-10-01",
    description: "Invalid",
  });
  assert.equal(result instanceof Error, true);
  assert.match((result as Error).message, /Jenis rencana/);
});
