import { playTone, type Tone } from "@vvedantb/ui";

const NOTIFICATION_BELL: readonly Tone[] = [
  { frequency: 659.25, startOffsetS: 0, durationS: 0.9, peakGain: 0.13 },
  { frequency: 659.25 * 2.76, startOffsetS: 0, durationS: 0.45, peakGain: 0.05 },
  { frequency: 659.25 * 5.4, startOffsetS: 0, durationS: 0.2, peakGain: 0.02 },
];

/**
 * An inbox notification arrived (`notificationBell` flag). Shares the
 * package's 1 second audio floor with the reply chime, so a turn finishing and
 * its `task_complete` notification sound once.
 */
export function playNotificationBell(): void {
  playTone(NOTIFICATION_BELL);
}
