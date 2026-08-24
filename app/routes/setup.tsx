import { env } from "cloudflare:workers";
import { data, Form, redirect, useNavigation } from "react-router";
import { CheckCircle, EnvelopeSimple } from "@phosphor-icons/react";
import { useState } from "react";

import type { Route } from "./+types/setup";
import { AvatarPicker } from "../components/avatar-picker";
import { BannerPicker } from "../components/banner-picker";
import { assertSameOrigin, currentViewer, normalizeEmail, normalizeHandle, validHandle } from "../lib/auth.server";
import { createBetterAuth } from "../lib/better-auth.server";
import { isAvatarSeed, isAvatarStyle, isBannerSeed, isBannerStyle, storeDicebearAvatar, storeDicebearBanner } from "../lib/avatar.server";
import type { AvatarStyle } from "../lib/avatar";
import type { BannerStyle } from "../lib/banner";
import { getProfile } from "../lib/db.server";
import { getSiteSettings } from "../lib/site.server";
import { ensureDigestTick } from "../lib/digest.server";

const emailPattern = /^\S+@\S+\.\S+$/;

export function meta() {
  return [
    { title: "Set up Fikra" },
    { name: "description", content: "Configure the owner and public identity for this Fikra site." },
    { name: "robots", content: "noindex,nofollow" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [settings, viewer, profile] = await Promise.all([
    getSiteSettings(env.DB),
    currentViewer(request),
    getProfile(env.DB),
  ]);
  if (settings.configured) throw redirect("/");
  return { settings, viewer, profile };
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const settings = await getSiteSettings(env.DB);
  if (settings.configured) throw redirect("/");

  if (intent === "request-owner-link") {
    const email = normalizeEmail(String(form.get("email") || ""));
    if (!emailPattern.test(email) || email.length > 254) {
      return data({ ok: false as const, error: "Enter the owner email configured for this Worker." }, { status: 400 });
    }
    if (!env.OWNER_EMAIL || email !== normalizeEmail(env.OWNER_EMAIL)) {
      return data({ ok: false as const, error: "That email is not the configured owner email." }, { status: 403 });
    }
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
    const userId = existing?.id || crypto.randomUUID();
    const timestamp = Math.floor(Date.now() / 1000);
    if (!existing) {
      await env.DB.prepare(`INSERT INTO users
        (id,email,handle,display_name,role,status,created_at,updated_at)
        VALUES (?,?,'owner','Site Owner','owner','pending',?,?)`)
        .bind(userId, email, timestamp, timestamp).run();
    } else {
      await env.DB.prepare("UPDATE users SET role='owner', status=CASE WHEN status='active' THEN status ELSE 'pending' END, updated_at=? WHERE id=?")
        .bind(timestamp, userId).run();
    }
    try {
      await createBetterAuth(env).api.signInMagicLink({
        headers: request.headers,
        body: {
          email,
          name: "Site Owner",
          callbackURL: "/auth/complete?setup=1",
          errorCallbackURL: "/auth/complete?setup=1",
          metadata: { domainUserId: userId, handle: "owner", requestId: crypto.randomUUID() },
        },
      });
      return { ok: true as const, sent: true as const };
    } catch (error) {
      console.error(JSON.stringify({ event: "setup_owner_link_failed", error: error instanceof Error ? error.message : String(error) }));
      return data({ ok: false as const, error: "The sign-in link could not be sent. Check your email transport and try again." }, { status: 503 });
    }
  }

  if (intent === "complete-setup") {
    const viewer = await currentViewer(request);
    if (!viewer || viewer.role !== "owner") throw new Response("Not found", { status: 404 });
    const siteName = String(form.get("siteName") || "").trim();
    const siteDescription = String(form.get("siteDescription") || "").trim();
    const displayName = String(form.get("displayName") || "").trim();
    const handle = normalizeHandle(String(form.get("handle") || ""));
    const bio = String(form.get("bio") || "").trim();
    const locale = String(form.get("locale") || "en").trim();
    const timezone = String(form.get("timezone") || "UTC").trim();
    const avatarSeed = String(form.get("avatarSeed") || "");
    const avatarStyle = String(form.get("avatarStyle") || "");
    const bannerSeed = String(form.get("bannerSeed") || "");
    const bannerStyle = String(form.get("bannerStyle") || "");
    if (siteName.length < 2 || siteName.length > 80) return data({ ok: false as const, error: "Site name must be 2–80 characters." }, { status: 400 });
    if (siteDescription.length < 10 || siteDescription.length > 180) return data({ ok: false as const, error: "Description must be 10–180 characters." }, { status: 400 });
    if (displayName.length < 2 || displayName.length > 60) return data({ ok: false as const, error: "Display name must be 2–60 characters." }, { status: 400 });
    if (!validHandle(handle)) return data({ ok: false as const, error: "Handle must use 3–24 letters, numbers, or underscores." }, { status: 400 });
    if (bio.length > 240 || locale.length > 20 || timezone.length > 64) return data({ ok: false as const, error: "One of the profile fields is too long." }, { status: 400 });
    const taken = await env.DB.prepare("SELECT id FROM users WHERE handle=? AND id<>?").bind(handle, viewer.id).first();
    if (taken) return data({ ok: false as const, error: `@${handle} is already in use.` }, { status: 409 });

    let avatarKey: string | null = null;
    let bannerKey: string | null = null;
    if (avatarSeed || avatarStyle) {
      if (!isAvatarSeed(avatarSeed) || !isAvatarStyle(avatarStyle)) return data({ ok: false as const, error: "Choose a valid avatar." }, { status: 400 });
      avatarKey = (await storeDicebearAvatar(avatarStyle, avatarSeed)).key;
    }
    if (bannerSeed || bannerStyle) {
      if (!isBannerSeed(bannerSeed) || !isBannerStyle(bannerStyle)) return data({ ok: false as const, error: "Choose a valid banner." }, { status: 400 });
      bannerKey = (await storeDicebearBanner(bannerStyle, bannerSeed)).key;
    }
    const timestamp = Math.floor(Date.now() / 1000);
    await env.DB.batch([
      env.DB.prepare(`UPDATE profile SET display_name=?,handle=?,bio=?,avatar_key=COALESCE(?,avatar_key),avatar_seed=NULLIF(?,''),avatar_style=?,banner_key=COALESCE(?,banner_key),banner_seed=NULLIF(?,''),banner_style=NULLIF(?,''),updated_at=? WHERE id=1`)
        .bind(displayName, handle, bio, avatarKey, avatarSeed, avatarStyle || "voxel-art", bannerKey, bannerSeed, bannerStyle, timestamp),
      env.DB.prepare(`UPDATE users SET handle=?,display_name=?,bio=?,avatar_key=COALESCE(?,avatar_key),avatar_seed=NULLIF(?,''),avatar_style=?,role='owner',updated_at=? WHERE id=?`)
        .bind(handle, displayName, bio, avatarKey, avatarSeed, avatarStyle || "voxel-art", timestamp, viewer.id),
      env.DB.prepare(`UPDATE site_settings SET site_name=?,site_description=?,locale=?,timezone=?,setup_completed_at=?,updated_at=? WHERE id=1`)
        .bind(siteName, siteDescription, locale || "en", timezone || "UTC", timestamp, timestamp),
    ]);
    await ensureDigestTick(env);
    return redirect("/compose");
  }
  return data({ ok: false as const, error: "Unknown setup action." }, { status: 400 });
}

export default function Setup({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const [avatarSeed, setAvatarSeed] = useState<string | null>(null);
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>("voxel-bot");
  const [bannerSeed, setBannerSeed] = useState<string | null>(null);
  const [bannerStyle, setBannerStyle] = useState<BannerStyle>("shapes");
  const ownerReady = loaderData.viewer?.role === "owner";
  return <main className="setup-page">
    <div className="setup-brand"><span>F</span><strong>Fikra</strong></div>
    {!ownerReady ? <section className="setup-intro">
      <h1>Make this timeline yours.</h1>
      <p>One private link confirms the configured owner. Then you will set the public name, profile, avatar, and banner before anything is indexed.</p>
      {actionData && "sent" in actionData && actionData.sent ? <div className="setup-sent" role="status"><CheckCircle size={24} weight="fill" /><div><strong>Check your inbox.</strong><span>Open the newest link in this browser to continue setup.</span></div></div> : <Form method="post" className="setup-owner-form">
        <input type="hidden" name="intent" value="request-owner-link" />
        <label className="field"><span>Owner email</span><div><EnvelopeSimple size={19} /><input name="email" type="email" autoComplete="email" required placeholder="owner@example.com" /></div></label>
        {actionData && "error" in actionData && actionData.error ? <p className="form-error" role="alert">{actionData.error}</p> : null}
        <button className="primary-button" disabled={navigation.state !== "idle"}>{navigation.state !== "idle" ? "Sending…" : "Send owner sign-in link"}</button>
      </Form>}
    </section> : <section className="setup-wizard">
      <header><h1>Set the public identity.</h1><p>These are real settings, not demo content. You can change them later from Edit profile.</p></header>
      <Form method="post" className="setup-form">
        <input type="hidden" name="intent" value="complete-setup" />
        <div className="setup-fields">
          <label className="field"><span>Site name</span><input name="siteName" defaultValue="Fikra" required minLength={2} maxLength={80} /></label>
          <label className="field wide"><span>Site description</span><textarea name="siteDescription" defaultValue={loaderData.settings.siteDescription} required minLength={10} maxLength={180} rows={2} /></label>
          <label className="field"><span>Your name</span><input name="displayName" defaultValue={loaderData.profile.displayName} required minLength={2} maxLength={60} /></label>
          <label className="field"><span>Handle</span><input name="handle" defaultValue={loaderData.profile.handle} required pattern="[a-z0-9_]{3,24}" /></label>
          <label className="field wide"><span>Bio</span><textarea name="bio" defaultValue={loaderData.profile.bio} maxLength={240} rows={3} /></label>
          <label className="field"><span>Locale</span><input name="locale" defaultValue="en" maxLength={20} /></label>
          <label className="field"><span>Timezone</span><input name="timezone" defaultValue="UTC" maxLength={64} /></label>
        </div>
        <AvatarPicker selectedSeed={avatarSeed} selectedStyle={avatarStyle} onSelect={(style, seed) => { setAvatarStyle(style); setAvatarSeed(seed); }} label="Choose the owner avatar" />
        <BannerPicker selectedSeed={bannerSeed} selectedStyle={bannerStyle} onSelect={(style, seed) => { setBannerStyle(style); setBannerSeed(seed); }} />
        <input type="hidden" name="bannerSeed" value={bannerSeed || ""} />
        <input type="hidden" name="bannerStyle" value={bannerSeed ? bannerStyle : ""} />
        {actionData && "error" in actionData && actionData.error ? <p className="form-error" role="alert">{actionData.error}</p> : null}
        <button className="primary-button setup-finish" disabled={navigation.state !== "idle"}>{navigation.state !== "idle" ? "Saving…" : "Finish setup and start posting"}</button>
      </Form>
    </section>}
  </main>;
}
