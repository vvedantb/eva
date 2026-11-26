# Sandbox memory pressure: dev services die first, watchdog stops misreading frozen turns

- Dev services are the kernel OOM killer's first choice: the dev server launch scripts (`launchDevServerInVercelConsole`, `launchDevServerInBackground`) and every background command (`runBackgroundCommands`, e.g. `convex dev`) start with `PREFER_OOM_KILL_LINE` (`oom_score_adj` 500). Eva restarts these, while a killed agent loses the turn.
- Watchdog liveness probe (`verifySandboxLiveness`): a probe that timed out or exited by signal (128+) now reports `probe_exec_failed` (alive, so the bounded 10-minute silent grace applies) instead of `pid_dead_or_exec_failed`. Only a clean exit 1–127 reports `pid_dead`. Session 1054 was finalised as dead on 26 November 2026, then heartbeated 3 minutes later.
- Heartbeats now carry `oomKills` (kernel count from `/proc/vmstat`), logged as `[heartbeat][vm] … oomKills=N`, so a rise proves an OOM kill even when the post-mortem exec fails.
- Claude turns: a `PreToolUse` hook on Bash adds a note for the agent when the VM has under 1 GB RAM free or more than half its swap used, steering it away from full type checks, builds and test suites. The command still runs.
