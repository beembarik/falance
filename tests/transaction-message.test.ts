import assert from "node:assert/strict";
import test from "node:test";

import { formatTransactionsMessage } from "../src/lib/telegram/transaction-message";
import type { Family, Transaction } from "../src/lib/family/types";

const family: Family = {
  familyId: "fam_1",
  familyName: "Keluarga Owner",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "100",
  plan: "FREE",
};

const baseTransaction: Transaction = {
  transactionId: "txn_1",
  familyId: "fam_1",
  transactionType: "INCOME",
  amountMinor: 5000000,
  currency: "IDR",
  transactionDate: "2026-01-01",
  description: "Gaji Januari",
  createdByMemberId: "mem_1",
  createdAt: "2026-01-01T00:00:00.000Z",
  status: "ACTIVE",
};

test("formats cumulative balance by currency and excludes VOID transactions", () => {
  const response = formatTransactionsMessage(family, [
    baseTransaction,
    {
      ...baseTransaction,
      transactionId: "txn_2",
      transactionType: "EXPENSE",
      amountMinor: 2000000,
      transactionDate: "2026-01-02",
      description: "Belanja keluarga",
    },
    {
      ...baseTransaction,
      transactionId: "txn_usd",
      amountMinor: 100,
      currency: "USD",
      description: "Freelance USD",
    },
    {
      ...baseTransaction,
      transactionId: "txn_void",
      amountMinor: 999999999,
      description: "Tidak boleh dihitung",
      status: "VOID",
    },
  ]);

  assert.match(response, /📊 RINGKASAN SALDO/);
  assert.match(response, /IDR\n  Pemasukan  : IDR 5\.000\.000\n  Pengeluaran: IDR 2\.000\.000\n  Saldo      : IDR 3\.000\.000/);
  assert.match(response, /USD\n  Pemasukan  : USD 100\n  Pengeluaran: USD 0\n  Saldo      : USD 100/);
  assert.match(response, /🧾 DAFTAR TRANSAKSI/);
  assert.doesNotMatch(response, /Tidak boleh dihitung/);
});

test("shows an explicit empty-state balance section", () => {
  const response = formatTransactionsMessage(family, []);

  assert.match(response, /📊 RINGKASAN SALDO/);
  assert.match(response, /Belum ada transaksi aktif/);
});
