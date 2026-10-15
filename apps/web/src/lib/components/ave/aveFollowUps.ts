import {
  findStreamingTargetMessage,
  type ChatBodyMessage,
  type ChatHeldFollowUp,
} from "@/lib/components/chat/chatBodyUtils";

/**
 * Splits the messages typed during a run out of Ave's transcript.
 *
 * Ave stores a mid-run message as a transcript row straight away and folds it
 * into the next run (`requestRun`). Left in place it renders under the reply
 * that is still streaming, as if that reply answered it. Sessions keep such
 * messages in the queue panel until their turn starts, so Ave does the same:
 * user rows after the in-flight reply are held back. The next run opens its
 * reply after them, so they rejoin the transcript exactly when Ave reads them.
 *
 * Agent notifications stay in the transcript: they are not the user's to queue.
 */
export function splitAveFollowUps(
  messages: ChatBodyMessage[],
  isExecuting: boolean,
): { transcript: ChatBodyMessage[]; followUps: ChatHeldFollowUp[] } {
  const inFlight = isExecuting
    ? findStreamingTargetMessage(messages)
    : undefined;
  if (inFlight === undefined) return { transcript: messages, followUps: [] };
  const inFlightIndex = messages.indexOf(inFlight);
  const transcript: ChatBodyMessage[] = [];
  const followUps: ChatHeldFollowUp[] = [];
  messages.forEach((message, index) => {
    const isFollowUp =
      index > inFlightIndex &&
      message.role === "user" &&
      message.isSystemAlert !== true &&
      message.orchestratorNotification !== true;
    if (isFollowUp) {
      followUps.push({
        id: message._id,
        content: message.content,
        userId: message.userId,
      });
    } else {
      transcript.push(message);
    }
  });
  return { transcript, followUps };
}
