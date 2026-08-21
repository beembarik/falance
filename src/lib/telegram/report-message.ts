import type { Family } from "../family/types";
import type { FinancialReport } from "../family/report";

export function formatFinancialReportMessage(family: Family, report: FinancialReport): string {
  const header = `📊 LAPORAN KEUANGAN — ${family.familyName}`;
  if (report.currencies.length === 0) {
    return [
      header,
      `Periode: ${report.period.label}`,
      `${report.period.startDate} s/d ${report.period.endDate}`,
      "",
      "Belum ada transaksi aktif pada periode ini.",
    ].join("\n");
  }

  const sections = report.currencies.map((summary) => [
    `💱 ${summary.currency}`,
    `  Pemasukan  : ${formatAmount(summary.incomeMinor, summary.currency)}`,
    `  Pengeluaran: ${formatAmount(summary.expenseMinor, summary.currency)}`,
    `  Saldo      : ${formatAmount(summary.netMinor, summary.currency)}`,
    `  Transaksi  : ${summary.transactionCount}`,
  ].join("\n"));

  return [
    header,
    `Periode: ${report.period.label}`,
    `${report.period.startDate} s/d ${report.period.endDate}`,
    `Transaksi aktif: ${report.transactionCount}`,
    "",
    ...sections,
  ].join("\n\n");
}

function formatAmount(amount: bigint, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount)}`;
}
