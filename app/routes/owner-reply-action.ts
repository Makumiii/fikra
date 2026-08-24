import { env } from "cloudflare:workers";
import { data } from "react-router";

import type { Route } from "./+types/owner-reply-action";
import { assertSameOrigin, requireOwner } from "../lib/auth.server";

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  await requireOwner(request);
  const intent = String((await request.formData()).get("intent") || "");
  if (intent !== "delete") return data({ ok: false, error: "Unknown reply action." }, { status: 400 });
  const result = await env.DB.prepare("DELETE FROM replies WHERE id=?").bind(params.replyId).run();
  if (!result.meta.changes) throw new Response("Not found", { status: 404 });
  return data({ ok: true });
}
