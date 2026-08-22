import type { MemberRole } from "../family/types";
import { escapeTelegramHtml, telegramCode } from "./html";

type HelpAudience = "PUBLIC" | "UNREGISTERED" | "ACTIVE" | "ADMIN" | "OWNER";

type HelpEntry = {
  command: string;
  description: string;
  audience: HelpAudience;
};

const HELP_SECTIONS: Array<{ title: string; entries: HelpEntry[] }> = [
  {
    title: "Mulai dan akses",
    entries: [
      { command: "/start", description: "Melihat status akun dan akses keluarga.", audience: "PUBLIC" },
      { command: "/help", description: "Membuka panduan command Falancé ini.", audience: "PUBLIC" },
      { command: "/createfamily", description: "Membuat keluarga baru jika belum memiliki membership aktif.", audience: "UNREGISTERED" },
      { command: "/join FAL-XXXXXX", description: "Bergabung ke keluarga memakai invitation code.", audience: "UNREGISTERED" },
    ],
  },
  {
    title: "Keluarga dan anggota",
    entries: [
      { command: "/members", description: "Melihat nama keluarga dan anggota aktif.", audience: "ACTIVE" },
      { command: "/invite", description: "Membuat invitation code siap dibagikan.", audience: "ADMIN" },
      { command: "/revokeinvite FAL-XXXXXX", description: "Mencabut invitation yang masih pending.", audience: "ADMIN" },
      { command: "/renamefamily <nama_baru>", description: "Mengubah nama keluarga.", audience: "OWNER" },
      { command: "/changerole <member_id_atau_username> <ADMIN|MEMBER>", description: "Mengubah role anggota aktif.", audience: "OWNER" },
      { command: "/deactivate <member_id_atau_username>", description: "Menonaktifkan anggota non-OWNER dengan konfirmasi Y/N.", audience: "OWNER" },
      { command: "/reactivate <member_id_atau_username> CONFIRM", description: "Mengaktifkan kembali membership yang suspended.", audience: "OWNER" },
      { command: "/archivefamily", description: "Mengarsipkan keluarga dengan konfirmasi Y/N.", audience: "OWNER" },
      { command: "/reactivatefamily CONFIRM", description: "Mengaktifkan kembali keluarga yang diarsipkan.", audience: "OWNER" },
    ],
  },
  {
    title: "Transaksi",
    entries: [
      { command: "/addincome <amount_minor> [CURRENCY] <YYYY-MM-DD> <deskripsi>", description: "Mencatat pemasukan aktual.", audience: "ACTIVE" },
      { command: "/addexpense <amount_minor> [CURRENCY] <YYYY-MM-DD> <deskripsi>", description: "Mencatat pengeluaran aktual.", audience: "ACTIVE" },
      { command: "/transactions", description: "Melihat saldo kumulatif per currency dan transaksi aktif terbaru.", audience: "ACTIVE" },
      { command: "/edittransaction <transaction_id> <INCOME|EXPENSE> <amount_minor> [CURRENCY] <YYYY-MM-DD> <deskripsi>", description: "Mengedit transaksi aktif tanpa mengganti ID-nya.", audience: "ACTIVE" },
      { command: "/voidtransaction <transaction_id>", description: "Meminta konfirmasi untuk membatalkan transaksi secara soft-state.", audience: "ACTIVE" },
      { command: "/canceltransaction <transaction_id>", description: "Alias dari /voidtransaction.", audience: "ACTIVE" },
    ],
  },
  {
    title: "Laporan dan Mini App",
    entries: [
      { command: "/report [YYYY-MM]", description: "Melihat laporan ringkas per periode dan currency.", audience: "ACTIVE" },
      { command: "/reportapp", description: "Membuka Mini App laporan interaktif.", audience: "ACTIVE" },
    ],
  },
  {
    title: "Draft transaksi dan AI",
    entries: [
      { command: "/editdraft <INCOME|EXPENSE> <amount_minor> [CURRENCY] <YYYY-MM-DD> <deskripsi>", description: "Mengubah draft transaksi natural-language sebelum disimpan.", audience: "ACTIVE" },
    ],
  },
];

export function formatHelpMessage(role: MemberRole | null): string {
  const registered = role !== null;
  const sections = HELP_SECTIONS
    .map((section) => ({
      title: section.title,
      entries: section.entries.filter((entry) => isVisible(entry.audience, role)),
    }))
    .filter((section) => section.entries.length > 0);

  const lines = [
    "📖 Panduan command Falancé",
    registered
      ? `Akses kamu: ${role === "OWNER" ? "OWNER" : role === "ADMIN" ? "ADMIN" : "MEMBER"}. Command di bawah disesuaikan dengan role kamu.`
      : "Akun kamu belum memiliki membership aktif. Gunakan salah satu command pada bagian Mulai dan akses.",
    "",
  ];

  for (const section of sections) {
    lines.push(`— ${section.title} —`);
    for (const entry of section.entries) {
      lines.push(`${formatHelpCommand(entry.command)} — ${entry.description}`);
    }
    lines.push("");
  }

  if (registered) {
    lines.push("Kirim pesan transaksi dengan bahasa biasa atau foto struk untuk membuat draft yang harus ditinjau sebelum disimpan.");
    lines.push("Tanggal transaksi aktual tidak boleh melewati hari ini pada zona waktu bisnis Falancé.");
  } else {
    lines.push("Untuk bergabung, minta invitation code dari owner atau admin keluarga.");
  }

  return lines.join("\n");
}

function formatHelpCommand(commandSyntax: string): string {
  const [command, ...parameters] = commandSyntax.split(" ");
  const parameterText = parameters.length > 0 ? ` ${telegramCode(parameters.join(" "))}` : "";
  return `${escapeTelegramHtml(command)}${parameterText}`;
}

function isVisible(audience: HelpAudience, role: MemberRole | null): boolean {
  if (audience === "PUBLIC") return true;
  if (audience === "UNREGISTERED") return role === null;
  if (audience === "ACTIVE") return role !== null;
  if (audience === "ADMIN") return role === "OWNER" || role === "ADMIN";
  return role === "OWNER";
}
