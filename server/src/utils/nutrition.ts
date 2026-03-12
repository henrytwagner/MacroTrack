import type { Macros } from "../../../shared/types.js";

/**
 * Small helper to describe a food's canonical "base serving".
 * All conversions map back to this quantity so that macros remain
 * tied to a single source of truth.
 */
export interface BaseServing {
  /**
   * Numeric size of the base serving (e.g., 100 or 1).
   */
  size: number;
  /**
   * Unit label of the base serving (e.g., "g", "servings").
   * This is primarily for display and for defining conversions;
   * macros themselves are unitless and always scaled from this base.
   */
  unit: string;
}

/**
 * Configuration for an alternative logging unit (e.g., "slice" or "cup")
 * relative to a food's base serving.
 *
 * quantityInBaseServings says how many base servings one unit represents:
 * - If base serving is "100 g" and 1 slice = 30 g, then quantityInBaseServings = 0.3.
 * - If base serving is "1 serving" and 1 cup = 2 servings, then quantityInBaseServings = 2.
 */
export interface UnitConversionConfig {
  unitName: string;
  quantityInBaseServings: number;
}

/**
 * Scales macros from a base serving to a requested quantity expressed
 * directly in base-serving units.
 */
export function scaleMacrosFromBase(
  base: Macros,
  baseServing: BaseServing,
  requestedQuantityInBaseServings: number,
): Macros {
  const { size } = baseServing;
  if (size <= 0) {
    return base;
  }
  const ratio = requestedQuantityInBaseServings / size;
  return {
    calories: Math.round(base.calories * ratio),
    proteinG: Math.round(base.proteinG * ratio * 10) / 10,
    carbsG: Math.round(base.carbsG * ratio * 10) / 10,
    fatG: Math.round(base.fatG * ratio * 10) / 10,
  };
}

/**
 * Given a requested quantity + unit and an optional per-food unit conversion,
 * returns the equivalent quantity in base-serving units.
 *
 * If there is no matching conversion for the requested unit, this simply
 * assumes the quantity is already expressed in base-serving units.
 */
export function toBaseServingQuantity(
  requestedQuantity: number,
  requestedUnit: string,
  baseServing: BaseServing,
  conversionForUnit?: UnitConversionConfig | null,
): number {
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
    return baseServing.size;
  }

  // If user is already logging in the base unit, no conversion is needed.
  if (!conversionForUnit || requestedUnit === baseServing.unit) {
    return requestedQuantity;
  }

  return requestedQuantity * conversionForUnit.quantityInBaseServings;
}

