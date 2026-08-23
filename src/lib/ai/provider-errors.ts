export type AiProviderFailureKind =
  | "not_configured"
  | "timeout"
  | "network"
  | "rate_limited"
  | "server_error"
  | "client_error"
  | "invalid_response";

export interface AiProviderFailureDetails {
  kind: AiProviderFailureKind;
  status?: number;
}

export function classifyProviderStatus(status: number): AiProviderFailureDetails {
  if (status === 408 || status === 504) return { kind: "timeout", status };
  if (status === 429) return { kind: "rate_limited", status };
  if (status >= 500 && status <= 599) return { kind: "server_error", status };
  return { kind: "client_error", status };
}

export function classifyProviderRequestError(error: unknown): AiProviderFailureDetails {
  if (isAbortError(error)) return { kind: "timeout" };
  return { kind: "network" };
}

export function providerFailureOutcome(details: AiProviderFailureDetails): string {
  return details.kind;
}

export function isTransientProviderFailure(details: AiProviderFailureDetails): boolean {
  return details.kind === "timeout"
    || details.kind === "network"
    || details.kind === "rate_limited"
    || details.kind === "server_error";
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
