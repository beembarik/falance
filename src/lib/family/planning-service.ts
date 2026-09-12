import { randomUUID } from "node:crypto";

import { normalizeFinancialPlanInput, type CreateFinancialPlanInput } from "./planning";
import type { PlanningRepository } from "./planning-repository";
import type { FamilyRepository } from "./repository";
import type { FinancialPlan, TelegramUser } from "./types";

export class PlanningAuthorizationError extends Error {}

export class PlanningService {
  private readonly familyRepository: Pick<FamilyRepository, "findActiveMemberByTelegramUserId" | "findFamilyById">;
  private readonly planningRepository: PlanningRepository;

  constructor(
    familyRepository: Pick<FamilyRepository, "findActiveMemberByTelegramUserId" | "findFamilyById">,
    planningRepository: PlanningRepository,
  ) {
    this.familyRepository = familyRepository;
    this.planningRepository = planningRepository;
  }

  async createPlan(actor: TelegramUser, input: CreateFinancialPlanInput): Promise<FinancialPlan> {
    const member = await this.familyRepository.findActiveMemberByTelegramUserId(actor.telegramUserId);
    if (!member) throw new PlanningAuthorizationError("Pengguna belum terdaftar dalam keluarga aktif.");
    const family = await this.familyRepository.findFamilyById(member.familyId);
    if (!family || family.status !== "ACTIVE") throw new PlanningAuthorizationError("Keluarga tidak tersedia.");

    const normalized = normalizeFinancialPlanInput(input);
    const plan: FinancialPlan = {
      planId: `plan_${randomUUID()}`, familyId: member.familyId, planningType: normalized.planningType,
      amountMinor: normalized.amountMinor, currency: normalized.currency!, startDate: normalized.startDate,
      endDate: normalized.endDate!, recurrence: normalized.recurrence!, description: normalized.description,
      category: normalized.category ?? undefined, createdByMemberId: member.memberId, createdAt: new Date().toISOString(), status: "ACTIVE",
    };
    await this.planningRepository.createFinancialPlan(plan);
    return plan;
  }

  async listPlans(telegramUserId: string): Promise<FinancialPlan[]> {
    const member = await this.familyRepository.findActiveMemberByTelegramUserId(telegramUserId);
    if (!member) throw new PlanningAuthorizationError("Pengguna belum terdaftar dalam keluarga aktif.");
    const family = await this.familyRepository.findFamilyById(member.familyId);
    if (!family || family.status !== "ACTIVE") throw new PlanningAuthorizationError("Keluarga tidak tersedia.");
    return this.planningRepository.findFinancialPlansByFamilyId(member.familyId);
  }
}