// Client-side image downscale before upload (Rules R26: stored images ≤1MB).
// Files already within budget pass through untouched. Larger ones are drawn to
// a canvas capped at maxDim and re-encoded — WebP first (keeps alpha, compresses
// far better than PNG), falling back to JPEG when the browser can't encode
// WebP — stepping quality down until the blob fits the budget.

export const MAX_UPLOAD_BYTES = 1024 * 1024; // 1MB

const DEFAULT_MAX_DIM = 1280;
const QUALITY_STEPS = [0.9, 0.8, 0.7, 0.6, 0.5];

export async function resizeImage(
  file: File,
  opts: { maxDim?: number; maxBytes?: number } = {}
): Promise<Blob> {
  const maxBytes = opts.maxBytes ?? MAX_UPLOAD_BYTES;
  if (file.size <= maxBytes) return file;

  const img = await loadImage(file);
  const maxDim = opts.maxDim ?? DEFAULT_MAX_DIM;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  const preferred = file.type === "image/png" || file.type === "image/webp" ? "image/webp" : "image/jpeg";
  const types = preferred === "image/jpeg" ? ["image/jpeg"] : [preferred, "image/jpeg"];

  let last: Blob | null = null;
  for (const type of types) {
    for (const quality of QUALITY_STEPS) {
      const blob = await toBlob(canvas, type, quality);
      if (!blob) break; // this type unsupported — try the fallback type
      last = blob;
      if (blob.size <= maxBytes) return blob;
    }
  }
  // Best effort above the floor — the caller decides whether to reject
  return last ?? file;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}
