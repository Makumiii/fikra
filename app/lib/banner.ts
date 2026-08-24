export const BANNER_STYLE_IDS = ["shapes", "waves", "patchwork", "planets"] as const;

export type BannerStyle = typeof BANNER_STYLE_IDS[number];

export const BANNER_STYLE_LABELS: Record<BannerStyle, string> = {
  shapes: "Shapes",
  waves: "Waves",
  patchwork: "Patchwork",
  planets: "Planets",
};

export const BANNER_GROUPS = [
  { id: "shapes", label: "Shapes", description: "Bold geometric colour fields" },
  { id: "waves", label: "Waves", description: "Soft flowing gradients" },
  { id: "patchwork", label: "Patchwork", description: "Playful tiled patterns" },
  { id: "planets", label: "Planets", description: "A tiny personal galaxy" },
] as const satisfies readonly { id: BannerStyle; label: string; description: string }[];

export function isBannerStyle(value: string): value is BannerStyle {
  return (BANNER_STYLE_IDS as readonly string[]).includes(value);
}

export function normalizeBannerStyle(value: unknown): BannerStyle | null {
  const style = String(value || "");
  return isBannerStyle(style) ? style : null;
}

export function bannerPreviewUrl(style: BannerStyle, seed: string) {
  return `/banners/${encodeURIComponent(style)}/${encodeURIComponent(seed)}.svg`;
}
