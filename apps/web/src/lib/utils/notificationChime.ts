import { playTone, type Tone } from "@vvedantb/ui/audio";

/**
 * The inbox notification bell, synthesised rather than loaded from a file.
 *
 * A few short sine tones beat a shipped audio asset: nothing to fetch or cache,
 * and no first-alert delay. One struck, lower bell tone with a longer ring.
 *
 * `playTone` from `@vvedantb/ui/audio` owns the AudioContext and the shared
 * 1 second floor, so a bell and a reply chime that fire together sound once.
 * Do not wrap it in `withAudioFloor`: `playTone` already takes the floor.
 */

/**
 * A single bell strike on E5. The upper partials sit at the inharmonic ratios
 * of a real bell (≈2.76× and 5.4×) and die away faster than the fundamental,
 * which is what makes it read as struck metal rather than a beep.
 */
const NOTIFICATION_BELL: readonly Tone[] = [
  { frequency: 659.25, durationS: 0.9, peakGain: 0.13 },
  { frequency: 659.25 * 2.76, durationS: 0.45, peakGain: 0.05 },
  { frequency: 659.25 * 5.4, durationS: 0.2, peakGain: 0.02 },
];

/** An inbox notification arrived (`notificationBell` flag). */
export function playNotificationBell(): void {
  playTone(NOTIFICATION_BELL);
}
