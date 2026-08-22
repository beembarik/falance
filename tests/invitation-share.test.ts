import { strict as assert } from "node:assert";
import test from "node:test";

import { buildInvitationShareMessage } from "../src/lib/telegram/invitation-share";

test("builds a ready-to-share invitation with a Telegram bot deep link", () => {
  const message = buildInvitationShareMessage("FAL-ABC123", "@Falance_bot");

  assert.equal(message, [
    "Undangan bergabung ke keluarga Falancé",
    "",
    "1. Kunjungi: https://t.me/Falance_bot",
    "2. Kirim pesan berikut di chat bot:",
    "/join FAL-ABC123",
    "",
    "Kode undangan hanya dapat digunakan satu kali dan memiliki masa berlaku.",
  ].join("\n"));
});

test("does not create a link from an invalid bot username", () => {
  const message = buildInvitationShareMessage("FAL-ABC123", "https://evil.example");

  assert.equal(message.includes("https://evil.example"), false);
  assert.equal(message.includes("/join FAL-ABC123"), true);
});
