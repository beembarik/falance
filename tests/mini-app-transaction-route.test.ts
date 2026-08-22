import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { POST } from "../src/app/api/mini-app/transaction/route";
import { GoogleSheetsFamilyRepository } from "../src/lib/family/google-sheets-repository";
import type { Family, FamilyMember, Transaction } from "../src/lib/family/types";

const botToken = "mini-app-transaction-test-token";
const family: Family = {
  familyId: "fam_transaction_test",
  familyName: "Keluarga Transaksi",
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

test("Mini App transaction rejects a request without initData", async () => {
  const response = await POST(new Request("https://falance.example.com/api/mini-app/transaction", {
    method: "POST",
    body: JSON.stringify({ transactionType: "EXPENSE", amountMinor: "1000", transactionDate: "2026-08-22", description: "Test" }),
    headers: { "content-type": "application/json" },
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Mini App authorization is required." });
});

test("Mini App transaction rejects an invalid initData signature", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  try {
    const response = await POST(new Request("https://falance.example.com/api/mini-app/transaction", {
      method: "POST",
      body: JSON.stringify({ initData: "auth_date=1700000000&hash=bad", transactionType: "EXPENSE", amountMinor: "1000", transactionDate: "2026-08-22", description: "Test" }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Mini App authorization is invalid or expired." });
  } finally {
    restoreEnv("TELEGRAM_BOT_TOKEN", originalToken);
  }
});

test("Mini App transaction resolves family server-side and ignores a foreign family_id", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  const repository = GoogleSheetsFamilyRepository.prototype as GoogleSheetsFamilyRepository & {
    findActiveMemberByTelegramUserId: GoogleSheetsFamilyRepository["findActiveMemberByTelegramUserId"];
    findFamilyById: GoogleSheetsFamilyRepository["findFamilyById"];
    createTransaction: GoogleSheetsFamilyRepository["createTransaction"];
    createAuditLog: GoogleSheetsFamilyRepository["createAuditLog"];
  };
  const originalFindMember = repository.findActiveMemberByTelegramUserId;
  const originalFindFamily = repository.findFamilyById;
  const originalCreateTransaction = repository.createTransaction;
  const originalCreateAuditLog = repository.createAuditLog;
  let created: Transaction | undefined;
  repository.findActiveMemberByTelegramUserId = async () => owner;
  repository.findFamilyById = async (familyId: string) => familyId === family.familyId ? family : null;
  repository.createTransaction = async (transaction) => { created = transaction; };
  repository.createAuditLog = async () => {};

  try {
    const response = await POST(new Request("https://falance.example.com/api/mini-app/transaction", {
      method: "POST",
      body: JSON.stringify({
        initData: signedInitData("100"),
        family_id: "fam_foreign_client_value",
        transactionType: "EXPENSE",
        amountMinor: "150.000",
        currency: "idr",
        transactionDate: "2026-08-22",
        description: "Belanja kebutuhan",
      }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(response.status, 201);
    const payload = await response.json() as { transaction: Omit<Transaction, "familyId" | "createdByMemberId" | "createdAt"> };
    assert.equal(payload.transaction.transactionType, "EXPENSE");
    assert.equal(payload.transaction.amountMinor, 150000);
    assert.ok(created);
    assert.equal(created.familyId, family.familyId);
    assert.equal(created.createdByMemberId, owner.memberId);
    assert.equal(JSON.stringify(payload).includes("fam_foreign_client_value"), false);
  } finally {
    repository.findActiveMemberByTelegramUserId = originalFindMember;
    repository.findFamilyById = originalFindFamily;
    repository.createTransaction = originalCreateTransaction;
    repository.createAuditLog = originalCreateAuditLog;
    restoreEnv("TELEGRAM_BOT_TOKEN", originalToken);
  }
});

test("Mini App transaction rejects a future date through the service boundary", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  const repository = GoogleSheetsFamilyRepository.prototype as GoogleSheetsFamilyRepository & {
    findActiveMemberByTelegramUserId: GoogleSheetsFamilyRepository["findActiveMemberByTelegramUserId"];
    findFamilyById: GoogleSheetsFamilyRepository["findFamilyById"];
  };
  const originalFindMember = repository.findActiveMemberByTelegramUserId;
  const originalFindFamily = repository.findFamilyById;
  repository.findActiveMemberByTelegramUserId = async () => owner;
  repository.findFamilyById = async () => family;
  try {
    const response = await POST(new Request("https://falance.example.com/api/mini-app/transaction", {
      method: "POST",
      body: JSON.stringify({ initData: signedInitData("100"), transactionType: "INCOME", amountMinor: "1000", currency: "IDR", transactionDate: "2099-01-01", description: "Masa depan" }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Transaksi tidak dapat dicatat." });
  } finally {
    repository.findActiveMemberByTelegramUserId = originalFindMember;
    repository.findFamilyById = originalFindFamily;
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
