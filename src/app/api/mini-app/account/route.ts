import { FamilyService, FamilyServiceError } from "../../../../lib/family/service";
import { MiniAppAuthError, validateMiniAppInitData } from "../../../../lib/telegram/mini-app-auth";
import { createFamilyRepository } from "../../../../lib/family/repository-factory";
import { buildMiniAppAvatarUrl } from "../../../../lib/telegram/mini-app-avatar-token";
import { classifyMiniAppError, classifyPersistenceConfig, logMiniAppDiagnostic } from "../../../../lib/mini-app/diagnostics";
import { isPublicBetaEnabled } from "../../../../lib/beta/policy";
import { FALANCE_RELEASE_VERSION } from "../../../../lib/release";

export const runtime = "nodejs";

type MiniAppAccountRequest = {
  initData?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  logMiniAppDiagnostic("account", "request_started");
  let payload: MiniAppAccountRequest;
  try {
    payload = await request.json() as MiniAppAccountRequest;
  } catch {
    logMiniAppDiagnostic("account", "invalid_request", { status: 400 });
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof payload.initData !== "string" || !payload.initData.trim()) {
    logMiniAppDiagnostic("account", "init_data_missing", { status: 400 });
    return Response.json({ error: "Mini App authorization is required." }, { status: 400 });
  }
  logMiniAppDiagnostic("account", "init_data_present");

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("[MiniApp] Telegram bot token is not configured");
    return Response.json({ error: "Service unavailable." }, { status: 503 });
  }

  let stage = "authentication";
  try {
    const validated = validateMiniAppInitData(payload.initData, botToken);
    stage = "repository_create";
    const service = new FamilyService(createFamilyRepository());
    stage = "membership_lookup";
    const membership = await service.getActiveMembership(validated.telegramUser.telegramUserId);
    if (!membership) {
      logMiniAppDiagnostic("account", "access_denied", { status: 403 });
      return Response.json({ error: "Mini App access denied." }, { status: 403 });
    }
    stage = "family_lookup";
    const family = await service.getActiveFamily(validated.telegramUser.telegramUserId);
    stage = "members_lookup";
    const members = await service.listFamilyMembers(validated.telegramUser.telegramUserId);
    stage = "avatar_url";
    const avatarFallbackUrl = buildMiniAppAvatarUrl(request, validated.telegramUser.telegramUserId);

    logMiniAppDiagnostic("account", "success", { status: 200 });
    return Response.json({
      beta: isPublicBetaEnabled() ? {
        label: "Public Beta",
        version: FALANCE_RELEASE_VERSION,
        supportUrl: getPublicSupportUrl(),
        tester: family.plan === "BETA",
      } : undefined,
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
        memberId: member.memberId,
        name: member.name,
        username: member.username,
        role: member.role,
        joinedAt: member.joinedAt,
      })),
    });
  } catch (error) {
    if (error instanceof MiniAppAuthError) {
      logMiniAppDiagnostic("account", "auth_invalid", { status: 401 });
      return Response.json({ error: "Mini App authorization is invalid or expired." }, { status: 401 });
    }
    if (error instanceof FamilyServiceError) {
      logMiniAppDiagnostic("account", "access_denied", { status: 403 });
      return Response.json({ error: "Mini App access denied." }, { status: 403 });
    }
    logMiniAppDiagnostic("account", "failure", {
      status: 500,
      errorClass: classifyMiniAppError(error),
      stage,
      persistenceConfig: classifyPersistenceConfig(),
    });
    console.error("[MiniApp] account request failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ error: "Unable to load account." }, { status: 500 });
  }
}

function getPublicSupportUrl(): string | null {
  const configuredUrl = process.env.FALANCE_SUPPORT_TELEGRAM_URL?.trim();
  if (!configuredUrl) return null;
  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== "https:" || (url.hostname !== "t.me" && url.hostname !== "telegram.me")) return null;
    url.searchParams.set("text", [
      "Halo, saya beta tester Falancé.",
      "",
      "Kategori feedback: Bug / Usability / Ide fitur",
      "Versi aplikasi:",
      "Ringkasan:",
      "Langkah atau konteks:",
    ].join("\n"));
    return url.toString();
  } catch {
    return null;
  }
}
