import {
  AlreadyRegisteredError,
  FamilyService,
  FamilyServiceError,
  InvitationError,
  MemberManagementError,
  UnauthorizedError,
} from "@/lib/family/service";
import type { FamilyMember, MemberRole, TelegramUser } from "@/lib/family/types";
import { formatMembersMessage } from "./member-message";

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
      return formatMembersMessage(await service.listFamilyMembers(user.telegramUserId));
    }
    if (command.startsWith("/revokeinvite")) {
      const code = command.slice("/revokeinvite".length).trim();
      if (!code) return "Format tidak valid. Gunakan: /revokeinvite FAL-XXXXXX";
      await service.revokeInvitation(user, code);
      return "✅ Invitation berhasil dicabut.";
    }
    if (command.startsWith("/changerole")) {
      const args = command.slice("/changerole".length).trim().split(/\s+/).filter(Boolean);
      if (args.length !== 2) return "Format tidak valid. Gunakan: /changerole <member_id_atau_username> <ADMIN|MEMBER>";

      const target = await findRoleChangeTarget(service, user, args[0]);
      if (!target) return "Anggota tidak ditemukan dalam keluarga aktif kamu.";

      const newRole = args[1].toUpperCase();
      if (newRole !== "ADMIN" && newRole !== "MEMBER") {
        return "Role tidak valid. Gunakan ADMIN atau MEMBER.";
      }
      await service.changeMemberRole(user, target.memberId, newRole as MemberRole);
      return `✅ Role ${target.name} berhasil diubah menjadi ${newRole}.`;
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

function startMessage(member: { role: string } | null): string {
  return member
    ? `👋 Halo! Kamu terdaftar sebagai ${member.role} di Falancé.`
    : UNREGISTERED_START;
}

async function findRoleChangeTarget(
  service: FamilyService,
  user: TelegramUser,
  identifier: string,
): Promise<FamilyMember | null> {
  const normalizedIdentifier = identifier.replace(/^@/, "").toLowerCase();
  const members = await service.listFamilyMembers(user.telegramUserId);
  return members.find(
    (member) =>
      member.memberId === identifier ||
      (member.username !== null && member.username.toLowerCase() === normalizedIdentifier),
  ) ?? null;
}

function messageForError(error: unknown): string {
  if (error instanceof AlreadyRegisteredError) return "Kamu sudah terdaftar dalam keluarga aktif.";
  if (error instanceof UnauthorizedError) return "Kamu tidak memiliki izin untuk menjalankan perintah ini.";
  if (error instanceof InvitationError) return "Invitation tidak valid, sudah digunakan, dicabut, atau kedaluwarsa.";
  if (error instanceof MemberManagementError) return "Role anggota tidak dapat diubah. Pastikan target adalah MEMBER atau ADMIN aktif.";
  if (error instanceof FamilyServiceError) return "Permintaan tidak dapat diproses. Gunakan /createfamily untuk memulai kembali.";
  return "Terjadi gangguan saat memproses permintaan. Silakan coba lagi.";
}
