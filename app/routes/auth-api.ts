import { env } from "cloudflare:workers";

import type { Route } from "./+types/auth-api";
import { createBetterAuth } from "../lib/better-auth.server";

export async function loader({ request }: Route.LoaderArgs) {
  return createBetterAuth(env).handler(request);
}

export async function action({ request }: Route.ActionArgs) {
  return createBetterAuth(env).handler(request);
}
