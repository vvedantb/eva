/**
 * Hand-rolled one-off migrations (paginated internalMutations).
 * For new table-wide backfills prefer `@convex-dev/migrations` via
 * `dataMigrations.ts` (batched, resumable, dry-run / cancel / status).
 */
export { cleanupStaleRuns } from "./_migrations/cleanup";
export {
  deleteRepoStep,
  deleteNonEvalucomRepos,
  deleteEvalucomRepos,
} from "./_migrations/deleteRepos";
export { backfillDeploymentUrlScheme } from "./_migrations/deploymentUrl";
export { migrateRepoSkillsToGithubMetadata } from "./_migrations/repoSkills";
export { backfillLogProjectIds } from "./_migrations/logProjectIds";
export { repairStuckProjectInterview } from "./_migrations/projectInterview";
export {
  migrateProjectPhases,
  repairStuckProjectPhases,
} from "./_migrations/projectPhases";
export { removeSnapshotWarmupFields } from "./_migrations/removeSnapshotWarmupFields";
export { removeSessionStartupRequestedAt } from "./_migrations/removeSessionStartupRequestedAt";
export { removeProjectIdField } from "./_migrations/removeProjectIdField";
export {
  backfillNumIds,
  backfillNumIdsForEntityType,
} from "./_migrations/backfillNumIds";
export { backfillQueuedMessageOrder } from "./_migrations/backfillQueuedMessageOrder";
export { backfillEvaPrRecapOrigin } from "./_migrations/backfillEvaPrRecapOrigin";
export { excludeConvexUrlFromSandbox } from "./_migrations/excludeConvexUrlFromSandbox";
export { backfillExperimentalFlags } from "./_migrations/backfillExperimentalFlags";
export { backfillArchivedFromPrState } from "./_migrations/backfillArchivedFromPrState";
