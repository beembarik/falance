import assert from "node:assert/strict";
import test from "node:test";

import { TransactionCommandError, parseAmountMinor, parseManualTransactionCommand } from "../src/lib/telegram/transaction-command";

test("parses an expense with Indonesian thousand separators and default currency", () => {
  assert.deepEqual(parseManualTransactionCommand(
    "/addexpense 150.000 2026-08-19 Makan siang keluarga",
    "/addexpense",
  ), {
    transactionType: "EXPENSE",
    amountMinor: 150000,
    currency: undefined,
    transactionDate: "2026-08-19",
    description: "Makan siang keluarga",
  });
});

test("parses an income with explicit currency and preserves description words", () => {
  assert.deepEqual(parseManualTransactionCommand(
    "/addincome 1,000 USD 2026-08-19 Honor freelance",
    "/addincome",
  ), {
    transactionType: "INCOME",
    amountMinor: 1000,
    currency: "USD",
    transactionDate: "2026-08-19",
    description: "Honor freelance",
  });
});

test("rejects ambiguous decimal amount and incomplete commands", () => {
  assert.throws(() => parseAmountMinor("1.5"), TransactionCommandError);
  assert.throws(() => parseManualTransactionCommand("/addexpense 1000", "/addexpense"), TransactionCommandError);
});
