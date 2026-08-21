import { GoogleSheetsFamilyRepository } from "../../../../../lib/family/google-sheets-repository";
import { FamilyService, FamilyServiceError, UnauthorizedError } from "../../../../../lib/family/service";
import { ReportPeriodError, buildFinancialCsv } from "../../../../../lib/family/report";
import { MiniAppAuthError, validateMiniAppInitData } from "../../../../../lib/telegram/mini-app-auth";

export const runtime = "nodejs";

type MiniAppExportRequest = {
  initData?: unknown;
  month?: unknown;
  startDate?: unknown;
  endDate?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  let payload: MiniAppExportRequest;
  try {
    payload = await request.json() as MiniAppExportRequest;
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
    const csv = buildFinancialCsv(exported.report);
    const period = exported.report.period;
    const filename = `falance-report-${period.startDate}-${period.endDate}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof MiniAppAuthError) {
      return Response.json({ error: "Mini App authorization is invalid or expired." }, { status: 401 });
    }
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Export hanya tersedia untuk OWNER dan ADMIN." }, { status: 403 });
    }
    if (error instanceof ReportPeriodError) {
      return Response.json({ error: "Report period or date range is invalid." }, { status: 400 });
    }
    if (error instanceof FamilyServiceError) {
      return Response.json({ error: "Mini App access denied." }, { status: 403 });
    }
    console.error("[MiniApp] CSV export failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ error: "Unable to export report." }, { status: 500 });
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
