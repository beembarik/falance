import { GoogleConfigurationError } from "../google/sheets-client";
import { GoogleSheetsFamilyRepository } from "./google-sheets-repository";
import type { FamilyRepository } from "./repository";
import { ShadowReadRepository } from "./shadow-read-repository";
import { SupabaseReadRepository } from "./supabase-read-repository";
import { SupabaseRestReadClient } from "./supabase-rest-read-client";

const DEFAULT_BACKEND = "google-sheets";

export function createFamilyRepository(): FamilyRepository {
  const backend = process.env.FALANCE_PERSISTENCE_BACKEND?.trim() || DEFAULT_BACKEND;
  if (backend !== DEFAULT_BACKEND) throw new GoogleConfigurationError(`Unsupported persistence backend: ${backend}`);

  const primary = new GoogleSheetsFamilyRepository();
  if (process.env.FALANCE_SHADOW_READS !== "true") return primary;

  const shadowUrl = process.env.FALANCE_SHADOW_SUPABASE_URL?.trim();
  const shadowKey = process.env.FALANCE_SHADOW_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!shadowUrl || !shadowKey) {
    console.warn("[ShadowRead] disabled: Supabase shadow configuration is incomplete");
    return primary;
  }

  try {
    new URL(shadowUrl);
  } catch {
    console.warn("[ShadowRead] disabled: Supabase shadow URL is invalid");
    return primary;
  }

  const secondary = new SupabaseReadRepository(new SupabaseRestReadClient(shadowUrl, shadowKey));
  return new ShadowReadRepository(primary, secondary);
}
