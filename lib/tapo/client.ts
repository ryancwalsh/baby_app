import { getEnvironment } from '@/lib/environment';
import { readTapoSwitchPower, setTapoSwitchPower } from '@/lib/tapo/cloud-nbu';

const CLOUD_LOGIN_URL = 'https://use1-wap.tplinkcloud.com/';
/**
 * Cloud tokens are long-lived; re-login well before anything can expire.
 */
const TOKEN_LIFETIME_MILLISECONDS = 30 * 60 * 1_000;

const RelayState = {
  OFF: 0,
  ON: 1,
} as const;

/**
 * The error codes this app is likely to meet, from the tp-link cloud API.
 */
const ERROR_MESSAGES: Record<number, string> = {
  [-20_675]: 'Cloud token expired or invalid',
  [-20_601]: 'Incorrect email or password',
  /**
   * The cloud says "Device is offline", which is misleading: Tapo devices
   * answer this even when powered and working, because this endpoint has no
   * route to them at all. See CLAUDE.md.
   */
  [-20_571]: 'Not reachable through this TP-Link cloud',
  [-20_104]: 'Missing credentials',
  [-20_004]: 'API rate limit exceeded',
  [-1_501]: 'Invalid credentials',
  '9999': 'Session timeout',
};

type CloudResponse<Result> = {
  error_code: number;
  msg?: string;
  result: Result;
};

function checkError(body: CloudResponse<unknown>) {
  if (body.error_code !== 0) {
    const known = ERROR_MESSAGES[body.error_code];
    /**
     * Recognised codes read plainly; only unknown ones need the number.
     */
    throw new Error(known ?? `Tapo cloud error ${body.error_code}: ${body.msg ?? 'unrecognised'}`);
  }
}

async function postJson<Result>(url: string, body: unknown): Promise<CloudResponse<Result>> {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (response.ok) {
    const parsed = (await response.json()) as CloudResponse<Result>;
    checkError(parsed);
    return parsed;
  }

  throw new Error(`Tapo request to ${url} failed (${response.status}).`);
}

let cachedToken: null | { obtainedAt: number; value: string } = null;

async function getCloudToken(): Promise<string> {
  if (cachedToken !== null && Date.now() - cachedToken.obtainedAt < TOKEN_LIFETIME_MILLISECONDS) {
    return cachedToken.value;
  }

  const environment = getEnvironment();
  const body = await postJson<{ token: string }>(CLOUD_LOGIN_URL, {
    method: 'login',
    params: {
      appType: 'Tapo_Android',
      cloudPassword: environment.TAPO_PASSWORD,
      cloudUserName: environment.TAPO_EMAIL_ADDRESS,
      terminalUUID: crypto.randomUUID(),
    },
  });

  // eslint-disable-next-line require-atomic-updates -- A concurrent login would only overwrite one valid token with another equally valid one.
  cachedToken = { obtainedAt: Date.now(), value: body.result.token };
  return cachedToken.value;
}

type Device = {
  alias: string;
  appServerUrl: string;
  deviceId: string;
  /**
   * Names the icon the row draws for this device, or is undefined when `.env`
   * left the field off and the default lamp icon should stand in.
   */
  iconName: string | undefined;
};

/**
 * TAPO_DEVICES holds the fields the cloud's own device list would return, so
 * there is no need to call `getDeviceList` on every request. The plugs are
 * older Kasa-protocol models, hence the `system.*` commands below rather than
 * Tapo's newer ones.
 */
export function getConfiguredDevices(): Device[] {
  const devices = getEnvironment().TAPO_DEVICES;
  if (devices.length === 0) {
    throw new Error('TAPO_DEVICES is empty; add the lamps to .env.');
  }

  return devices.map(([appServerUrl, alias, deviceId, iconName]) => ({
    alias,
    appServerUrl,
    deviceId,
    iconName,
  }));
}

/**
 * Looked up rather than trusted, so a device id arriving from the browser can
 * only ever name a plug that is already configured here.
 */
function getConfiguredDevice(deviceId: string): Device {
  const device = getConfiguredDevices().find((candidate) => candidate.deviceId === deviceId);
  if (device === undefined) {
    throw new Error(`Device ${deviceId} is not configured in TAPO_DEVICES.`);
  }

  return device;
}

/**
 * The cloud relays an arbitrary device command through as a JSON string. This
 * is the one call the `tp-link-tapo-connect` package does not expose, and the
 * only reason the proof of concept had to patch it.
 */
async function sendToDevice<Result>(device: Device, request: unknown): Promise<Result> {
  const token = await getCloudToken();
  const body = await postJson<{ responseData: string }>(`${device.appServerUrl}?token=${encodeURIComponent(token)}`, {
    method: 'passthrough',
    params: {
      deviceId: device.deviceId,
      requestData: JSON.stringify(request),
    },
  });

  return JSON.parse(body.result.responseData) as Result;
}

/**
 * The two device families share this account and this file, but not a protocol.
 * A device's configured app server is what says which: the S-series switches
 * are reachable only through the NBU cloud, the HS-series plugs only through
 * the Kasa one. See CLAUDE.md.
 */
function isTapoCloudDevice(device: Device): boolean {
  return new URL(device.appServerUrl).host.endsWith('tplinknbu.com');
}

export async function readLampPower(deviceId: string): Promise<boolean> {
  const device = getConfiguredDevice(deviceId);

  if (isTapoCloudDevice(device)) {
    return readTapoSwitchPower(new URL(device.appServerUrl).host, device.deviceId);
  }

  const information = await sendToDevice<{
    system: { get_sysinfo: { relay_state: number } };
  }>(device, { system: { get_sysinfo: {} } });

  return information.system.get_sysinfo.relay_state === RelayState.ON;
}

export async function setLampPower(deviceId: string, isOn: boolean): Promise<boolean> {
  const device = getConfiguredDevice(deviceId);

  if (isTapoCloudDevice(device)) {
    return setTapoSwitchPower(new URL(device.appServerUrl).host, device.deviceId, isOn);
  }

  await sendToDevice(device, {
    system: {
      set_relay_state: { state: isOn ? RelayState.ON : RelayState.OFF },
    },
  });

  return isOn;
}

export async function toggleLampPower(deviceId: string): Promise<boolean> {
  const isOn = await readLampPower(deviceId);
  return setLampPower(deviceId, !isOn);
}
