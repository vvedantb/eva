/**
 * The readiness half of the preview poll, with its sandbox calls injected.
 *
 * The poll fires every ~2s per open page and is the only thing watching a
 * preview, so the order of these steps is the whole behaviour: never touch a
 * stopped sandbox (on Vercel any exec resumes it), heal dead background
 * daemons on a rate-limited claim rather than on a failed probe (the app port
 * can serve while a daemon is down), and never relaunch the dev server inline
 * — Lifecycle owns the Console launcher, so recovery is scheduled instead.
 *
 * Extracted from `buildPreviewUrl` purely so those rules can be tested by
 * running them (see tests/previewPoll.test.ts) instead of by reading source.
 */

/** Readiness outcome of one poll. */
export type PreviewPollResult =
  | { kind: "sandbox-not-running" }
  | { kind: "probed"; ready: boolean };

/** Everything the poll does to the sandbox, so a test can watch it happen. */
export type PreviewPollIo = {
  /** Wins the per-sandbox heal slot, shared across every concurrent viewer. */
  claimHeal: () => Promise<boolean>;
  /** Restarts background daemons that died since the sandbox started. */
  healBackgroundCommands: () => Promise<void>;
  /** True when the previewed port is listening (or serving). */
  probeReady: () => Promise<boolean>;
  /** Relaunches the dev server through the Console launcher. */
  scheduleRecovery: () => Promise<void>;
  /** A failed heal must not fail the poll. */
  onHealFailed: (error: unknown) => void;
};

export async function pollPreviewReadiness(
  args: {
    /** `handle.state === "running"`, fetched without resuming the sandbox. */
    sandboxRunning: boolean;
    /** Set when the poll is for a user-defined tab, not the app's dev server. */
    customTabPort: number | undefined;
    /** The public port being previewed: 6080 desktop, 8080 editor, else app. */
    port: number;
  },
  io: PreviewPollIo,
): Promise<PreviewPollResult> {
  // Every exec goes through the SDK's withResume: on a stopped sandbox it
  // RESUMES it, and on a stopping one it waits the stop out and then revives
  // it — so this poll was waking sandboxes the user had just stopped. Report
  // not-ready without touching the VM; polling recovers once it is started.
  if (!args.sandboxRunning) return { kind: "sandbox-not-running" };

  // Custom tabs never heal or claim: both the heal and the recovery below are
  // about the app's dev server, and a stopped Supabase must not restart it.
  const healClaimed =
    args.customTabPort === undefined ? await io.claimHeal() : false;
  if (healClaimed) {
    try {
      await io.healBackgroundCommands();
    } catch (e) {
      io.onHealFailed(e);
    }
  }

  const ready = await io.probeReady();

  // Nothing watches the dev server after launch — an OOM kill or a lazily
  // resumed VM leaves the app port dead while the sandbox runs, and only this
  // poll notices. Reusing the heal claim rate-limits recovery to one attempt
  // per interval. Desktop and editor have their own lifecycles.
  if (!ready && healClaimed && args.port !== 6080 && args.port !== 8080) {
    await io.scheduleRecovery();
  }

  return { kind: "probed", ready };
}
