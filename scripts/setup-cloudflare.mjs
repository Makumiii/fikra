import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

const root = resolve(import.meta.dirname, "..");
const configPath = join(root, "wrangler.deploy.jsonc");
const prompt = createInterface({ input: process.stdin, output: process.stdout });

function run(args, options = {}) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? ["inherit", "pipe", "pipe"] : "inherit",
    env: { ...process.env, NO_COLOR: "1" },
  });
  if (result.status !== 0) {
    if (options.capture) process.stderr.write(result.stderr || result.stdout || "Wrangler failed.\n");
    process.exit(result.status || 1);
  }
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function slug(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function databaseId(output) {
  const match = output.match(/database_id["']?\s*[:=]\s*["']([0-9a-f-]{36})/i)
    || output.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (!match) throw new Error("Wrangler created D1 but its database ID could not be read from the output.");
  return match[1];
}

try {
  try {
    await readFile(configPath, "utf8");
    console.error("wrangler.deploy.jsonc already exists. Run npm run doctor or move that file before provisioning another installation.");
    process.exit(1);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  run(["whoami"]);
  const projectName = slug(await prompt.question("Cloudflare resource prefix (fikra): ")) || "fikra";
  const siteUrl = (await prompt.question("Public HTTPS URL (for example https://notes.example.com): ")).trim().replace(/\/$/, "");
  const ownerEmail = (await prompt.question("Owner email: ")).trim().toLowerCase();
  if (!/^https:\/\/[^\s/]+(?:\/.*)?$/.test(siteUrl)) throw new Error("A valid public HTTPS URL is required.");
  if (!/^\S+@\S+\.\S+$/.test(ownerEmail)) throw new Error("A valid owner email is required.");

  const databaseName = `${projectName}-db`;
  const bucketName = `${projectName}-media`;
  const queueName = `${projectName}-email`;
  const deadLetterQueue = `${projectName}-email-dlq`;
  const d1Output = run(["d1", "create", databaseName], { capture: true });
  const id = databaseId(d1Output);
  run(["r2", "bucket", "create", bucketName]);
  run(["queues", "create", queueName]);
  run(["queues", "create", deadLetterQueue]);

  const config = {
    $schema: "./node_modules/wrangler/config-schema.json",
    name: projectName,
    main: "./workers/app.ts",
    compatibility_date: "2026-08-24",
    compatibility_flags: ["nodejs_compat"],
    vars: { ENVIRONMENT: "production", SITE_NAME: "Fikra", SITE_URL: siteUrl, EMAIL_TRANSPORT: "outbox" },
    d1_databases: [{ binding: "DB", database_name: databaseName, database_id: id, migrations_dir: "./migrations" }],
    r2_buckets: [{ binding: "MEDIA", bucket_name: bucketName }],
    queues: {
      producers: [{ binding: "EMAIL_QUEUE", queue: queueName }],
      consumers: [{ queue: queueName, max_batch_size: 10, max_batch_timeout: 5, max_retries: 5, dead_letter_queue: deadLetterQueue, retry_delay: 30 }],
    },
    observability: { enabled: true, logs: { head_sampling_rate: 1 }, traces: { enabled: true, head_sampling_rate: 0.05 } },
    upload_source_maps: true,
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

  const secretDirectory = await mkdtemp(join(tmpdir(), "fikra-secrets-"));
  const secretPath = join(secretDirectory, "secrets.json");
  await writeFile(secretPath, JSON.stringify({
    OWNER_EMAIL: ownerEmail,
    BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
  }), { mode: 0o600 });
  try {
    run(["secret", "bulk", secretPath, "--config", configPath]);
  } finally {
    await rm(secretDirectory, { recursive: true, force: true });
  }

  const smtp = (await prompt.question("Configure SMTP now? (y/N): ")).trim().toLowerCase() === "y";
  if (smtp) {
    config.vars.EMAIL_TRANSPORT = "smtp";
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    for (const name of ["SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_FROM_EMAIL", "SMTP_FROM_NAME"]) {
      console.log(`Set ${name}:`);
      run(["secret", "put", name, "--config", configPath]);
    }
  }
  await chmod(configPath, 0o600);
  run(["d1", "migrations", "apply", "DB", "--remote", "--config", configPath]);
  console.log("\nCloudflare resources are ready. Run `npm run deploy`, then open:");
  console.log(`${siteUrl}/setup`);
  if (!smtp) console.log("Email is in outbox mode. Configure SMTP before requesting the production owner link.");
} finally {
  prompt.close();
}
