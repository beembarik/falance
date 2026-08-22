export const MEMBER_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_STATUSES = ["ACTIVE", "SUSPENDED", "LEFT"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const FAMILY_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type FamilyStatus = (typeof FAMILY_STATUSES)[number];

export const INVITATION_STATUSES = ["PENDING", "USED", "EXPIRED", "REVOKED"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const CONFIRMATION_ACTIONS = ["REVOKE_INVITATION", "DEACTIVATE_MEMBER", "ARCHIVE_FAMILY", "VOID_TRANSACTION"] as const;
export type ConfirmationAction = (typeof CONFIRMATION_ACTIONS)[number];

export const TRANSACTION_DRAFT_STATUSES = ["PENDING", "EDITING", "COMPLETED", "CANCELLED", "EXPIRED"] as const;
export type TransactionDraftStatus = (typeof TRANSACTION_DRAFT_STATUSES)[number];

export const PROCESSED_TELEGRAM_UPDATE_STATUSES = ["CLAIMED", "COMPLETED"] as const;
export type ProcessedTelegramUpdateStatus = (typeof PROCESSED_TELEGRAM_UPDATE_STATUSES)[number];

export const CONFIRMATION_STATUSES = ["PENDING", "COMPLETED", "CANCELLED", "EXPIRED"] as const;
export type ConfirmationStatus = (typeof CONFIRMATION_STATUSES)[number];

export const AUDIT_ACTIONS = [
  "CREATE_INVITATION",
  "REVOKE_INVITATION",
  "CHANGE_MEMBER_ROLE",
  "DEACTIVATE_MEMBER",
  "REACTIVATE_MEMBER",
  "RENAME_FAMILY",
  "ARCHIVE_FAMILY",
  "REACTIVATE_FAMILY",
  "CREATE_TRANSACTION",
  "UPDATE_TRANSACTION",
  "UPDATE_TRANSACTION_CATEGORY",
  "VOID_TRANSACTION",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditTargetType = "INVITATION" | "MEMBER" | "FAMILY" | "TRANSACTION";

export const TRANSACTION_TYPES = ["INCOME", "EXPENSE"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export const TRANSACTION_STATUSES = ["ACTIVE", "VOID"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export interface Transaction {
  transactionId: string;
  familyId: string;
  transactionType: TransactionType;
  amountMinor: number;
  currency: string;
  transactionDate: string;
  description: string;
  category?: string;
  createdByMemberId: string;
  createdAt: string;
  status: TransactionStatus;
}

export interface AuditLogEntry {
  auditId: string;
  familyId: string;
  actorMemberId: string;
  actorRole: MemberRole;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  previousValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export interface TelegramUser {
  telegramUserId: string;
  name: string;
  username: string | null;
  avatarUrl?: string | null;
}

export interface Family {
  familyId: string;
  familyName: string;
  status: FamilyStatus;
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

export interface PendingConfirmation {
  confirmationId: string;
  telegramUserId: string;
  familyId: string;
  action: ConfirmationAction;
  target: string;
  createdAt: string;
  expiresAt: string;
  status: ConfirmationStatus;
}

export interface PendingFamilyCreation {
  telegramUserId: string;
  familyName: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface ProcessedTelegramUpdate {
  updateId: number;
  claimedAt: string;
  completedAt: string | null;
  status: ProcessedTelegramUpdateStatus;
}

export const DRAFT_APPROVAL_CLAIM_STATUSES = ["CLAIMED", "COMPLETED"] as const;
export type DraftApprovalClaimStatus = (typeof DRAFT_APPROVAL_CLAIM_STATUSES)[number];

export interface DraftApprovalClaim {
  draftId: string;
  telegramUserId: string;
  familyId: string;
  transactionId: string;
  claimedAt: string;
  completedAt: string | null;
  leaseUntil: string;
  status: DraftApprovalClaimStatus;
}

export interface PendingTransactionDraft {
  draftId: string;
  telegramUserId: string;
  familyId: string;
  transactionType: TransactionType;
  amountMinor: number;
  currency: string;
  transactionDate: string;
  description: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  transactionDateInferred?: boolean;
  categorySuggestion?: string;
  descriptionSuggestion?: string;
  createdAt: string;
  expiresAt: string;
  status: TransactionDraftStatus;
}
