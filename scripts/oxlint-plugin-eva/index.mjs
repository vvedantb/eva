// Local oxlint plugin — holds only the rules that the shared
// `@vvedantb/config` oxlint plugin does not (yet) register at runtime.
//
// `no-is-record` is documented in @vvedantb/config and imported by its
// plugin.mjs, but @vvedantb/config@0.7.0 omits it from the exported `rules`
// map, so it is unavailable from the shared plugin. Keeping it here preserves
// the `isRecord` ban the codebase relies on (see CLAUDE.md). Remove this
// plugin once a @vvedantb/config release registers `no-is-record`.
//
// Wired via `jsPlugins` in ../../.oxlintrc.json. The other former `eva/*`
// rules (no-json-parse, no-double-cast, no-value-block-in-try,
// no-source-text-in-tests) now come from the shared `vvedantb` plugin.

import noIsRecord from "./rules/no-is-record.mjs";

export default {
  meta: { name: "eva" },
  rules: {
    "no-is-record": noIsRecord,
  },
};
