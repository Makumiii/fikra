import { env } from "cloudflare:workers";
import { isbot } from "isbot";

import type { Route } from "./+types/analytics-impressions";
import { assertSameOrigin } from "../lib/auth.server";
import { randomToken, sha256 } from "../lib/crypto.server";

const SESSION_SECONDS = 30 * 60;
const MAX_EVENTS = 50;
const POST_ID = /^[a-zA-Z0-9_-]{8,80}$/;

type AnalyticsEvent = { postId: string; type: "impression" | "detail" };

function readCookie(request: Request, name: string) {
  const prefix = `${name}=`;
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const value = part.trim();
    if (value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  if (isbot(request.headers.get("User-Agent") || "")) return new Response(null, { status: 204 });
  const purpose = `${request.headers.get("Purpose") || ""} ${request.headers.get("Sec-Purpose") || ""}`.toLowerCase();
  if (purpose.includes("prefetch") || purpose.includes("prerender")) return new Response(null, { status: 204 });
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Expected JSON" }, { status: 415 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const rawEvents = typeof body === "object" && body && "events" in body ? (body as { events?: unknown }).events : null;
  if (!Array.isArray(rawEvents) || rawEvents.length < 1 || rawEvents.length > MAX_EVENTS) {
    return Response.json({ error: "Send 1–50 events" }, { status: 400 });
  }
  const events: AnalyticsEvent[] = [];
  const seen = new Set<string>();
  for (const value of rawEvents) {
    if (!value || typeof value !== "object") return Response.json({ error: "Invalid event" }, { status: 400 });
    const postId = String((value as { postId?: unknown }).postId || "");
    const type = String((value as { type?: unknown }).type || "");
    if (!POST_ID.test(postId) || (type !== "impression" && type !== "detail")) return Response.json({ error: "Invalid event" }, { status: 400 });
    const key = `${type}:${postId}`;
    if (!seen.has(key)) { seen.add(key); events.push({ postId, type }); }
  }

  const cookieName = new URL(request.url).protocol === "https:" ? "__Host-fikra_analytics" : "fikra_analytics";
  let token = readCookie(request, cookieName);
  if (!token || !/^[a-zA-Z0-9_-]{40,80}$/.test(token)) token = randomToken();
  const sessionHash = await sha256(token);
  const timestamp = Math.floor(Date.now() / 1000);
  const expiry = timestamp + SESSION_SECONDS;
  const existing = await env.DB.prepare("SELECT expires_at FROM analytics_sessions WHERE session_hash=?")
    .bind(sessionHash).first<{ expires_at: number }>();
  if (existing && Number(existing.expires_at) <= timestamp) {
    await env.DB.prepare("DELETE FROM analytics_sessions WHERE session_hash=?").bind(sessionHash).run();
  }
  await env.DB.prepare(`INSERT INTO analytics_sessions (session_hash,expires_at,created_at,last_seen_at)
    VALUES (?,?,?,?) ON CONFLICT(session_hash) DO UPDATE SET expires_at=excluded.expires_at,last_seen_at=excluded.last_seen_at`)
    .bind(sessionHash, expiry, timestamp, timestamp).run();

  const ids = [...new Set(events.map((event) => event.postId))];
  const placeholders = ids.map(() => "?").join(",");
  const published = await env.DB.prepare(`SELECT id FROM posts WHERE status='published' AND id IN (${placeholders})`).bind(...ids).all<{ id: string }>();
  const allowed = new Set(published.results.map((row) => row.id));
  let accepted = 0;
  for (const event of events) {
    if (!allowed.has(event.postId)) continue;
    const table = event.type === "impression" ? "post_impressions" : "post_detail_opens";
    const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO ${table} (post_id,session_hash,created_at) VALUES (?,?,?)`)
      .bind(event.postId, sessionHash, timestamp).run();
    if (!inserted.meta.changes) continue;
    accepted += 1;
    if (event.type === "impression") {
      const metricDate = new Date(timestamp * 1000).toISOString().slice(0, 10);
      await env.DB.prepare(`INSERT INTO post_daily_metrics (post_id,metric_date,views) VALUES (?,?,1)
        ON CONFLICT(post_id,metric_date) DO UPDATE SET views=views+1`).bind(event.postId, metricDate).run();
    }
  }
  if (sessionHash.startsWith("0")) {
    await env.DB.prepare("DELETE FROM analytics_sessions WHERE expires_at < ?").bind(timestamp - 86400).run();
  }
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return Response.json({ accepted }, {
    headers: {
      "Cache-Control": "private, no-store",
      "Set-Cookie": `${cookieName}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; SameSite=Lax${secure}`,
    },
  });
}
