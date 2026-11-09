// Guard: the pnpm patch of @vvedantb/native-ui (DropdownMenu host, PromptInput grow)
// stays registered and applied, and call sites keep using the package components.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const mobileRoot = new URL("..", import.meta.url).pathname;
const repoRoot = new URL("../../..", import.meta.url).pathname;
const read = (path) => readFileSync(path, "utf8");

const patch = read(`${repoRoot}patches/@vvedantb__native-ui@0.11.2.patch`);
const added = patch.split("\n").filter((line) => line.startsWith("+")).join("\n");

test("patch is registered in pnpm.patchedDependencies", () => {
  assert.match(
    read(`${repoRoot}package.json`),
    /"@vvedantb\/native-ui@0\.11\.2": "patches\/@vvedantb__native-ui@0\.11\.2\.patch"/,
  );
});

test("patch gives DropdownMenu a full-size, box-none Modal host", () => {
  assert.match(added, /pointerEvents="box-none"/);
  assert.match(added, /flex: 1/);
});

test("patch grows PromptInput from content size and drops numberOfLines", () => {
  assert.match(added, /onContentSizeChange/);
  assert.match(added, /scrollEnabled=\{scrollEnabled\}/);
  assert.match(patch, /^-\s+numberOfLines=\{1\}/m);
});

test("call sites use native-ui DropdownMenu and PromptInput, not local copies", () => {
  for (const file of ["src/chat/ChatHeader.tsx", "src/inbox/InboxHeaderActions.tsx", "app/session/new.tsx"]) {
    assert.match(read(`${mobileRoot}${file}`), /DropdownMenu[\s\S]*from "@vvedantb\/native-ui\/primitives"/, file);
  }
  for (const file of ["app/chat/[target].tsx", "app/session/new.tsx"]) {
    assert.match(read(`${mobileRoot}${file}`), /PromptInput[\s\S]*from "@vvedantb\/native-ui\/ai"/, file);
  }
});
