import type { CreateFinancialPlanInput } from "../family/planning";

export class PlanningCommandError extends Error {}

export function parsePlanningCommand(
  command: string,
  prefix: string,
  planningType: CreateFinancialPlanInput["planningType"],
): CreateFinancialPlanInput {
  const args = command.slice(prefix.length).trim().split(/\s+/).filter(Boolean);
  if (args.length < 3) throw invalidFormat(prefix);
  const amountMinor = parseAmount(args.shift()!);
  const currency = /^[A-Za-z]{3}$/.test(args[0] ?? "") ? args.shift()!.toUpperCase() : undefined;
  const startDate = args.shift();
  const recurrence = (args[0] ?? "").toUpperCase() === "MONTHLY" ? (args.shift(), "MONTHLY" as const) : "ONCE" as const;
  const description = args.join(" ").trim();
  if (!startDate || !description) throw invalidFormat(prefix);
  return { planningType, amountMinor, currency, startDate, recurrence, description };
}

function parseAmount(value: string): number {
  const normalized = value.replaceAll(".", "").replaceAll(",", "");
  if (!/^\d+$/.test(normalized)) throw new PlanningCommandError("Jumlah rencana harus berupa angka bulat positif.");
  const amount = Number(normalized);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new PlanningCommandError("Jumlah rencana tidak valid.");
  return amount;
}

function invalidFormat(prefix: string): PlanningCommandError {
  return new PlanningCommandError(`Format tidak valid. Gunakan: ${prefix} <jumlah> [CURRENCY] <YYYY-MM-DD> [MONTHLY] <deskripsi>`);
}