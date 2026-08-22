export function buildInvitationShareMessage(code: string, botUsername?: string): string {
  const normalizedUsername = botUsername?.trim().replace(/^@/, "");
  const validUsername = normalizedUsername && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(normalizedUsername)
    ? normalizedUsername
    : null;
  const botLink = validUsername ? `https://t.me/${validUsername}` : "Buka bot Falancé di Telegram";

  return [
    "Undangan bergabung ke keluarga Falancé",
    "",
    `1. Kunjungi: ${botLink}`,
    "2. Kirim pesan berikut di chat bot:",
    `/join ${code}`,
    "",
    "Kode undangan hanya dapat digunakan satu kali dan memiliki masa berlaku.",
  ].join("\n");
}
