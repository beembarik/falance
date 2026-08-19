import assert from "node:assert/strict";
import test from "node:test";

import { answerTelegramCallbackQuery, sendTelegramMessage } from "../src/lib/telegram/client";

test("serializes interactive draft inline keyboard markup for Telegram", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const requests: Array<{ url: string; body: unknown }> = [];
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    await sendTelegramMessage({
      chatId: 123,
      text: "Draft",
      parseMode: "HTML",
      replyMarkup: {
        inline_keyboard: [[{ text: "✅ Ya, simpan", callbackData: "draft:yes:draft_1" }]],
      },
    });
    assert.deepEqual(requests[0]?.body, {
      chat_id: 123,
      text: "Draft",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "✅ Ya, simpan", callback_data: "draft:yes:draft_1" }]],
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment("TELEGRAM_BOT_TOKEN", originalToken);
  }
});

test("acknowledges Telegram callback queries", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  let body: unknown;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  globalThis.fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    await answerTelegramCallbackQuery("callback_1");
    assert.deepEqual(body, { callback_query_id: "callback_1" });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment("TELEGRAM_BOT_TOKEN", originalToken);
  }
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
