import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildSource = readFileSync(
  join(backendRoot, "scripts/build-annotation-script.mjs"),
  "utf8",
);
const generatedSource = readFileSync(
  join(
    backendRoot,
    "convex/_sandbox_runtime/previewAnnotationScript.generated.ts",
  ),
  "utf8",
);
const html2canvasSource = readFileSync(
  join(backendRoot, "convex/_sandbox_runtime/html2canvasScript.generated.ts"),
  "utf8",
);
const proxySource = readFileSync(
  join(backendRoot, "convex/_sandbox_runtime/previewProxy.ts"),
  "utf8",
);
const packageJson = readFileSync(join(backendRoot, "package.json"), "utf8");

describe("preview annotation bundle", () => {
  test("is rebuilt before every backend deploy", () => {
    expect(packageJson).toContain(
      '"predeploy": "pnpm run build:callback && pnpm run build:annotation"',
    );
  });

  test("typechecks its browser entry before bundling", () => {
    const typecheckAt = buildSource.indexOf('"tsc", "--noEmit"');
    const buildAt = buildSource.indexOf("await esbuild.build(");
    expect(typecheckAt).toBeGreaterThan(-1);
    expect(buildAt).toBeGreaterThan(typecheckAt);
  });

  test("rejects external esbuild helper references", () => {
    expect(buildSource).toContain("__name|__defProp|__spreadValues|__async");
    expect(buildSource).toContain("process.exit(1)");
  });

  test("refuses to write a bundle without the ready protocol", () => {
    expect(buildSource).toContain(
      'bundled.includes("eva-preview-annotate-ready")',
    );
  });

  test("checks in a substantial self-contained protocol bundle", () => {
    expect(generatedSource.length).toBeGreaterThan(10_000);
    expect(generatedSource).toContain("eva-preview-annotate-ready");
    expect(generatedSource).toContain("eva-preview-screenshot-capture");
    expect(generatedSource).toContain("eva-preview-snapshot-capture");
    expect(generatedSource).toContain("/__eva_preview_proxy/html2canvas.js");
    expect(generatedSource).not.toMatch(
      /\b(__name|__defProp|__spreadValues|__async)\b/,
    );
  });

  test("ships the forensic context fields the annotation parser reads", () => {
    for (const field of [
      "accessibility",
      "nearbyText",
      "nearbyElements",
      "fullPath",
      "stylesSummary",
      "devicePixelRatio",
    ]) {
      expect(generatedSource).toContain(field);
    }
  });

  test("vendors html2canvas for on-demand screenshot capture", () => {
    expect(html2canvasSource.length).toBeGreaterThan(50_000);
    expect(html2canvasSource).toContain(
      "export const PREVIEW_HTML2CANVAS_SCRIPT",
    );
    expect(html2canvasSource).toContain("html2canvas");
  });

  test("injects the generated bundle rather than stringifying its function", () => {
    expect(proxySource).toContain(
      'import { PREVIEW_ANNOTATION_SCRIPT } from "./previewAnnotationScript.generated"',
    );
    expect(proxySource).toContain(
      'import { PREVIEW_HTML2CANVAS_SCRIPT } from "./html2canvasScript.generated"',
    );
    expect(proxySource).toContain(
      "const ANNOTATION_SCRIPT = ${JSON.stringify(PREVIEW_ANNOTATION_SCRIPT)}",
    );
    expect(proxySource).toContain("/__eva_preview_proxy/html2canvas.js");
    expect(proxySource).not.toContain("PREVIEW_ANNOTATION_SCRIPT.toString");
  });
});
