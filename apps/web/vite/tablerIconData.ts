import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const VIRTUAL_ID = "virtual:tabler-icon-data";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

function buildModuleSource(): string {
  const require = createRequire(import.meta.url);
  const iconsDir = path.join(
    path.dirname(require.resolve("@tabler/icons-react/package.json")),
    "dist",
    "esm",
    "icons",
  );

  const entries: string[] = [];
  for (const file of readdirSync(iconsDir)) {
    if (!/^Icon.+\.mjs$/.test(file)) continue;
    const name = file.slice(0, -".mjs".length);
    const source = readFileSync(path.join(iconsDir, file), "utf8");
    const nodeMatch = source.match(/^const __iconNode = (.+);$/m);
    const variantMatch = source.match(
      /createReactComponent\("(outline|filled)"/,
    );
    if (!nodeMatch || !variantMatch) {
      throw new Error(
        `tablerIconData: unexpected icon module shape in ${file}`,
      );
    }
    const nodes = nodeMatch[1].replace(/ "key": "svg-\d+",?/g, "");
    entries.push(
      `${JSON.stringify(name)}:[${JSON.stringify(variantMatch[1])},${nodes}]`,
    );
  }

  return `export default {${entries.join(",")}};`;
}

export function tablerIconData(): Plugin {
  let cache: string | undefined;
  return {
    name: "eva-tabler-icon-data",
    resolveId: {
      filter: { id: /^virtual:tabler-icon-data$/ },
      handler(id) {
        if (id === VIRTUAL_ID) return RESOLVED_ID;
      },
    },
    load: {
      filter: { id: /^\0virtual:tabler-icon-data$/ },
      handler(id) {
        if (id === RESOLVED_ID) {
          cache ??= buildModuleSource();
          return cache;
        }
      },
    },
  };
}
