import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const configPath = resolve(root, process.env.FIKRA_WRANGLER_CONFIG || "wrangler.deploy.jsonc");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: options.capture ? ["inherit", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    env: { ...process.env, FIKRA_WRANGLER_CONFIG: configPath, NO_COLOR: "1" },
  });
  if (result.status !== 0) {
    if (options.capture) process.stderr.write(result.stderr || result.stdout || `${command} failed.\n`);
    process.exit(result.status || 1);
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
}

try { await access(configPath); }
catch { console.error("Missing wrangler.deploy.jsonc. Run npm run setup:cloudflare first."); process.exit(1); }

const backupDir = resolve(root, "backups");
await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replaceAll(":", "-");
const bookmark = run("npx", ["wrangler", "d1", "time-travel", "info", "DB", "--config", configPath], { capture: true });
await writeFile(resolve(backupDir, `d1-bookmark-${stamp}.txt`), bookmark, { mode: 0o600 });
run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--remote", "--config", configPath]);
run("npm", ["run", "check"]);
run("npm", ["run", "build"]);
run("npx", ["wrangler", "deploy", "--config", resolve(root, "build/server/wrangler.json")]);
console.log("Deployment complete. Run the production smoke suite against the configured SITE_URL.");
