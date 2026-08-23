// Unit tests for the viem helper layer (src/lib/blockchain.ts).
// Pure functions only — no network calls.
import { describe, it, expect } from "vitest";
import {
  SEPOLIA_CHAIN_ID,
  etherscanTxUrl,
  shortAddress,
  sha256ToBytes32,
  toWalletError,
  uuidToBytes32,
  WalletError,
  hashMatchesOnChain,
} from "../lib/blockchain";

describe("bytes32 conversions", () => {
  it("converts a dashed UUID to a 32-byte hex word", () => {
    const out = uuidToBytes32("6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b");
    expect(out).toBe("0x6f1a2b3c4d5e4f608a7b9c0d1e2f3a4b");
  });

  it("accepts a UUID without dashes", () => {
    expect(uuidToBytes32("ABCDEF0123456789abcdef0123456789")).toBe(
      "0xabcdef0123456789abcdef0123456789"
    );
  });

  it("rejects strings that are not 32 hex chars", () => {
    expect(() => uuidToBytes32("not-a-uuid")).toThrow(/bytes32/);
    expect(() => uuidToBytes32("12345")).toThrow(/bytes32/);
  });

  it("converts a 64-char SHA-256 hash (with or without 0x) to bytes32", () => {
    const h = "A".repeat(64);
    expect(sha256ToBytes32(h)).toBe(`0x${"a".repeat(64)}`);
    expect(sha256ToBytes32(`0x${h}`)).toBe(`0x${"a".repeat(64)}`);
  });

  it("rejects hashes with the wrong length", () => {
    expect(() => sha256ToBytes32("abcd")).toThrow(/bytes32/);
    expect(() => sha256ToBytes32("z".repeat(64))).toThrow(/bytes32/);
  });
});

describe("URL / address helpers", () => {
  it("builds Sepolia Etherscan transaction links", () => {
    expect(etherscanTxUrl("0xabc")).toBe("https://sepolia.etherscan.io/tx/0xabc");
  });

  it("shortens addresses to 0x1234…5678 form", () => {
    expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe(
      "0x1234…5678"
    );
  });

  it("targets the Sepolia chain id (11155111)", () => {
    expect(SEPOLIA_CHAIN_ID).toBe(11155111);
  });
});

describe("hashMatchesOnChain", () => {
  const onChain = {
    productHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab" as const,
    manufacturer: "0x0000000000000000000000000000000000000001" as const,
    currentOwner: "0x0000000000000000000000000000000000000002" as const,
    status: 1,
    batchId: "BAT-X3F8AB",
    createdAt: 1n,
    lastUpdated: 1n,
    scanCount: 0n,
    recalled: false,
  };

  it("matches when the stored verification hash equals the anchored bytes32", () => {
    const upper = "A".repeat(64).replace(/A/g, "A"); // "AAA…"
    const oc = { ...onChain, productHash: `0x${upper.toLowerCase()}` as const };
    expect(hashMatchesOnChain(upper, oc)).toBe(true);
    expect(hashMatchesOnChain(`0x${upper}`, oc)).toBe(true);
  });

  it("does not match a different anchored hash", () => {
    const other = { ...onChain, productHash: "0xbbbb" as const };
    expect(hashMatchesOnChain("a".repeat(64), other)).toBe(false);
  });

  it("returns false for malformed off-chain hashes instead of throwing", () => {
    expect(hashMatchesOnChain("garbage", onChain)).toBe(false);
  });
});

describe("toWalletError mapping (ImplementationPlan 4.1 edge cases)", () => {
  it("maps user rejection / 4001 → cancelled", () => {
    expect(toWalletError(new Error("User rejected the request")).code).toBe("cancelled");
    expect(toWalletError(new Error("Request denied: 4001")).code).toBe("cancelled");
  });

  it("maps insufficient funds → insufficient_funds", () => {
    expect(toWalletError(new Error("insufficient funds for gas * price + value")).code).toBe(
      "insufficient_funds"
    );
  });

  it("maps chain mismatches → wrong_network", () => {
    expect(toWalletError(new Error("Unrecognized chain ID")).code).toBe("wrong_network");
    expect(toWalletError(new Error("wrong chain id, expected 11155111")).code).toBe("wrong_network");
  });

  it("maps reverts → reverted", () => {
    expect(toWalletError(new Error("execution reverted: Unauthorized")).code).toBe("reverted");
  });

  it("wraps unknown errors → rpc_error and preserves WalletError instances", () => {
    expect(toWalletError(new Error("mystery failure")).code).toBe("rpc_error");
    const original = new WalletError("no wallet", "no_wallet");
    expect(toWalletError(original)).toBe(original);
  });
});
