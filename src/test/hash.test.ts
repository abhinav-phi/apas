import { describe, it, expect } from "vitest";
import { generateProductHash, generateBatchCode } from "../lib/hash";

describe("Hash Utils", () => {
  it("should generate a valid 64-character SHA-256 hash", () => {
    const input = {
      productCode: "PRD-123",
      name: "Test",
      brand: "Brand",
      manufacturerId: "123",
      timestamp: "2024-01-01T00:00:00Z"
    };
    const hash = generateProductHash(input);
    expect(hash).toBeDefined();
    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(64);
  });

  it("should generate different hashes for different inputs", () => {
    const hash1 = generateProductHash({
      productCode: "PRD-123",
      name: "Test",
      brand: "Brand",
      manufacturerId: "123",
      timestamp: "2024-01-01T00:00:00Z"
    });
    const hash2 = generateProductHash({
      productCode: "PRD-124",
      name: "Test",
      brand: "Brand",
      manufacturerId: "123",
      timestamp: "2024-01-01T00:00:00Z"
    });
    expect(hash1).not.toBe(hash2);
  });

  it("should generate batch codes correctly formatted", () => {
    const batchCode = generateBatchCode();
    expect(batchCode).toMatch(/^BAT-[A-Z0-9]{6}$/);
  });
});
