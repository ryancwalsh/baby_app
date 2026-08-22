import { LampIcon } from 'lucide-react';
import { type ComponentType } from 'react';

/**
 * Ceiling fixtures, drawn here because Lucide has neither one. The silhouettes
 * follow Material Design Icons' `ceiling-light` and `ceiling-fan-light`, but
 * they are redrawn to Lucide's conventions — a 24×24 box, `currentColor`,
 * round caps and joins — so they sit beside the Lucide icons without looking
 * foreign, the same way `SwaddleIcon` does.
 */

type IconProperties = Readonly<{ className?: string }>;

type DeviceIconComponent = ComponentType<IconProperties>;

const SHARED_PROPERTIES = {
  'aria-hidden': true,
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: 2,
  viewBox: '0 0 24 24',
} as const;

/**
 * A flush-mounted shade with the bulb showing beneath it. The ceiling plate is
 * the same one the fan hangs from, and it is load-bearing rather than
 * decorative: without it the shade and rod read as a bell. No rays, though —
 * this icon carries no on/off meaning of its own, so colour is what says the
 * light is on.
 */
export function CeilingLightIcon({ className }: IconProperties) {
  return (
    <svg className={className} {...SHARED_PROPERTIES}>
      <path d="M8 2h8" />
      <path d="M12 2v4" />
      <path d="M8 6h8l3.5 9H4.5Z" />
      <path d="M10 15a2 2 0 0 0 4 0" />
    </svg>
  );
}

/**
 * Ceiling plate, downrod, hub and two blades, with the light hanging below.
 * The bulb is filled rather than outlined and the three rays are kept short,
 * because both have to survive at the size the icon is actually used.
 */
export function CeilingFanLightIcon({ className }: IconProperties) {
  return (
    <svg className={className} {...SHARED_PROPERTIES}>
      <path d="M8 3h8" />
      <path d="M12 3v5.5" />
      <rect height="2" rx="1" width="4.5" x="9.75" y="8.5" />
      <ellipse cx="5.4" cy="9.5" rx="4.2" ry="1.4" />
      <ellipse cx="18.6" cy="9.5" rx="4.2" ry="1.4" />
      <path d="M10.5 10.5v1.5a1.5 1.5 0 0 0 3 0v-1.5" fill="currentColor" />
      <path d="M12 16.5V18" />
      <path d="m9.2 15.4-1.3 1.3" />
      <path d="m14.8 15.4 1.3 1.3" />
    </svg>
  );
}

/**
 * A switch plate with the rocker's bar sitting high in its body, which is how
 * Material Design Icons distinguishes `light-switch` from `light-switch-off`.
 * The bar stays high here whatever the switch is doing: the row already says
 * on or off with colour, and a bar that moved would compete with it.
 */
export function WallSwitchIcon({ className }: IconProperties) {
  return (
    <svg className={className} {...SHARED_PROPERTIES}>
      <rect height="20" rx="2" width="14" x="5" y="2" />
      <rect height="10" rx="1" width="6" x="9" y="7" />
      <path d="M10.5 9.5h3" />
    </svg>
  );
}

/**
 * Keyed by the name a device carries in `TAPO_DEVICES`, which is how `.env`
 * picks a device's icon. The keys are the names as they are written there, so
 * they are snake_case rather than the app's usual casing.
 */
const DEVICE_ICONS: Record<string, DeviceIconComponent> = {
  ceiling_fan_light: CeilingFanLightIcon,
  ceiling_light: CeilingLightIcon,
  wall_switch: WallSwitchIcon,
};

/**
 * A device that named no icon, or named one that no longer exists, gets the
 * lamp: an unrecognised name in `.env` should leave the row drawable rather
 * than break the page.
 */
export function getDeviceIcon(iconName: string | undefined): DeviceIconComponent {
  return (iconName === undefined ? undefined : DEVICE_ICONS[iconName]) ?? LampIcon;
}
