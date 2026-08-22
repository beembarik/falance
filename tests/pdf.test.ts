import assert from "node:assert/strict";
import test from "node:test";

import { buildFinancialReport, getFinancialReportPeriod } from "../src/lib/family/report";
import { buildFinancialPdf } from "../src/lib/family/pdf";
import type { Transaction } from "../src/lib/family/types";

const period = getFinancialReportPeriod("2026-08");
const transaction: Transaction = {
  transactionId: "txn_pdf",
  familyId: "fam_1",
  transactionType: "EXPENSE",
  amountMinor: 125000,
  currency: "IDR",
  transactionDate: "2026-08-19",
  description: "Belanja keluarga",
  createdByMemberId: "mem_1",
  createdAt: "2026-08-19T00:00:00.000Z",
  status: "ACTIVE",
};

test("builds a valid unprotected PDF report", async () => {
  const report = buildFinancialReport([transaction], period, null);
  const pdf = await buildFinancialPdf("Keluarga Test", report);

  assert.equal(pdf.subarray(0, 8).toString("ascii"), "%PDF-1.7");
  assert.equal(pdf.toString("ascii").endsWith("%%EOF\n"), true);
  assert.ok(pdf.length > 1_000);
  const output = pdf.toString("latin1");
  assert.match(output, /Falanc/);
  assert.match(output, /Laporan keuangan keluarga/);
  assert.match(output, /Dicetak pada/);
  assert.match(output, /\/Subtype \/Image/);
});

test("builds an encrypted PDF without exposing the password in output bytes", async () => {
  const report = buildFinancialReport([transaction], period, null);
  const password = "rahasia-pdf-2026";
  const pdf = await buildFinancialPdf("Keluarga Test", report, password);
  const output = pdf.toString("latin1");

  assert.equal(pdf.subarray(0, 8).toString("ascii"), "%PDF-1.7");
  assert.match(output, /\/Encrypt/);
  assert.equal(output.includes(password), false);
});
