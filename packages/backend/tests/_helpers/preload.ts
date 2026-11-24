import { Glob, plugin } from "bun";
import path from "node:path";

/**
 * Bun gaps in the libraries the Convex tests load, fixed at load time so no
 * test file has to know about them.
 */
const GLOB_CALL = /import\.meta\.glob\(\s*"([^"]+)"\s*\)/g;
const SCHEDULER_DELAY = "}), tsInSecs * 1000 - Date.now());";

plugin({
  name: "convex-test-bun",
  setup(build) {
    // Convex component test helpers (`@convex-dev/<name>/test`) ship as source
    // that calls Vite's `import.meta.glob`, which Bun does not have. Expand each
    // call into the same `{ "./path.ts": () => import(...) }` map.
    build.onLoad(
      { filter: /node_modules\/@convex-dev\/[^/]+\/src\/test\.ts$/ },
      async ({ path: file }) => {
        const dir = path.dirname(file);
        const source = await Bun.file(file).text();
        const contents = source.replace(GLOB_CALL, (_, pattern: string) => {
          const entries = Array.from(
            new Glob(pattern.replace(/^\.\//, "")).scanSync(dir),
            (match) =>
              `${JSON.stringify(`./${match}`)}: () => import(${JSON.stringify(path.join(dir, match))})`,
          );
          return `({${entries.join(",")}})`;
        });
        return { contents, loader: "ts" };
      },
    );

    // convex-test schedules a due job with a negative delay. Bun's fake
    // setTimeout throws on that, so the job never runs. Clamp it to 0.
    build.onLoad(
      { filter: /node_modules\/convex-test\/dist\/index\.js$/ },
      async ({ path: file }) => {
        const source = await Bun.file(file).text();
        if (!source.includes(SCHEDULER_DELAY)) {
          throw new Error(
            "convex-test changed its scheduler: update tests/_helpers/preload.ts",
          );
        }
        return {
          contents: source.replace(
            SCHEDULER_DELAY,
            "}), Math.max(0, tsInSecs * 1000 - Date.now()));",
          ),
          loader: "js",
        };
      },
    );
  },
});
