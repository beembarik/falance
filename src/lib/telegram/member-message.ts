import type { FamilyMember } from "@/lib/family/types";

export function formatMembersMessage(familyName: string, members: FamilyMember[]): string {
  const heading = `👥 Keluarga: ${familyName}`;
  if (members.length === 0) return `${heading}\n\nBelum ada anggota aktif dalam keluarga.`;

  const lines = members.map((member, index) => {
    const username = member.username ? `@${member.username}` : "tanpa username";
    const joinedAt = new Date(member.joinedAt).toLocaleDateString("id-ID");
    return `${index + 1}. ${member.name} (${username})\n   Member ID: ${member.memberId}\n   Role: ${member.role}\n   Status: ${member.status}\n   Bergabung: ${joinedAt}`;
  });

  return `${heading}\n\n${lines.join("\n\n")}`;
}
