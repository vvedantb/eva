import { expect, test } from "vitest";
import { wrapQueryHandler } from "../convex/_mcp/wrapQueryHandler";

test("does not evaluate template expressions in user handler source", () => {
  const previous = process.env.WRAP_QUERY_LEAK_TEST;
  process.env.WRAP_QUERY_LEAK_TEST = "should-not-appear";
  try {
    const bundled = wrapQueryHandler(
      'return `${process.env.WRAP_QUERY_LEAK_TEST}` + "ok";',
    );
    expect(bundled).toContain("${process.env.WRAP_QUERY_LEAK_TEST}");
    expect(bundled).not.toContain("should-not-appear");
  } finally {
    if (previous === undefined) delete process.env.WRAP_QUERY_LEAK_TEST;
    else process.env.WRAP_QUERY_LEAK_TEST = previous;
  }
});
