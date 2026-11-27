#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ALLOWED = {
  "push.register": "Device push tokens: the web has no phone push.",
  "push.unregister": "Device push tokens: the web has no phone push.",
  "crashReports.report": "Phone crash reports: a native or JS crash closes the phone app; the web has no such crash to report.",
  "chats.get": "The web moves onto chats.* one action at a time (#1302).",
  "chats.send": "The web moves onto chats.* one action at a time (#1302).",
  "chats.setModel": "The web moves onto chats.* one action at a time (#1302).",
  "chats.stop": "The web moves onto chats.* one action at a time (#1302).",
  "chats.start": "The web moves onto chats.* one action at a time (#1302).",
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
