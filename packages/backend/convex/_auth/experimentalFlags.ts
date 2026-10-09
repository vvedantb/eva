import type { Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type {
  experimentalFlagKeyValidator,
  resolvedExperimentalFlagsValidator,
} from "../_validators/shapes";

export type ExperimentalFlagKey = Infer<typeof experimentalFlagKeyValidator>;

export type ResolvedExperimentalFlags = Infer<
  typeof resolvedExperimentalFlagsValidator
>;

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
    notificationBell: flags?.notificationBell ?? false,
    disablePageMotion: flags?.disablePageMotion ?? false,
    viewVercelDeployment: flags?.viewVercelDeployment ?? false,
  };
}
