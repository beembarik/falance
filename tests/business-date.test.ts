import assert from "node:assert/strict";
import test from "node:test";

import { getBusinessDate } from "../src/lib/time/business-date";

const originalTimeZone = process.env.FALANCE_TIME_ZONE;

test.afterEach(() => {
  if (originalTimeZone === undefined) delete process.env.FALANCE_TIME_ZONE;
  else process.env.FALANCE_TIME_ZONE = originalTimeZone;
});

test("uses FALANCE_TIME_ZONE when deriving the business date", () => {
  process.env.FALANCE_TIME_ZONE = "Asia/Jakarta";
  assert.equal(getBusinessDate(new Date("2026-08-20T16:59:00Z")), "2026-08-20");
  assert.equal(getBusinessDate(new Date("2026-08-20T17:01:00Z")), "2026-08-21");
});

test("rejects an invalid FALANCE_TIME_ZONE", () => {
  process.env.FALANCE_TIME_ZONE = "Invalid/Timezone";
  assert.throws(() => getBusinessDate(new Date("2026-08-20T00:00:00Z")), /Invalid FALANCE_TIME_ZONE/);
});
