import { cleanEnv, json, str } from 'envalid';

export const APP_ROLES = ['cloud', 'worker'] as const;

export type AppRole = (typeof APP_ROLES)[number];

/**
 * Each role needs only the credentials for what it does: the worker holds the Nanit connection, and the cloud drives the TP-Link plugs. Until the cloud is set up, the worker does both, so the laptop's `.env` keeps all of them.
 */
const REQUIRED_BY_ROLE = {
  cloud: ['TAPO_EMAIL_ADDRESS', 'TAPO_PASSWORD'],
  worker: ['NANIT_EMAIL_ADDRESS', 'NANIT_PASSWORD'],
} as const satisfies Record<AppRole, string[]>;

/**
 * Validated lazily rather than at module load: `next build` runs this file
 * without the secrets present, and a build should not need device credentials.
 */
let environment: null | ReturnType<typeof validate> = null;

function validate() {
  // eslint-disable-next-line n/no-process-env -- Reading it here is the point; nothing else in the app touches it.
  const validated = cleanEnv(process.env, {
    /**
     * The installed PWA's short name, used where a launcher has no room for
     * `APP_TITLE` — a home screen icon's caption, for instance.
     */
    APP_ROLE: str({ choices: APP_ROLES, default: 'worker' }),
    APP_SHORT_NAME: str(),
    /**
     * The room's name, shown as the page heading and as the installed PWA's
     * name. Here rather than hardcoded so a second nursery only needs an `.env`.
     */
    APP_TITLE: str(),
    /**
     * The one origin, such as `https://baby.example.com`, whose pages may call the worker's `/api/worker/*` routes from the browser. Empty means none: only the worker's own pages.
     */
    CLOUD_ORIGIN: str({ default: '' }),
    /**
     * SHA-256 hex of the password the app asks for. Never the password.
     */
    LOGIN_SECRET: str(),
    NANIT_EMAIL_ADDRESS: str({ default: '' }),
    NANIT_PASSWORD: str({ default: '' }),
    /**
     * [[appServerUrl, alias, deviceId, iconName?], ...] — see .env.example.
     */
    TAPO_DEVICES: json<Array<[string, string, string, string?]>>(),
    TAPO_EMAIL_ADDRESS: str({ default: '' }),
    TAPO_PASSWORD: str({ default: '' }),
    /**
     * Where the tracked sleeps, bottles, and diapers live. Turso in production; in development a local SQLite file, so trying the tracking pages out never writes to the real log.
     */
    TURSO_AUTH_TOKEN: str({ default: '' }),
    TURSO_DATABASE_URL: str({ devDefault: 'file:database/tracking.db' }),
  });

  const missing = REQUIRED_BY_ROLE[validated.APP_ROLE].filter((name) => validated[name] === '');
  if (missing.length > 0) {
    throw new Error(`The ${validated.APP_ROLE} role needs ${missing.join(', ')} in the environment.`);
  }

  return validated;
}

export function getEnvironment() {
  environment ??= validate();

  return environment;
}
