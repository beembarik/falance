import { createFamilyRepository } from "../../../../lib/family/repository-factory";
import { FamilyService, FamilyServiceError } from "../../../../lib/family/service";
import { MiniAppAuthError, validateMiniAppInitData } from "../../../../lib/telegram/mini-app-auth";
import { classifyMiniAppError, classifyPersistenceConfig, logMiniAppDiagnostic } from "../../../../lib/mini-app/diagnostics";
import { parseMiniAppPlanningInput } from "../../../../lib/telegram/mini-app-planning-request";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let payload: { initData?: unknown; action?: unknown; planningType?: unknown; amountMinor?: unknown; currency?: unknown; startDate?: unknown; recurrence?: unknown; description?: unknown };
  try {
    payload = await request.json() as { initData?: unknown };
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof payload.initData !== "string" || !payload.initData.trim()) {
    return Response.json({ error: "Mini App authorization is required." }, { status: 400 });
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return Response.json({ error: "Service unavailable." }, { status: 503 });

  try {
    const validated = validateMiniAppInitData(payload.initData, botToken);
    const service = new FamilyService(createFamilyRepository());
    if (payload.action === "CREATE") {
      const input = parseMiniAppPlanningInput(payload);
      if (input instanceof Error) return Response.json({ error: input.message }, { status: 400 });
      const plan = await service.createFinancialPlan(validated.telegramUser, input);
      return Response.json({
        plan: {
          planId: plan.planId,
          planningType: plan.planningType,
          amountMinor: String(plan.amountMinor),
          currency: plan.currency,
          startDate: plan.startDate,
          endDate: plan.endDate,
          recurrence: plan.recurrence,
          description: plan.description,
          status: plan.status,
        },
      }, { status: 201 });
    }
    const plans = await service.listFinancialPlans(validated.telegramUser.telegramUserId);
    return Response.json({
      plans: plans.map((plan) => ({
        planId: plan.planId,
        planningType: plan.planningType,
        amountMinor: String(plan.amountMinor),
        currency: plan.currency,
        startDate: plan.startDate,
        endDate: plan.endDate,
        recurrence: plan.recurrence,
        description: plan.description,
        status: plan.status,
      })),
    });
  } catch (error) {
    if (error instanceof MiniAppAuthError) return Response.json({ error: "Mini App authorization is invalid or expired." }, { status: 401 });
    if (error instanceof FamilyServiceError) return Response.json({ error: "Mini App access denied." }, { status: 403 });
    logMiniAppDiagnostic("plans", "failure", { status: 500, errorClass: classifyMiniAppError(error), persistenceConfig: classifyPersistenceConfig() });
    return Response.json({ error: "Unable to load financial plans." }, { status: 500 });
  }
}