import {
  ConfirmationError,
  FamilyNameError,
  FamilyService,
  FamilyServiceError,
  InvitationError,
  MemberManagementError,
  UnauthorizedError,
} from "../../../../lib/family/service";
import { GoogleSheetsFamilyRepository } from "../../../../lib/family/google-sheets-repository";
import type { MemberRole } from "../../../../lib/family/types";
import { buildInvitationShareMessage } from "../../../../lib/telegram/invitation-share";
import { MiniAppAuthError, validateMiniAppInitData } from "../../../../lib/telegram/mini-app-auth";

export const runtime = "nodejs";

type FamilyAction =
  | "CREATE_INVITATION"
  | "RENAME_FAMILY"
  | "CHANGE_MEMBER_ROLE"
  | "REQUEST_DEACTIVATE_MEMBER"
  | "CONFIRM_DEACTIVATE_MEMBER"
  | "CANCEL_DEACTIVATE_MEMBER";

type MiniAppFamilyRequest = {
  initData?: unknown;
  action?: unknown;
  familyName?: unknown;
  memberId?: unknown;
  role?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  let payload: MiniAppFamilyRequest;
  try {
    payload = await request.json() as MiniAppFamilyRequest;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof payload.initData !== "string" || !payload.initData.trim()) {
    return Response.json({ error: "Mini App authorization is required." }, { status: 400 });
  }
  if (typeof payload.action !== "string" || !isFamilyAction(payload.action)) {
    return Response.json({ error: "Aksi keluarga tidak valid." }, { status: 400 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("[MiniApp] Telegram bot token is not configured");
    return Response.json({ error: "Service unavailable." }, { status: 503 });
  }

  try {
    const validated = validateMiniAppInitData(payload.initData, botToken);
    const service = new FamilyService(new GoogleSheetsFamilyRepository());
    const actor = validated.telegramUser;

    if (payload.action === "CREATE_INVITATION") {
      const invitation = await service.createInvitation(actor);
      return Response.json({
        message: "Undangan berhasil dibuat.",
        invitation: {
          code: invitation.code,
          expiresAt: invitation.expiresAt,
          shareMessage: buildInvitationShareMessage(invitation.code, process.env.FALANCE_TELEGRAM_BOT_USERNAME),
        },
      }, { status: 201 });
    }

    if (payload.action === "RENAME_FAMILY") {
      if (typeof payload.familyName !== "string" || !payload.familyName.trim()) {
        return Response.json({ error: "Nama keluarga wajib diisi." }, { status: 400 });
      }
      const family = await service.updateFamilyName(actor, payload.familyName);
      return Response.json({ message: "Nama keluarga berhasil diperbarui.", family: { familyName: family.familyName } });
    }

    if (payload.action === "CHANGE_MEMBER_ROLE") {
      if (typeof payload.memberId !== "string" || !payload.memberId.trim() || !isAssignableRole(payload.role)) {
        return Response.json({ error: "Target member dan role baru wajib valid." }, { status: 400 });
      }
      await service.changeMemberRole(actor, payload.memberId.trim(), payload.role);
      return Response.json({ message: "Role member berhasil diperbarui." });
    }

    if (payload.action === "REQUEST_DEACTIVATE_MEMBER") {
      if (typeof payload.memberId !== "string" || !payload.memberId.trim()) {
        return Response.json({ error: "Member wajib dipilih." }, { status: 400 });
      }
      const confirmation = await service.requestMemberDeactivation(actor, payload.memberId.trim());
      return Response.json({
        message: "Konfirmasi penonaktifan diperlukan.",
        confirmation: { expiresAt: confirmation.expiresAt },
      });
    }

    if (payload.action === "CONFIRM_DEACTIVATE_MEMBER") {
      const result = await service.confirmPendingAction(actor, "DEACTIVATE_MEMBER");
      return Response.json({ message: "Member berhasil dinonaktifkan.", targetName: result.targetName });
    }

    await service.cancelPendingConfirmation(actor, "DEACTIVATE_MEMBER");
    return Response.json({ message: "Penonaktifan member dibatalkan." });
  } catch (error) {
    if (error instanceof MiniAppAuthError) {
      return Response.json({ error: "Mini App authorization is invalid or expired." }, { status: 401 });
    }
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Mini App access denied." }, { status: 403 });
    }
    if (error instanceof FamilyNameError || error instanceof InvitationError || error instanceof MemberManagementError || error instanceof ConfirmationError) {
      return Response.json({ error: toIndonesianFamilyError(error) }, { status: 400 });
    }
    if (error instanceof FamilyServiceError) {
      return Response.json({ error: "Aksi keluarga tidak dapat diproses." }, { status: 400 });
    }
    console.error("[MiniApp] family action failed", { error: error instanceof Error ? error.name : "unknown" });
    return Response.json({ error: "Unable to process family action." }, { status: 500 });
  }
}

function isFamilyAction(value: string): value is FamilyAction {
  return [
    "CREATE_INVITATION",
    "RENAME_FAMILY",
    "CHANGE_MEMBER_ROLE",
    "REQUEST_DEACTIVATE_MEMBER",
    "CONFIRM_DEACTIVATE_MEMBER",
    "CANCEL_DEACTIVATE_MEMBER",
  ].includes(value);
}

function isAssignableRole(value: unknown): value is MemberRole {
  return value === "ADMIN" || value === "MEMBER";
}

function toIndonesianFamilyError(error: Error): string {
  if (error instanceof ConfirmationError) return "Konfirmasi tidak tersedia atau sudah kedaluwarsa.";
  if (error instanceof InvitationError) return "Undangan tidak valid atau tidak dapat diproses.";
  if (error instanceof MemberManagementError) return "Perubahan member tidak dapat diproses.";
  if (error instanceof FamilyNameError) return "Nama keluarga tidak valid.";
  return "Aksi keluarga tidak dapat diproses.";
}
