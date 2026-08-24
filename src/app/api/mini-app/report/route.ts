import { createFamilyRepository } from "../../../../lib/family/repository-factory";
import { FamilyService, FamilyServiceError } from "../../../../lib/family/service";
import { ReportPeriodError } from "../../../../lib/family/report";
import { MiniAppAuthError, validateMiniAppInitData } from "../../../../lib/telegram/mini-app-auth";
import { buildReportDownloadAction } from "../../../../lib/telegram/report-download-token";
import { classifyMiniAppError, classifyPersistenceConfig, logMiniAppDiagnostic } from "../../../../lib/mini-app/diagnostics";

export const runtime = "nodejs";

type MiniAppReportRequest = {
  initData?: unknown;
  month?: unknown;
  startDate?: unknown;
  endDate?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  logMiniAppDiagnostic("report", "request_started");
  let payload: MiniAppReportRequest;
  try {
    payload = await request.json() as MiniAppReportRequest;
  } catch {
    logMiniAppDiagnostic("report", "invalid_request", { status: 400 });
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof payload.initData !== "string" || !payload.initData.trim()) {
    logMiniAppDiagnostic("report", "init_data_missing", { status: 400 });
    return Response.json({ error: "Mini App authorization is required." }, { status: 400 });
  }
  logMiniAppDiagnostic("report", "init_data_present");
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

  let stage = "authentication";
  try {
    const validated = validateMiniAppInitData(payload.initData, botToken);
    stage = "repository_create";
    const service = new FamilyService(createFamilyRepository());
    stage = "membership_lookup";
    const membership = await service.getActiveMembership(validated.telegramUser.telegramUserId);
    if (!membership) {
      logMiniAppDiagnostic("report", "access_denied", { status: 403 });
      return Response.json({ error: "Mini App access denied." }, { status: 403 });
    }
    stage = "family_lookup";
    const family = await service.getActiveFamily(validated.telegramUser.telegramUserId);
    stage = "report_build";
    const report = await service.getFinancialReport(
      validated.telegramUser.telegramUserId,
      typeof payload.month === "string" && payload.month.trim() ? payload.month.trim() : undefined,
      typeof payload.startDate === "string" && payload.startDate.trim() ? payload.startDate.trim() : undefined,
      typeof payload.endDate === "string" && payload.endDate.trim() ? payload.endDate.trim() : undefined,
    );

    const actions = membership.role === "OWNER" || membership.role === "ADMIN"
      ? {
          csv: buildReportDownloadAction(request, {
            telegramUserId: validated.telegramUser.telegramUserId,
            format: "csv",
            period: report.period,
            fileName: `falance-report-${report.period.startDate}-${report.period.endDate}.csv`,
          }),
          pdf: buildReportDownloadAction(request, {
            telegramUserId: validated.telegramUser.telegramUserId,
            format: "pdf",
            period: report.period,
            fileName: `falance-report-${report.period.startDate}-${report.period.endDate}.pdf`,
          }),
          print: buildReportDownloadAction(request, {
            telegramUserId: validated.telegramUser.telegramUserId,
            format: "print",
            period: report.period,
            fileName: `falance-report-${report.period.startDate}-${report.period.endDate}.html`,
          }),
        }
      : undefined;

    logMiniAppDiagnostic("report", "success", { status: 200 });
    return Response.json({
      familyName: family.familyName,
      actions,
      viewer: {
        name: membership.name,
        role: membership.role,
      },
      report: {
        period: report.period,
        transactionCount: report.transactionCount,
        currencies: report.currencies.map((summary) => ({
          currency: summary.currency,
          incomeMinor: summary.incomeMinor.toString(),
          expenseMinor: summary.expenseMinor.toString(),
          netMinor: summary.netMinor.toString(),
          transactionCount: summary.transactionCount,
        })),
        categorySummaries: report.categorySummaries.map((summary) => ({
          category: summary.category,
          label: summary.label,
          currency: summary.currency,
          incomeMinor: String(summary.incomeMinor),
          expenseMinor: String(summary.expenseMinor),
          netMinor: String(summary.netMinor),
          transactionCount: summary.transactionCount,
        })),
        cashFlow: report.cashFlow.map((point) => ({
          period: point.period,
          label: point.label,
          currency: point.currency,
          incomeMinor: String(point.incomeMinor),
          expenseMinor: String(point.expenseMinor),
          netMinor: String(point.netMinor),
          transactionCount: point.transactionCount,
        })),
        transactions: report.transactions.map((transaction) => ({
          transactionId: transaction.transactionId,
          transactionType: transaction.transactionType,
          amountMinor: transaction.amountMinor.toString(),
          currency: transaction.currency,
          transactionDate: transaction.transactionDate,
          description: transaction.description,
          category: transaction.category,
          creatorName: transaction.creatorName,
        })),
      },
    });
  } catch (error) {
    if (error instanceof MiniAppAuthError) {
      logMiniAppDiagnostic("report", "auth_invalid", { status: 401 });
      return Response.json({ error: "Mini App authorization is invalid or expired." }, { status: 401 });
    }
    if (error instanceof ReportPeriodError) {
      logMiniAppDiagnostic("report", "failure", { status: 400, errorClass: "ReportPeriodError" });
      return Response.json({ error: "Report period or date range is invalid." }, { status: 400 });
    }
    if (error instanceof FamilyServiceError) {
      logMiniAppDiagnostic("report", "access_denied", { status: 403 });
      return Response.json({ error: "Mini App access denied." }, { status: 403 });
    }
    logMiniAppDiagnostic("report", "failure", {
      status: 500,
      errorClass: classifyMiniAppError(error),
      stage,
      persistenceConfig: classifyPersistenceConfig(),
    });
    console.error("[MiniApp] report request failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ error: "Unable to load report." }, { status: 500 });
  }
}
