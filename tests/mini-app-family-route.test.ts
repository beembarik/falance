import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import test from "node:test";

import { POST } from "../src/app/api/mini-app/family/route";
import { GoogleSheetsFamilyRepository } from "../src/lib/family/google-sheets-repository";
import type { Family, FamilyMember, PendingConfirmation } from "../src/lib/family/types";

const botToken = "mini-app-family-route-test-token";
const family: Family = {
  familyId: "fam_admin_route",
  familyName: "Keluarga Admin Route",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "100",
  plan: "MVP",
};
const owner: FamilyMember = {
  memberId: "mem_owner_admin_route",
  familyId: family.familyId,
  telegramUserId: "100",
  name: "Owner",
  username: "owner",
  role: "OWNER",
  status: "ACTIVE",
  joinedAt: "2026-01-01T00:00:00.000Z",
};
const member: FamilyMember = {
  memberId: "mem_member_admin_route",
  familyId: family.familyId,
  telegramUserId: "200",
  name: "Member",
  username: "member",
  role: "MEMBER",
  status: "ACTIVE",
  joinedAt: "2026-01-02T00:00:00.000Z",
};

test("Mini App family action resolves the family from verified membership", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalBotUsername = process.env.FALANCE_TELEGRAM_BOT_USERNAME;
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  process.env.FALANCE_TELEGRAM_BOT_USERNAME = "Falance_bot";
  const repository = GoogleSheetsFamilyRepository.prototype as GoogleSheetsFamilyRepository & {
    findActiveMemberByTelegramUserId: GoogleSheetsFamilyRepository["findActiveMemberByTelegramUserId"];
    findFamilyById: GoogleSheetsFamilyRepository["findFamilyById"];
    createInvitation: GoogleSheetsFamilyRepository["createInvitation"];
    createAuditLog: GoogleSheetsFamilyRepository["createAuditLog"];
  };
  const originalFindMember = repository.findActiveMemberByTelegramUserId;
  const originalFindFamily = repository.findFamilyById;
  const originalCreateInvitation = repository.createInvitation;
  const originalAudit = repository.createAuditLog;
  let createdFamilyId = "";
  repository.findActiveMemberByTelegramUserId = async () => owner;
  repository.findFamilyById = async (familyId: string) => familyId === family.familyId ? family : null;
  repository.createInvitation = async (value) => { createdFamilyId = value.familyId; };
  repository.createAuditLog = async () => {};

  try {
    const response = await POST(new Request("https://falance.example.com/api/mini-app/family", {
      method: "POST",
      body: JSON.stringify({ initData: signedInitData("100"), action: "CREATE_INVITATION", family_id: "fam_foreign_client_value" }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(response.status, 201);
    assert.equal(createdFamilyId, family.familyId);
    const payload = await response.json() as { invitation: { shareMessage: string } };
    assert.equal(payload.invitation.shareMessage.includes("https://t.me/Falance_bot"), true);
    assert.equal(payload.invitation.shareMessage.includes("/join FAL-"), true);
    assert.equal(JSON.stringify(payload).includes("fam_foreign_client_value"), false);
  } finally {
    repository.findActiveMemberByTelegramUserId = originalFindMember;
    repository.findFamilyById = originalFindFamily;
    repository.createInvitation = originalCreateInvitation;
    repository.createAuditLog = originalAudit;
    restoreEnv("TELEGRAM_BOT_TOKEN", originalToken);
    restoreEnv("FALANCE_TELEGRAM_BOT_USERNAME", originalBotUsername);
  }
});

test("Mini App deactivation requires a matching durable confirmation action", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  const repository = GoogleSheetsFamilyRepository.prototype as GoogleSheetsFamilyRepository & {
    findActiveMemberByTelegramUserId: GoogleSheetsFamilyRepository["findActiveMemberByTelegramUserId"];
    findFamilyById: GoogleSheetsFamilyRepository["findFamilyById"];
    findMembersByFamilyId: GoogleSheetsFamilyRepository["findMembersByFamilyId"];
    createPendingConfirmation: GoogleSheetsFamilyRepository["createPendingConfirmation"];
    findPendingConfirmation: GoogleSheetsFamilyRepository["findPendingConfirmation"];
    updatePendingConfirmationStatus: GoogleSheetsFamilyRepository["updatePendingConfirmationStatus"];
    updateMemberStatus: GoogleSheetsFamilyRepository["updateMemberStatus"];
    createAuditLog: GoogleSheetsFamilyRepository["createAuditLog"];
  };
  const originalFindMember = repository.findActiveMemberByTelegramUserId;
  const originalFindFamily = repository.findFamilyById;
  const originalFindMembers = repository.findMembersByFamilyId;
  const originalCreateConfirmation = repository.createPendingConfirmation;
  const originalFindConfirmation = repository.findPendingConfirmation;
  const originalUpdateConfirmation = repository.updatePendingConfirmationStatus;
  const originalUpdateMemberStatus = repository.updateMemberStatus;
  const originalAudit = repository.createAuditLog;
  let pending: PendingConfirmation | undefined;
  let deactivatedMemberId = "";
  repository.findActiveMemberByTelegramUserId = async () => owner;
  repository.findFamilyById = async (familyId: string) => familyId === family.familyId ? family : null;
  repository.findMembersByFamilyId = async () => [owner, member];
  repository.createPendingConfirmation = async (value) => { pending = value; };
  repository.findPendingConfirmation = async () => pending ?? null;
  repository.updatePendingConfirmationStatus = async (_id, status) => { if (pending) pending = { ...pending, status }; };
  repository.updateMemberStatus = async (memberId) => { deactivatedMemberId = memberId; };
  repository.createAuditLog = async () => {};

  try {
    const requestResponse = await POST(new Request("https://falance.example.com/api/mini-app/family", {
      method: "POST",
      body: JSON.stringify({ initData: signedInitData("100"), action: "REQUEST_DEACTIVATE_MEMBER", memberId: member.memberId, family_id: "fam_foreign_client_value" }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(requestResponse.status, 200);
    assert.equal(pending?.action, "DEACTIVATE_MEMBER");
    assert.equal(pending?.familyId, family.familyId);
    assert.equal(deactivatedMemberId, "");

    const confirmResponse = await POST(new Request("https://falance.example.com/api/mini-app/family", {
      method: "POST",
      body: JSON.stringify({ initData: signedInitData("100"), action: "CONFIRM_DEACTIVATE_MEMBER" }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(confirmResponse.status, 200);
    assert.equal(deactivatedMemberId, member.memberId);
    assert.equal(pending?.status, "COMPLETED");
  } finally {
    repository.findActiveMemberByTelegramUserId = originalFindMember;
    repository.findFamilyById = originalFindFamily;
    repository.findMembersByFamilyId = originalFindMembers;
    repository.createPendingConfirmation = originalCreateConfirmation;
    repository.findPendingConfirmation = originalFindConfirmation;
    repository.updatePendingConfirmationStatus = originalUpdateConfirmation;
    repository.updateMemberStatus = originalUpdateMemberStatus;
    repository.createAuditLog = originalAudit;
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
