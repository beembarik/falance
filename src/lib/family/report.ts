import type { Transaction } from "./types";
import { getBusinessDate } from "../time/business-date";

export interface FinancialReportPeriod {
  month: string;
  startDate: string;
  endDate: string;
  label: string;
}

export interface FinancialReportCurrencySummary {
  currency: string;
  incomeMinor: bigint;
  expenseMinor: bigint;
  netMinor: bigint;
  transactionCount: number;
}

export interface FinancialReport {
  period: FinancialReportPeriod;
  transactionCount: number;
  currencies: FinancialReportCurrencySummary[];
}

export function getFinancialReportPeriod(month?: string): FinancialReportPeriod {
  const selectedMonth = month ?? getBusinessDate().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth)) {
    throw new ReportPeriodError("Report period must use YYYY-MM format.");
  }

  const [yearText, monthText] = selectedMonth.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const label = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));

  return {
    month: selectedMonth,
    startDate: `${selectedMonth}-01`,
    endDate: `${selectedMonth}-${String(lastDay).padStart(2, "0")}`,
    label,
  };
}

export function buildFinancialReport(
  transactions: readonly Transaction[],
  period: FinancialReportPeriod,
): FinancialReport {
  const summaries = new Map<string, FinancialReportCurrencySummary>();
  for (const transaction of transactions) {
    if (transaction.status !== "ACTIVE") continue;
    if (transaction.transactionDate < period.startDate || transaction.transactionDate > period.endDate) continue;

    const current = summaries.get(transaction.currency) ?? {
      currency: transaction.currency,
      incomeMinor: BigInt(0),
      expenseMinor: BigInt(0),
      netMinor: BigInt(0),
      transactionCount: 0,
    };
    const amount = BigInt(transaction.amountMinor);
    if (transaction.transactionType === "INCOME") {
      current.incomeMinor += amount;
      current.netMinor += amount;
    } else {
      current.expenseMinor += amount;
      current.netMinor -= amount;
    }
    current.transactionCount += 1;
    summaries.set(transaction.currency, current);
  }

  const currencies = [...summaries.values()].sort((left, right) => left.currency.localeCompare(right.currency));
  return {
    period,
    transactionCount: currencies.reduce((total, summary) => total + summary.transactionCount, 0),
    currencies,
  };
}

export class ReportPeriodError extends Error {}
