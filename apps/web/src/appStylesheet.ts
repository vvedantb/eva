import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webSrc = dirname(fileURLToPath(import.meta.url));
const tokensCss = join(
  webSrc,
  "..",
  "node_modules",
  "@vvedantb",
  "ui",
  "tokens",
  "src",
  "css",
);

/**
 * For the design contract tests: `globals.css` followed by every
 * `@vvedantb/ui/tokens/css/*.css` file it imports, so a rule eva takes from
 * the package (modal, hit-target, border beam) is still checked.
 */
export function readAppStylesheet(): string {
  const globals = readFileSync(join(webSrc, "globals.css"), "utf8");
  const imported = [
    ...globals.matchAll(
      /@import "@vvedantb\/ui\/tokens\/css\/([\w-]+\.css)";/g,
    ),
  ].map((match) => readFileSync(join(tokensCss, match[1] ?? ""), "utf8"));
  return [globals, ...imported].join("\n").replaceAll("\r\n", "\n");
}
