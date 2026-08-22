import assert from "node:assert/strict";
import test from "node:test";

import { buildMiniAppAvatarUrl, verifyMiniAppAvatarToken } from "../src/lib/telegram/mini-app-avatar-token";

test("builds and verifies a short-lived avatar proxy token", () => {
  const originalSecret = process.env.FALANCE_REPORT_TOKEN_SECRET;
  process.env.FALANCE_REPORT_TOKEN_SECRET = "avatar-test-secret";
  try {
    const url = buildMiniAppAvatarUrl(new Request("https://falance.example.com/"), "100");
    const token = new URL(url).searchParams.get("token");
    assert.match(url, /^https:\/\/falance\.example\.com\/api\/mini-app\/avatar\?token=/);
    assert.equal(verifyMiniAppAvatarToken(token), "100");
    assert.equal(verifyMiniAppAvatarToken(`${token}tampered`), null);
  } finally {
    if (originalSecret === undefined) delete process.env.FALANCE_REPORT_TOKEN_SECRET;
    else process.env.FALANCE_REPORT_TOKEN_SECRET = originalSecret;
  }
});

test("rejects an avatar token after expiry", () => {
  const originalSecret = process.env.FALANCE_REPORT_TOKEN_SECRET;
  process.env.FALANCE_REPORT_TOKEN_SECRET = "avatar-test-secret";
  try {
    const url = buildMiniAppAvatarUrl(new Request("https://falance.example.com/"), "100");
    const token = new URL(url).searchParams.get("token");
    assert.equal(verifyMiniAppAvatarToken(token, Math.floor(Date.now() / 1000) + 301), null);
  } finally {
    if (originalSecret === undefined) delete process.env.FALANCE_REPORT_TOKEN_SECRET;
    else process.env.FALANCE_REPORT_TOKEN_SECRET = originalSecret;
  }
});
