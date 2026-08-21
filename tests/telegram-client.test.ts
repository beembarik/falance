import assert from "node:assert/strict";
import test from "node:test";

import {
  answerTelegramCallbackQuery,
  downloadTelegramPhoto,
  sendTelegramMessage,
  TelegramApiError,
} from "../src/lib/telegram/client";

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

test("serializes a Mini App web_app button for Telegram", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const requests: Array<{ body: unknown }> = [];
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  globalThis.fetch = async (_input, init) => {
    requests.push({ body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    await sendTelegramMessage({
      chatId: 123,
      text: "Report",
      replyMarkup: { inline_keyboard: [[{ text: "Buka Mini App", webApp: { url: "https://falance.example.com/" } }]] },
    });
    assert.deepEqual(requests[0]?.body, {
      chat_id: 123,
      text: "Report",
      reply_markup: {
        inline_keyboard: [[{ text: "Buka Mini App", web_app: { url: "https://falance.example.com/" } }]],
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment("TELEGRAM_BOT_TOKEN", originalToken);
  }
});

test("downloads the largest Telegram photo through getFile", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const requests: string[] = [];
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith("/getFile")) {
      return new Response(JSON.stringify({ ok: true, result: { file_path: "photos/receipt.jpg", file_size: 4 } }), { status: 200 });
    }
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0x01]), {
      status: 200,
      headers: { "content-length": "4" },
    });
  };

  try {
    const image = await downloadTelegramPhoto([
      { fileId: "small", width: 100, height: 100 },
      { fileId: "large", width: 1200, height: 1600 },
    ]);
    assert.deepEqual([...image.data], [0xff, 0xd8, 0xff, 0x01]);
    assert.equal(image.mimeType, "image/jpeg");
    assert.equal(requests[0]?.endsWith("/getFile"), true);
    assert.equal(requests[1]?.endsWith("/file/bottest-token/photos/receipt.jpg"), true);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment("TELEGRAM_BOT_TOKEN", originalToken);
  }
});

test("rejects Telegram photos over the pixel limit before downloading", async () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  try {
    await assert.rejects(
      () => downloadTelegramPhoto([{ fileId: "huge", width: 5000, height: 5000 }]),
      TelegramApiError,
    );
  } finally {
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
