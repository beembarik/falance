const START_MESSAGE = `👋 Halo! Selamat datang di Falancé.

Saya adalah asisten keuangan keluarga.

🔒 Akun Telegram kamu belum terdaftar.

Gunakan invitation dari owner keluarga untuk bergabung.`;

const UNDER_DEVELOPMENT_MESSAGE =
  "Falancé sedang dalam pengembangan. Fitur pencatatan keuangan akan segera hadir.";

export function getTextMessageResponse(text: string): string {
  return text === "/start" ? START_MESSAGE : UNDER_DEVELOPMENT_MESSAGE;
}
