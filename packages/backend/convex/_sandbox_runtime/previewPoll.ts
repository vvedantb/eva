import { DESKTOP_PORT, EDITOR_PORT } from "@eva/shared";

/** Readiness outcome of one poll. */
export type PreviewPollResult =
  | { kind: "sandbox-not-running" }
  | { kind: "probed"; ready: boolean };

/** Everything the poll does to the sandbox, so a test can watch it happen. */
export type PreviewPollIo = {
  claimHeal: () => Promise<boolean>;
  healBackgroundCommands: () => Promise<void>;
  probeReady: () => Promise<boolean>;
  scheduleRecovery: () => Promise<void>;
  onHealFailed: (error: unknown) => void;
};

export async function pollPreviewReadiness(
  args: {
    sandboxRunning: boolean;
    customTabPort: number | undefined;
    port: number;
  },
  io: PreviewPollIo,
): Promise<PreviewPollResult> {
  if (!args.sandboxRunning) return { kind: "sandbox-not-running" };

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

  if (
    !ready &&
    healClaimed &&
    args.port !== DESKTOP_PORT &&
    args.port !== EDITOR_PORT
  ) {
    await io.scheduleRecovery();
  }

  return { kind: "probed", ready };
}
