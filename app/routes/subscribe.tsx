import { env } from "cloudflare:workers";
import { data, Form, Link, useNavigation } from "react-router";
import { At, BellRinging, BookOpenText, EnvelopeSimple, LockKey } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import type { Route } from "./+types/subscribe";
import { assertSameOrigin, normalizeEmail, normalizeHandle, validHandle } from "../lib/auth.server";
import { createBetterAuth } from "../lib/better-auth.server";
import { rateLimit, rateLimitSubject } from "../lib/rate-limit.server";
import { isAvatarSeed, isAvatarStyle } from "../lib/avatar.server";
import type { AvatarStyle } from "../lib/avatar";
import { AvatarPicker } from "../components/avatar-picker";

export function meta() { return [{ title: "Subscribe | Fikra" }, { name: "description", content: "Claim a handle, choose what reaches your inbox, and join this independent timeline." }, { name:"robots",content:"noindex,follow" }]; }

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  await rateLimit(request, "magic-link", 5, 15 * 60);
  if (env.EMAIL_TRANSPORT === "smtp" && (!env.SMTP_HOST || !env.SMTP_USERNAME || !env.SMTP_PASSWORD || !env.SMTP_FROM_EMAIL)) {
    return data({ ok: false as const, error: "Email sign-in is being connected. Please try again shortly." }, { status: 503 });
  }
  const form = await request.formData();
  if (String(form.get("company") || "")) return { ok: true as const };
  const email = normalizeEmail(String(form.get("email") || ""));
  const handle = normalizeHandle(String(form.get("handle") || ""));
  const avatarSeed = String(form.get("avatarSeed") || "");
  const avatarStyle = String(form.get("avatarStyle") || "");
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return { ok: false as const, error: "Enter a real email address." };
  if (!validHandle(handle)) return { ok: false as const, error: "Use 3 to 24 letters, numbers, or underscores for your handle." };
  await Promise.all([
    rateLimitSubject(email, "magic-link-email", 3, 15 * 60),
    rateLimitSubject(handle, "magic-link-handle", 5, 15 * 60),
  ]);

  const byEmail = await env.DB.prepare("SELECT id, handle, status FROM users WHERE email = ?").bind(email).first<{ id: string; handle: string; status: string }>();
  const byHandle = await env.DB.prepare("SELECT id, email FROM users WHERE handle = ?").bind(handle).first<{ id: string; email: string }>();
  if (byHandle && byHandle.email.toLowerCase() !== email) return { ok: false as const, error: `@${handle} has already been claimed.` };
  if (byEmail && !["pending", "active"].includes(byEmail.status)) return { ok: false as const, error: "This subscription is not available right now." };
  if (byEmail?.status === "active") return { ok: false as const, error: "That email already has an account. Log in with email instead." };
  if (byEmail?.status !== "active" && (!isAvatarSeed(avatarSeed) || !isAvatarStyle(avatarStyle))) return { ok: false as const, error: "Choose an avatar before claiming your handle." };

  const userId = byEmail?.id || crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  if (!byEmail) {
    await env.DB.prepare(`INSERT INTO users (id, email, handle, display_name, status, avatar_seed, avatar_style, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`).bind(userId, email, handle, handle, avatarSeed, avatarStyle, now, now).run();
  } else if (byEmail.status === "pending") {
    await env.DB.prepare("UPDATE users SET handle=?, display_name=?, avatar_seed=?, avatar_style=?, updated_at=? WHERE id=? AND status='pending'")
      .bind(handle, handle, avatarSeed, avatarStyle, now, userId).run();
  }
  await env.DB.prepare("DELETE FROM magic_links WHERE user_id = ? AND used_at IS NULL").bind(userId).run();
  try {
    await createBetterAuth(env).api.signInMagicLink({
      headers: request.headers,
      body: {
        email,
        name: byEmail?.status === "active" ? byEmail.handle : handle,
        callbackURL: "/auth/complete",
        errorCallbackURL: "/auth/complete",
        metadata: { domainUserId: userId, handle: byEmail?.status === "active" ? byEmail.handle : handle, requestId: crypto.randomUUID() },
      },
    });
    return { ok: true as const };
  } catch (error) {
    console.error(JSON.stringify({ event: "magic_link_request_failed", userId, error: String(error) }));
    return data({ ok: false as const, error: "We could not send that link. Please try again shortly." }, { status: 503 });
  }
}

export default function Subscribe({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.formAction === "/subscribe";
  const [handle, setHandle] = useState("");
  const [avatarSeed, setAvatarSeed] = useState<string | null>(null);
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>("voxel-bot");
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  useEffect(() => {
    const clean = handle.trim().replace(/^@/, "").toLowerCase();
    if (!clean) { setAvailability("idle"); return; }
    if (!/^[a-z0-9_]{3,24}$/.test(clean)) { setAvailability("invalid"); return; }
    setAvailability("checking");
    const controller = new AbortController();
    const timer = setTimeout(async () => { try { const response = await fetch(`/api/handle/${encodeURIComponent(clean)}`, { signal: controller.signal }); const result = await response.json() as { available: boolean }; setAvailability(result.available ? "available" : "taken"); } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setAvailability("idle"); } }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [handle]);
  if (actionData?.ok) return <div className="page-panel centered auth-success"><div className="success-orb"><EnvelopeSimple size={30} weight="fill" /></div><h1>Check your inbox.</h1><p>Your private link expires in 15 minutes. Click the newest link in your email to finish setting up your handle.</p><Link className="soft-button" to="/">Back to the timeline</Link></div>;
  return <div className="form-page subscribe-page"><header className="page-heading"><h1>Claim your tiny corner.</h1><p>Reading stays public. Your handle unlocks reactions, replies, bookmarks, and an inbox you control.</p></header>
    <Form method="post" className="subscribe-form">
      <label className="field"><span>Email</span><div><EnvelopeSimple size={19} /><input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></div></label>
      <label className="field"><span>Alias</span><div><At size={19} /><input name="handle" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" placeholder="your_handle" value={handle} onChange={(event) => setHandle(event.target.value)} aria-describedby="handle-status" /></div><small id="handle-status" className={`availability ${availability}`}>{availability === "available" ? "✓ This one is yours." : availability === "taken" ? "Already claimed. Try another." : availability === "checking" ? "Checking…" : availability === "invalid" ? "Use 3 to 24 letters, numbers, or underscores." : "This becomes your public @handle. Your email never does."}</small></label>
      <AvatarPicker selectedSeed={avatarSeed} selectedStyle={avatarStyle} onSelect={(style, seed) => { setAvatarStyle(style); setAvatarSeed(seed); }} required />
      <label className="honeypot" aria-hidden="true">Company<input name="company" tabIndex={-1} autoComplete="off" /></label>
      {actionData?.error ? <p className="form-error" role="alert">{actionData.error}</p> : null}
      <button className="primary-button submit-button" disabled={busy}>{busy ? "Sending your link…" : "Email me a magic link"}</button>
      <p className="form-switch">Already have an account? <Link to="/login">Log in with email</Link>.</p>
      <p className="form-fineprint"><LockKey size={15} /> By continuing, you agree to receive the emails you choose. Unsubscribe is always one click away.</p>
    </Form>
    <div className="benefit-list"><div><BookOpenText size={23} /><span><strong>Reading stays open</strong><small>No sign-in wall between you and a post.</small></span></div><div><BellRinging size={23} /><span><strong>Only useful notifications</strong><small>Replies and mentions—not algorithmic noise.</small></span></div></div>
  </div>;
}
