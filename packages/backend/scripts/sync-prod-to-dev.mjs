import { mkdirSync, unlinkSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

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

convex(
  ["run", "--deployment", targetName, "sandboxIdlePause:switchOffInternal"],
  `switch sandbox sweeps off on ${TARGET_DEPLOYMENT}`,
);

console.log(`\nDone. ${TARGET_DEPLOYMENT} now mirrors prod.`);
console.log(`Backup kept at ${zipPath}`);
