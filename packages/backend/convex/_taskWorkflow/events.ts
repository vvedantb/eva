import { defineEvent } from "@convex-dev/workflow";
import { workflowCompleteValidator } from "../validators";

/** Workflow event emitted when the main task execution completes. */
export const taskCompleteEvent = defineEvent({
  name: "taskComplete",
  validator: workflowCompleteValidator,
});

