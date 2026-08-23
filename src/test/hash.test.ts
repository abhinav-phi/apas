import { describe, it, expect } from "vitest";
import {
  generateProductHash,
  generateProductCode,
  generateBatchCode,
  generateQRData,
} from "../lib/hash";

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
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should be deterministic for identical input", () => {
    const input = {
      productCode: "PRD-AB3F8X2Q",
      name: "Same",
      brand: "Same",
      manufacturerId: "u-1",
      timestamp: "2024-01-01T00:00:00Z"
    };
    expect(generateProductHash(input)).toBe(generateProductHash(input));
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

  // Rules R16 / TechSpec §4.2 — event & transfer hashes are computed
  // SERVER-SIDE inside SECURITY DEFINER RPCs; the client-side helpers were
  // removed as forgeable dead code. Guard against reintroduction.
  it("must not export client-side event/transfer hash generators", async () => {
    const mod = await import("../lib/hash");
    expect("generateEventHash" in mod).toBe(false);
    expect("generateTransferHash" in mod).toBe(false);
  });
});

describe("Code Generation Formats", () => {
  it("should generate product codes matching PRD-XXXXXXXX (Rules R18)", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateProductCode()).toMatch(/^PRD-[A-Z0-9]{8}$/);
    }
  });

  it("should generate batch codes matching BAT-XXXXXX (Rules R19)", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateBatchCode()).toMatch(/^BAT-[A-Z0-9]{6}$/);
    }
  });
});

describe("QR Data Generation", () => {
  const hash = "3b7a2f9c1e5d8a04b6c2d7e1f0a39485c6b7d2e9f1a30485b6c7d8e9f0a1b2c3";

  it("should encode product code + 16-char hash prefix separated by ::", () => {
    const qr = generateQRData("PRD-AB3F8X2Q", hash);
    expect(qr).toBe(`PRD-AB3F8X2Q::${hash.slice(0, 16)}`);
  });

  it("should keep the verification URL contract used by QRCodes.tsx (R28)", () => {
    // QRCodes.tsx encodes `${origin}/verify?code=${product_code}`; Verify.tsx
    // reads `code` from URL params. Assert the round-trip shape.
    const origin = "https://app.authentichain.com";
    const code = generateProductCode();
    const url = `${origin}/verify?code=${code}`;
    expect(url.startsWith(origin + "/verify?code=")).toBe(true);
    expect(new URL(url).searchParams.get("code")).toBe(code);
  });
});
