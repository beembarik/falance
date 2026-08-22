import { GoogleSheetsFamilyRepository } from "../../../../../lib/family/google-sheets-repository";
import { FamilyService, FamilyServiceError, UnauthorizedError } from "../../../../../lib/family/service";
import { ReportPeriodError } from "../../../../../lib/family/report";
import { MiniAppAuthError, validateMiniAppInitData } from "../../../../../lib/telegram/mini-app-auth";
import { readMiniAppReportRequest, type MiniAppReportRequestPayload } from "../../../../../lib/telegram/mini-app-request";
import { buildFinancialPdf } from "../../../../../lib/family/pdf";

export const runtime = "nodejs";

type MiniAppPdfRequest = MiniAppReportRequestPayload;

export async function POST(request: Request): Promise<Response> {
  let payload: MiniAppPdfRequest;
  try {
    payload = await readMiniAppReportRequest(request) as MiniAppPdfRequest;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof payload.initData !== "string" || !payload.initData.trim()) {
    return Response.json({ error: "Mini App authorization is required." }, { status: 400 });
  }
  if (
    (payload.month !== undefined && typeof payload.month !== "string") ||
    (payload.startDate !== undefined && typeof payload.startDate !== "string") ||
    (payload.endDate !== undefined && typeof payload.endDate !== "string") ||
    (payload.password !== undefined && typeof payload.password !== "string")
  ) {
    return Response.json({ error: "Invalid report period or password." }, { status: 400 });
  }

  const password = typeof payload.password === "string" && payload.password.length > 0
    ? payload.password
    : undefined;
  if (password && (password.length < 8 || Buffer.byteLength(password, "utf8") > 127)) {
    return Response.json({ error: "Password harus berisi 8–127 byte UTF-8." }, { status: 400 });
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
    const pdf = await buildFinancialPdf(exported.family.familyName, exported.report, password);
    const filename = `falance-report-${exported.report.period.startDate}-${exported.report.period.endDate}.pdf`;
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
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
      return Response.json({ error: "PDF hanya tersedia untuk OWNER dan ADMIN." }, { status: 403 });
    }
    if (error instanceof ReportPeriodError) {
      return Response.json({ error: "Report period or date range is invalid." }, { status: 400 });
    }
    if (error instanceof FamilyServiceError) {
      return Response.json({ error: "Mini App access denied." }, { status: 403 });
    }
    console.error("[MiniApp] PDF export failed", {
      error: error instanceof Error ? error.name : "unknown",
      code: classifyPdfError(error),
    });
    return Response.json({ error: "Unable to create PDF report." }, { status: 500 });
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function classifyPdfError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("font")) return "font";
  if (message.includes("password") || message.includes("encrypt") || message.includes("security")) return "encryption";
  if (message.includes("stream") || message.includes("buffer")) return "stream";
  if (message.includes("unsupported") || message.includes("version")) return "pdf-version";
  return "generation";
}
