// TODO(vedant): run once and confirm end-to-end — zip in backups/,
// dashboard table counts match prod on dev:good-mule-506, and the target's
// env vars are untouched.
//
// Replaces the cloud dev deployment's data with a fresh prod snapshot.
//
// Two steps, both through the Convex CLI so authentication comes from the
// logged-in `convex login` session (no deploy keys anywhere in the repo):
//   1. `convex export --prod` writes `backups/eva-prod-backup.zip`
//      (documents only — no file storage / attachments).
//   2. `convex import --replace-all` mirrors that ZIP into the dev deployment.
//
// Snapshot import preserves document `_id`s and does not touch the target
// deployment's environment variables. Attachment / storageId refs in docs may
// not resolve on the target.
import { mkdirSync, unlinkSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

// The only deployment this script is ever allowed to write to. Hardcoded rather
// than read from .env.local so a stray local override cannot redirect the
// destructive --replace-all import.
const TARGET_DEPLOYMENT = "dev:good-mule-506";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, "..");
const backupsDir = join(backendRoot, "backups");

if (!TARGET_DEPLOYMENT.startsWith("dev:")) {
  console.error(
    `Refusing to run: TARGET_DEPLOYMENT (${TARGET_DEPLOYMENT}) is not a dev deployment.`,
  );
  process.exit(1);
}
const targetName = TARGET_DEPLOYMENT.slice("dev:".length);

/** Runs a `convex` subcommand, streaming its output, and exits on failure. */
function convex(args, label) {
  console.log(`\n[${label}] npx convex ${args.join(" ")}`);
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["convex", ...args],
    {
      cwd: backendRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  if (result.status !== 0) {
    console.error(`\n[${label}] failed; aborting.`);
    process.exit(result.status ?? 1);
  }
}

const zipPath = join(backupsDir, "eva-prod-backup.zip");

mkdirSync(backupsDir, { recursive: true });
if (existsSync(zipPath)) {
  unlinkSync(zipPath);
}

convex(
  ["export", "--prod", "--path", zipPath],
  "export prod",
);

convex(
  ["import", "--deployment", targetName, "--replace-all", "--yes", zipPath],
  `import into ${TARGET_DEPLOYMENT}`,
);

// The import copied prod's `sandboxIdlePauseMode: "on"` and prod's session
// rows. Dev's sweeps would stop prod sandboxes from that stale copy.
convex(
  ["run", "--deployment", targetName, "sandboxIdlePause:switchOffInternal"],
  `switch sandbox sweeps off on ${TARGET_DEPLOYMENT}`,
);

console.log(`\nDone. ${TARGET_DEPLOYMENT} now mirrors prod.`);
console.log(`Backup kept at ${zipPath}`);
