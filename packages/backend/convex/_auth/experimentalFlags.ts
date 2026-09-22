import type { Doc } from "../_generated/dataModel";

export type ExperimentalFlagKey =
  | "sessionTabs"
  | "blurPid"
  | "voiceDictation"
  | "composerAutocomplete"
  | "simpleView"
  | "replyChime"
  | "disablePageMotion"
  | "viewVercelDeployment";

export type ResolvedExperimentalFlags = {
  sessionTabs: boolean;
  blurPid: boolean;
  voiceDictation: boolean;
  composerAutocomplete: boolean;
  simpleView: boolean;
  replyChime: boolean;
  disablePageMotion: boolean;
  viewVercelDeployment: boolean;
};

/** Resolves experimental flags for a user. Missing / unset keys are false. */
export function resolveExperimentalFlags(
  user: Doc<"users"> | null | undefined,
): ResolvedExperimentalFlags {
  const flags = user?.experimentalFlags;
  return {
    sessionTabs: flags?.sessionTabs ?? false,
    blurPid: flags?.blurPid ?? false,
    voiceDictation: flags?.voiceDictation ?? false,
    composerAutocomplete: flags?.composerAutocomplete ?? false,
    simpleView: flags?.simpleView ?? false,
    replyChime: flags?.replyChime ?? false,
    disablePageMotion: flags?.disablePageMotion ?? false,
    viewVercelDeployment: flags?.viewVercelDeployment ?? false,
  };
}
