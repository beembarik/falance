import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { MiniAppAuthError, validateMiniAppInitData } from "../src/lib/telegram/mini-app-auth";

const botToken = "123456:bot-token-for-tests";

function makeInitData(overrides: Record<string, string> = {}, authDate = 1_700_000_000): string {
  const fields = {
    auth_date: String(authDate),
    query_id: "AAHdF6IQ",
    user: JSON.stringify({ id: 100, first_name: "Owner", last_name: "Test", username: "owner_test" }),
    ...overrides,
  };
  const dataCheckString = Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

test("validates Mini App initData and returns the Telegram identity", () => {
  const result = validateMiniAppInitData(makeInitData(), botToken, 1_700_000_300, 600);
  assert.deepEqual(result.telegramUser, {
    telegramUserId: "100",
    name: "Owner Test",
    username: "owner_test",
  });
  assert.equal(result.authDate, 1_700_000_000);
  assert.equal(result.queryId, "AAHdF6IQ");
});

test("rejects a tampered Mini App initData signature", () => {
  const initData = makeInitData().replace("Owner", "Other");
  assert.throws(() => validateMiniAppInitData(initData, botToken, 1_700_000_300, 600), MiniAppAuthError);
});

test("rejects stale Mini App initData", () => {
  const initData = makeInitData({}, 1_700_000_000);
  assert.throws(() => validateMiniAppInitData(initData, botToken, 1_700_001_000, 600), MiniAppAuthError);
});

test("rejects initData without user or hash", () => {
  assert.throws(() => validateMiniAppInitData("auth_date=1700000000", botToken, 1_700_000_300, 600), MiniAppAuthError);
  assert.throws(() => validateMiniAppInitData("auth_date=1700000000&user=%7B%7D&hash=bad", botToken, 1_700_000_300, 600), MiniAppAuthError);
});
