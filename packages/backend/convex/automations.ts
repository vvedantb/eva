export {
  list,
  get,
  getByNumId,
  create,
  update,
  remove,
} from "./_automations/crud";

export {
  triggerAutomation,
  runNow,
  startEventRun,
} from "./_automations/triggers";

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
  getRunForTriage,
  setFindingsTriage,
  updateRunStatus,
  clearRunWorkflow,
  cancelRun,
  handleCompletion,
} from "./_automations/runs";

export {
  getAlertWebhook,
  rotateAlertSecret,
} from "./_automations/alertWebhook";

export {
  getRunForEmail,
  previewRunEmail,
  updateRunEmail,
  sendRunEmail,
  discardRunEmail,
} from "./_automations/email";

export {
  createTasksFromFindings,
  autoStartTask,
} from "./_automations/findings";
