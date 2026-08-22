import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../src/app/api/mini-app/report/download/route";
import { GoogleSheetsFamilyRepository } from "../src/lib/family/google-sheets-repository";
import type { Family, FamilyMember, Transaction } from "../src/lib/family/types";
import { createReportDownloadToken } from "../src/lib/telegram/report-download-token";

const tokenSecret = "report-token-secret-for-route-tests";
const family: Family = {
  familyId: "fam_1",
  familyName: "Keluarga Download",
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
  transactionId: "txn_download",
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

test("Mini App download rejects an invalid token", async () => {
  const originalSecret = process.env.FALANCE_REPORT_TOKEN_SECRET;
  process.env.FALANCE_REPORT_TOKEN_SECRET = tokenSecret;
  try {
    const response = await GET(new Request("https://falance.example.com/api/mini-app/report/download?token=invalid"));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Download link tidak valid atau sudah kedaluwarsa." });
  } finally {
    restoreEnv("FALANCE_REPORT_TOKEN_SECRET", originalSecret);
  }
});

test("Mini App download returns a CSV for an authorized OWNER", async () => {
  const originalSecret = process.env.FALANCE_REPORT_TOKEN_SECRET;
  process.env.FALANCE_REPORT_TOKEN_SECRET = tokenSecret;
  const restoreRepository = mockRepository(owner);
  try {
    const token = createReportDownloadToken({ uid: "100", format: "csv", month: "2026-08" }, tokenSecret);
    const response = await GET(new Request(`https://falance.example.com/api/mini-app/report/download?token=${token}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
    assert.equal(response.headers.get("access-control-allow-origin"), "https://web.telegram.org");
    assert.match(response.headers.get("content-disposition") ?? "", /attachment/);
    assert.match(await response.text(), /^"transaction_id"/);
  } finally {
    restoreRepository();
    restoreEnv("FALANCE_REPORT_TOKEN_SECRET", originalSecret);
  }
});

test("Mini App download returns print HTML for an authorized OWNER", async () => {
  const originalSecret = process.env.FALANCE_REPORT_TOKEN_SECRET;
  process.env.FALANCE_REPORT_TOKEN_SECRET = tokenSecret;
  const restoreRepository = mockRepository(owner);
  try {
    const token = createReportDownloadToken({ uid: "100", format: "print", month: "2026-08" }, tokenSecret);
    const response = await GET(new Request(`https://falance.example.com/api/mini-app/report/download?token=${token}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
    const html = await response.text();
    assert.match(html, /Keluarga Download/);
    assert.match(html, /Falancé/);
    assert.match(html, /class="toolbar no-print"/);
    assert.match(html, /Unduh PDF/);
    assert.match(html, /Unduh CSV/);
    assert.match(html, /Dicetak pada/);
    assert.match(html, /\/api\/mini-app\/report\/pdf\/prepare/);
  } finally {
    restoreRepository();
    restoreEnv("FALANCE_REPORT_TOKEN_SECRET", originalSecret);
  }
});

test("Mini App download returns an encrypted PDF for an authorized OWNER", async () => {
  const originalSecret = process.env.FALANCE_REPORT_TOKEN_SECRET;
  process.env.FALANCE_REPORT_TOKEN_SECRET = tokenSecret;
  const restoreRepository = mockRepository(owner);
  try {
    const token = createReportDownloadToken({ uid: "100", format: "pdf", month: "2026-08", password: "rahasia-pdf" }, tokenSecret);
    const response = await GET(new Request(`https://falance.example.com/api/mini-app/report/download?token=${token}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(new TextDecoder("latin1").decode(bytes.slice(0, 8)), "%PDF-1.7");
    assert.equal(new TextDecoder("latin1").decode(bytes).includes("rahasia-pdf"), false);
  } finally {
    restoreRepository();
    restoreEnv("FALANCE_REPORT_TOKEN_SECRET", originalSecret);
  }
});

test("Mini App download rejects MEMBER even with a valid signed token", async () => {
  const originalSecret = process.env.FALANCE_REPORT_TOKEN_SECRET;
  process.env.FALANCE_REPORT_TOKEN_SECRET = tokenSecret;
  const restoreRepository = mockRepository(member);
  try {
    const token = createReportDownloadToken({ uid: "200", format: "csv", month: "2026-08" }, tokenSecret);
    const response = await GET(new Request(`https://falance.example.com/api/mini-app/report/download?token=${token}`));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Export hanya tersedia untuk OWNER dan ADMIN." });
  } finally {
    restoreRepository();
    restoreEnv("FALANCE_REPORT_TOKEN_SECRET", originalSecret);
  }
});

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
