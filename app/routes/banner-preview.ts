import type { Route } from "./+types/banner-preview";
import { bannerResponse, isBannerSeed, isBannerStyle } from "../lib/avatar.server";
import type { BannerStyle } from "../lib/banner";

export async function loader({ request, params }: Route.LoaderArgs) {
  const seed = String(params.seed || "");
  const style = String(params.style || "");
  if (!isBannerSeed(seed) || !isBannerStyle(style)) throw new Response("Not found", { status: 404 });
  const cacheKey = new Request(new URL(request.url).toString(), { method: "GET" });
  try {
    const cache = await caches.open("banner-previews");
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    const response = bannerResponse(style as BannerStyle, seed);
    await cache.put(cacheKey, response.clone());
    return response;
  } catch {
    return bannerResponse(style as BannerStyle, seed);
  }
}
