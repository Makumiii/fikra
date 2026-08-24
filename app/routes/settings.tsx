import { env } from "cloudflare:workers";
import { Form, Link, useNavigation } from "react-router";
import { Gear, SignOut } from "@phosphor-icons/react";

import type { Route } from "./+types/settings";
import { assertSameOrigin, currentViewer, requireViewer } from "../lib/auth.server";
import { getTopics } from "../lib/db.server";
import { isAvatarSeed, isAvatarStyle, storeDicebearAvatar } from "../lib/avatar.server";
import { normalizeAvatarStyle, type AvatarStyle } from "../lib/avatar";
import { AvatarPicker } from "../components/avatar-picker";
import { useState } from "react";

export async function loader({ request }: Route.LoaderArgs) {
  const viewer = await currentViewer(request);
  if (!viewer) return { signedIn: false, viewer: null, user: null, topics: [], chosen: [] as string[] };
  const [user, chosen] = await Promise.all([
    env.DB.prepare("SELECT display_name, bio, avatar_key, avatar_seed, avatar_style, digest_frequency, notify_replies, notify_mentions, notify_new_posts, topics_only FROM users WHERE id = ?").bind(viewer.id).first<Record<string, unknown>>(),
    env.DB.prepare("SELECT topic_id FROM user_topics WHERE user_id = ?").bind(viewer.id).all<{ topic_id: string }>(),
  ]);
  return { signedIn: true, viewer, user, topics: await getTopics(env.DB), chosen: chosen.results.map((row) => row.topic_id) };
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const viewer = await requireViewer(request);
  const form = await request.formData();
  const display = String(form.get("displayName") || "").trim().slice(0, 50);
  const bio = String(form.get("bio") || "").trim().slice(0, 160);
  const digest = ["instant", "daily", "weekly", "off"].includes(String(form.get("digest"))) ? String(form.get("digest")) : "weekly";
  const avatarMode = String(form.get("avatarMode") || "keep");
  const avatarSeed = String(form.get("avatarSeed") || "");
  const avatarStyle = String(form.get("avatarStyle") || "");
  if (!["keep", "dicebear", "remove"].includes(avatarMode)) return { ok: false as const, error: "That avatar choice is not supported." };
  if (viewer.role === "owner" && avatarMode !== "keep") return { ok: false as const, error: "Owner profile media is managed from Edit profile." };
  if (avatarMode === "dicebear" && (!isAvatarSeed(avatarSeed) || !isAvatarStyle(avatarStyle))) return { ok: false as const, error: "Choose a valid avatar." };
  let generatedAvatar: { key: string; seed: string; style: AvatarStyle } | null = null;
  if (avatarMode === "dicebear") {
    try { generatedAvatar = await storeDicebearAvatar(avatarStyle as AvatarStyle, avatarSeed); }
    catch { return { ok: false as const, error: "The avatar could not be prepared. Try another one." }; }
  }
  const currentUser = await env.DB.prepare("SELECT avatar_key, avatar_seed, avatar_style FROM users WHERE id = ?").bind(viewer.id).first<{ avatar_key: string | null; avatar_seed: string | null; avatar_style: string | null }>();
  const avatarKey = generatedAvatar?.key || (avatarMode === "remove" ? null : currentUser?.avatar_key || null);
  const selectedAvatarSeed = generatedAvatar?.seed || (avatarMode === "remove" ? null : currentUser?.avatar_seed || null);
  const selectedAvatarStyle = generatedAvatar?.style || (avatarMode === "remove" ? normalizeAvatarStyle(currentUser?.avatar_style) : normalizeAvatarStyle(currentUser?.avatar_style));
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET display_name=?, bio=?, avatar_key=?, avatar_seed=?, avatar_style=?, digest_frequency=?, notify_replies=?, notify_mentions=?, notify_new_posts=?, topics_only=?, updated_at=unixepoch() WHERE id=?")
      .bind(display || viewer.handle, bio, avatarKey, selectedAvatarSeed, selectedAvatarStyle, digest, form.get("notifyReplies") ? 1 : 0, form.get("notifyMentions") ? 1 : 0, form.get("notifyPosts") ? 1 : 0, form.get("topicsOnly") ? 1 : 0, viewer.id),
    env.DB.prepare("DELETE FROM user_topics WHERE user_id = ?").bind(viewer.id),
  ]);
  const topicIds = [...new Set(form.getAll("topics").map(String))];
  if (topicIds.length) await env.DB.batch(topicIds.map((id) => env.DB.prepare("INSERT OR IGNORE INTO user_topics (user_id, topic_id, created_at) SELECT ?, id, unixepoch() FROM topics WHERE id = ?").bind(viewer.id, id)));
  return { ok: true as const };
}

function ToggleRow({ name, title, detail, checked }: { name: string; title: string; detail: string; checked: boolean }) {
  return <label className="preference-row"><span><strong>{title}</strong><small>{detail}</small></span><input type="checkbox" name={name} defaultChecked={checked} /><i aria-hidden="true" /></label>;
}

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const user = loaderData.user;
  const [avatarSeed, setAvatarSeed] = useState<string | null>(user?.avatar_seed ? String(user.avatar_seed) : null);
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>(normalizeAvatarStyle(user?.avatar_style));
  const [avatarMode, setAvatarMode] = useState<"keep" | "dicebear" | "remove">("keep");
  if (!loaderData.signedIn || !loaderData.viewer) return <div><header className="sticky-page-header"><Gear size={22} /><div><strong>Settings</strong></div></header><div className="empty-state"><h2>Settings need your handle.</h2><p>Sign in to manage your identity, email rhythm, and topics.</p><Link className="primary-button" to="/login">Log in with email</Link></div></div>;

  return <div className="settings-page">
    <header className="sticky-page-header"><Gear size={22} /><div><strong>Settings</strong><small>@{loaderData.viewer.handle}</small></div></header>
    <Form method="post" className="settings-form distilled-settings">
      <section className="settings-block settings-identity" aria-labelledby="identity-heading">
        <div className="settings-heading"><h2 id="identity-heading">Public identity</h2><p>Shown beside your replies. Your email stays private.</p></div>
        <label className="field"><span>Display name</span><input name="displayName" defaultValue={String(user?.display_name || "")} maxLength={50} /></label>
        <label className="field"><span>Bio</span><textarea name="bio" defaultValue={String(user?.bio || "")} maxLength={160} rows={2} /></label>
        {loaderData.viewer.role === "owner" ? <p className="settings-media-note">Profile photo, banner, and voxel avatar live in <Link to="/">Edit profile</Link>.</p> : <>
          <input type="hidden" name="avatarMode" value={avatarMode} />
          <input type="hidden" name="avatarStyle" value={avatarStyle} />
          <AvatarPicker selectedSeed={avatarSeed} selectedStyle={avatarStyle} onSelect={(style, seed) => { setAvatarStyle(style); setAvatarSeed(seed); setAvatarMode("dicebear"); }} label="Profile avatar" />
          {user?.avatar_key ? <button type="button" className="text-button danger avatar-remove-button" onClick={() => { setAvatarSeed(null); setAvatarMode("remove"); }}>Remove current avatar</button> : null}
        </>}
      </section>

      <section className="settings-block" aria-labelledby="email-heading">
        <div className="settings-heading"><h2 id="email-heading">Email</h2><p>Choose the rhythm. Change it anytime.</p></div>
        <label className="digest-row"><span><strong>New writing</strong><small>Posts and articles from the site owner</small></span><select name="digest" defaultValue={String(user?.digest_frequency || "weekly")} aria-label="New writing email frequency"><option value="instant">Instant</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="off">Off</option></select></label>
        <ToggleRow name="notifyPosts" title="New post alerts" detail="Include new posts in your email rhythm" checked={Boolean(user?.notify_new_posts)} />
        <ToggleRow name="notifyReplies" title="Replies" detail="When someone replies to you" checked={Boolean(user?.notify_replies)} />
        <ToggleRow name="notifyMentions" title="Mentions" detail="When the owner mentions your handle" checked={Boolean(user?.notify_mentions)} />
      </section>

      <section className="settings-block" aria-labelledby="topics-heading">
        <div className="settings-heading"><h2 id="topics-heading">Topics</h2><p>Pick the subjects you want in your inbox.</p></div>
        <fieldset className="topic-picker settings-topics"><legend className="sr-only">Email topics</legend>{loaderData.topics.map((topic) => <label key={topic.id}><input type="checkbox" name="topics" value={topic.id} defaultChecked={loaderData.chosen.includes(topic.id)} /><span>#{topic.name}</span></label>)}</fieldset>
        <ToggleRow name="topicsOnly" title="Selected topics only" detail="Filter post emails using the choices above" checked={Boolean(user?.topics_only)} />
      </section>

      <div className="settings-actions">{actionData?.ok ? <p className="save-confirmation" role="status">Saved</p> : actionData?.error ? <p className="form-error" role="alert">{actionData.error}</p> : null}<button className="primary-button" disabled={navigation.state !== "idle"}>{navigation.state !== "idle" ? "Saving…" : "Save changes"}</button></div>
    </Form>
    <Form method="post" action="/auth/logout" className="logout-row distilled-logout"><button className="text-button danger"><SignOut size={18} />Sign out</button></Form>
  </div>;
}
