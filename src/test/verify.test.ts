import { describe, it, expect } from "vitest";

describe("Verify Flow Logic", () => {
  it("should calculate trust score correctly", () => {
    const calculateTrustScore = (scans: number, flags: number) => {
      let score = 100 - (flags * 20);
      if (score < 0) score = 0;
      return score;
    };
    
    expect(calculateTrustScore(5, 0)).toBe(100);
    expect(calculateTrustScore(5, 2)).toBe(60);
    expect(calculateTrustScore(5, 10)).toBe(0);
  });

  it("should validate product code format", () => {
    const isValidCode = (code: string) => /^PRD-[A-Z0-9]{8}$/.test(code);
    expect(isValidCode("PRD-12345678")).toBe(true);
    expect(isValidCode("INVALIDCODE")).toBe(false);
  });
});
