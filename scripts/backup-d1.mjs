import { chmod, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const configPath = resolve(root, process.env.FIKRA_WRANGLER_CONFIG || "wrangler.deploy.jsonc");
const backupDir = resolve(root, "backups");
const stamp = new Date().toISOString().replaceAll(":", "-");
const tables = [
  "users", "profile", "profile_links", "magic_links", "sessions", "topics", "user_topics",
  "posts", "post_topics", "link_cards", "reactions", "replies", "reply_reactions", "bookmarks",
  "mentions", "notifications", "email_deliveries", "rate_limits", "post_daily_metrics",
  "unsubscribe_tokens", "system_state", "auth_user", "auth_session", "auth_account",
  "auth_verification", "auth_rate_limit", "site_settings", "analytics_sessions",
  "post_impressions", "post_detail_opens", "d1_migrations",
];

function run(args, capture = false) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: { ...process.env, NO_COLOR: "1" },
  });
  if (result.status !== 0) {
    if (capture) process.stderr.write(result.stderr || result.stdout || "Wrangler failed.\n");
    process.exit(result.status || 1);
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
}

await mkdir(backupDir, { recursive: true });
const bookmarkPath = resolve(backupDir, `d1-bookmark-${stamp}.txt`);
const exportPath = resolve(backupDir, `d1-logical-${stamp}.sql`);
await writeFile(bookmarkPath, run(["d1", "time-travel", "info", "DB", "--config", configPath], true), { mode: 0o600 });
run(["d1", "export", "DB", "--remote", "--skip-confirmation", "--output", exportPath, "--config", configPath, ...tables.flatMap((table) => ["--table", table])]);
await chmod(exportPath, 0o600);
console.log(`Backup written to ${exportPath}`);
console.log(`Time Travel bookmark written to ${bookmarkPath}`);
