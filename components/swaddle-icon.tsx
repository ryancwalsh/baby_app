/**
 * The bassinet seen from above: a swaddled baby inside the pod. Drawn here
 * rather than imported, because Lucide has no crib or bassinet — a bed was the
 * closest it could get. It follows Lucide's conventions all the same (a 24×24
 * box, `currentColor`, round caps and joins) so it sits beside the icons that
 * do come from there without looking foreign.
 *
 * `isMoving` adds the four marks at the pod's shoulders. They are the ones
 * carrying the meaning: the rocking is decoration, and it is switched off for
 * anyone who has asked the system for less motion, so the running state has to
 * read while the icon is perfectly still. They rock along with the pod because
 * they belong to it — they are the arc it is travelling through, not something
 * the room is doing around it.
 *
 * They sit up by the head rather than out at the pod's widest point for two
 * reasons. The pod pivots at its foot, so the head end is where the travel
 * actually is; and a symmetrical pair on the midline of a rounded shape reads
 * as a pair of ears, which is hard to unsee once seen.
 */
export function SwaddleIcon({ className, isMoving }: Readonly<{ className?: string; isMoving: boolean }>) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} viewBox="0 0 24 24">
      <g className={isMoving ? 'swaddle-rock' : undefined}>
        <ellipse cx="12" cy="12" rx="7" ry="9.2" />
        <circle cx="12" cy="7.2" r="2.2" />
        <path d="M12 10.2c2.3 0 3.4 1.9 3.4 4.2s-1.3 4.2-3.4 4.2-3.4-1.9-3.4-4.2 1.1-4.2 3.4-4.2z" />
        {isMoving ? (
          <>
            <path d="M4.6 3.4c-.5.9-.9 1.8-1.1 2.7" />
            <path d="M6.4 2.6c-.5.9-.9 1.8-1.1 2.7" />
            <path d="M17.6 2.6c.5.9.9 1.8 1.1 2.7" />
            <path d="M19.4 3.4c.5.9.9 1.8 1.1 2.7" />
          </>
        ) : null}
      </g>
    </svg>
  );
}
