import { env } from "cloudflare:workers";

import type { Route } from "./+types/favicon";

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

export async function loader({ request }: Route.LoaderArgs) {
  const profile = await env.DB.prepare("SELECT display_name,avatar_key FROM profile WHERE id=1").first<{ display_name: string; avatar_key: string | null }>();
  if (profile?.avatar_key) {
    const object = await env.MEDIA.get(profile.avatar_key, { onlyIf: { etagDoesNotMatch: request.headers.get("If-None-Match") || undefined } });
    if (object && !("body" in object)) return new Response(null, { status: 304, headers: { ETag: object.httpEtag, "Cache-Control": "no-cache" } });
    if (object && "body" in object) {
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      const type = headers.get("Content-Type")?.split(";", 1)[0].toLowerCase() || "";
      if (["image/jpeg", "image/png", "image/webp", "image/avif", "image/svg+xml"].includes(type)) {
        headers.set("ETag", object.httpEtag);
        headers.set("Cache-Control", "no-cache");
        headers.set("X-Content-Type-Options", "nosniff");
        if (type === "image/svg+xml") headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        return new Response(object.body, { headers });
      }
    }
  }

  const initial = escapeXml(profile?.display_name?.trim().charAt(0).toUpperCase() || "M");
  return new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#f4f5f1"/><text x="32" y="42" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#0c0d0e">${initial}</text></svg>`, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" },
  });
}
