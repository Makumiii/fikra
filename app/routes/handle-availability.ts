import { env } from "cloudflare:workers";
import type { Route } from "./+types/handle-availability";
import { normalizeHandle, validHandle } from "../lib/auth.server";

export async function loader({ params }: Route.LoaderArgs) {
  const handle = normalizeHandle(params.handle || "");
  if (!validHandle(handle)) return Response.json({ available: false, valid: false }, { headers: { "Cache-Control": "no-store" } });
  const exists = await env.DB.prepare("SELECT 1 FROM users WHERE handle=?").bind(handle).first();
  return Response.json({ available: !exists, valid: true }, { headers: { "Cache-Control": "no-store" } });
}
