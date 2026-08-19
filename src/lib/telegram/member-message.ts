import type { FamilyMember } from "../family/types";

export function formatMembersMessage(members: FamilyMember[]): string {
  if (members.length === 0) return "Belum ada anggota aktif dalam keluarga.";

  const lines = members.map((member, index) => {
    const username = member.username ? `@${member.username}` : "tanpa username";
    const joinedAt = new Date(member.joinedAt).toLocaleDateString("id-ID");
    return `${index + 1}. ${member.name} (${username})\n   Member ID: ${member.memberId}\n   Role: ${member.role}\n   Status: ${member.status}\n   Bergabung: ${joinedAt}`;
  });

  return `👥 Anggota keluarga:\n\n${lines.join("\n\n")}`;
}
