import assert from "node:assert/strict";
import test from "node:test";

import { TransactionCommandError, parseAmountMinor, parseEditTransactionCommand, parseManualTransactionCommand } from "../src/lib/telegram/transaction-command";

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

test("parses an edit command with an explicit transaction type", () => {
  assert.deepEqual(parseEditTransactionCommand(
    "/edittransaction txn_1 EXPENSE 200.000 IDR 2026-08-20 Belanja baru",
  ), {
    transactionId: "txn_1",
    input: {
      transactionType: "EXPENSE",
      amountMinor: 200000,
      currency: "IDR",
      transactionDate: "2026-08-20",
      description: "Belanja baru",
    },
  });
});

test("rejects ambiguous decimal amount and incomplete commands", () => {
  assert.throws(() => parseAmountMinor("1.5"), TransactionCommandError);
  assert.throws(() => parseManualTransactionCommand("/addexpense 1000", "/addexpense"), TransactionCommandError);
});
