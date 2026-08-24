import { env } from "cloudflare:workers";
import type { Route } from "./+types/logout";
import { assertSameOrigin } from "../lib/auth.server";
import { createBetterAuth } from "../lib/better-auth.server";

function responseHeaders(response: Response) {
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") headers.set(key, value);
  });
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  if (!cookies.length) {
    const combined = response.headers.get("set-cookie");
    if (combined) for (const cookie of combined.split(/,(?=\s*(?:__Secure-)?[^;,=\s]+=[^;,]*)/)) headers.append("Set-Cookie", cookie.trim());
  }
  return headers;
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const authHeaders = new Headers(request.headers);
  authHeaders.set("Content-Type", "application/json");
  authHeaders.delete("Content-Length");
  const authRequest = new Request(new URL("/api/auth/sign-out", request.url), {
    method: "POST",
    headers: authHeaders,
    body: "{}",
  });
  const response = await createBetterAuth(env).handler(authRequest);
  const headers = responseHeaders(response);
  headers.set("Location", "/");
  return new Response(null, { status: 303, headers });
}
