# One primitive for every one-shot sandbox agent

- Doc interview, doc generate, test generation, PR recap, evaluation, eval fix, browser runs and automations now run through `runOneShotAgent` (`_agentJobs/runOneShotAgent.ts`): prepare, launch under a turn, one `agentJobComplete` event, `onResult` / `onError`, sandbox delete and stream clear in `finally`.
- One completion, `agentJobs:handleCompletion`, replaces seven: it checks repo access, settles the turn lease and sends the event to the turn's own workflow.
- One slot rule and one backstop (`startAgentJob`, `agentJobs.handleStale`): every start refuses a busy slot (PR recap no longer overwrites it) and automation runs now get a backstop.
- One teardown (`stopAgentJob`, `tearDownStaleAgentJob`) for cancel, stall and backstop: it closes the turn, clears every stream id (the `pr-recap:` row too) and deletes the ephemeral sandbox.
- Browser runs now launch under a turn, so their completion is no longer dropped by the lease fence.
