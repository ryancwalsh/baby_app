import { getTapoCloudSession, refreshTapoCloudToken } from '@/lib/tapo/cloud-v2';
import { pinnedRequest } from '@/lib/tapo/cloud-v2-transport';

/**
 * TP-Link's NBU cloud (`*.iot.i.tplinknbu.com`), which is the only cloud that
 * can reach the S-series (Tapo) switches. `tplinkcloud.com` lists them but
 * neither tracks nor relays them: it reports `status: 0` and answers `-20571
 * "Device is offline"` for every command, whatever the request shape. NBU
 * reports the very same devices as `status: 1` and commands them in about
 * 130ms — faster than the Kasa cloud manages for the HS-series plugs.
 *
 * Nothing here is guessed. The paths, the header names and the `app:` and `ut|`
 * formats were read out of the Tapo Android app's own dex constants.
 */

/**
 * Tapo devices are AWS IoT things, and NBU exposes them as such: state is a
 * shadow with a `desired` half the app writes and a `reported` half the device
 * writes back. Only `reported` says what the switch is actually doing.
 */
const SHADOWS_PATH = '/v1/things/shadows';
const APP_NAME = 'Tapo';
/**
 * The app version NBU is told about. Unrelated to `APP_VERSION` in the V2
 * transport, which is what the older signed cloud expects.
 */
const NBU_APP_VERSION = '3.20.512';

const UNAUTHORIZED_STATUS = 401;
const OK_STATUS = 200;
/**
 * A shadow write carries the version it means to replace, so two phones cannot
 * silently overwrite each other. The cloud answers this when ours is stale.
 */
const VERSION_CONFLICT_CODE = 11_000;

type ShadowState = {
  desired?: { on?: boolean };
  reported?: { on?: boolean };
};

type Shadow = {
  state: ShadowState;
  thingName: string;
  version: number;
};

type ShadowsResult = {
  failThingList?: string[];
  shadows?: Shadow[];
};

type WriteResult = {
  code?: number;
  data?: { curVersion?: number };
  message?: string;
  version?: number;
};

/**
 * `app-cid` and the `ut|` authorization are what the older cloud's signed
 * headers are replaced by here; NBU wants no HMAC at all.
 */
function nbuHeaders(token: string, terminalUuid: string) {
  return {
    'app-cid': `app:${APP_NAME}:${terminalUuid}`,
    Authorization: `ut|${token}`,
    'Content-Type': 'application/json; charset-utf-8',
    'x-app-name': APP_NAME,
    'x-app-version': NBU_APP_VERSION,
    'x-locale': 'en_US',
    'x-net-type': 'wifi',
    'x-ospf': 'Android 14',
    'x-strict': '0',
    'x-term-id': terminalUuid,
  };
}

/**
 * Sends one NBU request, renewing the access token if the cloud says it has
 * expired. The refresh needs no second factor, so this stays unattended.
 */
async function sendToNbu(host: string, method: string, path: string, payload?: unknown) {
  const session = getTapoCloudSession();
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  const send = (token: string) =>
    pinnedRequest({
      body,
      headers: nbuHeaders(token, session.terminalUuid),
      host,
      method,
      path,
    });

  let response = await send(session.token);
  if (response.status === UNAUTHORIZED_STATUS) {
    response = await send(await refreshTapoCloudToken());
  }

  try {
    return { parsed: JSON.parse(response.text) as unknown, status: response.status };
  } catch {
    throw new Error(`Unreadable reply from ${host}${path}.`);
  }
}

/**
 * The switch's own account of itself. `reported` rather than `desired`, so a
 * command that never landed does not read back as though it had.
 */
export async function readTapoSwitchShadow(host: string, deviceId: string): Promise<Shadow> {
  const { parsed, status } = await sendToNbu(host, 'GET', `${SHADOWS_PATH}?thingNames=${encodeURIComponent(deviceId)}`);
  const result = parsed as ShadowsResult;
  const shadow = result.shadows?.[0];

  if (shadow === undefined) {
    throw new Error(status === OK_STATUS ? 'The Tapo cloud knows no such switch.' : `The Tapo cloud would not report the switch (${status}).`);
  }

  return shadow;
}

export async function readTapoSwitchPower(host: string, deviceId: string): Promise<boolean> {
  const shadow = await readTapoSwitchShadow(host, deviceId);
  return shadow.state.reported?.on === true;
}

/**
 * Writes the desired state. The version has to be one past the shadow's
 * current one; the cloud rejects anything else rather than guessing, so a
 * conflict is retried once against the version it names.
 */
export async function setTapoSwitchPower(host: string, deviceId: string, isOn: boolean): Promise<boolean> {
  const shadow = await readTapoSwitchShadow(host, deviceId);
  const path = `/v1/things/${encodeURIComponent(deviceId)}/shadows`;

  const write = async (version: number) => {
    const { parsed } = await sendToNbu(host, 'PATCH', path, { state: { desired: { on: isOn } }, version });
    return parsed as WriteResult;
  };

  let result = await write(shadow.version + 1);
  if (result.code === VERSION_CONFLICT_CODE && result.data?.curVersion !== undefined) {
    result = await write(result.data.curVersion + 1);
  }

  if (result.version === undefined) {
    throw new Error(result.message ?? 'The Tapo cloud rejected the command.');
  }

  return isOn;
}
