export {
  list,
  get,
  getByNumId,
  create,
  update,
  remove,
} from "./_automations/crud";

export { triggerAutomation, runNow } from "./_automations/triggers";

export {
  listSystemAutomations,
  installSystemAutomation,
  uninstallSystemAutomation,
} from "./_automations/systemInstall";

export {
  listRuns,
  acknowledgeRun,
  countUnreadAll,
  getAutomationData,
  getRunForEmail,
  getRunForTriage,
  setFindingsTriage,
  updateRunStatus,
  clearRunWorkflow,
  cancelRun,
  handleCompletion,
} from "./_automations/runs";

export {
  createTasksFromFindings,
  autoStartTask,
} from "./_automations/findings";
