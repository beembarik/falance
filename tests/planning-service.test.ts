import assert from "node:assert/strict";
import test from "node:test";

import { PlanningService } from "../src/lib/family/planning-service";
import type { FinancialPlan, Family, FamilyMember, TelegramUser } from "../src/lib/family/types";
import type { PlanningRepository } from "../src/lib/family/planning-repository";

const actor: TelegramUser = { telegramUserId: "telegram-1", name: "Owner", username: "owner" };
const member: FamilyMember = { memberId: "member-1", familyId: "family-1", telegramUserId: actor.telegramUserId, name: actor.name, username: actor.username, role: "OWNER", status: "ACTIVE", joinedAt: "2026-01-01T00:00:00.000Z" };
const family: Family = { familyId: "family-1", familyName: "Keluarga", status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z", createdBy: actor.telegramUserId, plan: "BETA" };

class FakePlanningRepository implements PlanningRepository {
  plans: FinancialPlan[] = [];
  async createFinancialPlan(plan: FinancialPlan): Promise<void> { this.plans.push(plan); }
  async updateFinancialPlan(): Promise<void> {}
  async findFinancialPlansByFamilyId(familyId: string): Promise<FinancialPlan[]> { return this.plans.filter((plan) => plan.familyId === familyId); }
}

function createService(repository: FakePlanningRepository): PlanningService {
  return new PlanningService({ findActiveMemberByTelegramUserId: async () => member, findFamilyById: async () => family }, repository);
}

test("creates a server-owned future plan and keeps family identity off the input", async () => {
  const repository = new FakePlanningRepository();
  const plan = await createService(repository).createPlan(actor, { planningType: "PLAN_INCOME", amountMinor: 8_000_000, startDate: "2026-10-01", description: "Gaji Oktober" });
  assert.equal(plan.familyId, "family-1");
  assert.equal(plan.createdByMemberId, "member-1");
  assert.equal(plan.currency, "IDR");
  assert.equal(repository.plans.length, 1);
});

test("lists only the actor's resolved family plans", async () => {
  const repository = new FakePlanningRepository();
  await createService(repository).createPlan(actor, { planningType: "PLAN_EXPENSE", amountMinor: 250_000, startDate: "2026-09-20", description: "Belanja mingguan" });
  const plans = await createService(repository).listPlans(actor.telegramUserId);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].familyId, family.familyId);
});