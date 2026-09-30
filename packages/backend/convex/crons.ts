import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Send the unread-notification digest at 08:00 UTC on weekdays (Mon-Fri).
crons.cron(
  "daily notification digest",
  "0 8 * * 1-5",
  internal.notificationDigest.sendDailyDigests,
  {},
);

// Check every 15 minutes whether the configured daily sandbox auto-stop time
// has been reached and, if so, stop every active sandbox. The action itself is
// a no-op when auto-stop is disabled or already ran for today's occurrence.
crons.interval(
  "sandbox auto-stop sweep",
  { minutes: 15 },
  internal.sandboxAutoStop.run,
  {},
);

// Rescan supported skill roots on every connected codebase every 6 hours. Push
// webhooks also trigger an immediate sync when the base branch changes skills;
// this cron is the backup when push events are not subscribed or a sync fails.
crons.interval(
  "repo skills github sync",
  { hours: 6 },
  internal._repoSkills.sync.syncAllRepos,
  {},
);

// Truth-sync eva's "active" sandbox statuses against the provider. Vercel
// stops VMs on its own (session-timeout cap, platform stops) with no webhook;
// without this, a session page left open showed "active" + a dead Preview
// until the next page-mount prewarm happened to probe it.
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

// Drop GitHub authorize-hop nonces nobody came back with. They expire after 10
// minutes regardless; this only stops the table growing.
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

// Safety net: delete sandboxes for archived sessions / done|cancelled tasks
// whose 48h grace has elapsed (or never got a grace schedule).
crons.cron(
  "dead sandbox sweep",
  "0 3 * * 0",
  internal.sandboxCleanup.sweepDeadSandboxes,
  {},
);

export default crons;
