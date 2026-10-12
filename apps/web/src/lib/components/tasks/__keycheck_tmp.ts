import type { useTaskDetail } from "./useTaskDetail";
type OldKeys = "activeRun"|"activeRunElapsed"|"activeTab"|"baseBranch"|"canCreatePr"|"canEditTaskText"|"canStartSandbox"|"canViewSandbox"|"comments"|"creatorUser"|"devServerCommandLabel"|"executionError"|"handleCreatePr"|"handleResolveConflicts"|"handleRetryStartupCommands"|"handleRunBackgroundCommands"|"handleRunDevServer"|"handleSelectSurface"|"handleStartExecution"|"handleStartSandbox"|"handleStopExecution"|"handleStopSandbox"|"hasActiveRun"|"hasRuns"|"isActivityBusy"|"isBlocked"|"isCreatingPr"|"isLoading"|"isNotFound"|"isOwner"|"isProjectTask"|"isRetryingStartupCommands"|"isRunningBackgroundCommands"|"isRunningDevServer"|"isSandboxActive"|"isSandboxStarting"|"isSandboxStopping"|"isStarting"|"isStopping"|"latestDeployment"|"latestPrError"|"latestPrUrl"|"layoutGridClass"|"modalWidthClass"|"projects"|"reviewTaskSandboxStatus"|"runs"|"sandboxId"|"sandboxStartupActivity"|"setActiveTab"|"setExecutionError"|"setShowResolveConfirm"|"setShowRunDevServerConfirm"|"setShowStartupCommandsConfirm"|"setShowStopConfirm"|"showResolveConfirm"|"showRunDevServerConfirm"|"showSandbox"|"showStartupCommandsConfirm"|"showStopConfirm"|"showTabsColumn"|"status"|"streaming"|"task"|"taskActivity"|"users";
type NewKeys = keyof ReturnType<typeof useTaskDetail>;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const keysMatch: Equal<OldKeys, NewKeys> = true;
type Extra = Exclude<NewKeys, OldKeys>;
type Missing = Exclude<OldKeys, NewKeys>;
export const noExtra: [Extra] extends [never] ? true : false = true;
export const noMissing: [Missing] extends [never] ? true : false = true;
