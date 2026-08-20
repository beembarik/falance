import assert from "node:assert/strict";
import test from "node:test";

import {
  isTelegramUpdateId,
  verifyTelegramWebhookSecret,
} from "../src/lib/telegram/webhook-security";

test("authorizes a webhook only when the configured secret matches", () => {
  assert.equal(verifyTelegramWebhookSecret("secret-123", "secret-123"), "AUTHORIZED");
  assert.equal(verifyTelegramWebhookSecret("wrong", "secret-123"), "UNAUTHORIZED");
  assert.equal(verifyTelegramWebhookSecret(null, "secret-123"), "UNAUTHORIZED");
});

test("fails closed when the webhook secret is not configured", () => {
  assert.equal(verifyTelegramWebhookSecret("anything", undefined), "MISSING_CONFIGURATION");
});

test("accepts only non-negative safe integer Telegram update IDs", () => {
  assert.equal(isTelegramUpdateId(0), true);
  assert.equal(isTelegramUpdateId(123), true);
  assert.equal(isTelegramUpdateId(-1), false);
  assert.equal(isTelegramUpdateId(1.5), false);
  assert.equal(isTelegramUpdateId(Number.MAX_SAFE_INTEGER + 1), false);
  assert.equal(isTelegramUpdateId("123"), false);
});
