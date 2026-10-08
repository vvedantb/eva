"use node";

// `repoGroups.ts` is an isolate file (authMutation/authQuery + plain ctx.db
// access), so the "use node" build action lives in its own top-level entry
// and is re-exported here — mirrors how `sandbox.ts` re-exports the
// `_sandbox_runtime` node actions.
export { buildGroupSnapshot } from "./_repoGroups/snapshotBuild";
