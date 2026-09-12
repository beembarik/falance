import type { CreateFinancialPlanInput } from "../family/planning";
import { isSupportedCurrencyCode } from "../family/currency";
import type { PlanningType } from "../family/types";
import { parseAmountMinor, TransactionCommandError } from "./transaction-command";

export type MiniAppPlanningPayload = Record<string, unknown>;

export function parseMiniAppPlanningInput(payload: MiniAppPlanningPayload): CreateFinancialPlanInput | Error {
  const planningType = stringValue(payload.planningType)?.toUpperCase() ?? "";
  if (planningType !== "PLAN_INCOME" && planningType !== "PLAN_EXPENSE" && planningType !== "RECURRING_LIABILITY") {
    return new TransactionCommandError("Jenis rencana tidak valid.");
  }

  let amountMinor: number;
  try {
    if (typeof payload.amountMinor === "number") {
      if (!Number.isSafeInteger(payload.amountMinor)) throw new TransactionCommandError("Jumlah harus berupa bilangan bulat positif yang valid.");
      amountMinor = parseAmountMinor(String(payload.amountMinor));
    } else if (typeof payload.amountMinor === "string") {
      amountMinor = parseAmountMinor(payload.amountMinor);
    } else {
      throw new TransactionCommandError("Jumlah harus diisi.");
    }
  } catch (error) {
    return error instanceof Error ? error : new TransactionCommandError("Jumlah tidak valid.");
  }

  const startDate = stringValue(payload.startDate);
  const description = stringValue(payload.description);
  if (!startDate || !description) return new TransactionCommandError("Tanggal mulai dan deskripsi wajib diisi.");

  const currency = stringValue(payload.currency)?.toUpperCase();
  if (currency && !isSupportedCurrencyCode(currency)) return new TransactionCommandError("Currency harus berupa kode ISO 4217 yang didukung.");

  const recurrence = stringValue(payload.recurrence)?.toUpperCase() === "MONTHLY" ? "MONTHLY" as const : "ONCE" as const;
  return { planningType: planningType as PlanningType, amountMinor, currency, startDate, recurrence, description };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}