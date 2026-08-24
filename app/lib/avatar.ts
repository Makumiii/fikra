export const AVATAR_STYLE_IDS = [
  "voxel-bot",
  "pixel-art",
  "personas",
  "moods",
  "fun-emoji",
  "critters",
  "voxel-art",
] as const;

export type AvatarStyle = typeof AVATAR_STYLE_IDS[number];

export const AVATAR_PICKER_STYLE_IDS = [
  "voxel-bot",
  "pixel-art",
  "personas",
  "moods",
  "fun-emoji",
  "critters",
] as const satisfies readonly AvatarStyle[];

export const AVATAR_STYLE_LABELS: Record<AvatarStyle, string> = {
  "voxel-bot": "Voxel bot",
  "pixel-art": "Pixel art",
  personas: "Personas",
  moods: "Moods",
  "fun-emoji": "Fun emoji",
  critters: "Critters",
  "voxel-art": "Voxel art",
};

export const AVATAR_GROUPS = [
  {
    id: "bots",
    label: "Bots",
    styles: [{ id: "voxel-bot", label: "Voxel bot", description: "Chunky little robots" }],
  },
  {
    id: "pixel",
    label: "Pixel",
    styles: [{ id: "pixel-art", label: "Pixel art", description: "Tiny retro characters" }],
  },
  {
    id: "people",
    label: "People",
    styles: [{ id: "personas", label: "Personas", description: "Clean illustrated faces" }],
  },
  {
    id: "moods",
    label: "Moods",
    styles: [
      { id: "moods", label: "Moods", description: "Expressive illustrated faces" },
      { id: "fun-emoji", label: "Fun emoji", description: "Bright emoji characters" },
    ],
  },
  {
    id: "critters",
    label: "Critters",
    styles: [{ id: "critters", label: "Critters", description: "Odd little creatures" }],
  },
] as const;

export function isAvatarStyle(value: string): value is AvatarStyle {
  return (AVATAR_STYLE_IDS as readonly string[]).includes(value);
}

export function normalizeAvatarStyle(value: unknown): AvatarStyle {
  const style = String(value || "");
  return isAvatarStyle(style) ? style : "voxel-art";
}

export function avatarPreviewUrl(style: AvatarStyle, seed: string) {
  return `/avatars/${encodeURIComponent(style)}/${encodeURIComponent(seed)}.svg`;
}
