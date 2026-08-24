export const CLIENT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

export interface ImagePreset { maxWidth: number; maxHeight: number; aspect?: number; quality?: number; zoom?: number; positionX?: number; positionY?: number }

export async function optimizeImage(file: File, preset: ImagePreset) {
  if (!CLIENT_IMAGE_TYPES.includes(file.type)) throw new Error("Choose a JPEG, PNG, WebP, or AVIF image.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Images must be under 8 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    let sourceX = 0, sourceY = 0, sourceWidth = bitmap.width, sourceHeight = bitmap.height;
    if (preset.aspect) {
      const sourceAspect = bitmap.width / bitmap.height;
      if (sourceAspect > preset.aspect) {
        sourceWidth = Math.round(bitmap.height * preset.aspect);
        sourceX = Math.round((bitmap.width - sourceWidth) / 2);
      } else {
        sourceHeight = Math.round(bitmap.width / preset.aspect);
        sourceY = Math.round((bitmap.height - sourceHeight) / 2);
      }
      const zoom = Math.max(1, Math.min(3, preset.zoom || 1));
      sourceWidth /= zoom;
      sourceHeight /= zoom;
      sourceX = (bitmap.width - sourceWidth) * Math.max(0, Math.min(1, preset.positionX ?? 0.5));
      sourceY = (bitmap.height - sourceHeight) * Math.max(0, Math.min(1, preset.positionY ?? 0.5));
    }
    const scale = Math.min(1, preset.maxWidth / sourceWidth, preset.maxHeight / sourceHeight);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("This browser cannot prepare the image.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", preset.quality ?? 0.84));
    if (!blob) throw new Error("The image could not be compressed.");
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.webp`, { type: "image/webp", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

export function replaceInputFile(input: HTMLInputElement, file: File) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
}

export function fileSavings(original: number, optimized: number) {
  if (optimized >= original) return `${Math.ceil(optimized / 1024)} KB prepared`;
  return `${Math.round((1 - optimized / original) * 100)}% smaller · ${Math.ceil(optimized / 1024)} KB`;
}
