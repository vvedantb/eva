# Tests for the one-shot agent primitive

- New `tests/agentJobs.test.ts` pins the `_agentJobs/` primitive: `startAgentJob` takes a free slot, schedules the backstop and refuses a busy one; `agentJobs:handleCompletion` refuses a caller without repo access, drops a stale lease or superseded turn, and sends a current completion to the workflow bound to the turn.
- The same file pins teardown: the `agentJobs.handleStale` backstop (doc and automation run) and the test-gen cancel close the turn, free the slot, clear the streaming rows and schedule the sandbox delete.
- `_taskWorkflow/helpers.ts` is gone. `llmJson` and `extractFirstJsonValue` move to `_shared/llmJson.ts`; `clearStreamingActivity` moves to `streaming.ts`, next to `upsertStreamingActivity`. The unused `extractJsonBlock` is deleted.
- `buildStaleDocPatch` moves from `_prRecapWorkflow/staleDoc.ts` to `_agentJobs/staleDoc.ts`: it serves every doc job's teardown, not only the PR recap.
- Pure moves: no behaviour change.
