export type AiWorkload = "text" | "vision";

export interface AiProviderConfig {
  apiBase: string | undefined;
  apiKey: string | undefined;
  model: string | undefined;
}

export function getAiProviderConfig(workload: AiWorkload): AiProviderConfig {
  const prefix = workload === "text" ? "FALANCE_AI_TEXT" : "FALANCE_AI_VISION";
  const modelFallback = workload === "text" ? "gpt-5-mini" : undefined;
  return {
    apiBase: readEnv(`${prefix}_API_BASE`) ?? readEnv("FALANCE_AI_API_BASE"),
    apiKey: readEnv(`${prefix}_API_KEY`) ?? readEnv("FALANCE_AI_API_KEY"),
    model: readEnv(`${prefix}_MODEL`) ?? (workload === "text" ? readEnv("FALANCE_AI_MODEL") : undefined) ?? modelFallback,
  };
}

export function getAiProviderFallbackConfig(workload: AiWorkload): AiProviderConfig {
  const prefix = workload === "text" ? "FALANCE_AI_TEXT_FALLBACK" : "FALANCE_AI_VISION_FALLBACK";
  return {
    apiBase: readEnv(`${prefix}_API_BASE`),
    apiKey: readEnv(`${prefix}_API_KEY`),
    model: readEnv(`${prefix}_MODEL`),
  };
}

export function isCompleteAiProviderConfig(config: AiProviderConfig): boolean {
  return Boolean(config.apiBase && config.apiKey && config.model);
}

export function isSameAiProvider(left: AiProviderConfig, right: AiProviderConfig): boolean {
  return left.apiBase === right.apiBase && left.apiKey === right.apiKey && left.model === right.model;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}
