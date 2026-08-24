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
  stage?: string;
  persistenceConfig?: string;
};

type DiagnosticEnvironment = {
  FALANCE_MINI_APP_DIAGNOSTICS?: string;
  VERCEL_ENV?: string;
  FALANCE_PERSISTENCE_BACKEND?: string;
  FALANCE_SUPABASE_URL?: string;
  FALANCE_SUPABASE_SERVICE_ROLE_KEY?: string;
};

export function isMiniAppDiagnosticsEnabled(env: DiagnosticEnvironment = process.env as DiagnosticEnvironment): boolean {
  return env.VERCEL_ENV === "preview" || (env.FALANCE_MINI_APP_DIAGNOSTICS === "true" && env.VERCEL_ENV !== "production");
}

export function classifyPersistenceConfig(env: DiagnosticEnvironment = process.env as DiagnosticEnvironment): string {
  const backend = env.FALANCE_PERSISTENCE_BACKEND?.trim() || "google-sheets";
  if (backend !== "supabase") return "backend_not_supabase";
  if (env.VERCEL_ENV !== "preview") return "supabase_non_preview_context";
  if (!env.FALANCE_SUPABASE_URL?.trim()) return "supabase_url_missing";
  if (!env.FALANCE_SUPABASE_SERVICE_ROLE_KEY?.trim()) return "supabase_service_role_missing";
  return "supabase_config_present";
}

export function classifyMiniAppError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown_error";
  if (error.name === "GoogleConfigurationError" || error.message.includes("Supabase backend is restricted") || error.message.includes("Supabase backend is not configured") || error.message.includes("Supabase backend URL is invalid")) return "persistence_configuration";
  if (error.name === "GoogleApiError" || error.message.includes("Google authentication failed") || error.message.includes("Google API request failed")) return "google_api_error";
  if (error.message === "Invalid Supabase row.") return "supabase_invalid_row";
  if (error.message === "Supabase write failed.") return "supabase_write_failed";
  if (error.message.startsWith("Supabase read failed for ")) {
    const match = /^Supabase read failed for ([a-z_]+) \[([a-z0-9_]+)\]\.$/.exec(error.message);
    if (!match) return "supabase_read_failed";
    const [, table, code] = match;
    const knownTables = new Set(["families", "members", "transactions", "invitations", "pending_confirmations", "pending_family_creations", "pending_transaction_drafts", "draft_approval_claims"]);
    const knownCodes = new Set(["http_400", "http_401", "http_403", "http_404", "http_408", "http_429", "http_500", "http_502", "http_503", "http_504", "network", "invalid_response", "unknown"]);
    if (!knownTables.has(table)) return "supabase_read_failed";
    return knownCodes.has(code) && code !== "unknown" ? `supabase_read_${table}_${code}` : `supabase_read_${table}`;
  }
  if (error.message.includes("Unsupported persistence backend")) return "persistence_configuration";
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
  if (details.stage && /^[a-z][a-z0-9_]{0,60}$/.test(details.stage)) {
    safeDetails.stage = details.stage;
  }
  if (details.persistenceConfig && /^[a-z][a-z0-9_]{0,60}$/.test(details.persistenceConfig)) {
    safeDetails.persistenceConfig = details.persistenceConfig;
  }
  console.info("[MiniAppDiagnostic]", { operation, state, ...safeDetails });
}
