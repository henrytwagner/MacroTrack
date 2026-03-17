import type { NutritionUnit } from '@shared/types';

/** Ordered list of units available when adding a conversion ("to" unit picker). */
export const SERVING_UNITS: NutritionUnit[] = [
  'g',
  'oz',
  'cups',
  'servings',
  'ml',
  'tbsp',
  'tsp',
  'L',
  'fl oz',
  'slices',
  'pieces',
  'portion',
  'scoop',
  'can',
  'bottle',
  'packet',
  'clove',
];

/** Grams per unit for weight units. */
export const WEIGHT_RATIOS_G: Record<string, number> = { g: 1, oz: 28.3495 };

/** Millilitres per unit for volume units. */
export const VOLUME_RATIOS_ML: Record<string, number> = {
  ml: 1,
  L: 1000,
  'fl oz': 29.5735,
  tbsp: 14.7868,
  tsp: 4.92892,
  cups: 236.588,
};

export type MeasurementSystem = 'weight' | 'volume' | 'abstract';

export function getMeasurementSystem(unit: string): MeasurementSystem {
  if (unit in WEIGHT_RATIOS_G) return 'weight';
  if (unit in VOLUME_RATIOS_ML) return 'volume';
  return 'abstract';
}
