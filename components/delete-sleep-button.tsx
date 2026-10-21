'use client';

import { Trash2Icon } from 'lucide-react';

import { DeleteButton } from '@/components/tracking-form';

/**
 * On the sleep tile, for a sleep still running with no note, which is most likely one started by mistake, so it can be thrown away without opening the form. It asks first, as the form's delete does.
 */
export function DeleteSleepButton({ onDelete }: { readonly onDelete: () => void }) {
  return (
    <div className="ml-auto">
      <DeleteButton onDelete={onDelete}>
        <Trash2Icon aria-label="Delete this sleep" className="size-5" />
      </DeleteButton>
    </div>
  );
}
