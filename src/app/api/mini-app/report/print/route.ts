import { GoogleSheetsFamilyRepository } from "../../../../../lib/family/google-sheets-repository";
import { FamilyService, FamilyServiceError, UnauthorizedError } from "../../../../../lib/family/service";
import { ReportPeriodError, buildFinancialPrintHtml } from "../../../../../lib/family/report";
import { MiniAppAuthError, validateMiniAppInitData } from "../../../../../lib/telegram/mini-app-auth";
import { readMiniAppReportRequest, type MiniAppReportRequestPayload } from "../../../../../lib/telegram/mini-app-request";

export const runtime = "nodejs";

type MiniAppPrintRequest = MiniAppReportRequestPayload;

export async function POST(request: Request): Promise<Response> {
  let payload: MiniAppPrintRequest;
  try {
    payload = await readMiniAppReportRequest(request) as MiniAppPrintRequest;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof payload.initData !== "string" || !payload.initData.trim()) {
    return Response.json({ error: "Mini App authorization is required." }, { status: 400 });
  }
  if (
    (payload.month !== undefined && typeof payload.month !== "string") ||
    (payload.startDate !== undefined && typeof payload.startDate !== "string") ||
    (payload.endDate !== undefined && typeof payload.endDate !== "string")
  ) {
    return Response.json({ error: "Invalid report period." }, { status: 400 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("[MiniApp] Telegram bot token is not configured");
    return Response.json({ error: "Service unavailable." }, { status: 503 });
  }

  try {
    const validated = validateMiniAppInitData(payload.initData, botToken);
    const service = new FamilyService(new GoogleSheetsFamilyRepository());
    const exported = await service.getFinancialExportReport(
      validated.telegramUser.telegramUserId,
      stringValue(payload.month),
      stringValue(payload.startDate),
      stringValue(payload.endDate),
    );
    const html = buildFinancialPrintHtml(exported.family.familyName, exported.report);
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": `inline; filename="falance-report-${exported.report.period.startDate}-${exported.report.period.endDate}.html"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof MiniAppAuthError) {
      return Response.json({ error: "Mini App authorization is invalid or expired." }, { status: 401 });
    }
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Cetak hanya tersedia untuk OWNER dan ADMIN." }, { status: 403 });
    }
    if (error instanceof ReportPeriodError) {
      return Response.json({ error: "Report period or date range is invalid." }, { status: 400 });
    }
    if (error instanceof FamilyServiceError) {
      return Response.json({ error: "Mini App access denied." }, { status: 403 });
    }
    console.error("[MiniApp] print report failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ error: "Unable to create print report." }, { status: 500 });
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
