import { DEFAULT_CURRENCY_CODE, isSupportedCurrencyCode } from "./currency";
import type { FinancialPlan, PlanningStatus, PlanningType } from "./types";

const MAX_PLANNING_AMOUNT_MINOR = 1_000_000_000_000;
const MAX_PLANNING_DESCRIPTION_LENGTH = 200;

export interface CreateFinancialPlanInput {
  planningType: PlanningType;
  amountMinor: number;
  currency?: string;
  startDate: string;
  endDate?: string | null;
  recurrence?: "ONCE" | "MONTHLY";
  description: string;
  category?: string | null;
}

export class PlanningValidationError extends Error {}

export function validateFinancialPlanInput(input: CreateFinancialPlanInput): void {
  if (!["PLAN_INCOME", "PLAN_EXPENSE", "RECURRING_LIABILITY"].includes(input.planningType)) {
    throw new PlanningValidationError("Jenis rencana tidak valid.");
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 || input.amountMinor > MAX_PLANNING_AMOUNT_MINOR) {
    throw new PlanningValidationError("Nominal rencana tidak valid.");
  }
  const currency = (input.currency ?? DEFAULT_CURRENCY_CODE).trim().toUpperCase();
  if (!isSupportedCurrencyCode(currency)) throw new PlanningValidationError("Mata uang tidak didukung.");
  if (!isCalendarDate(input.startDate)) throw new PlanningValidationError("Tanggal mulai harus menggunakan YYYY-MM-DD.");
  if (input.endDate !== undefined && input.endDate !== null) {
    if (!isCalendarDate(input.endDate) || input.endDate < input.startDate) {
      throw new PlanningValidationError("Tanggal selesai rencana tidak valid.");
    }
  }
  if ((input.recurrence ?? "ONCE") === "MONTHLY" && input.planningType === "PLAN_INCOME") {
    throw new PlanningValidationError("Rencana pendapatan berulang belum didukung sebagai recurring liability.");
  }
  const description = input.description.trim().replace(/\s+/g, " ");
  if (description.length < 1 || description.length > MAX_PLANNING_DESCRIPTION_LENGTH) {
    throw new PlanningValidationError("Deskripsi rencana harus 1-200 karakter.");
  }
}

export function normalizeFinancialPlanInput(input: CreateFinancialPlanInput): CreateFinancialPlanInput {
  validateFinancialPlanInput(input);
  return {
    ...input,
    currency: (input.currency ?? DEFAULT_CURRENCY_CODE).trim().toUpperCase(),
    endDate: input.endDate ?? null,
    recurrence: input.recurrence ?? "ONCE",
    description: input.description.trim().replace(/\s+/g, " "),
    category: input.category?.trim() || undefined,
  };
}

export interface PlanningForecastLine {
  planId: string;
  planningType: PlanningType;
  currency: string;
  amountMinor: bigint;
  description: string;
  date: string;
}

export function buildPlanningForecast(
  plans: readonly FinancialPlan[],
  startDate: string,
  endDate: string,
  familyId?: string,
): PlanningForecastLine[] {
  if (!isCalendarDate(startDate) || !isCalendarDate(endDate) || startDate > endDate) {
    throw new PlanningValidationError("Periode forecast tidak valid.");
  }
  return plans
    .filter((plan) => plan.familyId === (familyId ?? plans[0]?.familyId ?? ""))
    .filter((plan) => plan.status === "ACTIVE")
    .flatMap((plan) => expandPlan(plan, startDate, endDate))
    .sort((left, right) => left.date.localeCompare(right.date) || left.currency.localeCompare(right.currency));
}

function expandPlan(plan: FinancialPlan, startDate: string, endDate: string): PlanningForecastLine[] {
  const lines: PlanningForecastLine[] = [];
  if (plan.recurrence === "ONCE") {
    if (plan.startDate >= startDate && plan.startDate <= endDate) lines.push(toForecastLine(plan, plan.startDate));
    return lines;
  }
  const date = new Date(`${plan.startDate}T00:00:00Z`);
  while (date.toISOString().slice(0, 10) <= endDate) {
    const occurrence = date.toISOString().slice(0, 10);
    if (occurrence >= startDate && (!plan.endDate || occurrence <= plan.endDate)) lines.push(toForecastLine(plan, occurrence));
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return lines;
}

function toForecastLine(plan: FinancialPlan, date: string): PlanningForecastLine {
  return { planId: plan.planId, planningType: plan.planningType, currency: plan.currency, amountMinor: BigInt(plan.amountMinor), description: plan.description, date };
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isActivePlanningStatus(status: PlanningStatus): boolean {
  return status === "ACTIVE";
}