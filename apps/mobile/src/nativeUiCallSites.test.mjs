// Guard: Eva uses the native-ui DropdownMenu and PromptInput (no local copies),
// on a native-ui version that ships the dropdown host and composer grow fixes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const mobileRoot = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(path, "utf8");
const packageRoot = `${mobileRoot}node_modules/@vvedantb/native-ui`;

test("installed native-ui is at least 0.12.1", () => {
  const { version } = JSON.parse(read(`${packageRoot}/package.json`));
  const [major, minor, patch] = version.split(".").map((part) => Number.parseInt(part, 10));
  const atLeast = major > 0 || minor > 12 || (minor === 12 && patch >= 1);
  assert.ok(atLeast, `native-ui ${version} is older than 0.12.1`);
});

test("native-ui DropdownMenu has a full-size, box-none Modal host", () => {
  const source = read(`${packageRoot}/src/DropdownMenu.tsx`);
  assert.match(source, /pointerEvents="box-none"/);
  assert.match(source, /flex: 1/);
});

test("native-ui PromptInput grows from content size", () => {
  const source = read(`${packageRoot}/src/ai/prompt-input.tsx`);
  assert.match(source, /onContentSizeChange/);
  assert.doesNotMatch(source, /numberOfLines=\{1\}/);
});

test("call sites use native-ui DropdownMenu and PromptInput, not local copies", () => {
  for (const file of ["src/chat/ChatHeader.tsx", "src/inbox/InboxHeaderActions.tsx", "app/session/new.tsx"]) {
    assert.match(read(`${mobileRoot}${file}`), /DropdownMenu[\s\S]*from "@vvedantb\/native-ui\/primitives"/, file);
  }
  for (const file of ["app/chat/[target].tsx", "app/session/new.tsx"]) {
    assert.match(read(`${mobileRoot}${file}`), /PromptInput[\s\S]*from "@vvedantb\/native-ui\/ai"/, file);
  }
});
