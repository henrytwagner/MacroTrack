/**
 * Derives age in whole years from a date of birth.
 * Uses UTC date parts so that date-only values (e.g. from DB) are consistent.
 * Birthday not yet reached this year means age - 1.
 */
export function calculateAgeFromDob(dob: Date): number {
  const today = new Date();
  const y = dob.getUTCFullYear();
  const m = dob.getUTCMonth();
  const d = dob.getUTCDate();
  let age = today.getUTCFullYear() - y;
  const monthDiff = today.getUTCMonth() - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < d)) {
    age -= 1;
  }
  return Math.max(0, Math.min(age, 120));
}

/**
 * Parses a YYYY-MM-DD string into a Date (UTC date, no time).
 * Returns null if invalid or out of reasonable range (0–120 years).
 */
export function parseDateOfBirth(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = parseInt(y!, 10);
  const month = parseInt(m!, 10) - 1;
  const day = parseInt(d!, 10);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return null; // invalid calendar date
  }
  const now = new Date();
  if (date > now) return null; // future date
  const age = calculateAgeFromDob(date);
  if (age >= 120) return null; // over 119 years old invalid
  return date;
}
