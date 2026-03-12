import { calculateAgeFromDob, parseDateOfBirth } from "../age";

describe("calculateAgeFromDob", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.UTC(2025, 2, 10))); // 2025-03-10
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it("returns 0 for birthday today", () => {
    const today = new Date(Date.UTC(2025, 2, 10));
    expect(calculateAgeFromDob(today)).toBe(0);
  });

  it("returns 1 when birthday was exactly one year ago", () => {
    const oneYearAgo = new Date(Date.UTC(2024, 2, 10));
    expect(calculateAgeFromDob(oneYearAgo)).toBe(1);
  });

  it("returns 0 when birthday is tomorrow (same year)", () => {
    const tomorrow = new Date(Date.UTC(2025, 2, 11));
    expect(calculateAgeFromDob(tomorrow)).toBe(0);
  });

  it("returns 35 for Jan 1 1990 when today is Mar 10 2025", () => {
    const jan1_1990 = new Date(Date.UTC(1990, 0, 1));
    expect(calculateAgeFromDob(jan1_1990)).toBe(35);
  });

  it("clamps age to 0 for future date", () => {
    const future = new Date(Date.UTC(2030, 0, 1));
    expect(calculateAgeFromDob(future)).toBe(0);
  });

  it("clamps age to 120 for very old date", () => {
    const veryOld = new Date(Date.UTC(1900, 0, 1));
    expect(calculateAgeFromDob(veryOld)).toBe(120);
  });
});

describe("parseDateOfBirth", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.UTC(2025, 2, 10)));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it("parses valid YYYY-MM-DD", () => {
    const d = parseDateOfBirth("1990-07-15");
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(1990);
    expect(d!.getUTCMonth()).toBe(6);
    expect(d!.getUTCDate()).toBe(15);
  });

  it("returns null for invalid format", () => {
    expect(parseDateOfBirth("")).toBeNull();
    expect(parseDateOfBirth("1990/07/15")).toBeNull();
    expect(parseDateOfBirth("15-07-1990")).toBeNull();
    expect(parseDateOfBirth("not-a-date")).toBeNull();
  });

  it("returns null for invalid calendar date", () => {
    expect(parseDateOfBirth("1990-02-30")).toBeNull();
    expect(parseDateOfBirth("1990-13-01")).toBeNull();
  });

  it("returns null for future date", () => {
    expect(parseDateOfBirth("2026-03-10")).toBeNull();
  });

  it("returns null for over 120 years ago", () => {
    expect(parseDateOfBirth("1800-01-01")).toBeNull();
  });
});
