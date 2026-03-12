export const GRAMS_PER_OUNCE = 28.3495;

export function gramsToOunces(g: number): number {
  return g / GRAMS_PER_OUNCE;
}

export function ouncesToGrams(oz: number): number {
  return oz * GRAMS_PER_OUNCE;
}

