import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

function hashPayload(payload: string): string {
  return bytesToHex(sha256(utf8ToBytes(payload)));
}

export function generateProductHash(data: {
  productCode: string;
  name: string;
  brand: string;
  manufacturerId: string;
  timestamp: string;
}): string {
  const payload = `${data.productCode}|${data.name}|${data.brand}|${data.manufacturerId}|${data.timestamp}`;
  return hashPayload(payload);
}

// NOTE: Event hash generation is intentionally NOT provided here.
// Per TechSpec §4.2 / Rules R16, event hashes are computed SERVER-SIDE inside
// record_supply_chain_event() — any client-computed hash would be forgeable
// (no server secret, all fields knowable). Client-submitted hashes are discarded.

// NOTE: Event and transfer hash generation are intentionally NOT provided here.
// Event hashes are computed SERVER-SIDE inside record_supply_chain_event() and
// transfer hashes inside transfer_product_ownership() (TechSpec §4.2/§4.3, Rules
// R16) — any client-computed hash would be forgeable (no server secret, all
// fields knowable). Client-submitted hashes are discarded by both RPCs.

// Cryptographically-random code generator. The alphabet has 36 chars and
// 36 × 6 = 216, so bytes < 216 map uniformly onto it; bytes ≥ 216 are
// rejection-sampled away. This removes both Math.random's modulo bias and its
// predictability (audit MEDIUM #13 — codes must not be guessable/enumerable).
function randomCode(prefix: string, length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = new Uint8Array(length);
  let code = prefix;
  for (let i = 0; i < length; i++) {
    crypto.getRandomValues(bytes.subarray(i, i + 1));
    while (bytes[i] >= 216) {
      crypto.getRandomValues(bytes.subarray(i, i + 1));
    }
    code += chars[bytes[i] % 36];
  }
  return code;
}

export function generateProductCode(): string {
  return randomCode("PRD-", 8);
}

export function generateBatchCode(): string {
  return randomCode("BAT-", 6);
}

export function generateQRData(productCode: string, hash: string): string {
  return `${productCode}::${hash.substring(0, 16)}`;
}
