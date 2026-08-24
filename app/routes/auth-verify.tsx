import { env } from "cloudflare:workers";
import { data, Link } from "react-router";

import type { Route } from "./+types/auth-verify";
import { normalizeEmail, randomToken, sha256 } from "../lib/auth.server";
import { createBetterAuth } from "../lib/better-auth.server";

const PRIVATE_HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

interface LegacyMagicLink {
  id: string;
  user_id: string;
  email: string;
  handle: string;
  used_at: number | null;
  expires_at: number;
  avatar_seed: string | null;
  avatar_style: string | null;
}

async function hashBetterAuthToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function bridgeLegacyLink(token: string) {
  if (token.length < 30 || token.length > 200) return null;
  const link = await env.DB.prepare(`SELECT m.id,m.user_id,m.used_at,m.expires_at,m.avatar_seed,m.avatar_style,u.email,u.handle
    FROM magic_links m JOIN users u ON u.id=m.user_id WHERE m.token_hash=?`).bind(await sha256(token)).first<LegacyMagicLink>();
  const timestamp = Math.floor(Date.now() / 1000);
  if (!link || link.used_at || link.expires_at <= timestamp) return null;

  if (link.avatar_seed && link.avatar_style) {
    await env.DB.prepare("UPDATE users SET avatar_seed=?, avatar_style=?, updated_at=? WHERE id=? AND status='pending'")
      .bind(link.avatar_seed, link.avatar_style, timestamp, link.user_id).run();
  }

  const claimed = await env.DB.prepare("UPDATE magic_links SET used_at=? WHERE id=? AND used_at IS NULL")
    .bind(timestamp, link.id).run();
  if (!claimed.meta.changes) return null;

  const tokenForBetterAuth = randomToken();
  const storedIdentifier = await hashBetterAuthToken(tokenForBetterAuth);
  const date = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await env.DB.prepare(`INSERT INTO auth_verification (id,identifier,value,expiresAt,createdAt,updatedAt)
    VALUES (?,?,?,?,?,?)`).bind(crypto.randomUUID(), storedIdentifier, JSON.stringify({ email: normalizeEmail(link.email), name: link.handle }), date, new Date().toISOString(), new Date().toISOString()).run();
  return tokenForBetterAuth;
}

export function meta() {
  return [{ title: "Finish signing in | Fikra" }, { name: "robots", content: "noindex,nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const bridgedToken = await bridgeLegacyLink(token);
  if (!bridgedToken) return data({ ok: false as const, error: "This sign-in link is invalid, expired, or already used." }, { status: 400, headers: PRIVATE_HEADERS });

  const verifyUrl = new URL("/api/auth/magic-link/verify", request.url);
  verifyUrl.searchParams.set("token", bridgedToken);
  verifyUrl.searchParams.set("callbackURL", "/auth/complete");
  verifyUrl.searchParams.set("errorCallbackURL", "/auth/complete");
  return createBetterAuth(env).handler(new Request(verifyUrl, { method: "GET", headers: request.headers }));
}

export default function LegacyVerify({ loaderData }: Route.ComponentProps) {
  return <div className="page-panel centered"><div className="avatar large">M</div><h1>That link needs replacing.</h1><p>{loaderData.error}</p><Link className="primary-button" to="/login">Request a fresh sign-in link</Link></div>;
}
