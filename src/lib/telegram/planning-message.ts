import type { FinancialPlan } from "../family/types";

export function formatFinancialPlanMessage(plan: FinancialPlan): string {
  const type = plan.planningType === "PLAN_INCOME" ? "Rencana pendapatan" : plan.planningType === "PLAN_EXPENSE" ? "Rencana pengeluaran" : "Recurring liability";
  return `✅ ${type} tersimpan.\n\nID: <code>${escapeHtml(plan.planId)}</code>\nJumlah: ${formatAmount(plan.amountMinor, plan.currency)}\nMulai: ${plan.startDate}\nPerulangan: ${plan.recurrence === "MONTHLY" ? "Bulanan" : "Sekali"}\nDeskripsi: ${escapeHtml(plan.description)}`;
}

export function formatFinancialPlansMessage(plans: FinancialPlan[]): string {
  const activePlans = plans.filter((plan) => plan.status === "ACTIVE").slice(-20).reverse();
  if (activePlans.length === 0) return "Belum ada rencana keuangan aktif.";
  const rows = activePlans.map((plan) => {
    const label = plan.planningType === "PLAN_INCOME" ? "Pendapatan" : plan.planningType === "PLAN_EXPENSE" ? "Pengeluaran" : "Liability";
    return `• ${label}: ${formatAmount(plan.amountMinor, plan.currency)} mulai ${plan.startDate} (${plan.recurrence === "MONTHLY" ? "bulanan" : "sekali"}) — ${escapeHtml(plan.description)}`;
  });
  return `<b>Rencana keuangan</b>\n\n${rows.join("\n")}`;
}

function formatAmount(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 0 }).format(amountMinor);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}