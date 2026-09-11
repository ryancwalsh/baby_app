'use client';

import { Minimize2Icon, RotateCwIcon } from 'lucide-react';
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';

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
/**
 * The camera's own shape, which is what the box is sized against.
 */
export const VIDEO_ASPECT_RATIO = 16 / 9;
const MINIMUM_SCALE = 1;
const MAXIMUM_SCALE = 6;
/**
 * Two taps closer together than this reset the view, which is the quickest way
 * back after a one-handed drag in the dark has lost the cot.
 */
const DOUBLE_TAP_MILLISECONDS = 300;

/**
 * Sized by width rather than by height, because a block's width is what CSS
 * lets us set and `aspect-ratio` then derives the height from: capping the
 * height directly would leave the width alone and stretch the picture. The
 * width that lands on a given height is that height times the box's ratio, and
 * the screen is still the upper bound.
 */
export function getPictureBoxStyle(maximumHeightPixels: null | number, boxAspectRatio: number): CSSProperties {
  if (maximumHeightPixels !== null && maximumHeightPixels > 0) {
    return { width: `min(100%, ${maximumHeightPixels * boxAspectRatio}px)` };
  }

  return {};
}

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

export function PinchZoomView({ children, maximumHeightPixels }: { readonly children: React.ReactNode; readonly maximumHeightPixels: null | number }) {
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
      const measure = () => {
        setSize({ height: container.clientHeight, width: container.clientWidth });
      };

      /**
       * Measured once here as well as observed. A ResizeObserver does not
       * report until the browser next lays out, and a page that is not being
       * painted — a background tab, a locked phone — may not do that for a
       * long time. Until it reports, the box's size reads as zero and a
       * zoomed-in picture cannot be panned at all.
       */
      measure();

      const observer = new ResizeObserver(measure);
      observer.observe(container);

      return () => {
        observer.disconnect();
      };
    }

    return undefined;
  }, []);

  /**
   * A quarter turn swaps the picture's width and height, so the box turns with
   * it: landscape for an upright picture, portrait for a turned one. Both are
   * the full width of the screen, and the turned one is simply taller.
   *
   * The picture is letterboxed inside a portrait box before it is turned — it
   * comes out the camera 16:9 whichever way it is being looked at — so turning
   * alone would leave black down both sides. Growing it by the same ratio is
   * what fills the box: the contained picture is `width` by `width / ratio`,
   * and a quarter turn makes those the box's height and width exactly.
   */
  const isQuarterTurned = rotationQuarters % 2 === 1;
  const fitScale = isQuarterTurned ? VIDEO_ASPECT_RATIO : 1;
  const effectiveScale = scale * fitScale;

  const clampOffset = useCallback(
    (candidate: Point): Point => {
      /**
       * Panning is only allowed as far as there is picture hidden outside the
       * box, so a zoomed-out view cannot be dragged off into the dark. The fit
       * part of the scale is left out on purpose: it is what makes the picture
       * fill the box, so it hides nothing to drag into view.
       */
      const horizontalRoom = Math.max(0, (size.width * scale - size.width) / 2);
      const verticalRoom = Math.max(0, (size.height * scale - size.height) / 2);

      return {
        x: clamp(candidate.x, -horizontalRoom, horizontalRoom),
        y: clamp(candidate.y, -verticalRoom, verticalRoom),
      };
    },
    [scale, size.height, size.width],
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
      className={`relative mx-auto w-full touch-none overflow-hidden bg-black select-none ${isQuarterTurned ? 'aspect-[9/16]' : 'aspect-video'}`}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={containerRef}
      style={getPictureBoxStyle(maximumHeightPixels, isQuarterTurned ? 1 / VIDEO_ASPECT_RATIO : VIDEO_ASPECT_RATIO)}
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
