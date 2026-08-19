import assert from "node:assert/strict";
import test from "node:test";

import { formatMembersMessage } from "../src/lib/telegram/member-message";
import type { FamilyMember } from "../src/lib/family/types";

test("member listing includes member ID without exposing Telegram user ID", () => {
  const member: FamilyMember = {
    memberId: "mem_example123",
    familyId: "fam_1",
    telegramUserId: "telegram-secret-100",
    name: "Member",
    username: null,
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-01-01T00:00:00.000Z",
  };

  const message = formatMembersMessage("Keluarga Falancé", [member]);

  assert.match(message, /Keluarga Falancé/);
  assert.match(message, /Member ID: <code>mem_example123<\/code>/);
  assert.doesNotMatch(message, /telegram-secret-100/);
  assert.match(message, /tanpa username/);
});
