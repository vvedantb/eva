# Decision records moved out of comments: shared

Source: comment triage, 27 November 2026. Each line is file, symbol, decision. Written by Haiku agents; some entries state behaviour that the code already shows.

- `packages/shared/src/taskDetail.ts` | `STATUS_LABEL_BY_VALUE` / `PRIORITY_LABEL_BY_VALUE` | Activity values are stored as plain strings, so the label maps are keyed by string and looked up without a type cast.
- `packages/shared/src/taskDetail.ts` | `TASK_TEXT_EDITABLE_STATUSES` | Title and description stay editable only in draft, todo and business_review, and locked while an agent runs or once terminal, because refining the ask before a re-run is the point of business review.
- `packages/shared/src/terminalHistory.ts` | `TERMINAL_HISTORY_TAIL_MAX_CHARS` | A char cap sits on top of the line cap, so one huge line cannot inflate the entity doc.
- `packages/shared/src/threadFind.ts` | `(module)` | Find logic lives in `@eva/shared` so the phone's "Find in chat" counts and steps the same way as the web's `ThreadFindBar`.
- `packages/shared/src/turnCheckpoint.ts` | `(module)` | A restore is a new commit on the session branch, never a rewrite, so later turns stay in history and a later restore can undo it.
- `packages/shared/src/turnError.ts` | `(module)` | A failed turn shows as a failure notice, not as reply text, so a reply that begins with "Error:" is never mistaken for a failure.
- `packages/shared/src/usageLimitRecovery.ts` | `AT_LIMIT_UTILIZATION` | An account at or above 95% utilisation counts as no better than the account that just failed, so it is shown as "At limit too".
- `packages/shared/src/usageLimitRecovery.ts` | `RetryCandidateInput.provider` | Retry candidates stay on the chat model's provider, because a usage limit on one provider is no reason to run a different one.
- `packages/shared/src/usageLimits.ts` | `PROVIDER_LABELS` | A record, not a ternary, so adding a provider to the Convex validator fails to compile until it has a display name.
- `packages/shared/src/usageLimits.ts` | `REFRESH_FAILURE_COPY` | Refresh failures are split by reason only where each reason calls for a different next step for the user.
- `packages/shared/src/usageLimits.ts` | `SPEND_METER_WINDOW_KEYS` | Overage windows get a row but do not colour the chip, because spend beyond the plan is not a constraint and a full overage meter must not suggest the plan is about to refuse work.
- `packages/shared/src/usageLimits.ts` | `USAGE_READING_MAX_AGE_MS` | The client freshness window matches the server gate in `usageLimits.getForViewer`, so a stale reading is hidden the same way on both sides.
- `packages/shared/src/usageLimits.ts` | `emptyAccountUsageCopy` (complete case) | A complete reply with no plan windows reads as "not reporting", because Team and Enterprise spend caps live on claude.ai.
- `packages/shared/src/usageLimits.ts` | `emptyAccountUsageCopy` (partial and default cases) | Partial and legacy rows share one "not fully reported" copy, because either way the full picture was never available.
- `packages/shared/src/usageLimits.ts` | `toneForStatus` | A windowless reading takes its tone from the provider's status alone, because that verdict is all such a reading reports.
- `packages/shared/src/utils/dayLabel.ts` | `(module)` | Only dayjs is imported here, not `./dates`, because `./dates` loads `@vvedantb/ui`, which the mobile app cannot load.
- `packages/shared/src/utils/parseActivitySteps.ts` | `CACHE_SIZE` | Convex gives every consumer the same string, so a short identity-first cache turns seven parses of each streaming tick into one. Callers must treat results as read-only, because they share one array.
- `packages/shared/src/utils/parseActivitySteps.ts` | `SANDBOX_STARTUP_LABELS` | Startup plumbing labels collapse into one line in the simple view, because a reader who only wants to know Eva is waking up does not need them.
