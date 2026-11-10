/**
 * Message shown when a test reads a repo source file. Written as an
 * instruction to whoever (human or agent) is editing the test.
 */
const message =
  "BANNED: tests that read source files as text. A regex over source breaks " +
  "on every refactor and passes on real logic bugs. Import the code and assert " +
  "on what it returns or does. If the rule is about code shape, write a lint " +
  "rule instead. See CLAUDE.md (Tests).";

const TEST_FILE = /\.test\.(ts|tsx)$/;
/** A path or file name ending in a source extension, not a bare extension. */
const SOURCE_PATH = /[^/.][^/]*\.(ts|tsx|css|html)$/;
/** File reads, plus helpers that wrap them (`read`, `readSource`, `sourceOf`). */
const READ_CALL = /^(read|source)|Source$/;

function calleeName(call) {
  const callee = call.callee;
  if (callee.type === "Identifier") return callee.name;
  if (
    callee.type === "MemberExpression" &&
    callee.property.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return "";
}

/** True when the string is (part of) an argument to a file-read call. */
function isReadArgument(node) {
  let child = node;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      parent.type === "CallExpression" &&
      parent.callee !== child &&
      READ_CALL.test(calleeName(parent))
    ) {
      return true;
    }
    if (parent.type.endsWith("Statement") || parent.type === "VariableDeclarator") {
      return false;
    }
    child = parent;
  }
  return false;
}

/**
 * Flags a source file name (`foo.ts`, `src/app.css`, `index.html`) passed to a
 * file read in a `*.test.ts(x)` file: `readFileSync(join(dir, "x.ts"))`, or a
 * wrapper such as `readSource("x.ts")`. Plain path strings used as test data
 * stay allowed, because this app handles file paths as data everywhere.
 */
export default {
  meta: {
    type: "problem",
    docs: { description: message },
  },
  create(context) {
    if (!TEST_FILE.test(context.filename)) return {};
    const check = (node, value) => {
      if (SOURCE_PATH.test(value) && isReadArgument(node)) {
        context.report({ message, node });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateLiteral(node) {
        const last = node.quasis[node.quasis.length - 1];
        if (last) check(node, last.value.cooked ?? last.value.raw);
      },
    };
  },
};
