"use node";

export {
  killSandboxProcess,
  stopSandbox,
  deleteSandbox,
  captureDiagnosticsAndStopSandbox,
  archiveSandbox,
  verifySandboxLiveness,
  getSandboxProviderKind,
  getSnapshotSandboxProviderKind,
} from "./_sandbox_runtime/lifecycle";

export {
  bulkUpdateSnapshotRetention,
  inspectSnapshotRetention,
  inspectSnapshotsByIds,
  purgeDeletedSnapshotTombstones,
} from "./_sandbox_runtime/bulkSnapshotRetention";

export {
  runSandboxCommand,
  restoreSeededRuntimeState,
  runStartupCommands,
  startupCommandsMarkerExists,
  runBackgroundCommands,
  watchConvexReadiness,
  runStopCommands,
  getPreviewUrl,
  prepareSandbox,
  createOrResumeSandbox,
  fetchBaseBranch,
  checkoutBaseBranch,
  setupSandboxBranch,
  pushSandboxBranch,
  launchOnExistingSandbox,
  prewarmSessionDaemon,
  prewarmEntityDaemon,
  killEntityDaemon,
  extendSandboxDeadline,
  reconcileStaleActiveSandboxes,
  validateSandbox,
} from "./_sandbox_runtime/execution";

export { runDevServerInTaskSandbox } from "./_sandbox_runtime/runDevServer";

export { ensureSessionPreviewServices } from "./_sandbox_runtime/previewRecovery";

export {
  toggleCodeServer,
  toggleDesktopServer,
  launchChromeInDesktop,
  startDesktopForBrowserEntity,
  readSandboxFile,
  writeSandboxFile,
  readSandboxMediaFile,
  listSandboxFiles,
} from "./_sandbox_runtime/services";

export { revertSessionToTurn } from "./_sandbox_runtime/turnRevert";

export {
  reconcileBackgroundProcesses,
  killBackgroundProcess,
} from "./_sandbox_runtime/backgroundProcesses";

export {
  startSessionSandbox,
  prepareSessionSandbox,
  performForcePushBranch,
  startTaskPreviewSandbox,
  startProjectPreviewSandbox,
} from "./_sandbox_runtime/sessions";
