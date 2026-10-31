'use client';

/**
 * The sound a watching phone makes when the picture stops arriving.
 *
 * A frozen frame looks exactly like a sleeping baby, so losing the camera has
 * to be heard, not just shown. Synthesised rather than a file, so there is
 * nothing to fetch at the moment it matters.
 *
 * iOS only lets an audio context make sound once it has been started from a
 * tap, and a lost connection is never a tap. So the context is created and
 * resumed by `unlockAlarm`, which the Watch button calls, and kept here for the
 * alarm to use later.
 *
 * iOS also mutes an audio context on the silent switch unless told this is
 * playback, and can suspend it again later without saying so, so it is woken
 * before every beep and `getIsAlarmAudible` lets the page own up when it will
 * not wake.
 */

const BEEP_FREQUENCY_HERTZ = 880;
const BEEP_SECONDS = 0.25;
const BEEP_GAP_SECONDS = 0.15;
const BEEP_VOLUME = 1;

let context: AudioContext | null = null;

/**
 * Safari 17 and later. Older ones have no way to ask, and obey the silent switch.
 */
type NavigatorWithAudioSession = Navigator & { audioSession?: { type: string } };

function wake(audioContext: AudioContext): void {
  if (audioContext.state !== 'running') {
    // eslint-disable-next-line promise/prefer-await-to-then -- Called from a tap handler, which must stay synchronous for iOS to count it as a gesture.
    audioContext.resume().catch(() => {});
  }
}

export function unlockAlarm(): void {
  const { audioSession } = window.navigator as NavigatorWithAudioSession;

  if (audioSession !== undefined) {
    audioSession.type = 'playback';
  }

  context ??= new AudioContext();
  wake(context);
}

export function getIsAlarmAudible(): boolean {
  return context?.state === 'running';
}

/**
 * Two short beeps. The caller repeats it for as long as the picture is lost.
 */
export function soundAlarm(): void {
  if (context !== null) {
    wake(context);

    for (const offset of [0, BEEP_SECONDS + BEEP_GAP_SECONDS]) {
      const startsAt = context.currentTime + offset;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.frequency.value = BEEP_FREQUENCY_HERTZ;
      gain.gain.value = BEEP_VOLUME;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(startsAt);
      oscillator.stop(startsAt + BEEP_SECONDS);
    }
  }
}
