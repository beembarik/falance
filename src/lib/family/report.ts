import type { Transaction } from "./types";
import { getBusinessDate, getBusinessTimeZone } from "../time/business-date";
import { buildCategorySummaries, CATEGORY_LABELS, normalizeTransactionCategory, type CategorySummary } from "./category-analytics";

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

export interface FinancialReportCashFlowPoint {
  period: string;
  label: string;
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
  creatorName: string;
}

export interface FinancialReport {
  period: FinancialReportPeriod;
  transactionCount: number;
  currencies: FinancialReportCurrencySummary[];
  categorySummaries: CategorySummary[];
  cashFlow: FinancialReportCashFlowPoint[];
  transactions: FinancialReportTransaction[];
}

export interface FinancialPrintPreviewOptions {
  generatedAt: string;
  csvUrl: string;
  pdfUrl: string;
  pdfPrepareUrl: string;
  previewToken: string;
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

export function buildCashFlow(
  transactions: readonly Transaction[],
  period: FinancialReportPeriod,
  familyId?: string,
): FinancialReportCashFlowPoint[] {
  const summaries = new Map<string, FinancialReportCashFlowPoint>();
  for (const transaction of transactions) {
    if (transaction.familyId !== (familyId ?? transactions[0]?.familyId ?? "")) continue;
    if (transaction.status !== "ACTIVE") continue;
    if (transaction.transactionDate < period.startDate || transaction.transactionDate > period.endDate) continue;
    const key = `${transaction.transactionDate.slice(0, 7)}:${transaction.currency}`;
    const current = summaries.get(key) ?? {
      period: transaction.transactionDate.slice(0, 7),
      label: formatCashFlowPeriodLabel(transaction.transactionDate),
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
    summaries.set(key, current);
  }
  return [...summaries.values()].sort((left, right) => left.currency.localeCompare(right.currency) || left.period.localeCompare(right.period));
}

function formatCashFlowPeriodLabel(date: string): string {
  const [year, month] = date.slice(0, 7).split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function buildFinancialReport(
  transactions: readonly Transaction[],
  period: FinancialReportPeriod,
  transactionLimit: number | null = DEFAULT_TRANSACTION_LIMIT,
  familyId?: string,
  creatorNames?: ReadonlyMap<string, string>,
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
      creatorName: creatorNames?.get(transaction.createdByMemberId) ?? "Member",
    }));

  return {
    period,
    transactionCount: activeInPeriod.length,
    currencies,
    categorySummaries: buildCategorySummaries(transactions, {
      familyId: familyId ?? transactions[0]?.familyId ?? "",
      startDate: period.startDate,
      endDate: period.endDate,
    }),
    cashFlow: buildCashFlow(transactions, period, familyId),
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

export function buildFinancialPrintHtml(familyName: string, report: FinancialReport, options: FinancialPrintPreviewOptions): string {
  const categoryRows = report.categorySummaries.filter((summary) => summary.expenseMinor > BigInt(0)).map((summary) => `
      <tr>
        <td>${escapeHtml(summary.label)}</td>
        <td>${escapeHtml(summary.currency)}</td>
        <td class="amount negative">${escapeHtml(formatReportAmount(summary.expenseMinor, summary.currency))}</td>
        <td>${escapeHtml(String(summary.transactionCount))}</td>
      </tr>`).join('') || '<tr><td colspan="4">Belum ada pengeluaran berkategori pada periode ini.</td></tr>';
  const cashFlowRows = report.cashFlow.map((point) => `
      <tr>
        <td>${escapeHtml(point.label)}</td>
        <td>${escapeHtml(point.currency)}</td>
        <td class="amount positive">${escapeHtml(formatReportAmount(point.incomeMinor, point.currency))}</td>
        <td class="amount negative">${escapeHtml(formatReportAmount(point.expenseMinor, point.currency))}</td>
        <td class="amount">${escapeHtml(formatReportAmount(point.netMinor, point.currency))}</td>
      </tr>`).join('') || '<tr><td colspan="5">Belum ada arus kas pada periode ini.</td></tr>';
  const transactionRows = report.transactions.length === 0
    ? '<tr><td colspan="8">Belum ada transaksi aktif pada periode ini.</td></tr>'
    : report.transactions.map((transaction) => `
      <tr>
        <td>${escapeHtml(transaction.transactionDate)}</td>
        <td>${escapeHtml(transaction.transactionType === "INCOME" ? "Pemasukan" : "Pengeluaran")}</td>
        <td>${escapeHtml(CATEGORY_LABELS[normalizeTransactionCategory(transaction.category)])}</td>
        <td>${escapeHtml(transaction.currency)}</td>
        <td class="amount">${escapeHtml(formatReportAmount(transaction.amountMinor, transaction.currency))}</td>
        <td>${escapeHtml(transaction.description)}</td>
        <td>${escapeHtml(transaction.creatorName)}</td>
        <td><code>${escapeHtml(transaction.transactionId)}</code></td>
      </tr>`).join('');
  const previewToken = JSON.stringify(options.previewToken);
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(`Falancé — ${familyName} — ${report.period.label}`)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, Helvetica, sans-serif; }
    body { color: #223029; margin: 0; padding: 32px; background: #fafbf8; }
    main { max-width: 1080px; margin: 0 auto; }
    h1, h2, p { margin: 0; }
    h1 { color: #185a42; font-size: 26px; margin-bottom: 6px; }
    h2 { color: #6650a7; font-size: 16px; margin: 28px 0 10px; }
    .brand-header { border-bottom: 4px solid #267a5a; padding-bottom: 18px; }
    .brand-line { align-items: center; display: flex; gap: 12px; }
    .brand-mark { align-items: center; background: linear-gradient(135deg, #b9a6d2, #61b89c 60%, #f28a7c); border-radius: 12px 18px 12px 18px; color: #fff; display: inline-flex; font-size: 20px; font-weight: 800; height: 42px; justify-content: center; width: 42px; }
    .brand-name { color: #185a42; font-size: 22px; font-weight: 800; letter-spacing: .02em; }
    .muted { color: #68756e; font-size: 13px; }
    .toolbar { align-items: center; background: #e3f3ed; border: 1px solid #b8dfd0; border-radius: 12px; display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; margin-bottom: 24px; padding: 12px; }
    .toolbar-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    button, .action-link { border: 0; border-radius: 8px; background: #267a5a; color: #fff; cursor: pointer; display: inline-block; font-size: 13px; padding: 10px 14px; text-decoration: none; font-weight: 700; }
    .action-link.secondary { background: #8e72d6; }
    .action-link.neutral { background: #fff; border: 1px solid #b8dfd0; color: #185a42; }
    .password-form { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; }
    .password-form input { border: 1px solid #b8dfd0; border-radius: 8px; min-height: 36px; padding: 0 9px; }
    .notice { background: #f1edfa; border-left: 4px solid #8e72d6; color: #6650a7; font-size: 12px; margin-top: 10px; padding: 9px 12px; }
    .summary-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); margin-top: 12px; }
    .summary-card { background: #fff; border: 1px solid #e2eae5; border-radius: 12px; padding: 14px; }
    table { background: #fff; border-collapse: collapse; width: 100%; font-size: 12px; }
    th, td { border-bottom: 1px solid #e2eae5; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #e3f3ed; color: #185a42; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
    .amount { text-align: right; white-space: nowrap; }
    .positive { color: #267a5a; }
    .negative { color: #c85a4d; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
    footer { border-top: 1px solid #e2eae5; color: #68756e; font-size: 11px; margin-top: 32px; padding-top: 12px; }
    @media print { body { background: #fff; padding: 0; } .no-print { display: none !important; } th { background: #e3f3ed !important; print-color-adjust: exact; } .summary-card, table { break-inside: avoid; } }
    @media (max-width: 720px) { body { padding: 16px; } .toolbar { align-items: flex-start; flex-direction: column; } table { font-size: 11px; } th, td { padding: 6px; } }
  </style>
</head>
<body>
  <main>
    <div class="toolbar no-print">
      <div><strong>Export report</strong><p class="muted">Gunakan kontrol ini untuk mencetak atau mengunduh dokumen.</p></div>
      <div class="toolbar-actions">
        <button type="button" onclick="window.print()">Cetak</button>
        <a class="action-link secondary" href="${escapeHtml(options.pdfUrl)}">Unduh PDF</a>
        <a class="action-link neutral" href="${escapeHtml(options.csvUrl)}">Unduh CSV</a>
      </div>
      <form class="password-form" id="pdf-password-form">
        <input id="pdf-password" type="password" minlength="8" maxlength="127" autocomplete="new-password" placeholder="Password PDF (opsional)" aria-label="Password PDF opsional">
        <button type="submit">PDF ber-password</button>
      </form>
      <p class="notice" id="pdf-status" role="status" hidden></p>
    </div>
    <header class="brand-header">
      <div class="brand-line"><span class="brand-mark" aria-hidden="true">F</span><span class="brand-name">Falancé</span></div>
      <h1>Laporan Keuangan Keluarga</h1>
      <p class="muted">${escapeHtml(familyName)} · ${escapeHtml(report.period.label)} · ${escapeHtml(report.period.startDate)} s/d ${escapeHtml(report.period.endDate)}</p>
      <p class="muted">${report.transactionCount} transaksi aktif · Dicetak pada ${escapeHtml(options.generatedAt)}</p>
    </header>
    <section>
      <h2>Ringkasan per mata uang</h2>
      <div class="summary-grid">${report.currencies.length === 0 ? '<div class="summary-card muted">Belum ada transaksi aktif pada periode ini.</div>' : report.currencies.map((summary) => `<div class="summary-card"><strong>${escapeHtml(summary.currency)}</strong><p class="positive">Pemasukan: ${escapeHtml(formatReportAmount(summary.incomeMinor, summary.currency))}</p><p class="negative">Pengeluaran: ${escapeHtml(formatReportAmount(summary.expenseMinor, summary.currency))}</p><p><strong>${summary.netMinor >= BigInt(0) ? "Surplus" : "Defisit"}: ${escapeHtml(formatReportAmount(summary.netMinor, summary.currency))}</strong></p></div>`).join('')}</div>
    </section>
    <section>
      <h2>Arus kas per periode</h2>
      <table><thead><tr><th>Periode</th><th>Mata uang</th><th>Pemasukan</th><th>Pengeluaran</th><th>Surplus/Defisit</th></tr></thead><tbody>${cashFlowRows}</tbody></table>
    </section>
    <section>
      <h2>Pengeluaran per kategori</h2>
      <table><thead><tr><th>Kategori</th><th>Mata uang</th><th>Pengeluaran</th><th>Transaksi</th></tr></thead><tbody>${categoryRows}</tbody></table>
    </section>
    <section>
      <h2>Detail transaksi</h2>
      <table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Mata uang</th><th>Jumlah</th><th>Deskripsi</th><th>Dicatat oleh</th><th>ID</th></tr></thead><tbody>${transactionRows}</tbody></table>
    </section>
    <footer>Generated by Falancé · Dicetak pada ${escapeHtml(options.generatedAt)} · Nilai antar-mata uang tidak digabungkan.</footer>
  </main>
  <script>
    (() => {
      const form = document.getElementById("pdf-password-form");
      const password = document.getElementById("pdf-password");
      const status = document.getElementById("pdf-status");
      const previewToken = ${previewToken};
      form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!password || !status) return;
        status.hidden = false;
        status.textContent = "Menyiapkan PDF ber-password…";
        try {
          const response = await fetch("${escapeHtml(options.pdfPrepareUrl)}", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: previewToken, password: password.value }) });
          const payload = await response.json();
          if (!response.ok || !payload.action?.url) throw new Error(payload.error || "PDF tidak dapat disiapkan.");
          window.location.assign(payload.action.url);
          status.textContent = "PDF sedang diunduh.";
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : "PDF tidak dapat disiapkan.";
        }
      });
    })();
  </script>
</body>
</html>`;
}

export function formatReportGeneratedAt(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: getBusinessTimeZone(),
  }).format(now);
}

function formatReportAmount(amount: bigint | number, currency: string): string {
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
