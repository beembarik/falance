export const MEMBER_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_STATUSES = ["ACTIVE", "SUSPENDED", "LEFT"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const INVITATION_STATUSES = ["PENDING", "USED", "EXPIRED", "REVOKED"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export interface TelegramUser {
  telegramUserId: string;
  name: string;
  username: string | null;
}

export interface Family {
  familyId: string;
  familyName: string;
  spreadsheetId: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  createdBy: string;
  plan: string;
}

export interface FamilyMember extends TelegramUser {
  memberId: string;
  familyId: string;
  role: MemberRole;
  status: MemberStatus;
  joinedAt: string;
}

export interface Invitation {
  invitationId: string;
  familyId: string;
  code: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  status: InvitationStatus;
  usedBy: string | null;
  usedAt: string | null;
}

export interface PendingFamilyCreation {
  telegramUserId: string;
  createdAt: string;
  expiresAt: string;
}
