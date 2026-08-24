import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";

import { emailMediaUrl, queueEmail } from "./email.server";
import { isAvatarSeed, isAvatarStyle, storeDicebearAvatar } from "./avatar.server";
import { normalizeEmail } from "./auth-values";

const SESSION_TTL = 60 * 60 * 24 * 30;
const MAGIC_LINK_TTL = 15 * 60;

type DomainUser = {
  id: string;
  email: string;
  handle: string;
  display_name: string;
  status: string;
  role: string;
  avatar_key: string | null;
  avatar_seed: string | null;
  avatar_style: string | null;
  verified_at: number | null;
};

function now() {
  return Math.floor(Date.now() / 1000);
}

async function findDomainUser(runtimeEnv: Env, authUserId: string, email: string) {
  const byAuthId = await runtimeEnv.DB.prepare(`SELECT id,email,handle,display_name,status,role,avatar_key,avatar_seed,avatar_style,verified_at
    FROM users WHERE auth_user_id = ?`).bind(authUserId).first<DomainUser>();
  if (byAuthId) return byAuthId;
  return runtimeEnv.DB.prepare(`SELECT id,email,handle,display_name,status,role,avatar_key,avatar_seed,avatar_style,verified_at
    FROM users WHERE email = ?`).bind(normalizeEmail(email)).first<DomainUser>();
}

async function syncDomainIdentity(runtimeEnv: Env, authUserId: string, email: string) {
  const domainUser = await findDomainUser(runtimeEnv, authUserId, email);
  if (!domainUser || !["pending", "active"].includes(domainUser.status)) return null;

  const firstActivation = domainUser.status !== "active" || !domainUser.verified_at;
  const ownerEmail = runtimeEnv.OWNER_EMAIL ? normalizeEmail(runtimeEnv.OWNER_EMAIL) : "";
  const role = ownerEmail && normalizeEmail(domainUser.email) === ownerEmail ? "owner" : "reader";
  const timestamp = now();

  await runtimeEnv.DB.prepare(`UPDATE users
    SET auth_user_id = ?, status = 'active', role = ?, verified_at = COALESCE(verified_at, ?), updated_at = ?
    WHERE id = ?`).bind(authUserId, role, timestamp, timestamp, domainUser.id).run();

  const selectedAvatarStyle = domainUser.avatar_style;
  if (firstActivation && domainUser.avatar_seed && isAvatarSeed(domainUser.avatar_seed) && selectedAvatarStyle && isAvatarStyle(selectedAvatarStyle)) {
    let avatarKey: string | null = domainUser.avatar_key;
    try {
      avatarKey = (await storeDicebearAvatar(selectedAvatarStyle, domainUser.avatar_seed)).key;
    } catch (error) {
      console.error(JSON.stringify({ event: "avatar_provision_failed", userId: domainUser.id, error: String(error) }));
    }
    await runtimeEnv.DB.prepare(`UPDATE users SET avatar_key = COALESCE(?, avatar_key), avatar_seed = ?, avatar_style = ?, updated_at = ? WHERE id = ?`)
      .bind(avatarKey, domainUser.avatar_seed, selectedAvatarStyle, timestamp, domainUser.id).run();
    if (role === "owner") {
      await runtimeEnv.DB.prepare(`UPDATE profile SET avatar_key = COALESCE(?, avatar_key), avatar_seed = ?, avatar_style = ?, updated_at = ? WHERE id = 1`)
        .bind(avatarKey, domainUser.avatar_seed, selectedAvatarStyle, timestamp).run();
    }
  }

  if (firstActivation) {
    try {
      await queueEmail({
        userId: domainUser.id,
        email: domainUser.email,
        template: "welcome",
        idempotencyKey: `welcome:${domainUser.id}`,
        data: {
          handle: domainUser.handle,
          timelineUrl: `${runtimeEnv.SITE_URL}/`,
          settingsUrl: `${runtimeEnv.SITE_URL}/settings`,
          avatarUrl: emailMediaUrl(runtimeEnv.SITE_URL, domainUser.avatar_key),
        },
      });
    } catch (error) {
      console.error(JSON.stringify({ event: "welcome_email_queue_failed", userId: domainUser.id, error: String(error) }));
    }
  }

  return { id: domainUser.id, role };
}

export function createBetterAuth(runtimeEnv: Env) {
  const secret = runtimeEnv.BETTER_AUTH_SECRET || (runtimeEnv.ENVIRONMENT === "development" ? "fikra-local-only-better-auth-secret-change-me" : "");
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not configured");

  const isLocal = runtimeEnv.ENVIRONMENT === "development";
  return betterAuth({
    appName: runtimeEnv.SITE_NAME,
    baseURL: runtimeEnv.SITE_URL,
    basePath: "/api/auth",
    secret,
    database: runtimeEnv.DB,
    user: {
      modelName: "auth_user",
      validateUserInfo: async ({ user, source }) => {
        if (source.method !== "magic-link") return;
        const domainUser = await runtimeEnv.DB.prepare("SELECT status FROM users WHERE email = ?")
          .bind(normalizeEmail(String(user.email || ""))).first<{ status: string }>();
        if (!domainUser || !["pending", "active"].includes(domainUser.status)) {
          return { error: "account_not_ready", errorDescription: "This subscription is not available for sign-in." };
        }
      },
    },
    session: {
      modelName: "auth_session",
      expiresIn: SESSION_TTL,
      updateAge: SESSION_TTL,
      disableSessionRefresh: true,
    },
    account: { modelName: "auth_account" },
    verification: { modelName: "auth_verification" },
    rateLimit: { enabled: true, storage: "database", modelName: "auth_rate_limit" },
    advanced: {
      cookiePrefix: "fikra",
      useSecureCookies: !isLocal,
      cookies: {
        session_token: {
          name: "fikra_session",
          attributes: { httpOnly: true, sameSite: "lax", path: "/" },
        },
      },
    },
    trustedOrigins: isLocal
      ? [runtimeEnv.SITE_URL, "http://localhost:5173", "http://127.0.0.1:5173"]
      : [runtimeEnv.SITE_URL],
    plugins: [magicLink({
      expiresIn: MAGIC_LINK_TTL,
      storeToken: "hashed",
      rateLimit: { window: MAGIC_LINK_TTL, max: 5 },
      sendMagicLink: async ({ email, url, metadata }) => {
        const domainUserId = typeof metadata?.domainUserId === "string" ? metadata.domainUserId : "";
        const handle = typeof metadata?.handle === "string" ? metadata.handle : "there";
        const requestId = typeof metadata?.requestId === "string" ? metadata.requestId : crypto.randomUUID();
        if (!domainUserId) throw new Error("Magic link is missing its domain identity");
        await queueEmail({
          userId: domainUserId,
          email,
          template: "magic-link",
          idempotencyKey: `better-magic:${requestId}`,
          data: { url, handle },
        });
      },
    })],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await syncDomainIdentity(runtimeEnv, user.id, user.email);
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const authUser = await runtimeEnv.DB.prepare("SELECT email FROM auth_user WHERE id = ?")
              .bind(session.userId).first<{ email: string }>();
            if (!authUser) return false;
            return Boolean(await syncDomainIdentity(runtimeEnv, session.userId, authUser.email));
          },
        },
      },
    },
  });
}
