/**
 * The app's two alert sounds, synthesised rather than loaded from files.
 *
 * Each is a handful of short sine tones — a few oscillator nodes — so
 * generating them beats shipping audio assets: nothing to fetch, nothing to
 * cache, and no first-alert delay while a request is in flight.
 *
 * - Reply chime: a soft rising two-note interval when the agent finishes.
 * - Notification bell: one struck, lower bell tone with a longer ring when an
 *   inbox notification arrives. Different pitch, shape and length, so the two
 *   are told apart without looking.
 */

type Tone = {
  frequency: number;
  startOffsetS: number;
  durationS: number;
  peakGain: number;
};

/** A soft rising interval (A5 then D6), the second note overlapping the first. */
const REPLY_CHIME: Tone[] = [
  { frequency: 880, startOffsetS: 0, durationS: 0.28, peakGain: 0.14 },
  { frequency: 1174.66, startOffsetS: 0.09, durationS: 0.28, peakGain: 0.14 },
];

/**
 * A single bell strike on E5. The upper partials sit at the inharmonic ratios
 * of a real bell (≈2.76× and 5.4×) and die away faster than the fundamental,
 * which is what makes it read as struck metal rather than a beep.
 */
const NOTIFICATION_BELL: Tone[] = [
  { frequency: 659.25, startOffsetS: 0, durationS: 0.9, peakGain: 0.13 },
  { frequency: 659.25 * 2.76, startOffsetS: 0, durationS: 0.45, peakGain: 0.05 },
  { frequency: 659.25 * 5.4, startOffsetS: 0, durationS: 0.2, peakGain: 0.02 },
];

/** Long enough to avoid a click on attack, short enough to still sound struck. */
const ATTACK_S = 0.012;

/**
 * Shared context, created on first use.
 *
 * Browsers cap how many AudioContexts a page may hold and start each one
 * suspended until a user gesture, so there is nothing to gain from building it
 * at import time.
 */
let sharedContext: AudioContext | null = null;

/**
 * Floor between any two sounds. Two sources can fire for the same moment — an
 * agent turn finishing in the open chat, and the `task_complete` notification
 * that lands right after it — and overlapping sounds read as a glitch rather
 * than as two events. Shared across both sounds, so the first one wins.
 */
const MIN_INTERVAL_S = 1;

let lastPlayedAtS: number | null = null;

function getAudioContext(): AudioContext | null {
  if (sharedContext) {
    return sharedContext;
  }
  if (typeof window === "undefined" || !window.AudioContext) {
    return null;
  }
  sharedContext = new window.AudioContext();
  return sharedContext;
}

/**
 * Plays a sound, including while the tab is in the background.
 *
 * Background playback is why this uses the Web Audio clock instead of a timer:
 * browsers throttle timers in hidden tabs but keep audio scheduling accurate,
 * so tones queued the moment an event arrives still play on time.
 *
 * Silent until the user has interacted with the page at least once — autoplay
 * policy holds a freshly loaded context suspended, and no amount of scheduling
 * overrides that. In practice signing in and navigating clears the requirement
 * well before the first alert lands.
 */
function playTones(tones: Tone[]): void {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  // Resuming is a no-op once the gesture requirement is met, and rejects while
  // it is not. Either way the scheduling below is correct: a suspended context
  // holds its clock, so the tones play on resume rather than being lost.
  if (context.state === "suspended") {
    context.resume().catch(() => undefined);
  }

  const soundStart = context.currentTime;
  if (lastPlayedAtS !== null && soundStart - lastPlayedAtS < MIN_INTERVAL_S) {
    return;
  }
  lastPlayedAtS = soundStart;

  for (const tone of tones) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = tone.frequency;

    // Ramp both edges. Starting or stopping a tone at full amplitude puts a
    // step change into the buffer, which is audible as a click.
    const toneStart = soundStart + tone.startOffsetS;
    const toneEnd = toneStart + tone.durationS;
    envelope.gain.setValueAtTime(0, toneStart);
    envelope.gain.linearRampToValueAtTime(tone.peakGain, toneStart + ATTACK_S);
    envelope.gain.exponentialRampToValueAtTime(0.0001, toneEnd);

    oscillator.connect(envelope).connect(context.destination);
    oscillator.start(toneStart);
    // Nodes are single-use; stopping releases them for garbage collection.
    oscillator.stop(toneEnd);
  }
}

/** The agent finished replying (`replyChime` flag). */
export function playReplyChime(): void {
  playTones(REPLY_CHIME);
}

/** An inbox notification arrived (`notificationBell` flag). */
export function playNotificationBell(): void {
  playTones(NOTIFICATION_BELL);
}
