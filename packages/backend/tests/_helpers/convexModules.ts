import { Glob } from "bun";

/**
 * The Convex function modules for convex-test, keyed like Vite's
 * `import.meta.glob("../convex/**\/*.ts")`. One scan per module registry:
 * `bun test --parallel` isolates each file, so that is once per test file.
 */
const CONVEX_DIR = new URL("../../convex/", import.meta.url).pathname;

export const modules: Record<string, () => Promise<object>> =
  Object.fromEntries(
    Array.from(new Glob("**/*.ts").scanSync(CONVEX_DIR), (file) => [
      `../convex/${file}`,
      () => import(`${CONVEX_DIR}${file}`),
    ]),
  );
