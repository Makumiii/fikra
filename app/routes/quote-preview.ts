import { env } from "cloudflare:workers";
import { data } from "react-router";

import type { Route } from "./+types/quote-preview";
import { assertSameOrigin, requireOwner } from "../lib/auth.server";
import { fetchXQuote, getLocalQuote } from "../lib/quote.server";

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  await requireOwner(request);
  const form = await request.formData();
  const postId = String(form.get("postId") || "").trim();
  if (postId) {
    const quote = await getLocalQuote(env.DB, postId);
    if (!quote) return data({ ok: false as const, error: "That post is no longer available to quote." }, { status: 404 });
    return data({ ok: true as const, quote }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const quote = await fetchXQuote(String(form.get("url") || ""));
    return data({ ok: true as const, quote }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return data({ ok: false as const, error: error instanceof Error ? error.message : "That X post could not be loaded." }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }
}
