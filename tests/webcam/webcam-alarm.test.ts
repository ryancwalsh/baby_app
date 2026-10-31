import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeAudioContext, stubNavigator } from '@/tests/webcam/fakes';
import { useFakeBrowser } from '@/tests/webcam/setup';

/**
 * The alarm keeps its audio context in the module, so each test gets a fresh copy of it.
 */
async function importAlarm() {
  vi.resetModules();

  return await import('@/components/webcam-alarm');
}

describe('the alarm', () => {
  useFakeBrowser();

  beforeEach(() => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
  });

  it('asks iOS not to obey the silent switch', async () => {
    const audioSession = { type: 'auto' };

    stubNavigator({ audioSession });

    const { unlockAlarm } = await importAlarm();

    unlockAlarm();

    expect(audioSession.type).toBe('playback');
  });

  it('wakes an audio context that has been suspended since the tap that unlocked it', async () => {
    const { soundAlarm, unlockAlarm } = await importAlarm();

    unlockAlarm();

    const [context] = FakeAudioContext.instances;

    if (context !== undefined) {
      context.state = 'suspended';
    }

    FakeAudioContext.resumeCount = 0;
    soundAlarm();

    expect(FakeAudioContext.resumeCount).toBe(1);
  });

  it('is loud enough to wake someone', async () => {
    const { soundAlarm, unlockAlarm } = await importAlarm();

    unlockAlarm();
    soundAlarm();

    expect(FakeAudioContext.gainValues.length).toBeGreaterThan(0);
    expect(Math.min(...FakeAudioContext.gainValues)).toBe(1);
  });
});
