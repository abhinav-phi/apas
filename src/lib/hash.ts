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

export function generateProductCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "PRD-";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function generateBatchCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "BAT-";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function generateQRData(productCode: string, hash: string): string {
  return `${productCode}::${hash.substring(0, 16)}`;
}
