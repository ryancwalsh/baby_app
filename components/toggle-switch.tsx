/**
 * The sliding switch used by every on/off control, so the plugs and the camera
 * read as the same kind of thing.
 */
export function ToggleSwitch({ isOn }: { readonly isOn: boolean }) {
  return (
    <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${isOn ? 'bg-amber-500' : 'bg-foreground/25'}`}>
      {/* The knob is only full white when the switch is on: an off switch has nothing to announce, and a white dot is the brightest thing on an unlit page. */}
      <span className={`size-5 rounded-full transition-transform ${isOn ? 'translate-x-5 bg-white' : 'translate-x-0 bg-white/40'}`} />
    </span>
  );
}
