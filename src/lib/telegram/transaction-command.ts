import type { CreateTransactionInput } from "../family/service";
import type { TransactionType } from "../family/types";

export class TransactionCommandError extends Error {}

export function parseManualTransactionCommand(
  command: string,
  prefix: "/addincome" | "/addexpense",
): CreateTransactionInput {
  const transactionType: TransactionType = prefix === "/addincome" ? "INCOME" : "EXPENSE";
  const args = command.slice(prefix.length).trim().split(/\s+/).filter(Boolean);
  return parseTransactionArguments(args, transactionType, prefix);
}

export function parseEditTransactionCommand(command: string): {
  transactionId: string;
  input: CreateTransactionInput;
} {
  const args = command.slice("/edittransaction".length).trim().split(/\s+/).filter(Boolean);
  if (args.length < 5) {
    throw new TransactionCommandError(
      "Format tidak valid. Gunakan: /edittransaction <transaction_id> <INCOME|EXPENSE> <amount_minor> [CURRENCY] <YYYY-MM-DD> <deskripsi>",
    );
  }

  const transactionId = args.shift();
  const typeToken = args.shift()?.toUpperCase();
  if (!transactionId || (typeToken !== "INCOME" && typeToken !== "EXPENSE")) {
    throw new TransactionCommandError(
      "Format tidak valid. Gunakan: /edittransaction <transaction_id> <INCOME|EXPENSE> <amount_minor> [CURRENCY] <YYYY-MM-DD> <deskripsi>",
    );
  }

  return {
    transactionId,
    input: parseTransactionArguments(args, typeToken, "/edittransaction"),
  };
}

function parseTransactionArguments(
  args: string[],
  transactionType: TransactionType,
  prefix: string,
): CreateTransactionInput {
  if (args.length < 3) {
    throw new TransactionCommandError(
      `Format tidak valid. Gunakan: ${prefix} <amount_minor> [CURRENCY] <YYYY-MM-DD> <deskripsi>`,
    );
  }

  const amountMinor = parseAmountMinor(args[0]);
  const hasCurrency = /^[A-Za-z]{3}$/.test(args[1]);
  const currency = hasCurrency ? args[1].toUpperCase() : undefined;
  const dateIndex = hasCurrency ? 2 : 1;
  const transactionDate = args[dateIndex];
  const description = args.slice(dateIndex + 1).join(" ");

  if (!transactionDate || !description) {
    throw new TransactionCommandError(
      `Format tidak valid. Gunakan: ${prefix} <amount_minor> [CURRENCY] <YYYY-MM-DD> <deskripsi>`,
    );
  }

  return { transactionType, amountMinor, currency, transactionDate, description };
}

export function parseAmountMinor(value: string): number {
  const token = value.trim();
  const normalized = /^\d+$/.test(token)
    ? token
    : /^\d{1,3}(?:[.,]\d{3})+$/.test(token)
      ? token.replace(/[.,]/g, "")
      : "";
  const amount = Number(normalized);
  if (!normalized || !Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000_000) {
    throw new TransactionCommandError("Jumlah harus berupa bilangan bulat positif yang valid.");
  }
  return amount;
}
