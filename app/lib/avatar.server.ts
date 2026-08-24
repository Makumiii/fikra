import { Avatar, Style } from "@dicebear/core";
import critters from "@dicebear/styles/critters.json";
import funEmoji from "@dicebear/styles/fun-emoji.json";
import moods from "@dicebear/styles/moods.json";
import patchwork from "@dicebear/styles/patchwork.json";
import personas from "@dicebear/styles/personas.json";
import pixelArt from "@dicebear/styles/pixel-art.json";
import planets from "@dicebear/styles/planets.json";
import shapes from "@dicebear/styles/shapes.json";
import voxelBot from "@dicebear/styles/voxel-bot.json";
import voxelArt from "@dicebear/styles/voxel-art.json";
import waves from "@dicebear/styles/waves.json";
import { env } from "cloudflare:workers";
import { sha256 } from "./crypto.server";
import { AVATAR_STYLE_LABELS, isAvatarStyle, type AvatarStyle } from "./avatar";
import { BANNER_STYLE_LABELS, isBannerStyle, type BannerStyle } from "./banner";
export { avatarPreviewUrl, isAvatarStyle } from "./avatar";
export { bannerPreviewUrl, isBannerStyle } from "./banner";

const avatarStyles: Record<AvatarStyle, Style> = {
  "voxel-bot": new Style(voxelBot),
  "pixel-art": new Style(pixelArt),
  personas: new Style(personas),
  moods: new Style(moods),
  "fun-emoji": new Style(funEmoji),
  critters: new Style(critters),
  "voxel-art": new Style(voxelArt),
};
const bannerStyles: Record<BannerStyle, Style> = {
  shapes: new Style(shapes),
  waves: new Style(waves),
  patchwork: new Style(patchwork),
  planets: new Style(planets),
};
const AVATAR_SEED_PATTERN = /^(?:vx|av)_[a-zA-Z0-9_-]{16,80}$/;
const BANNER_SEED_PATTERN = /^bn_[a-zA-Z0-9_-]{16,80}$/;
const MAX_AVATAR_BYTES = 512 * 1024;
const MAX_BANNER_BYTES = 512 * 1024;

export function isAvatarSeed(value: string) {
  return AVATAR_SEED_PATTERN.test(value);
}

export function renderDicebearAvatar(style: AvatarStyle, seed: string) {
  if (!isAvatarStyle(style) || !isAvatarSeed(seed)) throw new Error("Invalid avatar selection.");
  const svg = new Avatar(avatarStyles[style], { seed, size: 256, title: `${AVATAR_STYLE_LABELS[style]} avatar` }).toString();
  if (new TextEncoder().encode(svg).byteLength > MAX_AVATAR_BYTES || /<script|<foreignObject|\son[a-z]+\s*=|javascript:/i.test(svg)) {
    throw new Error("Generated avatar was rejected.");
  }
  return svg;
}

export async function storeDicebearAvatar(style: AvatarStyle, seed: string) {
  const svg = renderDicebearAvatar(style, seed);
  const key = `avatar-dicebear-${style}-${await sha256(`${style}:${seed}`)}.svg`;
  await env.MEDIA.put(key, svg, {
    httpMetadata: { contentType: "image/svg+xml", contentDisposition: "inline", cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { purpose: "avatar", source: `dicebear-${style}`, style, seed },
  });
  return { key, seed, style };
}

export function avatarResponse(style: AvatarStyle, seed: string) {
  const svg = renderDicebearAvatar(style, seed);
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function renderVoxelAvatar(seed: string) {
  return renderDicebearAvatar("voxel-art", seed);
}

export async function storeVoxelAvatar(seed: string) {
  return storeDicebearAvatar("voxel-art", seed);
}

export function isBannerSeed(value: string) {
  return BANNER_SEED_PATTERN.test(value);
}

export function renderDicebearBanner(style: BannerStyle, seed: string) {
  if (!isBannerStyle(style) || !isBannerSeed(seed)) throw new Error("Invalid banner selection.");
  const svg = new Avatar(bannerStyles[style], { seed, title: `${BANNER_STYLE_LABELS[style]} banner` }).toString();
  const bannerSvg = svg.replace(/^<svg /, '<svg width="1200" height="400" preserveAspectRatio="none" ');
  if (new TextEncoder().encode(bannerSvg).byteLength > MAX_BANNER_BYTES || /<script|<foreignObject|\son[a-z]+\s*=|javascript:/i.test(bannerSvg)) {
    throw new Error("Generated banner was rejected.");
  }
  return bannerSvg;
}

export async function storeDicebearBanner(style: BannerStyle, seed: string) {
  const svg = renderDicebearBanner(style, seed);
  const key = `banner-dicebear-${style}-${await sha256(`${style}:${seed}`)}.svg`;
  await env.MEDIA.put(key, svg, {
    httpMetadata: { contentType: "image/svg+xml", contentDisposition: "inline", cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { purpose: "banner", source: `dicebear-${style}`, style, seed },
  });
  return { key, seed, style };
}

export function bannerResponse(style: BannerStyle, seed: string) {
  const svg = renderDicebearBanner(style, seed);
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
