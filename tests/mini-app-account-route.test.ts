import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../src/app/api/mini-app/account/route";

test("Mini App account rejects a request without initData", async () => {
  const response = await POST(new Request("https://falance.example.com/api/mini-app/account", {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "content-type": "application/json" },
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Mini App authorization is required." });
});

test("Mini App account returns only the authorized family view", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  const prototype = (await import("../src/lib/family/google-sheets-repository")).GoogleSheetsFamilyRepository.prototype;
  const repository = prototype as typeof prototype & {
    findActiveMemberByTelegramUserId: typeof prototype.findActiveMemberByTelegramUserId;
    findFamilyById: typeof prototype.findFamilyById;
    findMembersByFamilyId: typeof prototype.findMembersByFamilyId;
  };
  const originalFindMember = repository.findActiveMemberByTelegramUserId;
  const originalFindFamily = repository.findFamilyById;
  const originalFindMembers = repository.findMembersByFamilyId;
  repository.findActiveMemberByTelegramUserId = async () => ({
    memberId: "mem_owner",
    familyId: "fam_authorized",
    telegramUserId: "100",
    name: "Owner Falancé",
    username: "owner",
    role: "OWNER",
    status: "ACTIVE",
    joinedAt: "2026-01-01T00:00:00.000Z",
  });
  repository.findFamilyById = async () => ({
    familyId: "fam_authorized",
    familyName: "Keluarga Aman",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "100",
    plan: "MVP",
  });
  repository.findMembersByFamilyId = async () => [
    {
      memberId: "mem_owner",
      familyId: "fam_authorized",
      telegramUserId: "100",
      name: "Owner Falancé",
      username: "owner",
      role: "OWNER",
      status: "ACTIVE",
      joinedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      memberId: "mem_member",
      familyId: "fam_authorized",
      telegramUserId: "200",
      name: "Member Falancé",
      username: null,
      role: "MEMBER",
      status: "ACTIVE",
      joinedAt: "2026-01-02T00:00:00.000Z",
    },
    {
      memberId: "mem_suspended",
      familyId: "fam_authorized",
      telegramUserId: "300",
      name: "Suspended Falancé",
      username: "suspended",
      role: "MEMBER",
      status: "SUSPENDED",
      joinedAt: "2026-01-03T00:00:00.000Z",
    },
  ];

  try {
    const params = new URLSearchParams({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: 100, first_name: "Owner Falancé", username: "owner", photo_url: "https://t.me/i/userpic/320/avatar.jpg" }),
    });
    const dataCheckString = [...params.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    const { createHmac } = await import("node:crypto");
    const secretKey = createHmac("sha256", "WebAppData").update("test-token").digest();
    params.set("hash", createHmac("sha256", secretKey).update(dataCheckString).digest("hex"));

    const response = await POST(new Request("https://falance.example.com/api/mini-app/account", {
      method: "POST",
      body: JSON.stringify({ initData: params.toString() }),
      headers: { "content-type": "application/json" },
    }));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      viewer: { name: "Owner Falancé", username: "owner", role: "OWNER", avatarUrl: "https://t.me/i/userpic/320/avatar.jpg" },
      family: {
        familyName: "Keluarga Aman",
        status: "ACTIVE",
        plan: "MVP",
        activeMemberCount: 2,
      },
      members: [
        { name: "Owner Falancé", username: "owner", role: "OWNER", joinedAt: "2026-01-01T00:00:00.000Z" },
        { name: "Member Falancé", username: null, role: "MEMBER", joinedAt: "2026-01-02T00:00:00.000Z" },
      ],
    });
    const responseText = JSON.stringify(await (await POST(new Request("https://falance.example.com/api/mini-app/account", {
      method: "POST",
      body: JSON.stringify({ initData: params.toString() }),
      headers: { "content-type": "application/json" },
    }))).json());
    assert.equal(responseText.includes("100"), false);
    assert.equal(responseText.includes("fam_authorized"), false);
  } finally {
    repository.findActiveMemberByTelegramUserId = originalFindMember;
    repository.findFamilyById = originalFindFamily;
    repository.findMembersByFamilyId = originalFindMembers;
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
  }
});
