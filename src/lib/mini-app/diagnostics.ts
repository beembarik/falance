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
  return env.FALANCE_MINI_APP_DIAGNOSTICS === "true" && env.VERCEL_ENV !== "production";
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
