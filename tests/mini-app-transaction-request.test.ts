import assert from "node:assert/strict";
import test from "node:test";

import { parseMiniAppTransactionInput } from "../src/lib/telegram/mini-app-transaction-request";

const basePayload = {
  transactionType: "EXPENSE",
  amountMinor: "150000",
  currency: "idr",
  transactionDate: "2026-08-22",
  description: "Belanja kebutuhan",
};

test("Mini App transaction parser accepts a supported category code", () => {
  const parsed = parseMiniAppTransactionInput({ ...basePayload, category: "food" });
  assert.ok(!(parsed instanceof Error));
  assert.equal(parsed.category, "FOOD");
});

test("Mini App transaction parser defaults an absent category to the service boundary", () => {
  const parsed = parseMiniAppTransactionInput(basePayload);
  assert.ok(!(parsed instanceof Error));
  assert.equal(parsed.category, undefined);
});

test("Mini App transaction parser normalizes an explicit blank category to UNCATEGORIZED", () => {
  const parsed = parseMiniAppTransactionInput({ ...basePayload, category: "   " });
  assert.ok(!(parsed instanceof Error));
  assert.equal(parsed.category, "UNCATEGORIZED");
});

test("Mini App transaction parser rejects an unsupported category code", () => {
  const parsed = parseMiniAppTransactionInput({ ...basePayload, category: "groceries" });
  assert.ok(parsed instanceof Error);
  assert.equal(parsed.message, "Kategori transaksi tidak didukung.");
});

