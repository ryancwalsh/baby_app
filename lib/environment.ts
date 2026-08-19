import { cleanEnv, json, str } from "envalid";

/**
 * Validated lazily rather than at module load: `next build` runs this file
 * without the secrets present, and a build should not need device credentials.
 */
let environment: ReturnType<typeof validate> | null = null;

function validate() {
  return cleanEnv(process.env, {
    NANIT_EMAIL_ADDRESS: str(),
    NANIT_PASSWORD: str(),
    TAPO_EMAIL_ADDRESS: str(),
    TAPO_PASSWORD: str(),
    /** [[appServerUrl, alias, deviceId], ...] — see .env.example. */
    TAPO_DEVICES: json<[string, string, string][]>(),
  });
}

export function getEnvironment() {
  if (environment === null) {
    environment = validate();
  }
  return environment;
}
