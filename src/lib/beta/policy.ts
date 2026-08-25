export type BetaFeature = "vision" | "print" | "pdf";

const FEATURE_ENV_NAMES: Record<BetaFeature, string> = {
  vision: "FALANCE_BETA_VISION_ENABLED",
  print: "FALANCE_BETA_PRINT_ENABLED",
  pdf: "FALANCE_BETA_PDF_ENABLED",
};

export class BetaFeatureDisabledError extends Error {
  readonly feature: BetaFeature;

  constructor(feature: BetaFeature) {
    super(`Beta feature is disabled: ${feature}`);
    this.name = "BetaFeatureDisabledError";
    this.feature = feature;
  }
}

export class BetaCapacityError extends Error {
  readonly resource: "families" | "members";

  constructor(resource: "families" | "members") {
    super(`Public Beta capacity reached: ${resource}`);
    this.name = "BetaCapacityError";
    this.resource = resource;
  }
}

export function isPublicBetaEnabled(): boolean {
  return readBooleanEnv("FALANCE_PUBLIC_BETA") ?? false;
}

/**
 * Production-compatible defaults preserve existing features when the beta flag
 * is absent. A beta deployment defaults Vision, Print, and PDF to disabled;
 * each can be explicitly enabled later through its server-only flag.
 */
export function isBetaFeatureEnabled(feature: BetaFeature): boolean {
  const explicitValue = readBooleanEnv(FEATURE_ENV_NAMES[feature]);
  if (explicitValue !== undefined) return explicitValue;
  return !isPublicBetaEnabled();
}

export function requireBetaFeature(feature: BetaFeature): void {
  if (!isBetaFeatureEnabled(feature)) throw new BetaFeatureDisabledError(feature);
}

export function getBetaFeatureEnvironmentName(feature: BetaFeature): string {
  return FEATURE_ENV_NAMES[feature];
}

export function getBetaMaxFamilies(): number {
  return readPositiveIntegerEnv("FALANCE_BETA_MAX_FAMILIES", 20);
}

export function getBetaMaxActiveMembersPerFamily(): number {
  return readPositiveIntegerEnv("FALANCE_BETA_MAX_ACTIVE_MEMBERS_PER_FAMILY", 3);
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function readBooleanEnv(name: string): boolean | undefined {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === undefined || value === "") return undefined;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return undefined;
}
