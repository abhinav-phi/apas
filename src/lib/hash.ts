import CryptoJS from "crypto-js";

export function generateProductHash(data: {
  productCode: string;
  name: string;
  brand: string;
  manufacturerId: string;
  timestamp: string;
}): string {
  const payload = `${data.productCode}|${data.name}|${data.brand}|${data.manufacturerId}|${data.timestamp}`;
  return CryptoJS.SHA256(payload).toString();
}

export function generateEventHash(data: {
  productId: string;
  eventType: string;
  actorId: string;
  timestamp: string;
  previousHash?: string;
}): string {
  const payload = `${data.productId}|${data.eventType}|${data.actorId}|${data.timestamp}|${data.previousHash || "genesis"}`;
  return CryptoJS.SHA256(payload).toString();
}

export function generateTransferHash(data: {
  productId: string;
  fromUserId: string;
  toUserId: string;
  timestamp: string;
}): string {
  const payload = `${data.productId}|${data.fromUserId}|${data.toUserId}|${data.timestamp}`;
  return CryptoJS.SHA256(payload).toString();
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
