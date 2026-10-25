'use client';

import { LightbulbIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getLastKnownNanitAction, type LastKnownNanit } from '@/app/actions/device-state';
import { formatClockTime } from '@/components/tracking-format';
import { useClockFormat } from '@/hooks/use-clock-format';

/**
 * The night light tile while this phone cannot reach the laptop: what the laptop last recorded, with its time, dimmed and with nothing to press. It is last known rather than current, since a change made from the Nanit app while the laptop is off is invisible.
 */
export function NightLightOffline({ secretHash }: { readonly secretHash: string }) {
  const { is24Hour } = useClockFormat();
  const [lastKnown, setLastKnown] = useState<LastKnownNanit['nightLight'] | undefined>();

  useEffect(() => {
    async function load() {
      try {
        setLastKnown((await getLastKnownNanitAction(secretHash)).nightLight);
      } catch {
        setLastKnown(null);
      }
    }

    load();
  }, [secretHash]);

  let description = 'Checking what was last known…';
  if (lastKnown === null) {
    description = 'Nothing is known about it yet.';
  } else if (lastKnown !== undefined) {
    description = `Last known: ${lastKnown.isOn ? `on, ${lastKnown.brightness}%` : 'off'}, as of ${formatClockTime(lastKnown.updatedAt, is24Hour)}.`;
  }

  return (
    <section className="border-foreground/10 flex flex-col gap-2 rounded-2xl border px-5 py-4 opacity-60">
      <h2 className="text-muted flex items-center gap-2 text-lg font-semibold">
        <LightbulbIcon className="size-5 opacity-60" />
        Nanit night light
      </h2>
      <p className="text-sm">Laptop offline. {description}</p>
    </section>
  );
}
