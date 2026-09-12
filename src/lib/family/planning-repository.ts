import type { FinancialPlan } from "./types";

export interface PlanningRepository {
  createFinancialPlan(plan: FinancialPlan): Promise<void>;
  updateFinancialPlan(planId: string, plan: FinancialPlan): Promise<void>;
  findFinancialPlansByFamilyId(familyId: string): Promise<FinancialPlan[]>;
}