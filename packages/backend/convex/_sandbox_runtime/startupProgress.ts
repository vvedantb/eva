/** One sandbox startup stage as the UI's activity timeline reads it. */
export type ProgressStep = {
  type: "tool";
  label: string;
  status: "active" | "complete" | "pending";
};

/**
 * Finished stages, then the running one, then every planned stage after it as
 * pending, so the startup card shows what is left. A label missing from `plan`
 * leaves nothing pending.
 */
export function startupProgress(
  completed: ReadonlyArray<ProgressStep>,
  activeLabel: string,
  plan: ReadonlyArray<string>,
): Array<ProgressStep> {
  const at = plan.indexOf(activeLabel);
  const remaining = at < 0 ? [] : plan.slice(at + 1);
  return [
    ...completed,
    { type: "tool", label: activeLabel, status: "active" },
    ...remaining.map(
      (label): ProgressStep => ({ type: "tool", label, status: "pending" }),
    ),
  ];
}
