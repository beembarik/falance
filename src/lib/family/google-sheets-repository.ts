import { GoogleConfigurationError, GoogleSheetsClient } from "@/lib/google/sheets-client";
import type { FamilyRepository } from "@/lib/family/repository";
import type { Family, FamilyMember, Invitation, PendingFamilyCreation } from "@/lib/family/types";

/**
 * Repository backed by the single Falancé database spreadsheet configured for
 * this deployment. Family isolation is enforced by filtering rows with the
 * server-resolved family_id; Telegram input never selects a spreadsheet.
 */
export class GoogleSheetsFamilyRepository implements FamilyRepository {
  constructor(private readonly client = new GoogleSheetsClient()) {}

  async createFamily(family: Family): Promise<void> {
    const existing = await this.findFamilyById(family.familyId);
    if (existing) return;
    await this.append("Families", [
      family.familyId, family.familyName, family.status,
      family.createdAt, family.createdBy, family.plan,
    ]);
  }

  async findFamilyById(familyId: string): Promise<Family | null> {
    const row = (await this.rows("Families")).find((value) => value[0] === familyId);
    return row ? familyFromRow(row) : null;
  }

  async findFamilyByCreatedBy(telegramUserId: string): Promise<Family | null> {
    const row = (await this.rows("Families")).find(
      (value) => value[4] === telegramUserId && value[2] === "ACTIVE",
    );
    return row ? familyFromRow(row) : null;
  }

  async createMember(member: FamilyMember): Promise<void> {
    const existingRows = await this.rows("Members");
    if (existingRows.some((row) => row[0] === member.memberId)) return;
    await this.append("Members", [
      member.memberId, member.familyId, member.telegramUserId, member.name,
      member.username ?? "", member.role, member.status, member.joinedAt,
    ]);
  }

  async findActiveMemberByTelegramUserId(telegramUserId: string): Promise<FamilyMember | null> {
    const row = (await this.rows("Members")).find(
      (value) => value[2] === telegramUserId && value[6] === "ACTIVE",
    );
    return row ? {
      memberId: row[0], familyId: row[1], telegramUserId: row[2], name: row[3],
      username: row[4] || null, role: row[5] as FamilyMember["role"],
      status: "ACTIVE", joinedAt: row[7],
    } : null;
  }

  async createInvitation(invitation: Invitation): Promise<void> {
    const existing = await this.findInvitationByCode(invitation.code);
    if (existing) return;
    await this.append("Invitations", [
      invitation.invitationId, invitation.familyId, invitation.code, invitation.createdBy,
      invitation.createdAt, invitation.expiresAt, invitation.usedAt ?? "",
      invitation.usedBy ?? "", invitation.status,
    ]);
  }

  async findInvitationByCode(code: string): Promise<Invitation | null> {
    const row = (await this.rows("Invitations")).find((value) => value[2] === code);
    return row ? invitationFromRow(row) : null;
  }

  async markInvitationUsed(invitationId: string, telegramUserId: string, usedAt: string): Promise<void> {
    const rows = await this.rows("Invitations");
    const index = rows.findIndex((row) => row[0] === invitationId);
    if (index < 0) throw new GoogleConfigurationError("Invitation registry record is missing.");
    const row = rows[index];
    if (row[8] !== "PENDING") return;
    await this.client.updateValues(this.registryId(), `Invitations!A${index + 2}`, [[
      ...row.slice(0, 6), usedAt, telegramUserId, "USED",
    ]]);
  }

  async createPendingFamilyCreation(pending: PendingFamilyCreation): Promise<void> {
    await this.clearPendingFamilyCreation(pending.telegramUserId);
    await this.append("Pending Family Creations", [
      pending.telegramUserId, pending.familyName ?? "", pending.createdAt, pending.expiresAt, "PENDING",
    ]);
  }

  async findPendingFamilyCreation(telegramUserId: string): Promise<PendingFamilyCreation | null> {
    const row = (await this.rows("Pending Family Creations")).find(
      (value) => value[0] === telegramUserId && value[4] === "PENDING",
    );
    return row ? {
      telegramUserId: row[0], familyName: row[1] || null, createdAt: row[2], expiresAt: row[3],
    } : null;
  }

  async clearPendingFamilyCreation(telegramUserId: string): Promise<void> {
    const rows = await this.rows("Pending Family Creations");
    const index = rows.findIndex((row) => row[0] === telegramUserId && row[4] === "PENDING");
    if (index >= 0) {
      const row = rows[index];
      await this.client.updateValues(this.registryId(), `Pending Family Creations!A${index + 2}`, [[
        row[0], row[1], row[2], row[3], "COMPLETED",
      ]]);
    }
  }

  private async rows(sheet: string): Promise<string[][]> {
    await this.client.ensureRegistry(this.registryId());
    const values = await this.client.getValues(this.registryId(), sheet);
    return values.slice(1);
  }

  private async append(sheet: string, row: string[]): Promise<void> {
    await this.client.ensureRegistry(this.registryId());
    await this.client.appendRows(this.registryId(), sheet, [row]);
  }

  private registryId(): string {
    const registryId = process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID;
    if (!registryId) throw new GoogleConfigurationError("Google family registry is not configured.");
    return registryId;
  }
}

function familyFromRow(row: string[]): Family {
  return {
    familyId: row[0], familyName: row[1], status: row[2] as Family["status"],
    createdAt: row[3], createdBy: row[4], plan: row[5],
  };
}

function invitationFromRow(row: string[]): Invitation {
  return {
    invitationId: row[0], familyId: row[1], code: row[2], createdBy: row[3],
    createdAt: row[4], expiresAt: row[5],     usedAt: row[6] || null, usedBy: row[7] || null,
    status: row[8] as Invitation["status"],

  };
}
