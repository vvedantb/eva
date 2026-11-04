import type { ActivityStep } from "@vvedantb/ui";

export const LANDING_MOCK_REPO = "acme/web";
export const LANDING_MOCK_TASK_NUMBER = 142;
export const LANDING_MOCK_TASK_TITLE = "Fix checkout postcode validation";

export const LANDING_MOCK_RUN_STEPS: ActivityStep[] = [
  {
    type: "read",
    label: "Read",
    detail: "src/checkout/validate.ts",
    status: "complete",
  },
  {
    type: "edit",
    label: "Edited",
    detail: "src/checkout/validate.ts",
    status: "complete",
  },
  {
    type: "bash",
    label: "Ran command",
    detail: "pnpm test checkout",
    status: "complete",
  },
];
