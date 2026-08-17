import { GoogleConfigurationError, GoogleSheetsClient } from "@/lib/google/sheets-client";
import type { FamilyRepository } from "@/lib/family/repository";
import type { Family, FamilyMember, Invitation, PendingFamilyCreation } from "@/lib/family/types";

export class GoogleSheetsFamilyRepository implements FamilyRepository {
  constructor(private readonly client = new GoogleSheetsClient()) {}

  async createFamilySpreadsheet(familyName: string, familyId: string): Promise<string> {
    return this.client.createFamilySpreadsheet(familyName, familyId);
  }

  async createFamily(family: Family): Promise<void> {
    await this.append("Families", [
      family.familyId, family.familyName, family.spreadsheetId, family.status,
      family.createdAt, family.createdBy, family.plan,
    ]);
  }

  async findFamilyById(familyId: string): Promise<Family | null> {
    const row = (await this.rows("Families")).find((value) => value[0] === familyId);
    return row ? {
      familyId: row[0], familyName: row[1], spreadsheetId: row[2],
      status: row[3] as Family["status"], createdAt: row[4], createdBy: row[5], plan: row[6],
    } : null;
  }

  async createMember(member: FamilyMember): Promise<void> {
    const row = [member.memberId, member.familyId, member.telegramUserId, member.name,
      member.username ?? "", member.role, member.status, member.joinedAt];
    await this.append("Members", row);
    const family = await this.findFamilyById(member.familyId);
    if (!family) throw new GoogleConfigurationError("Family registry record is missing.");
    await this.client.appendRows(family.spreadsheetId, "Members", [
      [member.memberId, member.telegramUserId, member.name, member.username ?? "", member.role, member.status, member.joinedAt],
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
    await this.append("Invitations", [
      invitation.invitationId, invitation.familyId, invitation.code, invitation.createdBy,
      invitation.createdAt, invitation.expiresAt, invitation.status, invitation.usedBy ?? "", invitation.usedAt ?? "",
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
    await this.client.updateValues(this.registryId(), `Invitations!A${index + 2}`, [[
      ...row.slice(0, 6), "USED", telegramUserId, usedAt,
    ]]);
  }

  async createPendingFamilyCreation(pending: PendingFamilyCreation): Promise<void> {
    await this.clearPendingFamilyCreation(pending.telegramUserId);
    await this.append("Pending Family Creations", [
      pending.telegramUserId, pending.createdAt, pending.expiresAt, "PENDING",
    ]);
  }

  async findPendingFamilyCreation(telegramUserId: string): Promise<PendingFamilyCreation | null> {
    const row = (await this.rows("Pending Family Creations")).find(
      (value) => value[0] === telegramUserId && value[3] === "PENDING",
    );
    return row ? { telegramUserId: row[0], createdAt: row[1], expiresAt: row[2] } : null;
  }

  async clearPendingFamilyCreation(telegramUserId: string): Promise<void> {
    const rows = await this.rows("Pending Family Creations");
    const index = rows.findIndex((row) => row[0] === telegramUserId && row[3] === "PENDING");
    if (index >= 0) {
      const row = rows[index];
      await this.client.updateValues(this.registryId(), `Pending Family Creations!A${index + 2}`, [[
        row[0], row[1], row[2], "COMPLETED",
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

function invitationFromRow(row: string[]): Invitation {
  return {
    invitationId: row[0], familyId: row[1], code: row[2], createdBy: row[3],
    createdAt: row[4], expiresAt: row[5], status: row[6] as Invitation["status"],
    usedBy: row[7] || null, usedAt: row[8] || null,
  };
}
