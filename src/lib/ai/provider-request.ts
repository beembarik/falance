import { logDuration } from "../observability/timing";
import {
  classifyProviderRequestError,
  classifyProviderStatus,
  isTransientProviderFailure,
  providerFailureOutcome,
  type AiProviderFailureDetails,
} from "./provider-errors";
import {
  isCompleteAiProviderConfig,
  isSameAiProvider,
  type AiProviderConfig,
  type AiWorkload,
} from "./provider-config";

export interface AiProviderRequestResult {
  response: Response | null;
  failure: AiProviderFailureDetails | null;
  providerRole: "primary" | "fallback";
}

export async function requestWithOneLevelFallback(
  workload: AiWorkload,
  primary: AiProviderConfig,
  fallback: AiProviderConfig,
  timeoutMs: number,
  buildBody: (model: string) => Record<string, unknown>,
): Promise<AiProviderRequestResult> {
  const providers: Array<{ role: "primary" | "fallback"; config: AiProviderConfig }> = [
    { role: "primary", config: primary },
  ];
  if (isCompleteAiProviderConfig(fallback) && !isSameAiProvider(primary, fallback)) {
    providers.push({ role: "fallback", config: fallback });
  }

  let lastFailure: AiProviderFailureDetails | null = null;
  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index];
    const result = await requestOnce(workload, provider.role, provider.config, timeoutMs, buildBody);
    if (!result.failure) return result;
    lastFailure = result.failure;
    if (!isTransientProviderFailure(result.failure) || index === providers.length - 1) return result;
  }

  return { response: null, failure: lastFailure ?? { kind: "network" }, providerRole: "primary" };
}

async function requestOnce(
  workload: AiWorkload,
  providerRole: "primary" | "fallback",
  provider: AiProviderConfig,
  timeoutMs: number,
  buildBody: (model: string) => Record<string, unknown>,
): Promise<AiProviderRequestResult> {
  const baseUrl = provider.apiBase?.replace(/\/+$/, "");
  const model = provider.model;
  if (!baseUrl || !provider.apiKey || !model) {
    const failure = { kind: "not_configured" as const };
    logRequest(workload, providerRole, baseUrl, undefined, failure, 0);
    return { response: null, failure, providerRole };
  }

  const controller = new AbortController();
  const startedAt = performance.now();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildBody(model)),
      signal: controller.signal,
    });
    const failure = response.ok ? null : classifyProviderStatus(response.status);
    logRequest(workload, providerRole, baseUrl, response.status, failure, performance.now() - startedAt);
    return { response, failure, providerRole };
  } catch (error) {
    const failure = classifyProviderRequestError(error);
    logRequest(workload, providerRole, baseUrl, undefined, failure, performance.now() - startedAt);
    return { response: null, failure, providerRole };
  } finally {
    clearTimeout(timeout);
  }
}

function logRequest(
  workload: AiWorkload,
  providerRole: "primary" | "fallback",
  baseUrl: string | undefined,
  status: number | undefined,
  failure: AiProviderFailureDetails | null,
  durationMs: number,
): void {
  logDuration(`ai.${workload}.request`, durationMs, {
    provider: providerHost(baseUrl),
    providerRole,
    status,
    outcome: failure ? providerFailureOutcome(failure) : "success",
  });
}

function providerHost(baseUrl: string | undefined): string {
  if (!baseUrl) return "unconfigured";
  try {
    return new URL(baseUrl).host || "unknown";
  } catch {
    return "invalid";
  }
}
