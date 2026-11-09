import { assertInvalid, assertValid } from "./harness.mjs";

assertInvalid("no-is-record", `function isRecord(x) { return true; }\n`);

assertInvalid("no-is-record", `import { isRecord } from "./guards";\n`);

assertValid("no-is-record", `function isObject(x) { return true; }\n`);

assertInvalid("no-double-cast", `const x = value as unknown as string;\n`);

assertValid("no-double-cast", `const x = value as string;\n`);

assertInvalid("no-json-parse", `const data = JSON.parse(raw);\n`);

// Cast / unknown annotation is not an escape hatch in eva.
assertInvalid("no-json-parse", `const data = JSON.parse(raw) as MyType;\n`);

assertInvalid("no-json-parse", `const data: unknown = JSON.parse(raw);\n`);

assertInvalid("no-json-parse", `const data = JSON.parse(raw) as unknown;\n`);

assertValid(
  "no-json-parse",
  `const data = schema.safeParse(JSON.parse(raw));\n`,
);

assertValid("no-json-parse", `const data = schema.parse(JSON.parse(raw));\n`);

// no-value-block-in-try — React Compiler bails on the whole file for these.
// Scope below mirrors what babel-plugin-react-compiler actually rejects.

const inHook = (body) => `function useThing(a, b, fn, xs) {
${body}
}
`;

assertInvalid(
  "no-value-block-in-try",
  inHook(`try { const x = a ? 1 : 2; } catch {}`),
);

assertInvalid(
  "no-value-block-in-try",
  inHook(`try { const x = a ?? b; } catch {}`),
);

assertInvalid("no-value-block-in-try", inHook(`try { fn?.(); } catch {}`));

assertInvalid(
  "no-value-block-in-try",
  inHook(`try { for (const x of xs) fn(x); } catch {}`),
);

// `finally` bails just like `try`.
assertInvalid(
  "no-value-block-in-try",
  inHook(`try { fn(); } catch {} finally { const x = a || b; }`),
);

// Components are compiled too, including via a `memo` wrapper.
assertInvalid(
  "no-value-block-in-try",
  `const Card = memo((a) => { try { const x = a ? 1 : 2; } catch {} });
`,
);

// Statement-level control flow compiles fine.
assertValid(
  "no-value-block-in-try",
  inHook(`try { if (a) { fn(); } else { fn(); } } catch {}`),
);

// `catch` bodies are lowered separately and do not bail.
assertValid(
  "no-value-block-in-try",
  inHook(`try { fn(); } catch { const x = a ? 1 : 2; }`),
);

// Nested functions get their own lowering, so a value block inside one is fine.
assertValid(
  "no-value-block-in-try",
  inHook(`try { fn((d) => (a ? d : 0)); } catch {}`),
);

// Plain helper modules are never compiled, so nothing there can bail.
assertValid(
  "no-value-block-in-try",
  `function formatLabel(a, b) { try { return a ?? b; } catch { return ""; } }
`,
);

// Explicit opt-out disables the whole file.
assertValid(
  "no-value-block-in-try",
  `"use no memo";
function useThing(a, b) { try { const x = a ?? b; } catch {} }
`,
);

// A `finally` clause bails whatever it contains, as does a catch-less `try`.
assertInvalid(
  "no-value-block-in-try",
  inHook(`try { fn(); } catch {} finally { fn(); }`),
);

assertInvalid(
  "no-value-block-in-try",
  inHook(`try { fn(); } finally { fn(); }`),
);

assertValid("no-value-block-in-try", inHook(`try { fn(); } catch {}`));

// A `throw` inside the try bails too; throwing from the catch is fine.
assertInvalid(
  "no-value-block-in-try",
  inHook(`try { if (a) throw new Error("x"); fn(); } catch {}`),
);
assertValid(
  "no-value-block-in-try",
  inHook(`try { fn(); } catch (e) { fn(); throw e; }`),
);
// A throw inside a nested function gets its own lowering.
assertValid(
  "no-value-block-in-try",
  inHook(`try { fn(() => { throw new Error("x"); }); } catch {}`),
);

// no-source-text-in-tests — tests must import code, not regex its source.
const inTest = { filename: "thing.test.ts" };
assertInvalid(
  "no-source-text-in-tests",
  `const s = readFileSync(join(dir, "convex/mcp/tools.ts"), "utf8");\n`,
  inTest,
);
assertInvalid(
  "no-source-text-in-tests",
  `const s = readSource("ThemeContext.tsx");\n`,
  inTest,
);
assertInvalid(
  "no-source-text-in-tests",
  "expect(read(`${dir}/app.css`)).toContain('x');\n",
  inTest,
);
assertInvalid("no-source-text-in-tests", `source("../index.html");\n`, inTest);
// File paths as plain test data stay allowed.
assertValid(
  "no-source-text-in-tests",
  `expect(toPath("src/app.tsx")).toBe("app");\n`,
  inTest,
);
assertValid("no-source-text-in-tests", `import { a } from "./a.ts";\n`, inTest);
assertValid("no-source-text-in-tests", `vi.mock("../config.ts");\n`, inTest);
assertValid(
  "no-source-text-in-tests",
  `readFileSync(join(dir, "fixture.json"), "utf8");\n`,
  inTest,
);
// Only test files are checked.
assertValid("no-source-text-in-tests", `readSource("convex/mcp/tools.ts");\n`);
