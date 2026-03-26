/**
 * Shared barcode lookup service.
 *
 * Single source of truth for the barcode → food resolution chain.
 * Priority: custom foods (user's personal data) → community foods → not found.
 *
 * All consumers (REST endpoint, voiceSession WS, kitchenModeSession WS)
 * call this instead of implementing their own query logic. Each consumer
 * still controls what happens with the result (e.g., Gemini prompts,
 * draft insertion, JSON response).
 */

import { prisma } from "../db/client.js";
import { normalizeToGTIN } from "../routes/barcode.js";

// Re-export normalizeToGTIN so consumers don't need to import from routes
export { normalizeToGTIN };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw Prisma row for a custom food (all fields). */
type CustomFoodRow = NonNullable<
  Awaited<ReturnType<typeof prisma.customFood.findFirst>>
>;

/** Raw Prisma row for a community food (all fields). */
type CommunityFoodRow = NonNullable<
  Awaited<ReturnType<typeof prisma.communityFood.findFirst>>
>;

export type BarcodeLookupResult =
  | { source: "custom"; food: CustomFoodRow }
  | { source: "community"; food: CommunityFoodRow }
  | { source: "not_found"; normalizedGtin: string };

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Look up a food by barcode GTIN.
 *
 * 1. Normalizes the input to GTIN-13 (handles UPC-A, EAN-8, UPC-E, etc.)
 * 2. Checks user's custom foods first (personal data takes priority)
 * 3. Falls back to community foods
 * 4. Returns `{ source: "not_found" }` if no match
 *
 * @param gtin  Raw barcode string (any format — will be normalized)
 * @param userId  The user whose custom foods to search
 */
export async function lookupBarcode(
  gtin: string,
  userId: string,
): Promise<BarcodeLookupResult> {
  const digits = gtin.replace(/\D/g, "");
  const normalized = normalizeToGTIN(digits) ?? digits;

  if (!normalized) {
    return { source: "not_found", normalizedGtin: "" };
  }

  // 1. Custom foods (user's personal data takes priority)
  const customFood = await prisma.customFood.findFirst({
    where: {
      userId,
      OR: [
        { barcode: normalized },
        // Also check raw digits for legacy data stored before GTIN normalization
        ...(normalized !== digits ? [{ barcode: digits }] : []),
      ],
    },
  });
  if (customFood) {
    return { source: "custom", food: customFood };
  }

  // 2. Community foods (barcode stored in separate join table)
  const communityRecord = await prisma.communityFoodBarcode.findUnique({
    where: { barcode: normalized },
    include: { communityFood: true },
  });
  if (communityRecord?.communityFood) {
    return { source: "community", food: communityRecord.communityFood };
  }

  return { source: "not_found", normalizedGtin: normalized };
}
