import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { DIGEST_CRON } from "./_notifications/digestWindow";

const crons = cronJobs();

crons.cron(
  "daily notification digest",
  DIGEST_CRON,
  internal.notificationDigest.sendDailyDigests,
  {},
);

crons.interval(
  "sandbox auto-stop sweep",
  { minutes: 15 },
  internal.sandboxAutoStop.run,
  {},
);

crons.interval(
  "sandbox idle pause sweep",
  { minutes: 5 },
  internal.sandboxIdlePause.run,
  {},
);

crons.interval(
  "sandbox leak sweep",
  { minutes: 10 },
  internal.sandboxLeakSweep.run,
  {},
);

crons.cron(
  "repo skills github sync",
  "0 4 * * *",
  internal._repoSkills.sync.syncAllRepos,
  {},
);

crons.interval(
  "stale active sandbox reconcile",
  { minutes: 5 },
  internal.sandbox.reconcileStaleActiveSandboxes,
  {},
);

crons.interval(
  "session turn lease reconcile",
  { minutes: 1 },
  internal.turns.reconcile,
  {},
);

crons.interval(
  "github oauth state purge",
  { hours: 1 },
  internal._github.userTokens.purgeExpiredOauthStates,
  {},
);

crons.interval(
  "connector oauth state purge",
  { hours: 1 },
  internal._connectors.tokens.purgeExpiredOauthStates,
  {},
);

crons.cron(
  "dead sandbox sweep",
  "0 3 * * 0",
  internal.sandboxCleanup.sweepDeadSandboxes,
  {},
);

crons.cron(
  "orphan snapshot purge",
  "30 3 * * 0",
  internal.snapshotActions.purgeOrphanSnapshotsScheduled,
  {},
);

export default crons;
