import { env } from "cloudflare:workers";
import { data, Form, Link, useNavigation } from "react-router";
import { EnvelopeSimple, LockKey } from "@phosphor-icons/react";

import type { Route } from "./+types/login";
import { assertSameOrigin, normalizeEmail } from "../lib/auth.server";
import { createBetterAuth } from "../lib/better-auth.server";
import { rateLimit, rateLimitSubject } from "../lib/rate-limit.server";

export function meta() {
  return [
    { title: "Log in | Fikra" },
    { name: "description", content: "Log in to your timeline account with a private email link." },
    { name: "robots", content: "noindex,follow" },
  ];
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  await rateLimit(request, "magic-link", 5, 15 * 60);
  if (env.EMAIL_TRANSPORT === "smtp" && (!env.SMTP_HOST || !env.SMTP_USERNAME || !env.SMTP_PASSWORD || !env.SMTP_FROM_EMAIL)) {
    return data({ ok: false as const, error: "Email sign-in is being connected. Please try again shortly." }, { status: 503 });
  }

  const form = await request.formData();
  const email = normalizeEmail(String(form.get("email") || ""));
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return { ok: false as const, error: "Enter the email attached to your account." };
  }
  await rateLimitSubject(email, "magic-link-email", 3, 15 * 60);

  const user = await env.DB.prepare("SELECT id,email,handle,status FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; email: string; handle: string; status: string }>();
  if (!user || !["pending", "active"].includes(user.status)) {
    return { ok: false as const, error: "No active account uses that email yet. New here? Subscribe first." };
  }

  try {
    await createBetterAuth(env).api.signInMagicLink({
      headers: request.headers,
      body: {
        email,
        name: user.handle,
        callbackURL: "/auth/complete",
        errorCallbackURL: "/auth/complete",
        metadata: { domainUserId: user.id, handle: user.handle, requestId: crypto.randomUUID() },
      },
    });
    return { ok: true as const };
  } catch (error) {
    console.error(JSON.stringify({ event: "login_magic_link_request_failed", userId: user.id, error: String(error) }));
    return data({ ok: false as const, error: "We could not send that link. Please try again shortly." }, { status: 503 });
  }
}

export default function Login({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.formAction === "/login";
  if (actionData?.ok) {
    return <div className="page-panel centered auth-success">
      <div className="success-orb"><EnvelopeSimple size={30} weight="fill" /></div>
      <h1>Check your inbox.</h1>
      <p>Sending the link does not sign you in yet. Click the newest link in your email to finish. Owner links open your publishing controls automatically.</p>
      <Link className="soft-button" to="/">Back to the timeline</Link>
    </div>;
  }

  return <div className="form-page auth-page login-page">
    <header className="page-heading">
      <span className="auth-kicker">Returning readers</span>
      <h1>Welcome back.</h1>
      <p>Use the email attached to your handle. We will send a private link and keep your username remembered for you.</p>
    </header>
    <Form method="post" className="subscribe-form auth-form">
      <label className="field"><span>Email</span><div><EnvelopeSimple size={19} /><input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></div></label>
      {actionData?.error ? <p className="form-error" role="alert">{actionData.error}</p> : null}
      <button className="primary-button submit-button" disabled={busy}>{busy ? "Sending your link…" : "Email me a sign-in link"}</button>
      <p className="form-switch">New here? <Link to="/subscribe">Subscribe and choose a handle</Link>.</p>
      <p className="form-fineprint"><LockKey size={15} /> No password to remember. Your email stays private.</p>
    </Form>
  </div>;
}
