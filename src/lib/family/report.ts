import type { Transaction } from "./types";
import { getBusinessDate } from "../time/business-date";

const DEFAULT_TRANSACTION_LIMIT = 50;
const MAX_TRANSACTION_LIMIT = 50;
const MAX_REPORT_RANGE_DAYS = 366;

export interface FinancialReportPeriod {
  month: string | null;
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

export interface FinancialReportTransaction {
  transactionId: string;
  transactionType: Transaction["transactionType"];
  amountMinor: bigint;
  currency: string;
  transactionDate: string;
  description: string;
}

export interface FinancialReport {
  period: FinancialReportPeriod;
  transactionCount: number;
  currencies: FinancialReportCurrencySummary[];
  transactions: FinancialReportTransaction[];
}

export function getFinancialReportPeriod(
  month?: string,
  startDate?: string,
  endDate?: string,
): FinancialReportPeriod {
  const hasMonth = Boolean(month);
  const hasRange = Boolean(startDate || endDate);
  if (hasMonth && hasRange) throw new ReportPeriodError("Choose a month or a date range, not both.");
  if (hasRange) {
    if (!startDate || !endDate || !isCalendarDate(startDate) || !isCalendarDate(endDate) || startDate > endDate) {
      throw new ReportPeriodError("Report date range must use valid YYYY-MM-DD dates.");
    }
    const rangeDays = calendarDayDifference(startDate, endDate) + 1;
    if (rangeDays > MAX_REPORT_RANGE_DAYS) throw new ReportPeriodError("Report date range is too large.");
    return {
      month: null,
      startDate,
      endDate,
      label: `${formatDateLabel(startDate)} – ${formatDateLabel(endDate)}`,
    };
  }

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
  transactionLimit: number = DEFAULT_TRANSACTION_LIMIT,
): FinancialReport {
  const boundedLimit = Math.min(Math.max(Math.trunc(transactionLimit), 1), MAX_TRANSACTION_LIMIT);
  const activeInPeriod = transactions
    .filter((transaction) => transaction.status === "ACTIVE")
    .filter((transaction) => transaction.transactionDate >= period.startDate && transaction.transactionDate <= period.endDate);

  const summaries = new Map<string, FinancialReportCurrencySummary>();
  for (const transaction of activeInPeriod) {
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
  const reportTransactions = activeInPeriod
    .slice()
    .sort((left, right) => right.transactionDate.localeCompare(left.transactionDate) || right.createdAt.localeCompare(left.createdAt))
    .slice(0, boundedLimit)
    .map((transaction) => ({
      transactionId: transaction.transactionId,
      transactionType: transaction.transactionType,
      amountMinor: BigInt(transaction.amountMinor),
      currency: transaction.currency,
      transactionDate: transaction.transactionDate,
      description: transaction.description,
    }));

  return {
    period,
    transactionCount: activeInPeriod.length,
    currencies,
    transactions: reportTransactions,
  };
}

export class ReportPeriodError extends Error {}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function calendarDayDifference(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return Math.floor((end - start) / 86_400_000);
}

function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}
