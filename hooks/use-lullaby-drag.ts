'use client';

import { type PointerEvent, useRef, useState } from 'react';

import { type Lullaby, saveLullabyOrderAction } from '@/app/actions/lullaby';
import { useLullabyAudio } from '@/components/lullaby-audio-provider';

/**
 * Reordering the lullabies by dragging the handle on the left of each one. The new order is shown as the finger moves, handed to the player as soon as it lifts, so that it plays in the order shown, and saved for every phone.
 */
export function useLullabyDrag({ lullabies, onChanged, secretHash }: { readonly lullabies: Lullaby[]; readonly onChanged: () => Promise<void>; readonly secretHash: string }) {
  const { reorderLullabies } = useLullabyAudio();
  /**
   * The order while a lullaby is being dragged, shown as the finger moves and saved only when it lifts.
   */
  const [dragOrder, setDragOrder] = useState<null | string[]>(null);
  const [draggingFileName, setDraggingFileName] = useState<null | string>(null);
  const [orderError, setOrderError] = useState<null | string>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const shownLullabies = dragOrder === null ? lullabies : dragOrder.flatMap((fileName) => lullabies.filter((lullaby) => lullaby.fileName === fileName));

  /**
   * Moves the dragged lullaby to the row under the finger. Each lullaby is one child of the list, whether it is showing its buttons, its rename form or its delete confirmation.
   */
  function dragTo(clientY: number) {
    const list = listRef.current;

    if (list !== null && dragOrder !== null && draggingFileName !== null) {
      const rows = [...list.children];
      const midpoints = rows.map((row) => {
        const box = row.getBoundingClientRect();

        return box.top + box.height / 2;
      });
      const rowBelow = midpoints.findIndex((midpoint) => clientY < midpoint);
      const targetIndex = rowBelow === -1 ? rows.length - 1 : rowBelow;
      const withoutDragged = dragOrder.filter((fileName) => fileName !== draggingFileName);

      setDragOrder([...withoutDragged.slice(0, targetIndex), draggingFileName, ...withoutDragged.slice(targetIndex)]);
    }
  }

  async function finishDrag() {
    const finalOrder = dragOrder;
    const originalOrder = lullabies.map((lullaby) => lullaby.fileName);

    setDragOrder(null);
    setDraggingFileName(null);

    if (finalOrder !== null && finalOrder.join('/') !== originalOrder.join('/')) {
      reorderLullabies(finalOrder);
      setOrderError(null);

      try {
        const result = await saveLullabyOrderAction(secretHash, finalOrder);

        if (result.error !== null) {
          setOrderError(result.error);
          await onChanged();
        }
      } catch (caughtError) {
        setOrderError(caughtError instanceof Error ? caughtError.message : 'Could not save the order.');
        await onChanged();
      }
    }
  }

  function getHandleProps(fileName: string) {
    return {
      onPointerCancel: () => {
        void finishDrag();
      },
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragOrder(lullabies.map((lullaby) => lullaby.fileName));
        setDraggingFileName(fileName);
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        dragTo(event.clientY);
      },
      onPointerUp: () => {
        void finishDrag();
      },
    };
  }

  return { draggingFileName, getHandleProps, listRef, orderError, shownLullabies };
}
