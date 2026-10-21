import { cleanEnv, json, str } from 'envalid';

/**
 * Validated lazily rather than at module load: `next build` runs this file
 * without the secrets present, and a build should not need device credentials.
 */
let environment: null | ReturnType<typeof validate> = null;

function validate() {
  // eslint-disable-next-line n/no-process-env -- Reading it here is the point; nothing else in the app touches it.
  return cleanEnv(process.env, {
    /**
     * The installed PWA's short name, used where a launcher has no room for
     * `APP_TITLE` — a home screen icon's caption, for instance.
     */
    APP_SHORT_NAME: str(),
    /**
     * The room's name, shown as the page heading and as the installed PWA's
     * name. Here rather than hardcoded so a second nursery only needs an `.env`.
     */
    APP_TITLE: str(),
    /**
     * SHA-256 hex of the password the app asks for. Never the password.
     */
    LOGIN_SECRET: str(),
    NANIT_EMAIL_ADDRESS: str(),
    NANIT_PASSWORD: str(),
    /**
     * [[appServerUrl, alias, deviceId, iconName?], ...] — see .env.example.
     */
    TAPO_DEVICES: json<Array<[string, string, string, string?]>>(),
    TAPO_EMAIL_ADDRESS: str(),
    TAPO_PASSWORD: str(),
    /**
     * Where the tracked sleeps, bottles, and diapers live. Turso in production; in development a local SQLite file, so trying the tracking pages out never writes to the real log.
     */
    TURSO_AUTH_TOKEN: str({ default: '' }),
    TURSO_DATABASE_URL: str({ devDefault: 'file:database/tracking.db' }),
  });
}

export function getEnvironment() {
  environment ??= validate();

  return environment;
}
