import { env } from "cloudflare:workers";
import { sha256 } from "./crypto.server";

export async function consumeRateLimit(subject: string, bucket: string, limit: number, windowSeconds: number) {
  const key = `${bucket}:${await sha256(subject)}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  await env.DB.prepare(`INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
    ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1`).bind(key, windowStart).run();
  const row = await env.DB.prepare("SELECT count FROM rate_limits WHERE key = ? AND window_start = ?").bind(key, windowStart).first<{ count: number }>();
  return Number(row?.count || 0) <= limit;
}

function blocked(windowSeconds: number) {
  throw new Response("Too many attempts. Try again shortly.", { status: 429, headers: { "Retry-After": String(windowSeconds) } });
}

export async function rateLimitSubject(subject: string, bucket: string, limit: number, windowSeconds: number) {
  if (!await consumeRateLimit(subject, bucket, limit, windowSeconds)) blocked(windowSeconds);
}

export async function rateLimit(request: Request, bucket: string, limit: number, windowSeconds: number) {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  await rateLimitSubject(ip, bucket, limit, windowSeconds);
}
