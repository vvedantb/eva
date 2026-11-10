// Eva custom oxlint plugin — enforces "parse at the boundary with Zod,
// don't hand-roll narrowing" conventions the built-in rules can't express.
//
// Wired via `jsPlugins` in ../../.oxlintrc.json. Rules are ESLint-compatible
// AST visitors (oxlint JS plugins are alpha and not subject to semver).

import noIsRecord from "./rules/no-is-record.mjs";
import noJsonParse from "./rules/no-json-parse.mjs";
import noDoubleCast from "./rules/no-double-cast.mjs";
import noValueBlockInTry from "./rules/no-value-block-in-try.mjs";
import noSourceTextInTests from "./rules/no-source-text-in-tests.mjs";

export default {
  meta: { name: "eva" },
  rules: {
    "no-is-record": noIsRecord,
    "no-json-parse": noJsonParse,
    "no-double-cast": noDoubleCast,
    "no-value-block-in-try": noValueBlockInTry,
    "no-source-text-in-tests": noSourceTextInTests,
  },
};
