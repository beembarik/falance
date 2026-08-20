import assert from "node:assert/strict";
import test from "node:test";

import { handleTelegramCallbackQuery, handleTelegramTextMessage } from "../src/lib/telegram/command-handler";
import type { FamilyService, ConfirmationResult } from "../src/lib/family/service";
import type { Family, TelegramUser, Transaction } from "../src/lib/family/types";
import type { TransactionTextParser } from "../src/lib/ai/transaction-text-parser";

const owner: TelegramUser = { telegramUserId: "100", name: "Owner", username: "owner" };

test("formats an invitation code as inline code", async () => {
  const service = fakeService({
    createInvitation: async () => ({ code: "FAL-ABC123", expiresAt: "2026-08-20T00:00:00.000Z" }),
  });

  const response = await handleTelegramTextMessage(service, owner, "/invite");

  assert.match(response, /Kode: <code>FAL-ABC123<\/code>/);
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
      },
    }),
  };

  const response = await handleTelegramTextMessage(service, owner, "beli susu 35 ribu", parser);

  assert.equal(persisted, false);
  assert.match(response, /DRAFT TRANSAKSI/);
  assert.match(response, /Tanggal    : 20\/08\/2026 \(diasumsikan hari ini\)/);
  assert.match(response, /Jika sudah benar, tekan tombol ✅ Ya, simpan/);
  assert.match(response, /Jika perlu perubahan, tekan tombol ✏️ Edit/);
  assert.doesNotMatch(response, /\/addexpense 35000 IDR 2026-08-20 Beli susu/);
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
