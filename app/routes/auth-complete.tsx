import { data, Link, redirect } from "react-router";

import type { Route } from "./+types/auth-complete";
import { currentViewer } from "../lib/auth.server";

export function meta() {
  return [{ title: "Sign-in complete | Fikra" }, { name: "robots", content: "noindex,nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    return data({ ok: false as const, error: "That sign-in link is invalid, expired, or already used." }, { status: 400, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  const viewer = await currentViewer(request);
  if (!viewer) return data({ ok: false as const, error: "Your sign-in session could not be created. Request a fresh link and open it in this browser." }, { status: 503, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  throw redirect(viewer.role === "owner" && url.searchParams.get("setup") === "1" ? "/setup" : viewer.role === "owner" ? "/compose" : "/");
}

export default function AuthComplete({ loaderData }: Route.ComponentProps) {
  return <div className="page-panel centered"><div className="avatar large">F</div><h1>Sign-in needs another link.</h1><p>{loaderData.error}</p><Link className="primary-button" to="/login">Request a fresh sign-in link</Link></div>;
}
