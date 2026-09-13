/**
 * Wraps user-supplied Convex query handler source for `run_test_function`.
 *
 * Concatenate — do not interpolate `handlerBody` inside a template literal.
 * MCP `run_query` forwards customer code; `${…}` in that string would evaluate
 * in Eva's Node process while building the bundle and leak env secrets.
 */
export function wrapQueryHandler(handlerBody: string): string {
  return [
    'import { query } from "convex:/_system/repl/wrappers.js";',
    "",
    "export default query({",
    "  handler: async (ctx) => {",
    "    " + handlerBody,
    "  },",
    "});",
  ].join("\n");
}
