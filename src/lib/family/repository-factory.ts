import { GoogleConfigurationError } from "../google/sheets-client";
import { GoogleSheetsFamilyRepository } from "./google-sheets-repository";
import type { FamilyRepository } from "./repository";

const DEFAULT_BACKEND = "google-sheets";

export function createFamilyRepository(): FamilyRepository {
  const backend = process.env.FALANCE_PERSISTENCE_BACKEND?.trim() || DEFAULT_BACKEND;
  if (backend === DEFAULT_BACKEND) return new GoogleSheetsFamilyRepository();
  throw new GoogleConfigurationError(`Unsupported persistence backend: ${backend}`);
}
