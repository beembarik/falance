import { createFamilyRepository } from "../../../../../../lib/family/repository-factory";
import { FamilyService, FamilyServiceError, UnauthorizedError } from "../../../../../../lib/family/service";
import { ReportPeriodError } from "../../../../../../lib/family/report";
import { validatePdfPassword } from "../../../../../../lib/family/pdf";
import { MiniAppAuthError, validateMiniAppInitData } from "../../../../../../lib/telegram/mini-app-auth";
import { readMiniAppReportRequest, type MiniAppReportRequestPayload } from "../../../../../../lib/telegram/mini-app-request";
import { buildReportDownloadAction, getReportDownloadSecret, verifyReportDownloadToken } from "../../../../../../lib/telegram/report-download-token";

export const runtime = "nodejs";

type MiniAppPdfPrepareRequest = MiniAppReportRequestPayload;

export async function POST(request: Request): Promise<Response> {
  let payload: MiniAppPdfPrepareRequest;
  try {
    payload = await readMiniAppReportRequest(request);
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (
    (payload.month !== undefined && typeof payload.month !== "string") ||
    (payload.startDate !== undefined && typeof payload.startDate !== "string") ||
    (payload.endDate !== undefined && typeof payload.endDate !== "string") ||
    (payload.password !== undefined && typeof payload.password !== "string") ||
    (payload.token !== undefined && typeof payload.token !== "string")
  ) {
    return Response.json({ error: "Invalid report period, password, or preview token." }, { status: 400 });
  }

  let password: string | undefined;
  try {
    password = validatePdfPassword(typeof payload.password === "string" ? payload.password : undefined);
  } catch {
    return Response.json({ error: "Password harus berisi 8–127 byte UTF-8." }, { status: 400 });
  }

  const suppliedToken = stringValue(payload.token);
  let telegramUserId: string;
  let month: string | undefined;
  let startDate: string | undefined;
  let endDate: string | undefined;

  if (suppliedToken) {
    const secret = getReportDownloadSecret();
    if (!secret) return Response.json({ error: "Service unavailable." }, { status: 503 });
    const tokenPayload = verifyReportDownloadToken(suppliedToken, secret);
    if (!tokenPayload || tokenPayload.format !== "print") {
      return Response.json({ error: "Preview report tidak valid atau sudah kedaluwarsa." }, { status: 401 });
    }
    telegramUserId = tokenPayload.uid;
    month = tokenPayload.month;
    startDate = tokenPayload.startDate;
    endDate = tokenPayload.endDate;
  } else {
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
      telegramUserId = validated.telegramUser.telegramUserId;
      month = stringValue(payload.month);
      startDate = stringValue(payload.startDate);
      endDate = stringValue(payload.endDate);
    } catch (error) {
      if (error instanceof MiniAppAuthError) {
        return Response.json({ error: "Mini App authorization is invalid or expired." }, { status: 401 });
      }
      throw error;
    }
  }

  try {
    const service = new FamilyService(createFamilyRepository());
    const exported = await service.getFinancialExportReport(telegramUserId, month, startDate, endDate);
    const action = buildReportDownloadAction(request, {
      telegramUserId,
      format: "pdf",
      period: exported.report.period,
      fileName: `falance-report-${exported.report.period.startDate}-${exported.report.period.endDate}.pdf`,
      password,
    });
    return Response.json({ action }, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "PDF hanya tersedia untuk OWNER dan ADMIN." }, { status: 403 });
    }
    if (error instanceof ReportPeriodError) {
      return Response.json({ error: "Report period or date range is invalid." }, { status: 400 });
    }
    if (error instanceof FamilyServiceError) {
      return Response.json({ error: "Mini App access denied." }, { status: 403 });
    }
    console.error("[MiniApp] PDF action preparation failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ error: "Unable to prepare PDF report." }, { status: 500 });
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
