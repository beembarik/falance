import assert from "node:assert/strict";
import test from "node:test";

import { handleTelegramTextMessage } from "../src/lib/telegram/command-handler";
import type { FamilyService, ConfirmationResult } from "../src/lib/family/service";
import type { Family, TelegramUser, Transaction } from "../src/lib/family/types";

const owner: TelegramUser = { telegramUserId: "100", name: "Owner", username: "owner" };

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
  assert.match(response, /txn_1/);
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
  assert.match(response, /txn_1/);
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
