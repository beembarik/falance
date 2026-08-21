import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../src/app/api/mini-app/report/route";

test("Mini App report rejects a request without initData", async () => {
  const response = await POST(new Request("https://falance.example.com/api/mini-app/report", {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "content-type": "application/json" },
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Mini App authorization is required." });
});

test("Mini App report rejects invalid initData before reading registry data", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  try {
    const response = await POST(new Request("https://falance.example.com/api/mini-app/report", {
      method: "POST",
      body: JSON.stringify({ initData: "auth_date=1700000000&hash=bad" }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Mini App authorization is invalid or expired." });
  } finally {
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
  }
});
