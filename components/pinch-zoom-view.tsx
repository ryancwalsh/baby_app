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

/**
 * The size the picture is laid out at before any pinch: the largest 16:9 box
 * that still fits the container once the quarter turns have been applied.
 *
 * It is worked out here rather than left to `object-contain` on the video,
 * because the container is free to be any shape — a turned picture in a
 * landscape box is limited by the box's width, not its height, and the element
 * has to be that size before it is turned.
 */
function getPictureSize(boxWidth: number, boxHeight: number, isQuarterTurned: boolean): { height: number; width: number } {
  const width = isQuarterTurned ? Math.min(boxHeight, boxWidth * VIDEO_ASPECT_RATIO) : Math.min(boxWidth, boxHeight * VIDEO_ASPECT_RATIO);

  return { height: width / VIDEO_ASPECT_RATIO, width };
}

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
   * The box is the whole of what is left of the screen, whatever shape that
   * is, and the picture is centred in it rather than stretched to its ratio.
   *
   * That is what lets a zoomed-in picture use the screen: it is already wider
   * and taller than it needs to be, so a taller box simply shows more of it.
   * Sizing the box to the camera's ratio instead would leave the magnified
   * picture trapped in a letterbox strip with the rest of the screen unused.
   * Nothing about the transform depends on the box, so there is no jump at the
   * moment a pinch begins.
   */
  const isQuarterTurned = rotationQuarters % 2 === 1;
  const picture = getPictureSize(size.width, size.height, isQuarterTurned);
  const drawnWidth = (isQuarterTurned ? picture.height : picture.width) * scale;
  const drawnHeight = (isQuarterTurned ? picture.width : picture.height) * scale;

  const clampOffset = useCallback(
    (candidate: Point): Point => {
      /**
       * Panning is only allowed as far as there is picture hidden outside the
       * box, so a zoomed-out view cannot be dragged off into the dark.
       */
      const horizontalRoom = Math.max(0, (drawnWidth - size.width) / 2);
      const verticalRoom = Math.max(0, (drawnHeight - size.height) / 2);

      return {
        x: clamp(candidate.x, -horizontalRoom, horizontalRoom),
        y: clamp(candidate.y, -verticalRoom, verticalRoom),
      };
    },
    [drawnHeight, drawnWidth, size.height, size.width],
  );

  const reset = useCallback(() => {
    setScale(MINIMUM_SCALE);
    setOffset({ x: 0, y: 0 });
  }, []);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const pointers = [...pointersRef.current.values()];

    if (pointers.length === 1) {
      const now = Date.now();

      /**
       * Only ever a second *finger*, never the second finger of a pinch. The
       * two fingers of a pinch land within a few tens of milliseconds of each
       * other, so counting them as a double tap threw the view back to fully
       * zoomed out the moment a pinch began — which read as the picture
       * jerking out on its own halfway through zooming back.
       */
      if (now - lastTapAtRef.current < DOUBLE_TAP_MILLISECONDS) {
        reset();
      }

      lastTapAtRef.current = now;
    } else if (pointers.length === 2 && pointers[0] !== undefined && pointers[1] !== undefined) {
      /**
       * Forgotten so that lifting out of a pinch and touching again is not a
       * double tap either.
       */
      lastTapAtRef.current = 0;
      pinchRef.current = {
        distance: getDistance(pointers[0], pointers[1]),
        midpoint: getMidpoint(pointers[0], pointers[1]),
      };
    }
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
      className={`relative flex w-full touch-none items-center justify-center overflow-hidden bg-black select-none ${maximumHeightPixels === null ? 'aspect-video' : ''}`}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={containerRef}
      style={maximumHeightPixels === null ? {} : { height: `${maximumHeightPixels}px` }}
    >
      <div
        style={{
          height: `${picture.height}px`,
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotationQuarters * DEGREES_PER_QUARTER_TURN}deg)`,
          transformOrigin: 'center',
          width: `${picture.width}px`,
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
