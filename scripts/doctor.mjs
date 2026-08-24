import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const failures = [];
const notes = [];
const major = Number(process.versions.node.split(".")[0]);
if (major < 22) failures.push(`Node 22+ is required (found ${process.versions.node}).`);

for (const file of ["wrangler.jsonc", "migrations/0014_qualified_impressions.sql", ".dev.vars.example"]) {
  try { await access(resolve(root, file)); }
  catch { failures.push(`Missing ${file}.`); }
}
try {
  const ignored = spawnSync("git", ["check-ignore", "wrangler.deploy.jsonc", ".dev.vars"], { cwd: root, encoding: "utf8" });
  if (ignored.status !== 0) failures.push("Private Wrangler and development variable files are not fully ignored by Git.");
} catch { notes.push("Git ignore checks were skipped."); }
try {
  const deployConfig = await readFile(resolve(root, "wrangler.deploy.jsonc"), "utf8");
  const config = JSON.parse(deployConfig);
  if (!config.d1_databases?.length || !config.r2_buckets?.length || !config.queues?.producers?.length) failures.push("wrangler.deploy.jsonc is missing a required binding.");
  else notes.push(`Remote config found for ${config.name}.`);
} catch (error) {
  if (error?.code === "ENOENT") notes.push("No remote config yet; run npm run setup:cloudflare when ready.");
  else failures.push("wrangler.deploy.jsonc is not valid JSON.");
}

for (const note of notes) console.log(`info: ${note}`);
if (failures.length) {
  for (const failure of failures) console.error(`error: ${failure}`);
  process.exit(1);
}
console.log("Fikra doctor found no blocking setup problems.");
