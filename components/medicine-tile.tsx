'use client';

import Link from 'next/link';

import { TILE_BUTTON_CLASS_NAME, TILE_COLORS } from '@/components/tile-styles';
import { formatAgo } from '@/components/tracking-format';
import { type Medicine } from '@/storage/tracking-types';

/**
 * Repeat opens a new entry with the last medicine and amount already filled in, and the time left as now.
 */
export function MedicineTile({ medicine, now }: { readonly medicine: Medicine | null; readonly now: number }) {
  const colors = TILE_COLORS.medicine;

  return (
    <div className={`flex flex-col gap-3 rounded-2xl border p-4 ${colors.border} ${colors.surface}`}>
      <div className="flex flex-col gap-1">
        <span className={`text-lg font-semibold ${colors.label}`}>Medicine</span>
        {medicine === null ? (
          <span className="text-foreground/50 text-base">No medicine yet.</span>
        ) : (
          <span className="text-foreground/70 tabular-nums text-base">
            {medicine.name} {medicine.amountMilliliters} ml, {formatAgo(now - new Date(medicine.givenAt).getTime())}
          </span>
        )}
        {medicine !== null && medicine.note !== '' && <p className="text-foreground/50 truncate italic text-base">{medicine.note}</p>}
      </div>
      <div className="flex gap-2">
        <Link className={`${TILE_BUTTON_CLASS_NAME} ${colors.border} ${colors.label}`} href="/track/medicine">
          New
        </Link>
        {medicine !== null && (
          <Link className={`${TILE_BUTTON_CLASS_NAME} ${colors.border} ${colors.label}`} href={`/track/medicine?repeat=${medicine.id}`}>
            Repeat
          </Link>
        )}
      </div>
    </div>
  );
}
