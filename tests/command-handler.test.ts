import assert from "node:assert/strict";
import test from "node:test";

import {
  handleTelegramCallbackQuery,
  handleTelegramPhotoMessageResponse,
  handleTelegramTextMessage,
  handleTelegramTextMessageResponse,
} from "../src/lib/telegram/command-handler";
import type { FamilyService, ConfirmationResult } from "../src/lib/family/service";
import type { Family, TelegramUser, Transaction } from "../src/lib/family/types";
import type { FinancialReport } from "../src/lib/family/report";
import type { TransactionTextParser } from "../src/lib/ai/transaction-text-parser";

const owner: TelegramUser = { telegramUserId: "100", name: "Owner", username: "owner" };

test("guides an unregistered user from /start to /help", async () => {
  const response = await handleTelegramTextMessage(
    fakeService({ getActiveMembership: async () => null }),
    owner,
    "/start",
  );

  assert.match(response, /belum terdaftar/);
  assert.match(response, /Ketik \/help untuk melihat panduan lengkap/);
});

test("guides an active member from /start to /help", async () => {
  const response = await handleTelegramTextMessage(fakeService({}), owner, "/start");

  assert.match(response, /terdaftar sebagai OWNER/);
  assert.match(response, /Ketik \/help untuk melihat panduan lengkap/);
});

test("shows onboarding commands to an unregistered user without exposing active-family commands", async () => {
  const response = await handleTelegramTextMessage(
    fakeService({ getActiveMembership: async () => null }),
    owner,
    "/help",
  );

  assert.match(response, /Panduan command Falancé/);
  assert.match(response, /\/createfamily/);
  assert.match(response, /\/join <code>FAL-XXXXXX<\/code>/);
  assert.doesNotMatch(response, /<code>\/createfamily<\/code>/);
  assert.doesNotMatch(response, /<code>\/addincome/);
  assert.doesNotMatch(response, /<code>\/invite<\/code>/);
});

test("shows common commands to a MEMBER and hides administration commands", async () => {
  const response = await handleTelegramTextMessage(
    fakeService({ getActiveMembership: async () => ({ role: "MEMBER" }) }),
    owner,
    "/help",
  );

  assert.match(response, /Akses kamu: MEMBER/);
  assert.match(response, /\/transactions/);
  assert.match(response, /\/report <code>\[YYYY-MM\]<\/code>/);
  assert.doesNotMatch(response, /<code>\/transactions<\/code>/);
  assert.doesNotMatch(response, /<code>\/invite<\/code>/);
  assert.doesNotMatch(response, /<code>\/changerole/);
  assert.doesNotMatch(response, /<code>\/createfamily<\/code>/);
});

test("shows family administration commands to an OWNER", async () => {
  const response = await handleTelegramTextMessage(fakeService({}), owner, "/help");

  assert.match(response, /Akses kamu: OWNER/);
  assert.match(response, /\/invite/);
  assert.match(response, /\/changerole <code>/);
  assert.match(response, /\/archivefamily/);
  assert.doesNotMatch(response, /<code>\/invite<\/code>/);
  assert.doesNotMatch(response, /<code>\/createfamily<\/code>/);
});

test("formats an invitation as a ready-to-share message with copyable join command", async () => {
  const originalBotUsername = process.env.FALANCE_TELEGRAM_BOT_USERNAME;
  process.env.FALANCE_TELEGRAM_BOT_USERNAME = "Falance_bot";
  const service = fakeService({
    createInvitation: async () => ({ code: "FAL-ABC123", expiresAt: "2026-08-20T00:00:00.000Z" }),
  });

  try {
    const response = await handleTelegramTextMessage(service, owner, "/invite");
    assert.match(response, /https:\/\/t\.me\/Falance_bot/);
    assert.match(response, /<code>\/join FAL-ABC123<\/code>/);
    assert.match(response, /Berlaku sampai:/);
  } finally {
    if (originalBotUsername === undefined) delete process.env.FALANCE_TELEGRAM_BOT_USERNAME;
    else process.env.FALANCE_TELEGRAM_BOT_USERNAME = originalBotUsername;
  }
});


test("previews a natural-language transaction draft without persisting it", async () => {
  let persisted = false;
  const service = fakeService({
    createTransaction: async () => {
      persisted = true;
      throw new Error("must not persist from natural language");
    },
    createPendingTransactionDraft: async () => ({
      draftId: "draft_1",
      telegramUserId: owner.telegramUserId,
      familyId: "fam_1",
      transactionType: "EXPENSE",
      amountMinor: 35000,
      currency: "IDR",
      transactionDate: "2026-08-20",
      description: "Beli susu",
      confidence: "HIGH",
      transactionDateInferred: true,
      categorySuggestion: "Makanan & Minuman",
      descriptionSuggestion: "Beli susu untuk sarapan",
      createdAt: "2026-08-20T00:00:00.000Z",
      expiresAt: "2026-08-20T00:05:00.000Z",
      status: "PENDING",
    }),
  });
  const parser: TransactionTextParser = {
    parse: async () => ({
      kind: "READY",
      draft: {
        transactionType: "EXPENSE",
        amountMinor: 35000,
        currency: "IDR",
        transactionDate: "2026-08-20",
        description: "Beli susu",
        confidence: "HIGH",
        transactionDateInferred: true,
        categorySuggestion: "Makanan & Minuman",
        descriptionSuggestion: "Beli susu untuk sarapan",
      },
    }),
  };

  const response = await handleTelegramTextMessage(service, owner, "beli susu 35 ribu", parser);

  assert.equal(persisted, false);
  assert.match(response, /DRAFT TRANSAKSI/);
  assert.match(response, /Tanggal    : 20\/08\/2026 \(diasumsikan hari ini\)/);
  assert.match(response, /Kategori   : Makanan & Minuman \(saran\)/);
  assert.match(response, /Saran deskripsi: Beli susu untuk sarapan/);
  assert.match(response, /Jika sudah benar, tekan tombol ✅ Ya, simpan/);
  assert.match(response, /Jika perlu perubahan, tekan tombol ✏️ Edit/);
  assert.doesNotMatch(response, /\/addexpense 35000 IDR 2026-08-20 Beli susu/);
});

test("previews an authorized receipt through the shared interactive draft flow", async () => {
  let persisted = false;
  const service = fakeService({
    createPendingTransactionDraft: async () => ({
      draftId: "draft_receipt_1",
      telegramUserId: owner.telegramUserId,
      familyId: "fam_1",
      transactionType: "EXPENSE",
      amountMinor: 45000,
      currency: "IDR",
      transactionDate: "2026-08-20",
      description: "Makan siang",
      categorySuggestion: "Makanan & Minuman",
      confidence: "HIGH",
      createdAt: "2026-08-20T00:00:00.000Z",
      expiresAt: "2026-08-20T00:05:00.000Z",
      status: "PENDING",
    }),
    createTransaction: async () => {
      persisted = true;
      throw new Error("must not persist during receipt preview");
    },
  });
  const parser = {
    parse: async () => ({
      kind: "READY" as const,
      draft: {
        transactionType: "EXPENSE" as const,
        amountMinor: 45000,
        currency: "IDR",
        transactionDate: "2026-08-20",
        description: "Makan siang",
        categorySuggestion: "Makanan & Minuman" as const,
        confidence: "HIGH" as const,
      },
    }),
  };

  const response = await handleTelegramPhotoMessageResponse(
    service,
    owner,
    [{ fileId: "photo_1", width: 1200, height: 1600 }],
    "Makan siang",
    parser,
    async () => ({ data: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg", filePath: "photos/receipt.jpg" }),
  );

  assert.equal(persisted, false);
  assert.match(typeof response === "string" ? response : response.text, /DRAFT TRANSAKSI/);
  assert.match(typeof response === "string" ? response : response.text, /Kategori   : Makanan & Minuman \(saran\)/);
});

test("blocks a receipt when the vision guard denies the claim before download or parsing", async () => {
  let downloaded = false;
  let parsed = false;
  const service = fakeService({ claimReceiptVision: async () => null });
  const response = await handleTelegramPhotoMessageResponse(
    service,
    owner,
    [{ fileId: "photo_rate_limited", width: 1200, height: 1600 }],
    null,
    { parse: async () => { parsed = true; throw new Error("parser must not run"); } },
    async () => {
      downloaded = true;
      throw new Error("download must not run");
    },
  );

  assert.equal(downloaded, false);
  assert.equal(parsed, false);
  assert.match(typeof response === "string" ? response : response.text, /batas penggunaan receipt/);
});

test("completes the vision guard claim after receipt processing", async () => {
  let completed = false;
  const service = fakeService({ completeReceiptVision: async () => { completed = true; } });
  const response = await handleTelegramPhotoMessageResponse(
    service,
    owner,
    [{ fileId: "photo_1", width: 1200, height: 1600 }],
    null,
    { parse: async () => ({ kind: "NEEDS_CLARIFICATION" as const, question: "Receipt belum jelas." }) },
    async () => ({ data: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg", filePath: "photos/receipt.jpg" }),
  );

  assert.equal(completed, true);
  assert.match(typeof response === "string" ? response : response.text, /Receipt belum jelas/);
});

test("rejects a receipt photo for an unregistered user before downloading it", async () => {
  let downloaded = false;
  const service = fakeService({ getActiveMembership: async () => null });
  const response = await handleTelegramPhotoMessageResponse(
    service,
    owner,
    [{ fileId: "photo_unauthorized", width: 1200, height: 1600 }],
    null,
    { parse: async () => { throw new Error("parser must not run"); } },
    async () => {
      downloaded = true;
      throw new Error("download must not run");
    },
  );

  assert.equal(downloaded, false);
  assert.match(typeof response === "string" ? response : response.text, /belum terdaftar/);
});

test("draft Edit callback enters manual edit mode", async () => {
  let markedEditing = false;
  const service = fakeService({
    getPendingTransactionDraft: async () => ({ draftId: "draft_1" }),
    markPendingTransactionDraftEditing: async () => { markedEditing = true; },
  });

  const response = await handleTelegramCallbackQuery(service, owner, "draft:edit:draft_1");

  assert.equal(markedEditing, true);
  assert.match(response.text, /EDIT DRAFT TRANSAKSI/);
  assert.match(response.text, /<code>\/editdraft/);
});

test("draft Ya callback approves the server-resolved draft and saves the transaction", async () => {
  let approved = false;
  const service = fakeService({
    getPendingTransactionDraft: async () => ({ draftId: "draft_1" }),
    approvePendingTransactionDraft: async () => {
      approved = true;
      return { transactionId: "txn_saved" };
    },
  });

  const response = await handleTelegramCallbackQuery(service, owner, "draft:yes:draft_1");

  assert.equal(approved, true);
  assert.match(response.text, /Transaksi berhasil disimpan/);
  assert.match(response.text, /<code>txn_saved<\/code>/);
});

test("draft callback rejects a foreign or stale draft ID", async () => {
  const service = fakeService({
    getPendingTransactionDraft: async () => ({ draftId: "draft_other" }),
  });

  const response = await handleTelegramCallbackQuery(service, owner, "draft:yes:draft_foreign");

  assert.match(response.text, /kedaluwarsa atau tidak tersedia/);
});

test("adds an expense through the service and formats the Indonesian response", async () => {
  let receivedInput: unknown;
  const transaction: Transaction = {
    transactionId: "txn_1",
    familyId: "fam_1",
    transactionType: "EXPENSE",
    amountMinor: 150000,
    currency: "IDR",
    transactionDate: "2026-08-19",
    description: "Makan siang",
    createdByMemberId: "mem_100",
    createdAt: "2026-08-19T00:00:00.000Z",
    status: "ACTIVE",
  };
  const service = fakeService({
    createTransaction: async (_user: TelegramUser, input: unknown) => {
      receivedInput = input;
      return transaction;
    },
  });

  const response = await handleTelegramTextMessage(service, owner, "/addexpense 150.000 2026-08-19 Makan siang");

  assert.deepEqual(receivedInput, {
    transactionType: "EXPENSE",
    amountMinor: 150000,
    currency: undefined,
    transactionDate: "2026-08-19",
    description: "Makan siang",
  });
  assert.match(response, /Pengeluaran berhasil dicatat/);
  assert.match(response, /ID: <code>txn_1<\/code>/);
});

test("lists transactions through the requester’s server-resolved family", async () => {
  const family: Family = {
    familyId: "fam_1",
    familyName: "Keluarga Owner",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: owner.telegramUserId,
    plan: "FREE",
  };
  const transaction: Transaction = {
    transactionId: "txn_1",
    familyId: "fam_1",
    transactionType: "INCOME",
    amountMinor: 100000,
    currency: "IDR",
    transactionDate: "2026-08-19",
    description: "Gaji",
    createdByMemberId: "mem_100",
    createdAt: "2026-08-19T00:00:00.000Z",
    status: "ACTIVE",
  };
  const service = fakeService({
    getActiveFamily: async () => family,
    listTransactions: async () => [transaction],
  });

  const response = await handleTelegramTextMessage(service, owner, "/transactions");

  assert.match(response, /Keluarga Owner/);
  assert.match(response, /Gaji/);
  assert.match(response, /ID: <code>txn_1<\/code>/);
});

test("renders a family-scoped financial report for the requested month", async () => {
  const family: Family = {
    familyId: "fam_1",
    familyName: "Keluarga Owner",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: owner.telegramUserId,
    plan: "FREE",
  };
  const report: FinancialReport = {
    period: { month: "2026-08", startDate: "2026-08-01", endDate: "2026-08-31", label: "Agustus 2026" },
    transactionCount: 2,
    currencies: [{ currency: "IDR", incomeMinor: BigInt(500000), expenseMinor: BigInt(125000), netMinor: BigInt(375000), transactionCount: 2 }],
    categorySummaries: [],
    cashFlow: [],
    transactions: [],
  };
  let receivedUserId: string | undefined;
  let receivedMonth: string | undefined;
  const service = fakeService({
    getActiveFamily: async () => family,
    getFinancialReport: async (telegramUserId: string, month?: string) => {
      receivedUserId = telegramUserId;
      receivedMonth = month;
      return report;
    },
  });

  const response = await handleTelegramTextMessage(service, owner, "/report 2026-08");

  assert.equal(receivedUserId, owner.telegramUserId);
  assert.equal(receivedMonth, "2026-08");
  assert.match(response, /Keluarga Owner/);
  assert.match(response, /Agustus 2026/);
  assert.match(response, /Saldo\s+: IDR 375\.000/);
  assert.match(response, /Transaksi aktif: 2/);
});

test("rejects a report command with multiple period arguments", async () => {
  const service = fakeService({});
  const response = await handleTelegramTextMessage(service, owner, "/report 2026-08 extra");
  assert.match(response, /Format tidak valid/);
  assert.match(response, /\/report YYYY-MM/);
});

test("opens the configured HTTPS Mini App for an active family member", async () => {
  const originalMiniAppUrl = process.env.FALANCE_MINI_APP_URL;
  process.env.FALANCE_MINI_APP_URL = "https://falance.example.com/";
  const family: Family = {
    familyId: "fam_1",
    familyName: "Keluarga Owner",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: owner.telegramUserId,
    plan: "FREE",
  };
  try {
    const response = await handleTelegramTextMessageResponse(
      fakeService({ getActiveFamily: async () => family }),
      owner,
      "/reportapp",
    );
    assert.equal(typeof response, "object");
    assert.deepEqual(response, {
      text: "📊 Buka laporan interaktif keluarga <code>Keluarga Owner</code>.",
      replyMarkup: { inline_keyboard: [[{ text: "Buka Mini App", webApp: { url: "https://falance.example.com/" } }]] },
    });
  } finally {
    if (originalMiniAppUrl === undefined) delete process.env.FALANCE_MINI_APP_URL;
    else process.env.FALANCE_MINI_APP_URL = originalMiniAppUrl;
  }
});

test("edits a transaction through the service", async () => {
  let receivedId: unknown;
  let receivedInput: unknown;
  const service = fakeService({
    updateTransaction: async (_user: TelegramUser, transactionId: string, input: unknown) => {
      receivedId = transactionId;
      receivedInput = input;
      return { transactionId };
    },
  });

  const response = await handleTelegramTextMessage(
    service,
    owner,
    "/edittransaction txn_1 EXPENSE 200.000 IDR 2026-08-20 Belanja baru",
  );

  assert.equal(receivedId, "txn_1");
  assert.deepEqual(receivedInput, {
    transactionType: "EXPENSE",
    amountMinor: 200000,
    currency: "IDR",
    transactionDate: "2026-08-20",
    description: "Belanja baru",
  });
  assert.match(response, /Transaksi <code>txn_1<\/code> berhasil diperbarui/);
});

test("requests transaction void with an interactive confirmation prompt", async () => {
  let requestedId: unknown;
  const service = fakeService({
    requestTransactionVoid: async (_user: TelegramUser, transactionId: string) => {
      requestedId = transactionId;
      return {};
    },
  });

  const response = await handleTelegramTextMessage(service, owner, "/voidtransaction txn_1");

  assert.equal(requestedId, "txn_1");
  assert.match(response, /membatalkan transaksi <code>txn_1<\/code>/);
  assert.match(response, /Balas Y/);
});

test("formats a confirmed transaction void result", async () => {
  const service = fakeService({
    hasPendingConfirmation: async () => true,
    confirmPendingAction: async () => ({
      action: "VOID_TRANSACTION",
      transactionDescription: "Belanja baru",
    } satisfies ConfirmationResult),
  });

  const response = await handleTelegramTextMessage(service, owner, "Y");

  assert.match(response, /Belanja baru berhasil dibatalkan secara soft-state/);
});

test("Y confirms a pending destructive action", async () => {
  let confirmed = false;
  const service = fakeService({
    hasPendingConfirmation: async () => true,
    confirmPendingAction: async () => {
      confirmed = true;
      return { action: "DEACTIVATE_MEMBER", targetName: "Budi" } satisfies ConfirmationResult;
    },
  });

  const response = await handleTelegramTextMessage(service, owner, "Y");

  assert.equal(confirmed, true);
  assert.match(response, /Budi berhasil dinonaktifkan/);
});

test("N cancels a pending destructive action", async () => {
  let cancelled = false;
  const service = fakeService({
    hasPendingConfirmation: async () => true,
    cancelPendingConfirmation: async () => { cancelled = true; },
  });

  const response = await handleTelegramTextMessage(service, owner, "N");

  assert.equal(cancelled, true);
  assert.match(response, /Operasi dibatalkan/);
});

test("Y is passed to normal message handling when no confirmation is pending", async () => {
  const service = fakeService({ hasPendingConfirmation: async () => false });

  const response = await handleTelegramTextMessage(service, owner, "Y");

  assert.match(response, /pengembangan/);
});

function fakeService(overrides: Record<string, unknown>): FamilyService {
  return {
    hasPendingConfirmation: async () => false,
    confirmPendingAction: async () => ({ action: "REVOKE_INVITATION" }),
    cancelPendingConfirmation: async () => {},
    claimReceiptVision: async () => ({ familyId: "fam_1", telegramUserId: owner.telegramUserId }),
    completeReceiptVision: async () => {},
    getActiveMembership: async () => ({
      memberId: "mem_100",
      familyId: "fam_1",
      telegramUserId: owner.telegramUserId,
      name: owner.name,
      username: owner.username,
      role: "OWNER",
      status: "ACTIVE",
      joinedAt: "2026-01-01T00:00:00.000Z",
    }),
    ...overrides,
  } as unknown as FamilyService;
}
