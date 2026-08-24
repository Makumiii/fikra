import { env } from "cloudflare:workers";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 12_000;
const MAX_IMAGE_PIXELS = 40_000_000;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

function detectedImageType(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 16 && new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp" && /avif|avis/.test(new TextDecoder().decode(bytes.slice(8, 32)))) return "image/avif";
  return null;
}

function imageDimensions(bytes: Uint8Array, type: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === "image/png" && bytes.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20) };
  if (type === "image/jpeg") {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 1 >= bytes.length) break;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: (bytes[offset + 3] << 8) | bytes[offset + 4], width: (bytes[offset + 5] << 8) | bytes[offset + 6] };
      }
      offset += length;
    }
  }
  if (type === "image/webp" && bytes.length >= 30) {
    const chunk = new TextDecoder().decode(bytes.slice(12, 16));
    if (chunk === "VP8X") {
      return {
        width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      };
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      return {
        width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
        height: 1 + ((bytes[22] & 0xc0) >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
      };
    }
    if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
  }
  if (type === "image/avif") {
    const candidates: Array<{ width: number; height: number }> = [];
    for (let offset = 4; offset + 16 <= bytes.length; offset++) {
      if (bytes[offset] === 0x69 && bytes[offset + 1] === 0x73 && bytes[offset + 2] === 0x70 && bytes[offset + 3] === 0x65) {
        candidates.push({ width: view.getUint32(offset + 8), height: view.getUint32(offset + 12) });
      }
    }
    if (candidates.length) return candidates.reduce((largest, item) => item.width * item.height > largest.width * largest.height ? item : largest);
  }
  return null;
}

export async function prepareImageUpload(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || !value.size) return null;
  if (value.size > MAX_IMAGE_BYTES) return { ok: false as const, error: "Images must be under 8 MB." };
  if (!ALLOWED_IMAGE_TYPES.has(value.type)) return { ok: false as const, error: "Use a JPEG, PNG, WebP, or AVIF image." };
  const buffer = await value.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const detected = detectedImageType(bytes.slice(0, Math.min(bytes.byteLength, 32)));
  if (!detected || detected !== value.type) return { ok: false as const, error: "The file contents do not match a supported image type." };
  const dimensions = imageDimensions(bytes, detected);
  if (!dimensions || !dimensions.width || !dimensions.height) return { ok: false as const, error: "The image dimensions could not be verified." };
  if (dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION || dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
    return { ok: false as const, error: "The image dimensions are too large. Keep images under 40 megapixels." };
  }
  return { ok: true as const, buffer, contentType: detected, size: buffer.byteLength, ...dimensions };
}

export async function storePreparedImage(prepared: Extract<Awaited<ReturnType<typeof prepareImageUpload>>, { ok: true }>, purpose: "avatar" | "banner" | "cover") {
  const extension = prepared.contentType === "image/jpeg" ? "jpg" : prepared.contentType.split("/")[1];
  const key = `${purpose}-${crypto.randomUUID()}.${extension}`;
  await env.MEDIA.put(key, prepared.buffer, {
    httpMetadata: { contentType: prepared.contentType, cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { uploadedBy: "owner", purpose, sourceBytes: String(prepared.size), width: String(prepared.width), height: String(prepared.height) },
  });
  return { ok: true as const, key, contentType: prepared.contentType, size: prepared.size };
}

export async function storeImageUpload(value: FormDataEntryValue | null, purpose: "avatar" | "banner" | "cover") {
  const prepared = await prepareImageUpload(value);
  if (!prepared || !prepared.ok) return prepared;
  return storePreparedImage(prepared, purpose);
}
