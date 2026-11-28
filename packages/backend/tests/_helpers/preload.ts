import { Glob, plugin } from "bun";
import path from "node:path";

const GLOB_CALL = /import\.meta\.glob\(\s*"([^"]+)"\s*\)/g;
const SCHEDULER_DELAY = "}), tsInSecs * 1000 - Date.now());";

plugin({
  name: "convex-test-bun",
  setup(build) {
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
