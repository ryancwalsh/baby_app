'use client';

import { GripVerticalIcon } from 'lucide-react';
import { useRef, useState } from 'react';

import { TRACK_TILES, type TrackTile, useTrackTileOrder } from '@/hooks/use-track-tile-order';

/**
 * Reordering the Track page's tiles on this phone by dragging the handle on each row. The new order is shown as the finger moves and stored when it lifts.
 */
export function TrackTileOrder() {
  const { setTileOrder, tileOrder } = useTrackTileOrder();
  const [dragOrder, setDragOrder] = useState<null | TrackTile[]>(null);
  const [draggingTile, setDraggingTile] = useState<null | TrackTile>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const shownOrder = dragOrder ?? tileOrder;

  function dragTo(clientY: number) {
    const list = listRef.current;

    if (list !== null && dragOrder !== null && draggingTile !== null) {
      const rows = [...list.children];
      const midpoints = rows.map((row) => {
        const box = row.getBoundingClientRect();

        return box.top + box.height / 2;
      });
      const rowBelow = midpoints.findIndex((midpoint) => clientY < midpoint);
      const targetIndex = rowBelow === -1 ? rows.length - 1 : rowBelow;
      const withoutDragged = dragOrder.filter((tile) => tile !== draggingTile);

      setDragOrder([...withoutDragged.slice(0, targetIndex), draggingTile, ...withoutDragged.slice(targetIndex)]);
    }
  }

  function finishDrag() {
    if (dragOrder !== null) {
      setTileOrder(dragOrder);
    }

    setDragOrder(null);
    setDraggingTile(null);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-muted mb-1 text-sm">Order of the Track tiles on this phone</legend>
      <ol className="flex flex-col gap-2" ref={listRef}>
        {shownOrder.map((tile) => {
          const label = TRACK_TILES.find((option) => option.tile === tile)?.label ?? tile;

          return (
            <li className={`border-foreground/15 flex items-center gap-2 rounded-lg border pr-4 text-sm ${draggingTile === tile ? 'text-accent border-accent/60' : ''}`} key={tile}>
              <button
                aria-label={`Drag to reorder ${label}`}
                className="text-muted shrink-0 cursor-grab touch-none p-3"
                onPointerCancel={finishDrag}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDragOrder(tileOrder);
                  setDraggingTile(tile);
                }}
                onPointerMove={(event) => {
                  dragTo(event.clientY);
                }}
                onPointerUp={finishDrag}
                type="button"
              >
                <GripVerticalIcon className="size-4" />
              </button>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>
    </fieldset>
  );
}
