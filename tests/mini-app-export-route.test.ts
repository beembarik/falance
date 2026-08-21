import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { POST } from "../src/app/api/mini-app/report/export/route";
import { GoogleSheetsFamilyRepository } from "../src/lib/family/google-sheets-repository";
import type { Family, FamilyMember, Transaction } from "../src/lib/family/types";

const botToken = "test-token";

const family: Family = {
  familyId: "fam_1",
  familyName: "Keluarga Test",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "100",
  plan: "MVP",
};

const owner: FamilyMember = {
  memberId: "mem_100",
  familyId: "fam_1",
  telegramUserId: "100",
  name: "Owner",
  username: "owner",
  role: "OWNER",
  status: "ACTIVE",
  joinedAt: "2026-01-01T00:00:00.000Z",
};

const member: FamilyMember = { ...owner, memberId: "mem_200", telegramUserId: "200", name: "Member", username: null, role: "MEMBER" };

const transaction: Transaction = {
  transactionId: "txn_1",
  familyId: "fam_1",
  transactionType: "EXPENSE",
  amountMinor: 125000,
  currency: "IDR",
  transactionDate: "2026-08-19",
  description: "Belanja",
  createdByMemberId: "mem_100",
  createdAt: "2026-08-19T00:00:00.000Z",
  status: "ACTIVE",
};

test("Mini App export rejects a request without initData", async () => {
  const response = await POST(new Request("https://falance.example.com/api/mini-app/report/export", {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "content-type": "application/json" },
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Mini App authorization is required." });
});

test("Mini App export rejects an invalid HMAC signature", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  try {
    const response = await POST(new Request("https://falance.example.com/api/mini-app/report/export", {
      method: "POST",
      body: JSON.stringify({ initData: "auth_date=1700000000&hash=bad" }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Mini App authorization is invalid or expired." });
  } finally {
    restoreEnv("TELEGRAM_BOT_TOKEN", originalToken);
  }
});

test("Mini App export rejects MEMBER with an Indonesian authorization error", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  const restoreRepository = mockRepository(member);
  try {
    const response = await POST(new Request("https://falance.example.com/api/mini-app/report/export", {
      method: "POST",
      body: JSON.stringify({ initData: signedInitData("200") }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Export hanya tersedia untuk OWNER dan ADMIN." });
  } finally {
    restoreRepository();
    restoreEnv("TELEGRAM_BOT_TOKEN", originalToken);
  }
});

test("Mini App export returns CSV for a valid OWNER", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  const restoreRepository = mockRepository(owner);
  try {
    const response = await POST(new Request("https://falance.example.com/api/mini-app/report/export", {
      method: "POST",
      body: JSON.stringify({ initData: signedInitData("100"), month: "2026-08" }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
    assert.match(response.headers.get("content-disposition") ?? "", /attachment/);
    assert.match(await response.text(), /^"transaction_id"/);
  } finally {
    restoreRepository();
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
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

function mockRepository(requester: FamilyMember): () => void {
  const prototype = GoogleSheetsFamilyRepository.prototype as GoogleSheetsFamilyRepository & {
    findActiveMemberByTelegramUserId: GoogleSheetsFamilyRepository["findActiveMemberByTelegramUserId"];
    findFamilyById: GoogleSheetsFamilyRepository["findFamilyById"];
    findTransactionsByFamilyId: GoogleSheetsFamilyRepository["findTransactionsByFamilyId"];
  };
  const originalFindMember = prototype.findActiveMemberByTelegramUserId;
  const originalFindFamily = prototype.findFamilyById;
  const originalFindTransactions = prototype.findTransactionsByFamilyId;
  prototype.findActiveMemberByTelegramUserId = async () => requester;
  prototype.findFamilyById = async (familyId: string) => familyId === family.familyId ? family : null;
  prototype.findTransactionsByFamilyId = async () => [transaction];
  return () => {
    prototype.findActiveMemberByTelegramUserId = originalFindMember;
    prototype.findFamilyById = originalFindFamily;
    prototype.findTransactionsByFamilyId = originalFindTransactions;
  };
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
