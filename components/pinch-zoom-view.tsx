'use client';

import { Minimize2Icon, RotateCwIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useLocalStorage } from '@/hooks/use-local-storage';

/**
 * The camera picture, turned and moved the way the Nanit app allows: a quarter
 * turn at a time, pinched to zoom, dragged to choose which part of the cot is
 * on screen.
 *
 * All of it is a CSS transform on what is handed in. Nothing here reaches the
 * camera — the stream is the same whichever way it is being looked at.
 */

const ROTATION_KEY = 'baby-app-camera-rotation';
const QUARTER_TURNS = 4;
const DEGREES_PER_QUARTER_TURN = 90;
const MINIMUM_SCALE = 1;
const MAXIMUM_SCALE = 6;
/**
 * Two taps closer together than this reset the view, which is the quickest way
 * back after a one-handed drag in the dark has lost the cot.
 */
const DOUBLE_TAP_MILLISECONDS = 300;

type Point = { x: number; y: number };

function getDistance(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function getMidpoint(first: Point, second: Point): Point {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function clamp(value: number, lowest: number, highest: number): number {
  return Math.min(Math.max(value, lowest), highest);
}

export function PinchZoomView({ children }: { readonly children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  /**
   * Every finger currently down, by pointer id. One is a drag, two are a
   * pinch, and holding them all means a finger lifting mid-gesture does not
   * make the picture jump.
   */
  const pointersRef = useRef(new Map<number, Point>());
  const pinchRef = useRef<null | { distance: number; midpoint: Point }>(null);
  const lastTapAtRef = useRef(0);

  const [size, setSize] = useState({ height: 0, width: 0 });
  const [scale, setScale] = useState(MINIMUM_SCALE);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const { store: storeRotation, value: storedRotation } = useLocalStorage(ROTATION_KEY);

  /**
   * The camera is screwed to the wall one way round, so which way up the
   * picture wants to be is a property of the room rather than of this visit.
   */
  const rotationQuarters = Number(storedRotation ?? '0') % QUARTER_TURNS;

  useEffect(() => {
    const container = containerRef.current;

    if (container !== null) {
      const observer = new ResizeObserver(() => {
        setSize({ height: container.clientHeight, width: container.clientWidth });
      });
      observer.observe(container);

      return () => {
        observer.disconnect();
      };
    }

    return undefined;
  }, []);

  /**
   * A quarter turn swaps the picture's width and height, so on its own it
   * would push the long side out through the sides of the box. Shrinking by the
   * box's own aspect ratio is what brings it back inside.
   */
  const isQuarterTurned = rotationQuarters % 2 === 1;
  const fitScale = isQuarterTurned && size.width > 0 && size.height > 0 ? Math.min(size.width / size.height, size.height / size.width) : 1;
  const effectiveScale = scale * fitScale;

  const clampOffset = useCallback(
    (candidate: Point): Point => {
      /**
       * Panning is only allowed as far as there is picture hidden outside the
       * box, so a zoomed-out view cannot be dragged off into the dark.
       */
      const horizontalRoom = Math.max(0, (size.width * effectiveScale - size.width) / 2);
      const verticalRoom = Math.max(0, (size.height * effectiveScale - size.height) / 2);

      return {
        x: clamp(candidate.x, -horizontalRoom, horizontalRoom),
        y: clamp(candidate.y, -verticalRoom, verticalRoom),
      };
    },
    [effectiveScale, size.height, size.width],
  );

  const reset = useCallback(() => {
    setScale(MINIMUM_SCALE);
    setOffset({ x: 0, y: 0 });
  }, []);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const pointers = [...pointersRef.current.values()];

    if (pointers.length === 2 && pointers[0] !== undefined && pointers[1] !== undefined) {
      pinchRef.current = {
        distance: getDistance(pointers[0], pointers[1]),
        midpoint: getMidpoint(pointers[0], pointers[1]),
      };
    }

    const now = Date.now();

    if (now - lastTapAtRef.current < DOUBLE_TAP_MILLISECONDS) {
      reset();
    }

    lastTapAtRef.current = now;
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const previous = pointersRef.current.get(event.pointerId);

    if (previous !== undefined) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      const pointers = [...pointersRef.current.values()];

      if (pointers.length === 1) {
        setOffset((current) => clampOffset({ x: current.x + (event.clientX - previous.x), y: current.y + (event.clientY - previous.y) }));
      } else if (pointers[0] !== undefined && pointers[1] !== undefined) {
        const distance = getDistance(pointers[0], pointers[1]);
        const midpoint = getMidpoint(pointers[0], pointers[1]);
        const pinch = pinchRef.current;

        if (pinch !== null && pinch.distance > 0) {
          const ratio = distance / pinch.distance;

          setScale((current) => clamp(current * ratio, MINIMUM_SCALE, MAXIMUM_SCALE));
          /**
           * Two fingers moving together drag as well as pinch, which is what
           * makes zooming into a corner feel like one gesture rather than two.
           */
          setOffset((current) => clampOffset({ x: current.x + (midpoint.x - pinch.midpoint.x), y: current.y + (midpoint.y - pinch.midpoint.y) }));
        }

        pinchRef.current = { distance, midpoint };
      }
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);
    /**
     * Forgetting the pinch is what stops the finger still on the glass being
     * measured against a gap that no longer exists.
     */
    pinchRef.current = null;
  }

  function rotate() {
    storeRotation(String((rotationQuarters + 1) % QUARTER_TURNS));
    reset();
  }

  const isChanged = scale !== MINIMUM_SCALE || offset.x !== 0 || offset.y !== 0;
  const buttonClassName = 'rounded-full bg-black/50 p-2 text-foreground/60 backdrop-blur';

  return (
    <div
      className="relative aspect-video touch-none overflow-hidden rounded-lg bg-black select-none"
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={containerRef}
    >
      <div
        className="size-full"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${effectiveScale}) rotate(${rotationQuarters * DEGREES_PER_QUARTER_TURN}deg)`,
          transformOrigin: 'center',
        }}
      >
        {children}
      </div>

      {/*
        Kept in a corner and dim, because this is looked at in an unlit room.
        The row swallows its own pointer events so that reaching for a button is
        not also the start of a drag.
      */}
      <div className="absolute right-2 bottom-2 flex gap-2" onPointerDown={(event) => event.stopPropagation()}>
        {isChanged && (
          <button aria-label="Reset the view" className={buttonClassName} onClick={reset} type="button">
            <Minimize2Icon className="size-4" />
          </button>
        )}
        <button aria-label="Rotate the view" className={buttonClassName} onClick={rotate} type="button">
          <RotateCwIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
