#!/usr/bin/env node
/**
 * Finds sequential awaits that could run in parallel. Candidates only:
 * every hit still needs a human/agent read before it changes.
 *
 * Usage (from the repo root):
 *   node .claude/skills/parallel-awaits/scan-awaits.cjs [pathPrefix...] [--diff <ref>] [--all]
 *
 *   pathPrefix   limit to files under these prefixes (default: whole repo)
 *   --diff <ref> limit to .ts/.tsx files changed since <ref> (e.g. origin/main)
 *   --all        also report pairs that are bare `await x();` statements
 *
 * Reports:
 *   PAIR  `const a = await A; ...; const b = await B;` where B uses nothing
 *         declared since A (only guards / plain consts in between).
 *   LOOP  for/for-of/for-in loops that await reads one by one. Loops that only
 *         write, sleep/poll, `break`/`return`, or carry state are skipped.
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = execSync("git rev-parse --show-toplevel").toString().trim();
const ts = require(require.resolve("typescript", { paths: [root] }));

const args = process.argv.slice(2);
const includeAll = args.includes("--all");
const diffIndex = args.indexOf("--diff");
const diffRef = diffIndex >= 0 ? args[diffIndex + 1] : null;
const prefixes = args.filter(
  (arg, i) => !arg.startsWith("--") && (diffIndex < 0 || i !== diffIndex + 1),
);

const EXCLUDE =
  /(^|\/)(node_modules|_generated|__tests__|_migrations)\/|\.test\.|\.spec\.|\.d\.ts$|\.generated\.|^(t3code|video|scripts)\/|dataMigrations\.ts$|^\.claude\//;

const listCommand = diffRef
  ? `git diff --name-only ${diffRef} -- "*.ts" "*.tsx"`
  : `git ls-files "*.ts" "*.tsx"`;
const files = execSync(listCommand, { cwd: root })
  .toString()
  .split("\n")
  .filter(
    (file) =>
      file &&
      !EXCLUDE.test(file) &&
      (prefixes.length === 0 || prefixes.some((p) => file.startsWith(p))) &&
      fs.existsSync(path.join(root, file)),
  );

const WRITE_ONLY = /\.(patch|insert|delete|replace)\(|scheduler\./;
const SLEEPY = /\b(wait|sleep|delay|setTimeout)\b/i;
const oneLine = (node, max) => node.getText().replace(/\s+/g, " ").slice(0, max);

function containsAwait(node) {
  let found = false;
  (function visit(child) {
    if (found) return;
    if (child !== node && ts.isFunctionLike(child)) return;
    if (
      ts.isAwaitExpression(child) ||
      (ts.isForOfStatement(child) && child.awaitModifier)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  })(node);
  return found;
}

function identifiers(node) {
  const names = new Set();
  (function visit(child) {
    if (ts.isIdentifier(child)) names.add(child.text);
    ts.forEachChild(child, visit);
  })(node);
  return names;
}

function declaredNames(statement) {
  const names = new Set();
  if (!ts.isVariableStatement(statement)) return names;
  for (const decl of statement.declarationList.declarations) {
    for (const name of identifiers(decl.name)) names.add(name);
  }
  return names;
}

function awaitOf(statement) {
  if (ts.isVariableStatement(statement)) {
    const decls = statement.declarationList.declarations;
    const init = decls.length === 1 ? decls[0].initializer : undefined;
    if (init && ts.isAwaitExpression(init)) return init;
  }
  if (
    ts.isExpressionStatement(statement) &&
    ts.isAwaitExpression(statement.expression)
  ) {
    return statement.expression;
  }
  return null;
}

function isGuard(statement) {
  if (!ts.isIfStatement(statement) || containsAwait(statement)) return false;
  const then = statement.thenStatement;
  const last = ts.isBlock(then) ? then.statements.at(-1) : then;
  return Boolean(last && (ts.isReturnStatement(last) || ts.isThrowStatement(last)));
}

function enclosingName(node) {
  for (let n = node; n; n = n.parent) {
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name) {
      return n.name.getText();
    }
    if (ts.isVariableDeclaration(n) || ts.isPropertyAssignment(n)) {
      return n.name.getText();
    }
  }
  return "?";
}

const pairs = [];
const loops = [];

for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;

  function scanBlock(statements) {
    let run = [];
    for (const statement of statements) {
      const awaited = awaitOf(statement);
      if (awaited) {
        const used = identifiers(awaited);
        const dependent = run.some((entry) =>
          [...entry.names].some((name) => used.has(name)),
        );
        const first = run.find((entry) => entry.awaited);
        const bothDecls =
          first &&
          ts.isVariableStatement(first.statement) &&
          ts.isVariableStatement(statement);
        if (!dependent && first && (includeAll || bothDecls)) {
          pairs.push({
            where: `${file}:${lineOf(first.statement)}-${lineOf(statement)}`,
            fn: enclosingName(statement),
            a: oneLine(first.statement, 110),
            b: oneLine(statement, 110),
          });
        }
        run.push({ statement, awaited, names: declaredNames(statement) });
      } else if (run.length && isGuard(statement)) {
        run.push({ statement, awaited: null, names: new Set() });
      } else if (
        run.length &&
        ts.isVariableStatement(statement) &&
        !containsAwait(statement)
      ) {
        run.push({ statement, awaited: null, names: declaredNames(statement) });
      } else {
        run = [];
      }
    }
  }

  function scanLoop(loop) {
    const awaits = [];
    let exitsEarly = false;
    let carriesState = false;
    (function visit(node) {
      if (ts.isFunctionLike(node)) return;
      if (ts.isAwaitExpression(node)) awaits.push(oneLine(node.expression, 80));
      if (ts.isBreakStatement(node) || ts.isReturnStatement(node)) exitsEarly = true;
      if (
        ts.isBinaryExpression(node) &&
        ts.isIdentifier(node.left) &&
        [
          ts.SyntaxKind.EqualsToken,
          ts.SyntaxKind.PlusEqualsToken,
          ts.SyntaxKind.MinusEqualsToken,
        ].includes(node.operatorToken.kind)
      ) {
        carriesState = true;
      }
      ts.forEachChild(node, visit);
    })(loop.statement);
    if (awaits.length === 0 || exitsEarly || carriesState) return;
    if (awaits.every((a) => WRITE_ONLY.test(a))) return;
    if (SLEEPY.test(awaits.join(" "))) return;
    loops.push({
      where: `${file}:${lineOf(loop)}`,
      fn: enclosingName(loop),
      awaits: awaits.join(" | "),
    });
  }

  (function visit(node) {
    if (ts.isBlock(node) || ts.isSourceFile(node) || ts.isCaseClause(node)) {
      scanBlock(node.statements);
    }
    if (
      (ts.isForOfStatement(node) ||
        ts.isForStatement(node) ||
        ts.isForInStatement(node)) &&
      !node.awaitModifier
    ) {
      scanLoop(node);
    }
    ts.forEachChild(node, visit);
  })(sf);
}

for (const p of pairs) {
  console.log(`PAIR ${p.where} (${p.fn})\n  A: ${p.a}\n  B: ${p.b}`);
}
for (const l of loops) {
  console.log(`LOOP ${l.where} (${l.fn})\n  ${l.awaits}`);
}
console.error(
  `scan-awaits: ${files.length} files, ${pairs.length} pairs, ${loops.length} loops`,
);
