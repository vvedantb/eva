import { dirname } from "node:path";

const CALLBACK_SRC = dirname(import.meta.dir);

/**
 * Drops every callback-src module from Bun's registry, so the next import
 * re-runs module-level code (config reads the environment at load time).
 * Test files stay loaded; `mock.module` overrides still apply.
 */
export function freshModules(): void {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(CALLBACK_SRC) && !key.startsWith(import.meta.dir)) {
      delete require.cache[key];
    }
  }
}
