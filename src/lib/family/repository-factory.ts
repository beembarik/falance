import { GoogleConfigurationError } from "../google/sheets-client";
import { GoogleSheetsFamilyRepository } from "./google-sheets-repository";
import type { FamilyRepository } from "./repository";
import { ShadowReadRepository } from "./shadow-read-repository";
import { SupabaseFamilyRepository } from "./supabase-family-repository";
import { SupabaseReadRepository } from "./supabase-read-repository";
import { SupabaseRestReadClient } from "./supabase-rest-read-client";
import { SupabaseRestWriteClient } from "./supabase-rest-write-client";

const DEFAULT_BACKEND = "google-sheets";

export function createFamilyRepository(): FamilyRepository {
  const backend = process.env.FALANCE_PERSISTENCE_BACKEND?.trim() || DEFAULT_BACKEND;
  if (backend === "supabase") return createSupabaseRepository();
  if (backend !== DEFAULT_BACKEND) throw new GoogleConfigurationError(`Unsupported persistence backend: ${backend}`);

  const primary = new GoogleSheetsFamilyRepository();
  if (process.env.FALANCE_SHADOW_READS !== "true") return primary;

  const vercelEnvironment = process.env.VERCEL_ENV?.trim();
  const isPreviewDeployment = vercelEnvironment === "preview";
  const isLocalDevelopment = !vercelEnvironment && process.env.NODE_ENV !== "production";
  if (!isPreviewDeployment && !isLocalDevelopment) {
    console.warn("[ShadowRead] disabled outside Preview or local development");
    return primary;
  }

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

function createSupabaseRepository(): FamilyRepository {
  const vercelEnvironment = process.env.VERCEL_ENV?.trim();
  const isPreviewDeployment = vercelEnvironment === "preview";
  const isLocalDevelopment = !vercelEnvironment && process.env.NODE_ENV !== "production";
  if (!isPreviewDeployment && !isLocalDevelopment) {
    throw new GoogleConfigurationError("Supabase backend is restricted to Preview or local development.");
  }

  const url = process.env.FALANCE_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.FALANCE_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) throw new GoogleConfigurationError("Supabase backend is not configured.");
  try {
    new URL(url);
  } catch {
    throw new GoogleConfigurationError("Supabase backend URL is invalid.");
  }
  return new SupabaseFamilyRepository(new SupabaseRestWriteClient(url, serviceRoleKey));
}
