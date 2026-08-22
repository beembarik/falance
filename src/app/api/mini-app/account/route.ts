import { FamilyService, FamilyServiceError } from "../../../../lib/family/service";
import { MiniAppAuthError, validateMiniAppInitData } from "../../../../lib/telegram/mini-app-auth";
import { GoogleSheetsFamilyRepository } from "../../../../lib/family/google-sheets-repository";
import { buildMiniAppAvatarUrl } from "../../../../lib/telegram/mini-app-avatar-token";

export const runtime = "nodejs";

type MiniAppAccountRequest = {
  initData?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  let payload: MiniAppAccountRequest;
  try {
    payload = await request.json() as MiniAppAccountRequest;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof payload.initData !== "string" || !payload.initData.trim()) {
    return Response.json({ error: "Mini App authorization is required." }, { status: 400 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("[MiniApp] Telegram bot token is not configured");
    return Response.json({ error: "Service unavailable." }, { status: 503 });
  }

  try {
    const validated = validateMiniAppInitData(payload.initData, botToken);
    const service = new FamilyService(new GoogleSheetsFamilyRepository());
    const membership = await service.getActiveMembership(validated.telegramUser.telegramUserId);
    if (!membership) return Response.json({ error: "Mini App access denied." }, { status: 403 });
    const family = await service.getActiveFamily(validated.telegramUser.telegramUserId);
    const members = await service.listFamilyMembers(validated.telegramUser.telegramUserId);
    const avatarFallbackUrl = buildMiniAppAvatarUrl(request, validated.telegramUser.telegramUserId);

    return Response.json({
      viewer: {
        name: membership.name,
        username: membership.username,
        role: membership.role,
        avatarUrl: validated.telegramUser.avatarUrl,
        avatarFallbackUrl,
      },
      family: {
        familyName: family.familyName,
        status: family.status,
        plan: family.plan,
        activeMemberCount: members.length,
      },
      members: members.map((member) => ({
        name: member.name,
        username: member.username,
        role: member.role,
        joinedAt: member.joinedAt,
      })),
    });
  } catch (error) {
    if (error instanceof MiniAppAuthError) {
      return Response.json({ error: "Mini App authorization is invalid or expired." }, { status: 401 });
    }
    if (error instanceof FamilyServiceError) {
      return Response.json({ error: "Mini App access denied." }, { status: 403 });
    }
    console.error("[MiniApp] account request failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ error: "Unable to load account." }, { status: 500 });
  }
}
