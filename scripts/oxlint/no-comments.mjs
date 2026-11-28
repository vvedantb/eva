const message =
  "No comments. Say it in code: a clearer name, a type, an extracted function. " +
  "Kept: lint and tool directives, license headers, doc comments on exports, and comments with an issue or RFC link. " +
  "See .agents/skills/no-comments.";

const directive =
  /^\s*(?:[*/]\s*)?(?:eslint-(?:disable|enable)|oxlint-(?:disable|enable)|@ts-(?:expect-error|ignore|nocheck|check)|[a-z]+(?:-[a-z]+)*-ignore\b|@vite-ignore|webpack[A-Z]|[#@]__(?:PURE|NO_SIDE_EFFECTS)__|@refresh\b|@jsx|<reference\b|(?:istanbul|c8|v8) ignore)/;
const license = /\b(?:license|copyright|SPDX-License-Identifier)\b/i;
const link = /https?:\/\//;

function isKept(comment, text) {
  const value = comment.value;
  if (directive.test(value) || license.test(value) || link.test(value)) {
    return true;
  }
  if (comment.type !== "Block" || !value.startsWith("*")) {
    return false;
  }
  return /^\s*export\s/.test(text.slice(comment.range[1]));
}

function lineStart(text, index) {
  return text.lastIndexOf("\n", index - 1) + 1;
}

function lineEnd(text, index) {
  const end = text.indexOf("\n", index);
  return end === -1 ? text.length : end;
}

function isBlank(text, start, end) {
  return text.slice(start, end).trim() === "";
}

function ownsLines(text, range) {
  return (
    isBlank(text, lineStart(text, range[0]), range[0]) &&
    isBlank(text, range[1], lineEnd(text, range[1]))
  );
}

function wholeLineRuns(text, ranges) {
  const runs = new Map();
  let run = null;
  for (const range of ranges) {
    if (!ownsLines(text, range)) {
      run = null;
      continue;
    }
    const start = lineStart(text, range[0]);
    if (run !== null && isBlank(text, run.end, start)) {
      run.end = lineEnd(text, range[1]);
    } else {
      run = { start, end: lineEnd(text, range[1]) };
    }
    runs.set(range, run);
  }
  return runs;
}

function lineRemoval(text, run) {
  const end = Math.min(run.end + 1, text.length);
  const previousLineBlank =
    run.start === 0 || isBlank(text, lineStart(text, run.start - 1), run.start);
  const nextLineEnd = lineEnd(text, end);
  if (previousLineBlank && end < text.length && isBlank(text, end, nextLineEnd)) {
    return [run.start, Math.min(nextLineEnd + 1, text.length)];
  }
  return [run.start, end];
}

function inlineRemoval(text, range) {
  if (isBlank(text, lineStart(text, range[0]), range[0])) {
    let end = range[1];
    while (text[end] === " " || text[end] === "\t") {
      end += 1;
    }
    return [range[0], end];
  }
  let start = range[0];
  while (start > 0 && (text[start - 1] === " " || text[start - 1] === "\t")) {
    start -= 1;
  }
  return [start, range[1]];
}

const noComments = {
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: { description: message },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const emptyJsxContainers = [];
    return {
      JSXExpressionContainer(node) {
        if (node.expression.type === "JSXEmptyExpression") {
          emptyJsxContainers.push(node.range);
        }
      },
      "Program:exit"() {
        const text = sourceCode.text;
        const targets = [];
        for (const comment of sourceCode.getAllComments()) {
          if (isKept(comment, text)) {
            continue;
          }
          const container = emptyJsxContainers.find(
            (range) => range[0] <= comment.range[0] && comment.range[1] <= range[1],
          );
          targets.push({ comment, range: container ?? comment.range });
        }
        const unique = [...new Map(targets.map((t) => [t.range, t])).values()];
        const runs = wholeLineRuns(
          text,
          unique.map((t) => t.range),
        );
        for (const { comment, range } of targets) {
          const run = runs.get(range);
          const removal = run ? lineRemoval(text, run) : inlineRemoval(text, range);
          context.report({
            loc: comment.loc,
            message,
            fix: (fixer) => fixer.removeRange(removal),
          });
        }
      },
    };
  },
};

export default {
  meta: { name: "no-comments" },
  rules: { "no-comments": noComments },
};
