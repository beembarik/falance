import assert from "node:assert/strict";
import test from "node:test";

import { escapeTelegramHtml, telegramCode, usesTelegramHtml } from "../src/lib/telegram/html";

test("escapes dynamic values before placing them in Telegram HTML", () => {
  assert.equal(escapeTelegramHtml("A&B <test> \"quote\""), "A&amp;B &lt;test&gt; &quot;quote&quot;");
});

test("wraps identifiers in an inline code span", () => {
  assert.equal(telegramCode("txn_abc123"), "<code>txn_abc123</code>");
});

test("detects only responses that require Telegram HTML parsing", () => {
  assert.equal(usesTelegramHtml("Kode: <code>FAL-ABC123</code>"), true);
  assert.equal(usesTelegramHtml("Belum ada transaksi aktif."), false);
});
