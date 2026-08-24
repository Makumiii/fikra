import { env } from "cloudflare:workers";

import type { Route } from "./+types/media";

const PUBLIC_MEDIA_KEY = /^(?:avatar|banner|cover)-[a-zA-Z0-9_-]+\.(?:jpg|png|webp|avif|svg)$/;

export async function loader({ request, params }: Route.LoaderArgs) {
  const key = params.key || "";
  if (!PUBLIC_MEDIA_KEY.test(key)) throw new Response("Not found", { status: 404 });
  const object = await env.MEDIA.get(key, { onlyIf: { etagDoesNotMatch: request.headers.get("If-None-Match") || undefined } });
  if (!object) throw new Response("Not found", { status: 404 });
  if (!("body" in object)) return new Response(null, { status: 304, headers: { ETag: object.httpEtag } });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const type = headers.get("Content-Type")?.split(";", 1)[0].toLowerCase() || "";
  if (!["image/jpeg", "image/png", "image/webp", "image/avif", "image/svg+xml"].includes(type)) {
    throw new Response("Not found", { status: 404 });
  }
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  if (type === "image/svg+xml") {
    headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    headers.set("Content-Disposition", "inline");
  }
  return new Response(object.body, { headers });
}
