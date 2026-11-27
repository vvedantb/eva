import { Glob } from "bun";

const CONVEX_DIR = new URL("../../convex/", import.meta.url).pathname;

export const modules: Record<string, () => Promise<object>> =
  Object.fromEntries(
    Array.from(new Glob("**/*.ts").scanSync(CONVEX_DIR), (file) => [
      `../convex/${file}`,
      () => import(`${CONVEX_DIR}${file}`),
    ]),
  );
