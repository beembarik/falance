import assert from "node:assert/strict";
import test from "node:test";

import { handleTelegramTextMessage } from "../src/lib/telegram/command-handler";
import type { FamilyService, ConfirmationResult } from "../src/lib/family/service";
import type { TelegramUser } from "../src/lib/family/types";

const owner: TelegramUser = { telegramUserId: "100", name: "Owner", username: "owner" };

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
