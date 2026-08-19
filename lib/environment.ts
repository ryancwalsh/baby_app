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
     * SHA-256 hex of the password the app asks for. Never the password.
     */
    LOGIN_SECRET: str(),
    NANIT_EMAIL_ADDRESS: str(),
    NANIT_PASSWORD: str(),
    /**
     * [[appServerUrl, alias, deviceId], ...] — see .env.example.
     */
    TAPO_DEVICES: json<Array<[string, string, string]>>(),
    TAPO_EMAIL_ADDRESS: str(),
    TAPO_PASSWORD: str(),
  });
}

export function getEnvironment() {
  environment ??= validate();

  return environment;
}
