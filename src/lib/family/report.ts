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
  category: string;
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
  transactionLimit: number | null = DEFAULT_TRANSACTION_LIMIT,
): FinancialReport {
  const boundedLimit = transactionLimit === null
    ? null
    : Math.min(Math.max(Math.trunc(transactionLimit), 1), MAX_TRANSACTION_LIMIT);
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
    .slice(0, boundedLimit ?? activeInPeriod.length)
    .map((transaction) => ({
      transactionId: transaction.transactionId,
      transactionType: transaction.transactionType,
      amountMinor: BigInt(transaction.amountMinor),
      currency: transaction.currency,
      transactionDate: transaction.transactionDate,
      description: transaction.description,
      category: transaction.category ?? "UNCATEGORIZED",
    }));

  return {
    period,
    transactionCount: activeInPeriod.length,
    currencies,
    transactions: reportTransactions,
  };
}

export class ReportPeriodError extends Error {}

export function buildFinancialCsv(report: FinancialReport): string {
  const header = ["transaction_id", "transaction_type", "amount_minor", "currency", "transaction_date", "description"];
  const rows = report.transactions.map((transaction) => [
    transaction.transactionId,
    transaction.transactionType,
    transaction.amountMinor.toString(),
    transaction.currency,
    transaction.transactionDate,
    transaction.description,
  ]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function csvCell(value: string): string {
  const normalized = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${normalized.replaceAll('"', '""')}"`;
}

export function buildFinancialPrintHtml(familyName: string, report: FinancialReport): string {
  const currencyRows = report.currencies.length === 0
    ? '<tr><td colspan="5">Belum ada transaksi aktif pada periode ini.</td></tr>'
    : report.currencies.map((summary) => `
      <tr>
        <td>${escapeHtml(summary.currency)}</td>
        <td class="amount positive">${escapeHtml(formatReportAmount(summary.incomeMinor, summary.currency))}</td>
        <td class="amount negative">${escapeHtml(formatReportAmount(summary.expenseMinor, summary.currency))}</td>
        <td class="amount">${escapeHtml(formatReportAmount(summary.netMinor, summary.currency))}</td>
        <td>${summary.transactionCount}</td>
      </tr>`).join('');
  const transactionRows = report.transactions.length === 0
    ? '<tr><td colspan="6">Belum ada transaksi aktif pada periode ini.</td></tr>'
    : report.transactions.map((transaction) => `
      <tr>
        <td>${escapeHtml(transaction.transactionDate)}</td>
        <td>${escapeHtml(transaction.transactionType === "INCOME" ? "Pemasukan" : "Pengeluaran")}</td>
        <td>${escapeHtml(transaction.currency)}</td>
        <td class="amount">${escapeHtml(formatReportAmount(transaction.amountMinor, transaction.currency))}</td>
        <td>${escapeHtml(transaction.description)}</td>
        <td><code>${escapeHtml(transaction.transactionId)}</code></td>
      </tr>`).join('');
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(`Falancé — ${familyName} — ${report.period.label}`)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; }
    body { color: #0f172a; margin: 0; padding: 32px; background: #fff; }
    main { max-width: 1080px; margin: 0 auto; }
    h1, h2, p { margin: 0; }
    h1 { font-size: 24px; margin-bottom: 6px; }
    h2 { font-size: 16px; margin: 28px 0 10px; }
    .muted { color: #475569; font-size: 13px; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 24px; }
    button { border: 0; border-radius: 8px; background: #0f766e; color: #fff; cursor: pointer; padding: 10px 16px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
    .amount { text-align: right; white-space: nowrap; }
    .positive { color: #047857; }
    .negative { color: #be123c; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
    @media print { body { padding: 0; } .no-print { display: none !important; } th { background: #f1f5f9 !important; print-color-adjust: exact; } }
    @media (max-width: 720px) { body { padding: 16px; } .toolbar { align-items: flex-start; flex-direction: column; } table { font-size: 11px; } th, td { padding: 6px; } }
  </style>
</head>
<body>
  <main>
    <div class="toolbar no-print">
      <p class="muted">Dokumen print-friendly Falancé</p>
      <button type="button" onclick="window.print()">Cetak / Simpan PDF</button>
    </div>
    <header>
      <h1>Laporan Keuangan — ${escapeHtml(familyName)}</h1>
      <p class="muted">${escapeHtml(report.period.label)} · ${escapeHtml(report.period.startDate)} s/d ${escapeHtml(report.period.endDate)}</p>
      <p class="muted">${report.transactionCount} transaksi aktif</p>
    </header>
    <section>
      <h2>Ringkasan per mata uang</h2>
      <table>
        <thead><tr><th>Mata uang</th><th>Pemasukan</th><th>Pengeluaran</th><th>Saldo</th><th>Transaksi</th></tr></thead>
        <tbody>${currencyRows}</tbody>
      </table>
    </section>
    <section>
      <h2>Detail transaksi</h2>
      <table>
        <thead><tr><th>Tanggal</th><th>Jenis</th><th>Mata uang</th><th>Jumlah</th><th>Deskripsi</th><th>ID</th></tr></thead>
        <tbody>${transactionRows}</tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

function formatReportAmount(amount: bigint, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

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
