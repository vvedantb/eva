import type { ForkTranscriptPrefix } from "@eva/shared";

export const DEMO_FORK_MESSAGES: ReadonlyArray<{
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
}> = [
  {
    id: "user-1",
    role: "user",
    content: "The invoices table is empty on billing.",
  },
  {
    id: "asst-1",
    role: "assistant",
    content: "I'll seed the invoices empty state and retry the invoice fetch.",
  },
  {
    id: "user-2",
    role: "user",
    content: "Also hide the upgrade banner.",
  },
];

export const DEMO_FORK_THROUGH_ID = "asst-1";

export const DEMO_FORK_PREFIX: ForkTranscriptPrefix = {
  throughMessageId: DEMO_FORK_THROUGH_ID,
  turns: [
    {
      messageId: "user-1",
      role: "user",
      text: "The invoices table is empty on billing.",
    },
    {
      messageId: "asst-1",
      role: "assistant",
      text: "I'll seed the invoices empty state and retry the invoice fetch.",
    },
  ],
};
