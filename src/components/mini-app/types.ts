export type ReportAction = { url: string; fileName: string };
export type NavKey = "home" | "transactions" | "reports" | "account";
export type TransactionFilter = "ALL" | "INCOME" | "EXPENSE";
export type FamilyAction = "CREATE_INVITATION" | "RENAME_FAMILY" | "CHANGE_MEMBER_ROLE" | "REQUEST_DEACTIVATE_MEMBER" | "CONFIRM_DEACTIVATE_MEMBER" | "CANCEL_DEACTIVATE_MEMBER";
export type FamilyActionFields = { familyName?: string; memberId?: string; role?: "ADMIN" | "MEMBER" };

export type ReportResponse = {
  familyName: string;
  viewer: { name: string; role: string };
  actions?: { csv?: ReportAction; pdf?: ReportAction; print?: ReportAction };
  report: {
    period: { month: string | null; startDate: string; endDate: string; label: string };
    transactionCount: number;
    currencies: Array<{
      currency: string;
      incomeMinor: string;
      expenseMinor: string;
      netMinor: string;
      transactionCount: number;
    }>;
    categorySummaries: Array<{
      category: string;
      label: string;
      currency: string;
      incomeMinor: string;
      expenseMinor: string;
      netMinor: string;
      transactionCount: number;
    }>;
    cashFlow: Array<{
      period: string;
      label: string;
      currency: string;
      incomeMinor: string;
      expenseMinor: string;
      netMinor: string;
      transactionCount: number;
    }>;
    transactions: Array<{
      transactionId: string;
      transactionType: "INCOME" | "EXPENSE";
      amountMinor: string;
      currency: string;
      transactionDate: string;
      description: string;
      category: string;
      creatorName: string;
    }>;
  };
};

export type AccountResponse = {
  beta?: { label: string; version: string; supportUrl: string | null; tester: boolean };
  viewer: { name: string; username: string | null; role: string; avatarUrl: string | null; avatarFallbackUrl: string | null };
  family: { familyName: string; status: string; plan: string; activeMemberCount: number };
  members: Array<{ memberId: string; name: string; username: string | null; role: string; joinedAt: string }>;
};

export type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  downloadFile?: (params: { url: string; file_name: string }, callback?: (accepted: boolean) => void) => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}
