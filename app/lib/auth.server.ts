import { env } from "cloudflare:workers";
import { createBetterAuth } from "./better-auth.server";
import type { Viewer } from "./models";
export { randomToken, sha256 } from "./crypto.server";

export function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
export function normalizeHandle(value: string) { return value.trim().replace(/^@/, "").toLowerCase(); }
export function validHandle(value: string) { return /^[a-z0-9_]{3,24}$/.test(value); }

export async function currentViewer(request: Request): Promise<Viewer | null> {
  const authSession = await createBetterAuth(env).api.getSession({
    headers: request.headers,
    query: { disableRefresh: true },
  });
  if (!authSession) return null;
  const row = await env.DB.prepare(`
    SELECT u.id, u.handle, u.display_name, u.role, u.avatar_key, u.avatar_seed, u.avatar_style
    FROM users u
    WHERE u.auth_user_id = ? AND u.status = 'active'
  `).bind(authSession.user.id).first<Record<string, unknown>>();
  if (!row) return null;
  return {
    id: String(row.id),
    handle: String(row.handle),
    displayName: String(row.display_name),
    role: row.role === "owner" ? "owner" : "reader",
    avatarKey: row.avatar_key ? String(row.avatar_key) : null,
    avatarSeed: row.avatar_seed ? String(row.avatar_seed) : null,
    avatarStyle: (row.avatar_style ? String(row.avatar_style) : "voxel-art") as Viewer["avatarStyle"],
  };
}

export async function requireViewer(request: Request) {
  const viewer = await currentViewer(request);
  if (!viewer) throw new Response("Sign in required", { status: 401 });
  return viewer;
}

export async function requireOwner(request: Request) {
  const viewer = await currentViewer(request);
  if (!viewer || viewer.role !== "owner") throw new Response("Not found", { status: 404 });
  return viewer;
}

export function assertSameOrigin(request: Request) {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("Origin");
  if (origin) {
    if (origin === expectedOrigin) return;
    throw new Response("Invalid request origin", { status: 403 });
  }

  const referer = request.headers.get("Referer");
  if (referer) {
    try {
      if (new URL(referer).origin === expectedOrigin) return;
    } catch { /* reject below */ }
    throw new Response("Invalid request origin", { status: 403 });
  }

  if (request.headers.get("Sec-Fetch-Site") === "same-origin") return;
  throw new Response("Request origin required", { status: 403 });
}
