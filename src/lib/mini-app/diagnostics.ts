export type MiniAppDiagnosticState =
  | "request_started"
  | "invalid_request"
  | "init_data_missing"
  | "init_data_present"
  | "auth_invalid"
  | "access_denied"
  | "success"
  | "failure";

export type MiniAppDiagnosticOperation = "account" | "report" | "family" | "transaction";

type SafeDiagnosticDetails = {
  status?: number;
  errorClass?: string;
};

type DiagnosticEnvironment = {
  FALANCE_MINI_APP_DIAGNOSTICS?: string;
  VERCEL_ENV?: string;
};

export function isMiniAppDiagnosticsEnabled(env: DiagnosticEnvironment = process.env as DiagnosticEnvironment): boolean {
  return env.VERCEL_ENV === "preview" || (env.FALANCE_MINI_APP_DIAGNOSTICS === "true" && env.VERCEL_ENV !== "production");
}

export function classifyMiniAppError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown_error";
  if (error.name === "GoogleConfigurationError") return "persistence_configuration";
  if (error.name === "GoogleApiError") return "google_api_error";
  if (error.message === "Invalid Supabase row.") return "supabase_invalid_row";
  if (error.message === "Supabase write failed.") return "supabase_write_failed";
  if (error.message.startsWith("Supabase read failed for ")) {
    const table = error.message.slice("Supabase read failed for ".length).replace(/\.$/, "");
    const knownTables = new Set(["families", "members", "transactions", "invitations", "pending_confirmations", "pending_family_creations", "pending_transaction_drafts", "draft_approval_claims"]);
    return knownTables.has(table) ? `supabase_read_${table}` : "supabase_read_failed";
  }
  if (error.message === "Supabase read response was invalid.") return "supabase_invalid_response";
  return "unknown_error";
}

export function logMiniAppDiagnostic(
  operation: MiniAppDiagnosticOperation,
  state: MiniAppDiagnosticState,
  details: SafeDiagnosticDetails = {},
): void {
  if (!isMiniAppDiagnosticsEnabled()) return;
  const safeDetails: SafeDiagnosticDetails = {};
  const status = details.status;
  if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) {
    safeDetails.status = status;
  }
  if (details.errorClass && /^[A-Za-z][A-Za-z0-9_]{0,80}$/.test(details.errorClass)) {
    safeDetails.errorClass = details.errorClass;
  }
  console.info("[MiniAppDiagnostic]", { operation, state, ...safeDetails });
}
