import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { PATCH } from "../src/app/api/mini-app/transaction/route";
import { POST as POST_VOID } from "../src/app/api/mini-app/transaction/void/route";
import { GoogleSheetsFamilyRepository } from "../src/lib/family/google-sheets-repository";
import type { Family, FamilyMember, PendingConfirmation, Transaction } from "../src/lib/family/types";

const botToken = "mini-app-transaction-mutation-test-token";
const family: Family = {
  familyId: "fam_mutation_test",
  familyName: "Keluarga Mutation",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "100",
  plan: "MVP",
};
const owner: FamilyMember = {
  memberId: "mem_owner",
  familyId: family.familyId,
  telegramUserId: "100",
  name: "Owner",
  username: "owner",
  role: "OWNER",
  status: "ACTIVE",
  joinedAt: "2026-01-01T00:00:00.000Z",
};
const transaction: Transaction = {
  transactionId: "txn_mutation",
  familyId: family.familyId,
  transactionType: "EXPENSE",
  amountMinor: 125000,
  currency: "IDR",
  transactionDate: "2026-08-22",
  description: "Belanja lama",
  createdByMemberId: owner.memberId,
  createdAt: "2026-08-22T00:00:00.000Z",
  status: "ACTIVE",
};

test("Mini App PATCH updates only an active transaction in the server-resolved family", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  const repository = GoogleSheetsFamilyRepository.prototype as GoogleSheetsFamilyRepository & {
    findActiveMemberByTelegramUserId: GoogleSheetsFamilyRepository["findActiveMemberByTelegramUserId"];
    findFamilyById: GoogleSheetsFamilyRepository["findFamilyById"];
    findTransactionsByFamilyId: GoogleSheetsFamilyRepository["findTransactionsByFamilyId"];
    updateTransaction: GoogleSheetsFamilyRepository["updateTransaction"];
    createAuditLog: GoogleSheetsFamilyRepository["createAuditLog"];
  };
  const originalFindMember = repository.findActiveMemberByTelegramUserId;
  const originalFindFamily = repository.findFamilyById;
  const originalFindTransactions = repository.findTransactionsByFamilyId;
  const originalUpdate = repository.updateTransaction;
  const originalAudit = repository.createAuditLog;
  let updated: Transaction | undefined;
  repository.findActiveMemberByTelegramUserId = async () => owner;
  repository.findFamilyById = async (familyId: string) => familyId === family.familyId ? family : null;
  repository.findTransactionsByFamilyId = async () => [transaction];
  repository.updateTransaction = async (_id, value) => { updated = value; };
  repository.createAuditLog = async () => {};

  try {
    const response = await PATCH(new Request("https://falance.example.com/api/mini-app/transaction", {
      method: "PATCH",
      body: JSON.stringify({
        initData: signedInitData("100"),
        family_id: "fam_foreign_client_value",
        transactionId: transaction.transactionId,
        transactionType: "INCOME",
        amountMinor: "200.000",
        currency: "idr",
        transactionDate: "2026-08-21",
        description: "Gaji diperbarui",
      }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(response.status, 200);
    assert.ok(updated);
    assert.equal(updated.familyId, family.familyId);
    assert.equal(updated.transactionType, "INCOME");
    assert.equal(updated.amountMinor, 200000);
    assert.equal(updated.description, "Gaji diperbarui");
    assert.equal(JSON.stringify(await response.json()).includes("fam_foreign_client_value"), false);
  } finally {
    repository.findActiveMemberByTelegramUserId = originalFindMember;
    repository.findFamilyById = originalFindFamily;
    repository.findTransactionsByFamilyId = originalFindTransactions;
    repository.updateTransaction = originalUpdate;
    repository.createAuditLog = originalAudit;
    restoreEnv("TELEGRAM_BOT_TOKEN", originalToken);
  }
});

test("Mini App transaction mutation rejects an unsupported currency code", async () => {
  const response = await PATCH(new Request("https://falance.example.com/api/mini-app/transaction", {
    method: "PATCH",
    body: JSON.stringify({
      initData: signedInitData("100"),
      transactionId: transaction.transactionId,
      transactionType: "EXPENSE",
      amountMinor: "125000",
      currency: "IDE",
      transactionDate: "2026-08-22",
      description: "Currency typo",
    }),
    headers: { "content-type": "application/json" },
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Currency harus berupa kode ISO 4217 yang didukung, misalnya IDR." });
});

test("Mini App soft-void requires server-persisted confirmation before changing status", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  const repository = GoogleSheetsFamilyRepository.prototype as GoogleSheetsFamilyRepository & {
    findActiveMemberByTelegramUserId: GoogleSheetsFamilyRepository["findActiveMemberByTelegramUserId"];
    findFamilyById: GoogleSheetsFamilyRepository["findFamilyById"];
    findTransactionsByFamilyId: GoogleSheetsFamilyRepository["findTransactionsByFamilyId"];
    createPendingConfirmation: GoogleSheetsFamilyRepository["createPendingConfirmation"];
    findPendingConfirmation: GoogleSheetsFamilyRepository["findPendingConfirmation"];
    updatePendingConfirmationStatus: GoogleSheetsFamilyRepository["updatePendingConfirmationStatus"];
    updateTransaction: GoogleSheetsFamilyRepository["updateTransaction"];
    createAuditLog: GoogleSheetsFamilyRepository["createAuditLog"];
  };
  const originalFindMember = repository.findActiveMemberByTelegramUserId;
  const originalFindFamily = repository.findFamilyById;
  const originalFindTransactions = repository.findTransactionsByFamilyId;
  const originalCreateConfirmation = repository.createPendingConfirmation;
  const originalFindConfirmation = repository.findPendingConfirmation;
  const originalUpdateConfirmation = repository.updatePendingConfirmationStatus;
  const originalUpdateTransaction = repository.updateTransaction;
  const originalAudit = repository.createAuditLog;
  let pending: PendingConfirmation | undefined;
  let voided: Transaction | undefined;
  repository.findActiveMemberByTelegramUserId = async () => owner;
  repository.findFamilyById = async (familyId: string) => familyId === family.familyId ? family : null;
  repository.findTransactionsByFamilyId = async () => [transaction];
  repository.createPendingConfirmation = async (value) => { pending = value; };
  repository.findPendingConfirmation = async () => pending ?? null;
  repository.updatePendingConfirmationStatus = async (_id, status) => { if (pending) pending = { ...pending, status }; };
  repository.updateTransaction = async (_id, value) => { voided = value; };
  repository.createAuditLog = async () => {};

  try {
    const requestResponse = await POST_VOID(new Request("https://falance.example.com/api/mini-app/transaction/void", {
      method: "POST",
      body: JSON.stringify({ initData: signedInitData("100"), action: "REQUEST", transactionId: transaction.transactionId, family_id: "fam_foreign_client_value" }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(requestResponse.status, 200);
    assert.equal(pending?.action, "VOID_TRANSACTION");
    assert.equal(pending?.familyId, family.familyId);
    assert.equal(pending?.status, "PENDING");
    assert.equal(voided, undefined);

    const confirmResponse = await POST_VOID(new Request("https://falance.example.com/api/mini-app/transaction/void", {
      method: "POST",
      body: JSON.stringify({ initData: signedInitData("100"), action: "CONFIRM" }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(confirmResponse.status, 200);
    assert.equal(pending?.status, "COMPLETED");
    const recordedVoid = voided as Transaction | undefined;
    assert.ok(recordedVoid);
    assert.equal(recordedVoid.transactionId, transaction.transactionId);
    assert.equal(recordedVoid.familyId, family.familyId);
    assert.equal(recordedVoid.status, "VOID");
  } finally {
    repository.findActiveMemberByTelegramUserId = originalFindMember;
    repository.findFamilyById = originalFindFamily;
    repository.findTransactionsByFamilyId = originalFindTransactions;
    repository.createPendingConfirmation = originalCreateConfirmation;
    repository.findPendingConfirmation = originalFindConfirmation;
    repository.updatePendingConfirmationStatus = originalUpdateConfirmation;
    repository.updateTransaction = originalUpdateTransaction;
    repository.createAuditLog = originalAudit;
    restoreEnv("TELEGRAM_BOT_TOKEN", originalToken);
  }
});

test("Mini App soft-void rejects confirmation when the pending action is for another operation", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  const repository = GoogleSheetsFamilyRepository.prototype as GoogleSheetsFamilyRepository & {
    findPendingConfirmation: GoogleSheetsFamilyRepository["findPendingConfirmation"];
    findActiveMemberByTelegramUserId: GoogleSheetsFamilyRepository["findActiveMemberByTelegramUserId"];
  };
  const originalFindConfirmation = repository.findPendingConfirmation;
  const originalFindMember = repository.findActiveMemberByTelegramUserId;
  repository.findPendingConfirmation = async () => ({
    confirmationId: "confirm_other",
    telegramUserId: owner.telegramUserId,
    familyId: family.familyId,
    action: "DEACTIVATE_MEMBER",
    target: "mem_other",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    status: "PENDING",
  });
  repository.findActiveMemberByTelegramUserId = async () => owner;
  try {
    const response = await POST_VOID(new Request("https://falance.example.com/api/mini-app/transaction/void", {
      method: "POST",
      body: JSON.stringify({ initData: signedInitData("100"), action: "CONFIRM" }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "Konfirmasi void tidak tersedia atau sudah kedaluwarsa." });
  } finally {
    repository.findPendingConfirmation = originalFindConfirmation;
    repository.findActiveMemberByTelegramUserId = originalFindMember;
    restoreEnv("TELEGRAM_BOT_TOKEN", originalToken);
  }
});

function signedInitData(telegramUserId: string): string {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: Number(telegramUserId), first_name: "Test" }),
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set("hash", createHmac("sha256", secretKey).update(dataCheckString).digest("hex"));
  return params.toString();
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
