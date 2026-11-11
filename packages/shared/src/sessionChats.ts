/**
 * How many chats of one session may execute a turn at the same time. Each
 * running chat is its own agent process on the shared sandbox; the VM holds
 * three comfortably alongside the dev server. A fourth send queues on its
 * chat until a sibling finishes (`drainSessionChatQueues`).
 */
export const MAX_PARALLEL_CHATS = 3;
