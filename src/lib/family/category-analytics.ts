import type { Transaction } from "./types";

export const CATEGORY_CODES = [
  "UNCATEGORIZED",
  "FOOD",
  "SHOPPING",
  "HOUSEHOLD",
  "UTILITIES",
  "TRANSPORTATION",
  "HEALTH",
  "EDUCATION",
  "ENTERTAINMENT",
  "INCOME",
  "OTHER",
] as const;

export type TransactionCategory = (typeof CATEGORY_CODES)[number];

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  UNCATEGORIZED: "Belum dikategorikan",
  FOOD: "Makanan & Minuman",
  SHOPPING: "Belanja",
  HOUSEHOLD: "Rumah Tangga",
  UTILITIES: "Tagihan & Utilitas",
  TRANSPORTATION: "Transportasi",
  HEALTH: "Kesehatan",
  EDUCATION: "Pendidikan",
  ENTERTAINMENT: "Hiburan",
  INCOME: "Gaji & Pendapatan",
  OTHER: "Lainnya",
};

export const CATEGORY_SCHEMA_VERSION = 1;

export type CategorizedTransaction = Pick<
  Transaction,
  "transactionId" | "familyId" | "transactionType" | "amountMinor" | "currency" | "transactionDate" | "status"
> & {
  category?: string | null;
};

export interface CategorySummary {
  category: TransactionCategory;
  label: string;
  currency: string;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  transactionCount: number;
}

export function normalizeTransactionCategory(value: unknown): TransactionCategory {
  if (typeof value !== "string") return "UNCATEGORIZED";
  const normalized = value.trim().toUpperCase();
  return isTransactionCategory(normalized) ? normalized : "UNCATEGORIZED";
}

export function isTransactionCategory(value: string): value is TransactionCategory {
  return (CATEGORY_CODES as readonly string[]).includes(value);
}

export function buildCategorySummaries(
  transactions: readonly CategorizedTransaction[],
  options: { familyId: string; startDate?: string; endDate?: string },
): CategorySummary[] {
  const summaries = new Map<string, CategorySummary>();
  for (const transaction of transactions) {
    if (transaction.familyId !== options.familyId || transaction.status !== "ACTIVE") continue;
    if (options.startDate && transaction.transactionDate < options.startDate) continue;
    if (options.endDate && transaction.transactionDate > options.endDate) continue;

    const category = normalizeTransactionCategory(transaction.category);
    const key = `${category}:${transaction.currency}`;
    const current = summaries.get(key) ?? {
      category,
      label: CATEGORY_LABELS[category],
      currency: transaction.currency,
      incomeMinor: 0,
      expenseMinor: 0,
      netMinor: 0,
      transactionCount: 0,
    };
    if (transaction.transactionType === "INCOME") {
      current.incomeMinor += transaction.amountMinor;
      current.netMinor += transaction.amountMinor;
    } else {
      current.expenseMinor += transaction.amountMinor;
      current.netMinor -= transaction.amountMinor;
    }
    current.transactionCount += 1;
    summaries.set(key, current);
  }
  return [...summaries.values()].sort((left, right) =>
    left.currency.localeCompare(right.currency) || left.category.localeCompare(right.category),
  );
}
