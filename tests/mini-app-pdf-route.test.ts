import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { POST } from "../src/app/api/mini-app/report/pdf/route";
import { POST as preparePdf } from "../src/app/api/mini-app/report/pdf/prepare/route";
import { GoogleSheetsFamilyRepository } from "../src/lib/family/google-sheets-repository";
import type { Family, FamilyMember, Transaction } from "../src/lib/family/types";

const botToken = "test-token";
const family: Family = {
  familyId: "fam_1",
  familyName: "Keluarga PDF",
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
  transactionId: "txn_pdf",
  familyId: "fam_1",
  transactionType: "INCOME",
  amountMinor: 500000,
  currency: "IDR",
  transactionDate: "2026-08-19",
  description: "Pendapatan",
  createdByMemberId: "mem_100",
  createdAt: "2026-08-19T00:00:00.000Z",
  status: "ACTIVE",
};

test("Mini App PDF rejects a request without initData", async () => {
  const response = await POST(new Request("https://falance.example.com/api/mini-app/report/pdf", {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "content-type": "application/json" },
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Mini App authorization is required." });
});

test("Mini App PDF rejects an invalid HMAC signature", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  try {
    const response = await POST(new Request("https://falance.example.com/api/mini-app/report/pdf", {
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

test("Mini App PDF rejects MEMBER before creating a PDF", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  const restoreRepository = mockRepository(member);
  try {
    const response = await POST(new Request("https://falance.example.com/api/mini-app/report/pdf", {
      method: "POST",
      body: JSON.stringify({ initData: signedInitData("200"), password: "rahasia-pdf" }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "PDF hanya tersedia untuk OWNER dan ADMIN." });
  } finally {
    restoreRepository();
    restoreEnv("TELEGRAM_BOT_TOKEN", originalToken);
  }
});

test("Mini App PDF accepts a direct form POST for an OWNER with optional password", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  const restoreRepository = mockRepository(owner);
  try {
    const body = new URLSearchParams({ initData: signedInitData("100"), month: "2026-08", password: "rahasia-pdf" });
    const response = await POST(new Request("https://falance.example.com/api/mini-app/report/pdf", {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(new TextDecoder("latin1").decode(bytes.slice(0, 8)), "%PDF-1.7");
  } finally {
    restoreRepository();
    restoreEnv("TELEGRAM_BOT_TOKEN", originalToken);
  }
});

test("Mini App PDF returns a valid PDF for an OWNER with optional password", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  const restoreRepository = mockRepository(owner);
  try {
    const password = "rahasia-pdf";
    const response = await POST(new Request("https://falance.example.com/api/mini-app/report/pdf", {
      method: "POST",
      body: JSON.stringify({ initData: signedInitData("100"), month: "2026-08", password }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.match(response.headers.get("content-disposition") ?? "", /attachment/);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(new TextDecoder("latin1").decode(bytes.slice(0, 8)), "%PDF-1.7");
    assert.equal(new TextDecoder("latin1").decode(bytes).includes(password), false);
  } finally {
    restoreRepository();
    restoreEnv("TELEGRAM_BOT_TOKEN", originalToken);
  }
});

test("Mini App PDF prepare returns a signed action URL for an OWNER", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalSecret = process.env.FALANCE_REPORT_TOKEN_SECRET;
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  process.env.FALANCE_REPORT_TOKEN_SECRET = "report-secret";
  const restoreRepository = mockRepository(owner);
  try {
    const response = await preparePdf(new Request("https://falance.example.com/api/mini-app/report/pdf/prepare", {
      method: "POST",
      body: JSON.stringify({ initData: signedInitData("100"), month: "2026-08", password: "rahasia-pdf" }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(response.status, 200);
    const payload = await response.json() as { action?: { url: string; fileName: string } };
    assert.match(payload.action?.url ?? "", /^https:\/\/falance\.example\.com\/api\/mini-app\/report\/download\?token=/);
    assert.equal(payload.action?.fileName, "falance-report-2026-08-01-2026-08-31.pdf");
  } finally {
    restoreRepository();
    restoreEnv("TELEGRAM_BOT_TOKEN", originalToken);
    restoreEnv("FALANCE_REPORT_TOKEN_SECRET", originalSecret);
  }
});

test("Mini App PDF rejects a short password before report generation", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  try {
    const response = await POST(new Request("https://falance.example.com/api/mini-app/report/pdf", {
      method: "POST",
      body: JSON.stringify({ initData: signedInitData("100"), password: "short" }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Password harus berisi 8–127 byte UTF-8." });
  } finally {
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
