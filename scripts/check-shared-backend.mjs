#!/usr/bin/env node
// One backend for both apps: every Convex function the phone calls must also
// be one the web calls, so the two clients cannot drift onto separate server
// paths. A phone-only function needs an entry in ALLOWED with the reason it
// cannot be shared. CI runs this; `node scripts/check-shared-backend.mjs`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Phone-only functions, each with the reason. Remove an entry when the web calls it. */
const ALLOWED = {
  "push.register": "Device push tokens: the web has no phone push.",
  "push.unregister": "Device push tokens: the web has no phone push.",
  // The phone's own wrappers (open a chat by target, send, stop, model,
  // start, archive). They are moving to the neutral chats.* (#1302), which the
  // web then adopts one action at a time.
  "mobile.getChat": "Moving to chats.get (#1302).",
  "mobile.sendMessage": "Moving to chats.send (#1302).",
  "mobile.setChatModel": "Moving to chats.setModel (#1302).",
  "mobile.stopTurn": "Moving to chats.stop (#1302).",
  "mobile.startSession": "Moving to chats.start (#1302).",
  "mobile.archiveSession": "Moving to chats.archive (#1302).",
};

/** `api.module.fn` references (not URLs such as https://api.github.com). */
const API_REF = /(?<![\w./])api\.([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)/g;

function referencedFunctions(dirs) {
  const found = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        for (const match of readFileSync(path, "utf8").matchAll(API_REF)) found.add(match[1]);
      }
    }
  };
  for (const dir of dirs) walk(dir);
  return found;
}

const phone = referencedFunctions(["apps/mobile/app", "apps/mobile/src"]);
const web = referencedFunctions(["apps/web/src"]);
const phoneOnly = [...phone].filter((fn) => !web.has(fn)).sort();
const unexplained = phoneOnly.filter((fn) => !(fn in ALLOWED));
const stale = Object.keys(ALLOWED).filter((fn) => !phoneOnly.includes(fn));

for (const fn of unexplained) {
  console.error(`check-shared-backend: the phone calls api.${fn}, which the web never calls.`);
}
if (unexplained.length > 0) {
  console.error(
    "Call the web's function from the phone (or move both onto one shared function), " +
      "or, if it truly cannot be shared, add it to ALLOWED in scripts/check-shared-backend.mjs with the reason.",
  );
}
for (const fn of stale) {
  console.error(`check-shared-backend: ALLOWED lists ${fn}, which is no longer phone-only. Remove it.`);
}
if (unexplained.length > 0 || stale.length > 0) process.exit(1);
console.log(`check-shared-backend: OK (${phone.size} phone calls, ${phoneOnly.length} phone-only, all explained).`);
