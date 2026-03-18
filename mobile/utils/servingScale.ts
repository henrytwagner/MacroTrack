/**
 * Single source of truth for scaling nutrition from a food's "base serving"
 * to the amount the user is logging (quantity + unit).
 *
 * Contract:
 * - Base serving: (baseServingSize, baseServingUnit), e.g. 100 g or 1 serving.
 *   Macros are stored per one base serving.
 * - When the user logs in the base unit (e.g. 200 g): scale = quantity / baseServingSize.
 * - When the user logs in an alternate unit with a conversion (e.g. 2 cups, 1 cup = 2.5 base servings):
 *   scale = quantity * conversion.quantityInBaseServings.
 *
 * FoodDetailSheet and any other UI that shows "scaled" macros should use this helper.
 */

export interface BaseServing {
  size: number;
  unit: string;
}

export interface UnitConversion {
  unitName: string;
  quantityInBaseServings: number;
}

/**
 * Returns the multiplier to apply to base macros for the given quantity and unit.
 * Result is "how many base servings" the user's amount represents.
 */
export function scaleFactorForQuantity(
  quantity: number,
  unit: string,
  baseServing: BaseServing,
  conversionForUnit: UnitConversion | null | undefined,
): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  if (baseServing.size <= 0) return 0;

  if (conversionForUnit && unit === conversionForUnit.unitName) {
    return quantity * conversionForUnit.quantityInBaseServings;
  }
  // "servings" always means multiples of the base serving (e.g. 2 servings = 2× base).
  if (unit === "servings") {
    return quantity;
  }
  if (unit === baseServing.unit) {
    return quantity / baseServing.size;
  }
  return quantity / baseServing.size;
}
