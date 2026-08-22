import { GoogleSheetsFamilyRepository } from "../../../../../lib/family/google-sheets-repository";
import { FamilyService, FamilyServiceError, UnauthorizedError } from "../../../../../lib/family/service";
import { ReportPeriodError, buildFinancialCsv, buildFinancialPrintHtml, formatReportGeneratedAt } from "../../../../../lib/family/report";
import { buildFinancialPdf, validatePdfPassword } from "../../../../../lib/family/pdf";
import { buildReportDownloadAction, getReportDownloadSecret, verifyReportDownloadToken } from "../../../../../lib/telegram/report-download-token";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const secret = getReportDownloadSecret();
  if (!secret) return Response.json({ error: "Service unavailable." }, { status: 503 });

  const payload = verifyReportDownloadToken(new URL(request.url).searchParams.get("token"), secret);
  if (!payload) return Response.json({ error: "Download link tidak valid atau sudah kedaluwarsa." }, { status: 401 });

  try {
    const service = new FamilyService(new GoogleSheetsFamilyRepository());
    const exported = await service.getFinancialExportReport(
      payload.uid,
      payload.month,
      payload.startDate,
      payload.endDate,
    );
    const period = exported.report.period;
    const headers = {
      "cache-control": "private, no-store",
      "access-control-allow-origin": "https://web.telegram.org",
      "x-content-type-options": "nosniff",
    };

    if (payload.format === "csv") {
      return new Response(buildFinancialCsv(exported.report), {
        status: 200,
        headers: {
          ...headers,
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="falance-report-${period.startDate}-${period.endDate}.csv"`,
        },
      });
    }

    if (payload.format === "print") {
      const token = new URL(request.url).searchParams.get("token");
      if (!token) return Response.json({ error: "Download link tidak valid atau sudah kedaluwarsa." }, { status: 401 });
      const csvAction = buildReportDownloadAction(request, {
        telegramUserId: payload.uid,
        format: "csv",
        period: exported.report.period,
        fileName: `falance-report-${period.startDate}-${period.endDate}.csv`,
      });
      const pdfAction = buildReportDownloadAction(request, {
        telegramUserId: payload.uid,
        format: "pdf",
        period: exported.report.period,
        fileName: `falance-report-${period.startDate}-${period.endDate}.pdf`,
      });
      return new Response(buildFinancialPrintHtml(exported.family.familyName, exported.report, {
        generatedAt: formatReportGeneratedAt(),
        csvUrl: csvAction.url,
        pdfUrl: pdfAction.url,
        pdfPrepareUrl: new URL("/api/mini-app/report/pdf/prepare", request.url).toString(),
        previewToken: token,
      }), {
        status: 200,
        headers: {
          ...headers,
          "content-type": "text/html; charset=utf-8",
          "content-disposition": `inline; filename="falance-report-${period.startDate}-${period.endDate}.html"`,
        },
      });
    }

    const pdf = await buildFinancialPdf(
      exported.family.familyName,
      exported.report,
      validatePdfPassword(payload.password),
    );
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        ...headers,
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="falance-report-${period.startDate}-${period.endDate}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Export hanya tersedia untuk OWNER dan ADMIN." }, { status: 403 });
    }
    if (error instanceof ReportPeriodError) {
      return Response.json({ error: "Report period or date range is invalid." }, { status: 400 });
    }
    if (error instanceof FamilyServiceError) {
      return Response.json({ error: "Mini App access denied." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "PDF password must be 8–127 UTF-8 bytes.") {
      return Response.json({ error: "Password harus berisi 8–127 byte UTF-8." }, { status: 400 });
    }
    console.error("[MiniApp] report download failed", {
      error: error instanceof Error ? error.name : "unknown",
      format: payload.format,
    });
    return Response.json({ error: "Unable to create report download." }, { status: 500 });
  }
}
