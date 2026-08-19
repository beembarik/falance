import type { Family, Transaction } from "../family/types";
import { telegramCode } from "./html";

export function formatTransactionCreatedMessage(transaction: Transaction): string {
  const label = transaction.transactionType === "INCOME" ? "Pemasukan" : "Pengeluaran";
  return [
    `✅ ${label} berhasil dicatat.`,
    "",
    `ID: ${telegramCode(transaction.transactionId)}`,
    `Jumlah: ${formatAmount(transaction.amountMinor, transaction.currency)}`,
    `Tanggal: ${formatDate(transaction.transactionDate)}`,
    `Deskripsi: ${transaction.description}`,
  ].join("\n");
}

export function formatTransactionsMessage(family: Family, transactions: Transaction[]): string {
  const activeTransactions = transactions.filter((transaction) => transaction.status === "ACTIVE");
  const header = `📒 TRANSAKSI AKTIF — ${family.familyName}`;
  if (activeTransactions.length === 0) {
    return [header, "", "📊 RINGKASAN SALDO", "Belum ada transaksi aktif."].join("\n");
  }

  const rows = activeTransactions
    .slice()
    .sort((left, right) => right.transactionDate.localeCompare(left.transactionDate) || right.createdAt.localeCompare(left.createdAt))
    .slice(0, 50)
    .map((transaction) => {
      const label = transaction.transactionType === "INCOME" ? "Pemasukan" : "Pengeluaran";
      return [
        `• ${label}: ${formatAmount(transaction.amountMinor, transaction.currency)}`,
        `  ${formatDate(transaction.transactionDate)} — ${transaction.description}`,
        `  ID: ${telegramCode(transaction.transactionId)}`,
      ].join("\n");
    });

  return [
    header,
    "",
    formatBalanceSummary(activeTransactions),
    "",
    "🧾 DAFTAR TRANSAKSI",
    ...rows,
  ].join("\n");
}

function formatBalanceSummary(transactions: Transaction[]): string {
  const balances = new Map<string, { income: bigint; expense: bigint }>();
  for (const transaction of transactions) {
    const current = balances.get(transaction.currency) ?? { income: BigInt(0), expense: BigInt(0) };
    if (transaction.transactionType === "INCOME") {
      current.income += BigInt(transaction.amountMinor);
    } else {
      current.expense += BigInt(transaction.amountMinor);
    }
    balances.set(transaction.currency, current);
  }

  const sections = [...balances.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, balance]) => {
    const net = balance.income - balance.expense;
    return [
      currency,
      `  Pemasukan  : ${formatAmount(balance.income, currency)}`,
      `  Pengeluaran: ${formatAmount(balance.expense, currency)}`,
      `  Saldo      : ${formatAmount(net, currency)}`,
    ].join("\n");
  });

  return ["📊 RINGKASAN SALDO", ...sections].join("\n");
}

function formatAmount(amount: number | bigint, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount)}`;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
