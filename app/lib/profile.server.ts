import { env } from "cloudflare:workers";
import { prepareImageUpload, storePreparedImage } from "./media.server";
import { isAvatarSeed, isAvatarStyle, isBannerSeed, isBannerStyle, storeDicebearAvatar, storeDicebearBanner } from "./avatar.server";
import { normalizeAvatarStyle, type AvatarStyle } from "./avatar";
import { normalizeBannerStyle, type BannerStyle } from "./banner";

export async function updateOwnerProfile(form: FormData, ownerId: string) {
  const displayName = String(form.get("displayName") || "").trim().slice(0, 60);
  const handle = String(form.get("handle") || "").trim().replace(/^@/, "").toLowerCase();
  const bio = String(form.get("bio") || "").trim().slice(0, 200);
  const location = String(form.get("location") || "").trim().slice(0, 80) || null;
  const linkUrl = String(form.get("linkUrl") || "").trim();
  const linkLabel = String(form.get("linkLabel") || "").trim().slice(0, 50);
  const removeAvatar = form.get("removeAvatar") === "1";
  const removeBanner = form.get("removeBanner") === "1";
  const requestedAvatarMode = String(form.get("avatarMode") || "");
  const avatarMode = ["keep", "upload", "dicebear", "remove"].includes(requestedAvatarMode)
    ? requestedAvatarMode as "keep" | "upload" | "dicebear" | "remove"
    : removeAvatar ? "remove" : form.get("avatar") instanceof File && (form.get("avatar") as File).size ? "upload" : "keep";
  const requestedBannerMode = String(form.get("bannerMode") || "");
  const bannerMode = ["keep", "upload", "dicebear", "remove"].includes(requestedBannerMode)
    ? requestedBannerMode as "keep" | "upload" | "dicebear" | "remove"
    : removeBanner ? "remove" : form.get("banner") instanceof File && (form.get("banner") as File).size ? "upload" : "keep";
  const avatarSeed = String(form.get("avatarSeed") || "");
  const avatarStyle = String(form.get("avatarStyle") || "");
  const bannerSeed = String(form.get("bannerSeed") || "");
  const bannerStyle = String(form.get("bannerStyle") || "");
  const existingProfile = await env.DB.prepare("SELECT avatar_key,avatar_seed,avatar_style,banner_key,banner_seed,banner_style,about_intro,about_heading,about_body FROM profile WHERE id=1").first<{ avatar_key: string | null; avatar_seed: string | null; avatar_style: string | null; banner_key: string | null; banner_seed: string | null; banner_style: string | null; about_intro: string; about_heading: string; about_body: string }>();
  const aboutIntro = form.has("aboutIntro") ? String(form.get("aboutIntro") || "").trim().slice(0, 500) : existingProfile?.about_intro || "";
  const aboutHeading = form.has("aboutHeading") ? String(form.get("aboutHeading") || "").trim().slice(0, 80) : existingProfile?.about_heading || "";
  const aboutBody = form.has("aboutBody") ? String(form.get("aboutBody") || "").trim().slice(0, 1000) : existingProfile?.about_body || "";
  if (!displayName) return { ok: false as const, error: "Your display name cannot be empty." };
  if (!/^[a-z0-9_]{3,24}$/.test(handle)) return { ok: false as const, error: "Use 3–24 lowercase letters, numbers, or underscores for the handle." };
  if (linkUrl && !linkUrl.startsWith("https://")) return { ok: false as const, error: "Your link must start with https://" };
  if (avatarMode === "dicebear" && (!isAvatarSeed(avatarSeed) || !isAvatarStyle(avatarStyle))) return { ok: false as const, error: "Choose a valid avatar." };
  if (bannerMode === "dicebear" && (!isBannerSeed(bannerSeed) || !isBannerStyle(bannerStyle))) return { ok: false as const, error: "Choose a valid banner." };

  const [preparedAvatar, preparedBanner] = await Promise.all([
    avatarMode === "upload" ? prepareImageUpload(form.get("avatar")) : null,
    bannerMode === "upload" ? prepareImageUpload(form.get("banner")) : null,
  ]);
  if (preparedAvatar && !preparedAvatar.ok) return preparedAvatar;
  if (preparedBanner && !preparedBanner.ok) return preparedBanner;
  const [avatar, banner, dicebearAvatar, dicebearBanner] = await Promise.all([
    preparedAvatar ? storePreparedImage(preparedAvatar, "avatar") : null,
    preparedBanner ? storePreparedImage(preparedBanner, "banner") : null,
    avatarMode === "dicebear" ? storeDicebearAvatar(avatarStyle as AvatarStyle, avatarSeed) : null,
    bannerMode === "dicebear" ? storeDicebearBanner(bannerStyle as BannerStyle, bannerSeed) : null,
  ]);
  const avatarKey = avatar?.key || dicebearAvatar?.key || (avatarMode === "remove" ? null : existingProfile?.avatar_key || null);
  const selectedAvatarSeed = dicebearAvatar?.seed || (avatarMode === "remove" || avatarMode === "upload" ? null : existingProfile?.avatar_seed || null);
  const selectedAvatarStyle = dicebearAvatar?.style || normalizeAvatarStyle(existingProfile?.avatar_style);
  const bannerKey = banner?.key || dicebearBanner?.key || (bannerMode === "remove" ? null : existingProfile?.banner_key || null);
  const selectedBannerSeed = dicebearBanner?.seed || (bannerMode === "remove" || bannerMode === "upload" ? null : existingProfile?.banner_seed || null);
  const selectedBannerStyle = dicebearBanner?.style || (bannerMode === "remove" || bannerMode === "upload" ? null : normalizeBannerStyle(existingProfile?.banner_style));
  const statements = [
    env.DB.prepare("UPDATE profile SET display_name=?,handle=?,bio=?,location=?,avatar_key=?,avatar_seed=?,avatar_style=?,banner_key=?,banner_seed=?,banner_style=?,about_intro=?,about_heading=?,about_body=?,updated_at=unixepoch() WHERE id=1")
      .bind(displayName, handle, bio, location, avatarKey, selectedAvatarSeed, selectedAvatarStyle, bannerKey, selectedBannerSeed, selectedBannerStyle, aboutIntro, aboutHeading, aboutBody),
    env.DB.prepare("UPDATE users SET display_name=?,handle=?,bio=?,avatar_key=?,avatar_seed=?,avatar_style=?,banner_key=?,updated_at=unixepoch() WHERE id=?")
      .bind(displayName, handle, bio, avatarKey, selectedAvatarSeed, selectedAvatarStyle, bannerKey, ownerId),
  ];
  if (linkUrl) {
    statements.push(env.DB.prepare("INSERT INTO profile_links(id,label,url,position,created_at) VALUES('profile-link-main',?,?,0,unixepoch()) ON CONFLICT(id) DO UPDATE SET label=excluded.label,url=excluded.url")
      .bind(linkLabel || new URL(linkUrl).hostname, linkUrl));
  } else {
    statements.push(env.DB.prepare("DELETE FROM profile_links WHERE id='profile-link-main'"));
  }
  try {
    await env.DB.batch(statements);
  } catch (error) {
    await Promise.all([avatar?.key, banner?.key, dicebearBanner?.key].filter((key): key is string => Boolean(key)).map((key) => env.MEDIA.delete(key).catch(() => undefined)));
    if (String(error).toLowerCase().includes("unique")) return { ok: false as const, error: "That handle is already in use." };
    throw error;
  }
  const staleKeys = [
    existingProfile?.avatar_key && existingProfile.avatar_key !== avatarKey && !existingProfile.avatar_key.startsWith("avatar-dicebear-") ? existingProfile.avatar_key : null,
    existingProfile?.banner_key && existingProfile.banner_key !== bannerKey ? existingProfile.banner_key : null,
  ].filter((key): key is string => Boolean(key));
  await Promise.all(staleKeys.map((key) => env.MEDIA.delete(key).catch((error) => {
    console.error(JSON.stringify({ event: "orphaned_profile_media", key, error: String(error) }));
  })));
  return { ok: true as const };
}
