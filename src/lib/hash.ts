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

export function generateEventHash(data: {
  productId: string;
  eventType: string;
  actorId: string;
  timestamp: string;
  previousHash?: string;
}): string {
  const payload = `${data.productId}|${data.eventType}|${data.actorId}|${data.timestamp}|${data.previousHash || "genesis"}`;
  return hashPayload(payload);
}

export function generateTransferHash(data: {
  productId: string;
  fromUserId: string;
  toUserId: string;
  timestamp: string;
}): string {
  const payload = `${data.productId}|${data.fromUserId}|${data.toUserId}|${data.timestamp}`;
  return hashPayload(payload);
}

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
