// Upload validation. The declared MIME type and file name come from the
// client and are never trusted: the type is decided by the file's bytes.

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export function detectImageType(b: Uint8Array): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif';
  return null;
}

export function isPdf(b: Uint8Array): boolean {
  return b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d;
}

export function decodeBase64(data: string): Uint8Array | null {
  const clean = data.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) return null;
  try {
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function encodeBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export type ImageCheck =
  | { ok: true; mediaType: ImageType; bytes: Uint8Array; base64: string }
  | { ok: false; reason: 'not_base64' | 'too_large' | 'unsupported_type' | 'empty' };

export function validateImage(data: unknown): ImageCheck {
  if (typeof data !== 'string' || data.length === 0) return { ok: false, reason: 'empty' };
  // cheap size pre-check before decoding
  if (data.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 64) return { ok: false, reason: 'too_large' };
  const bytes = decodeBase64(data);
  if (!bytes) return { ok: false, reason: 'not_base64' };
  if (bytes.length === 0) return { ok: false, reason: 'empty' };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, reason: 'too_large' };
  const mediaType = detectImageType(bytes);
  if (!mediaType) return { ok: false, reason: 'unsupported_type' };
  return { ok: true, mediaType, bytes, base64: encodeBase64(bytes) };
}

export type PdfCheck =
  | { ok: true; bytes: Uint8Array; base64: string }
  | { ok: false; reason: 'not_base64' | 'too_large' | 'not_pdf' | 'empty' };

export function validatePdf(data: unknown): PdfCheck {
  if (typeof data !== 'string' || data.length === 0) return { ok: false, reason: 'empty' };
  if (data.length > Math.ceil((MAX_PDF_BYTES * 4) / 3) + 64) return { ok: false, reason: 'too_large' };
  const bytes = decodeBase64(data);
  if (!bytes) return { ok: false, reason: 'not_base64' };
  if (bytes.length > MAX_PDF_BYTES) return { ok: false, reason: 'too_large' };
  if (!isPdf(bytes)) return { ok: false, reason: 'not_pdf' };
  return { ok: true, bytes, base64: encodeBase64(bytes) };
}

export function extensionFor(t: ImageType): string {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[t];
}
