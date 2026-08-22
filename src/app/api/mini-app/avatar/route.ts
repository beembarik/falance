import { FamilyService, FamilyServiceError } from "../../../../lib/family/service";
import { GoogleSheetsFamilyRepository } from "../../../../lib/family/google-sheets-repository";
import { downloadTelegramProfilePhoto, TelegramApiError } from "../../../../lib/telegram/client";
import { verifyMiniAppAvatarToken } from "../../../../lib/telegram/mini-app-avatar-token";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  const telegramUserId = verifyMiniAppAvatarToken(token);
  if (!telegramUserId) return new Response("Unauthorized.", { status: 401 });

  try {
    const service = new FamilyService(new GoogleSheetsFamilyRepository());
    const membership = await service.getActiveMembership(telegramUserId);
    if (!membership) return new Response("Forbidden.", { status: 403 });
    const image = await downloadTelegramProfilePhoto(telegramUserId);
    if (!image) return new Response("Profile photo unavailable.", { status: 404 });
    return new Response(image.data as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "private, max-age=60",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof FamilyServiceError) return new Response("Forbidden.", { status: 403 });
    if (error instanceof TelegramApiError) return new Response("Profile photo unavailable.", { status: 502 });
    console.error("[MiniApp] avatar request failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return new Response("Unable to load avatar.", { status: 500 });
  }
}
