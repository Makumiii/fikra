import type { Route } from "./+types/avatar-preview";
import { avatarResponse, isAvatarSeed, isAvatarStyle } from "../lib/avatar.server";
import type { AvatarStyle } from "../lib/avatar";

export async function loader({ request, params }: Route.LoaderArgs) {
  const seed = String(params.seed || "");
  const style = String(params.style || "");
  if (!isAvatarSeed(seed) || !isAvatarStyle(style)) throw new Response("Not found", { status: 404 });
  const cacheKey = new Request(new URL(request.url).toString(), { method: "GET" });
  try {
    const cache = await caches.open("avatar-previews");
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    const response = avatarResponse(style as AvatarStyle, seed);
    await cache.put(cacheKey, response.clone());
    return response;
  } catch {
    return avatarResponse(style as AvatarStyle, seed);
  }
}
