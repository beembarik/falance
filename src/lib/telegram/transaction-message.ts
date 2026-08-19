import type { Family, Transaction } from "../family/types";

export function formatTransactionCreatedMessage(transaction: Transaction): string {
  const label = transaction.transactionType === "INCOME" ? "Pemasukan" : "Pengeluaran";
  return [
    `✅ ${label} berhasil dicatat.`,
    "",
    `ID: ${transaction.transactionId}`,
    `Jumlah: ${formatAmount(transaction.amountMinor, transaction.currency)}`,
    `Tanggal: ${formatDate(transaction.transactionDate)}`,
    `Deskripsi: ${transaction.description}`,
  ].join("\n");
}

export function formatTransactionsMessage(family: Family, transactions: Transaction[]): string {
  if (transactions.length === 0) {
    return `📒 Transaksi aktif keluarga ${family.familyName}\n\nBelum ada transaksi.`;
  }

  const rows = transactions
    .slice()
    .sort((left, right) => right.transactionDate.localeCompare(left.transactionDate) || right.createdAt.localeCompare(left.createdAt))
    .slice(0, 50)
    .map((transaction) => {
      const label = transaction.transactionType === "INCOME" ? "Pemasukan" : "Pengeluaran";
      return [
        `• ${label}: ${formatAmount(transaction.amountMinor, transaction.currency)}`,
        `  ${formatDate(transaction.transactionDate)} — ${transaction.description}`,
        `  ID: ${transaction.transactionId}`,
      ].join("\n");
    });

  return [`📒 Transaksi aktif keluarga ${family.familyName}`, "", ...rows].join("\n");
}

function formatAmount(amountMinor: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amountMinor)}`;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
