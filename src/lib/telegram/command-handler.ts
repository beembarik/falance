import {
  AlreadyRegisteredError,
  FamilyService,
  FamilyServiceError,
  InvitationError,
  UnauthorizedError,
} from "@/lib/family/service";
import type { FamilyMember, TelegramUser } from "@/lib/family/types";

const UNREGISTERED_START = `👋 Halo! Selamat datang di Falancé.

Kamu belum terdaftar dalam keluarga.

Kamu bisa:
• membuat keluarga baru
• bergabung menggunakan invitation code.`;

export async function handleTelegramTextMessage(
  service: FamilyService,
  user: TelegramUser,
  text: string,
): Promise<string> {
  const command = text.trim();
  try {
    if (command === "/start") return startMessage(await service.getActiveMembership(user.telegramUserId));
    if (command === "/createfamily") {
      await service.beginFamilyCreation(user);
      return "🏠 Mari buat keluarga baru.\n\nSilakan kirim nama keluarga.";
    }
    if (command === "/invite") {
      const invitation = await service.createInvitation(user);
      return `✅ Invitation berhasil dibuat.\n\nKode: ${invitation.code}\nBerlaku sampai: ${new Date(invitation.expiresAt).toLocaleString("id-ID")}`;
    }
    if (command === "/members") {
      return membersMessage(await service.listFamilyMembers(user.telegramUserId));
    }
    if (command.startsWith("/revokeinvite")) {
      const code = command.slice("/revokeinvite".length).trim();
      if (!code) return "Format tidak valid. Gunakan: /revokeinvite FAL-XXXXXX";
      await service.revokeInvitation(user, code);
      return "✅ Invitation berhasil dicabut.";
    }
    if (command.startsWith("/join")) {
      const code = command.slice("/join".length).trim();
      if (!code) return "Format tidak valid. Gunakan: /join FAL-XXXXXX";
      const family = await service.joinFamily(user, code);
      return `✅ Kamu berhasil bergabung dengan ${family.familyName}.`;
    }

    const membership = await service.getActiveMembership(user.telegramUserId);
    if (!membership) {
      const family = await service.createFamilyFromPending(user, command);
      return `✅ Keluarga ${family.familyName} berhasil dibuat. Kamu adalah OWNER keluarga ini.`;
    }
    return "Falancé sedang dalam pengembangan. Fitur pencatatan keuangan akan segera hadir.";
  } catch (error) {
    return messageForError(error);
  }
}

function membersMessage(members: FamilyMember[]): string {
  if (members.length === 0) return "Belum ada anggota aktif dalam keluarga.";

  const lines = members.map((member, index) => {
    const username = member.username ? `@${member.username}` : "tanpa username";
    const joinedAt = new Date(member.joinedAt).toLocaleDateString("id-ID");
    return `${index + 1}. ${member.name} (${username})\n   Role: ${member.role}\n   Status: ${member.status}\n   Bergabung: ${joinedAt}`;
  });

  return `👥 Anggota keluarga:\n\n${lines.join("\n\n")}`;
}

function startMessage(member: { role: string } | null): string {
  return member
    ? `👋 Halo! Kamu terdaftar sebagai ${member.role} di Falancé.`
    : UNREGISTERED_START;
}

function messageForError(error: unknown): string {
  if (error instanceof AlreadyRegisteredError) return "Kamu sudah terdaftar dalam keluarga aktif.";
  if (error instanceof UnauthorizedError) return "Kamu tidak memiliki izin untuk menjalankan perintah ini.";
  if (error instanceof InvitationError) return "Invitation tidak valid, sudah digunakan, dicabut, atau kedaluwarsa.";
  if (error instanceof FamilyServiceError) return "Permintaan tidak dapat diproses. Gunakan /createfamily untuk memulai kembali.";
  return "Terjadi gangguan saat memproses permintaan. Silakan coba lagi.";
}
