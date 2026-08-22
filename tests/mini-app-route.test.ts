import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../src/app/api/mini-app/report/route";

test("Mini App report rejects a request without initData", async () => {
  const response = await POST(new Request("https://falance.example.com/api/mini-app/report", {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "content-type": "application/json" },
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Mini App authorization is required." });
});

test("Mini App report rejects invalid initData before reading registry data", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  try {
    const response = await POST(new Request("https://falance.example.com/api/mini-app/report", {
      method: "POST",
      body: JSON.stringify({ initData: "auth_date=1700000000&hash=bad" }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Mini App authorization is invalid or expired." });
  } finally {
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
  }
});


test("Mini App report returns signed export actions for an authorized OWNER", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalSecret = process.env.FALANCE_REPORT_TOKEN_SECRET;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.FALANCE_REPORT_TOKEN_SECRET = "report-secret";
  const prototype = (await import("../src/lib/family/google-sheets-repository")).GoogleSheetsFamilyRepository.prototype;
  const repository = prototype as typeof prototype & {
    findActiveMemberByTelegramUserId: typeof prototype.findActiveMemberByTelegramUserId;
    findFamilyById: typeof prototype.findFamilyById;
    findTransactionsByFamilyId: typeof prototype.findTransactionsByFamilyId;
    findMembersByFamilyId: typeof prototype.findMembersByFamilyId;
  };
  const originalFindMember = repository.findActiveMemberByTelegramUserId;
  const originalFindFamily = repository.findFamilyById;
  const originalFindTransactions = repository.findTransactionsByFamilyId;
  const originalFindMembers = repository.findMembersByFamilyId;
  repository.findActiveMemberByTelegramUserId = async () => ({
    memberId: "mem_100",
    familyId: "fam_1",
    telegramUserId: "100",
    name: "Owner",
    username: "owner",
    role: "OWNER",
    status: "ACTIVE",
    joinedAt: "2026-01-01T00:00:00.000Z",
  });
  repository.findFamilyById = async () => ({
    familyId: "fam_1",
    familyName: "Keluarga Test",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "100",
    plan: "MVP",
  });
  repository.findMembersByFamilyId = async () => [{
    memberId: "mem_100",
    familyId: "fam_1",
    telegramUserId: "100",
    name: "Owner",
    username: "owner",
    role: "OWNER",
    status: "ACTIVE",
    joinedAt: "2026-01-01T00:00:00.000Z",
  }];
  repository.findTransactionsByFamilyId = async () => [{
    transactionId: "txn_category",
    familyId: "fam_1",
    transactionType: "EXPENSE",
    amountMinor: 25000,
    currency: "IDR",
    transactionDate: "2026-08-20",
    description: "Belanja",
    category: "FOOD",
    createdByMemberId: "mem_100",
    createdAt: "2026-08-20T00:00:00.000Z",
    status: "ACTIVE",
  }];
  try {
    const params = new URLSearchParams({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: 100, first_name: "Owner" }),
    });
    const dataCheckString = [...params.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("\n");
    const { createHmac } = await import("node:crypto");
    const secretKey = createHmac("sha256", "WebAppData").update("test-token").digest();
    params.set("hash", createHmac("sha256", secretKey).update(dataCheckString).digest("hex"));
    const response = await POST(new Request("https://falance.example.com/api/mini-app/report", {
      method: "POST",
      body: JSON.stringify({ initData: params.toString(), month: "2026-08" }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(response.status, 200);
    const payload = await response.json() as { actions?: { csv?: { url: string }; pdf?: { url: string }; print?: { url: string } }; report?: { categorySummaries?: Array<{ category: string; currency: string; expenseMinor: string }>; transactions?: Array<{ transactionId: string; category: string; creatorName: string }> } };
    assert.deepEqual(payload.report?.categorySummaries, [{ category: "FOOD", label: "Makanan & Minuman", currency: "IDR", incomeMinor: "0", expenseMinor: "25000", netMinor: "-25000", transactionCount: 1 }]);
    assert.deepEqual(payload.report?.transactions, [{
      transactionId: "txn_category",
      transactionType: "EXPENSE",
      amountMinor: "25000",
      currency: "IDR",
      transactionDate: "2026-08-20",
      description: "Belanja",
      category: "FOOD",
      creatorName: "Owner",
    }]);
    assert.match(payload.actions?.csv?.url ?? "", /^https:\/\/falance\.example\.com\/api\/mini-app\/report\/download\?token=/);
    assert.match(payload.actions?.pdf?.url ?? "", /^https:\/\/falance\.example\.com\/api\/mini-app\/report\/download\?token=/);
    assert.match(payload.actions?.print?.url ?? "", /^https:\/\/falance\.example\.com\/api\/mini-app\/report\/download\?token=/);
  } finally {
    repository.findActiveMemberByTelegramUserId = originalFindMember;
    repository.findFamilyById = originalFindFamily;
    repository.findTransactionsByFamilyId = originalFindTransactions;
    repository.findMembersByFamilyId = originalFindMembers;
    restoreEnv("TELEGRAM_BOT_TOKEN", originalToken);
    restoreEnv("FALANCE_REPORT_TOKEN_SECRET", originalSecret);
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
