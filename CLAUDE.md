@./CLAUDE.private.md

# baby_app

Next.js PWA to control the devices in Laydon's nursery from a phone. Ported
from `~/code/baby_app_poc`, which is the reference for anything that once
worked but does not here.

## The room has a sleeping baby in it

Treat every device call as something that can wake a child.

- Never run a command against the Nanit camera without asking first — a night
  light coming on is not recoverable.
- Never toggle a plug to "check" something. Read-only `system.get_sysinfo`
  passthrough is fine; `set_relay_state` is not, unless asked.
- A page load must never _write_ to the camera. It renders cached state and
  opens the shared connection, which only ever reads — keep it that way.

## Design in the dark

The phone is used in an unlit room at night. Keep large surfaces dim — no
bright backgrounds, borders or text that flip on when a device is on. Small
amber accents for state are fine.

## Two protocols, one cloud account

`TAPO_DEVICES` mixes device families and they are **not** interchangeable. Which
cloud a device is on is decided by the `appServerUrl` in its `TAPO_DEVICES`
entry, and `lib/tapo/client.ts` routes on it: a `tplinknbu.com` host means the
NBU cloud, anything else means the Kasa one.

- `IOT.SMARTPLUGSWITCH` (HS-series, "Kasa"): plaintext `alias`, driven by
  `system.get_sysinfo` / `system.set_relay_state` through the cloud's
  `passthrough` method at `use1-wap.tplinkcloud.com`. This is what
  `lib/tapo/client.ts` implements directly.
- `SMART.TAPOSWITCH` (S-series, "Tapo"): **base64-encoded `alias`**, and
  reachable only through the **NBU** cloud — see below. Decode S-series aliases
  before putting them in `TAPO_DEVICES`.

### The S-series switches work, through the NBU cloud

Verified end to end against a real S505 on 2026-08-20: read, write, and the
state read back. Round trip is about **130ms**, faster than the Kasa cloud.

**`tplinkcloud.com` cannot reach these devices and never could.** It lists them,
reports `status: 0`, and answers `-20571 "Device is offline"` for every request
shape — through the legacy endpoint _and_ through the signed V2 cloud. None of
that means the hardware is offline: NBU reports the very same devices as
`status: 1` and commands them instantly. `tplinkcloud.com` is a legacy mirror
that neither tracks nor relays Tapo devices. Do not spend time there.

The NBU API is `https://use1-app-server.iot.i.tplinknbu.com`, and its root is
**`/v1/`, not `/api/v2/`** — probing `/api/v2/...` there 404s, which is what
made earlier attempts look like dead ends. It is implemented in
`lib/tapo/cloud-nbu.ts`:

- No HMAC signing. Two headers carry the session:
  `Authorization: ut|{token}` and `app-cid: app:Tapo:{terminalUuid}`, alongside
  `x-app-name`, `x-app-version`, `x-locale`, `x-net-type`, `x-ospf`, `x-strict`
  and `x-term-id`. The `app:` and `ut|` formats and every header name were read
  out of the Tapo Android app's dex constants
  (`com.tplink.iot.aiassistant.bean.see.sseclient.SSESession`) — they are not
  guesses, and the server rejects near-misses with a bare
  `403 "missing appCid or invalid"`.
- The `terminalUuid` in `app-cid` must be the one the session token was issued
  for.
- Devices are AWS IoT **things**, addressed by the same device id the Kasa
  cloud uses. `GET /v1/things?pageSize=50` lists them.
- Read: `GET /v1/things/shadows?thingNames={deviceId}` →
  `{shadows:[{state:{desired,reported},version}]}`. **`reported` is the truth**;
  `desired` is only what was last asked for.
- Write: `PATCH /v1/things/{deviceId}/shadows` with
  `{state:{desired:{on}},version}`. The version must be **exactly one past** the
  shadow's current one — anything else earns `11000 "Update version is smaller
than present version"`, which names `curVersion` so it can be retried.
  `GET`/`POST`/`PUT` on that path all answer `405`.
- NBU chains to the **same self-signed `tp-link-CA` root already pinned** for
  the app servers, so `pinnedRequest` in `cloud-v2-transport.ts` covers both
  clouds with no new certificate.

### Sign-in: the refresh token, not MFA

The NBU session token comes from the V2 cloud at `n-wap.i.tplinkcloud.com`, and
**`POST /api/v2/account/refreshToken` mints a fresh one with no second factor**,
from the `refreshToken` in `secrets/tapo-v2-tokens.json`. That is the normal
path and it needs nobody present; `lib/tapo/cloud-nbu.ts` refreshes on a `401`
and retries once. Expired access tokens surface as `-20651 "Token expired"`.

Interactive login is therefore only needed if the refresh token itself is ever
lost, and **it is currently broken**: login answers `-20677 "MFA feature
enabled"` with an `MFAProcessId`, but **no code is ever sent** — confirmed
2026-08-20, nothing arrived by app notification or email, and the reply carries
`remainAttempts: 0`. There is no dispatch endpoint: `sendMFACode`,
`resendMFACode`, `getMFACode`, `sendVerificationCode` and `requestMFACode` all
answer `-20103`. So **guard the refresh token**. If it is lost, finding the real
MFA dispatch call means capturing the app's own traffic.

Other V2 details, still true: a successful login carries `result.errorCode: "0"`,
so treating any present `errorCode` as failure surfaces a bare "0" as the error;
requests are HMAC-SHA1 signed over `{contentMd5}\n{timestamp}\n{nonce}\n{path}`
with **path only, no query string**; app keys are access
`4d11b6b9d5ea4d19a829adbb9714b057`, secret `6ed7d97f3e73467f8a5bab90b577ba4c`,
fixed timestamp `9999999999`. `sendToTapoDevice` in `cloud-v2.ts` is the V2
passthrough — it is unused, and it cannot reach the S-series switches.

Files under `secrets/` are written by the code, never by hand; an empty or
hand-made `tapo-v2-tokens.json` is treated as no session.

## The Snoo talks to AWS IoT, not to the app's REST API

Unlike the other two devices, this protocol was not guessed: `python-snoo`
backs Home Assistant's official `snoo` integration, and `lib/snoo/` follows it.
Three hops, in order:

1. **Cognito** at `cognito-idp.us-east-1.amazonaws.com`, `USER_PASSWORD_AUTH`,
   with the Happiest Baby app's own `ClientId`. No second factor, so no
   interactive login script — the one device here that does not need one. Keep
   the **id** token; the access token is not used.
2. **`GET .../hds/me/v11/devices`** with `Authorization: Bearer <idToken>`, for
   the per-device `awsIoT.thingName` and `awsIoT.clientEndpoint`.
3. **MQTT over websocket** at `wss://{clientEndpoint}:443/mqtt`, protocol
   **3.1** (`protocolId: "MQIsdp"`), the id token as a `token` websocket header.
   Subscribe to `{thingName}/state_machine/activity_state`; publish to
   `{thingName}/state_machine/control`.

PubNub is the older path and still serves history. Control has moved to the
topics above — do not reach for `pubnubapi.com` to send a command.

There is no on/off. The bassinet runs a state machine, and the button maps onto
two commands: `start_snoo`, and `go_to_state` with `state: "ONLINE", hold: "off"`
to stop. Anything other than `ONLINE` means it is running.

The connection is shared and held open for the same reasons the Nanit one is —
see below, and do not reintroduce a connection per press.

## State that is knowable, and state that is not

- A Kasa plug that answers **always** reports `relay_state`. Power is never
  unknown. Failure to reach a plug is a _reachability_ problem — model it as
  `isReachable: false`, never as an unknown power state.
- The Nanit night light cannot be _asked_ for its on/off state — `GET_CONTROL`
  is never answered (see README.md). It is knowable anyway, by holding the
  camera socket open: the camera announces every change, including ones made
  from the phone app, and an acknowledged write tells us what we just set.
  `lib/nanit/connection.ts` keeps that connection and caches the result to
  `secrets/nanit-night-light.json`. Treat the cache as _last known_ rather than
  verified — a change made while the process was down is invisible until the
  next announcement.

Read every device independently and catch per device; one unreachable plug must
not take the whole page down.

## Do not reintroduce per-request Nanit connections

A socket per button press cost a token check, a REST call, a TLS handshake and a
3-second wait for announcements — seconds per press, and it closed before on/off
could ever be learned. Both the slowness and the old unknown state came from
that one decision. Everything goes through the shared connection.

## How this is deployed, and why it matters

One **long-lived Node process at home**, exposed with a Cloudflare tunnel. Not
serverless, and the difference is structural rather than cosmetic:

- The token and state files under `secrets/` are read and rewritten at runtime.
  A read-only or ephemeral filesystem breaks Nanit auth, the Tapo V2 session and
  the night light cache. `secrets/` is gitignored, so it would not even be
  present in a git-based deploy.
- `lib/nanit/connection.ts` holds a websocket open, sends keepalives and listens
  for announcements. Nothing about that survives a per-request runtime, and
  losing it costs both the quick presses and the knowable on/off state.
- Login rate limiting and the pending Tapo MFA `terminalUUID` live in process
  memory, which is only sound because there is one process.

If this ever needs to move to serverless, all four have to be rehomed (a
database such as Turso for the first, second and fourth; a separate always-on
worker for the socket). Do not port it piecemeal.

The app is on the public internet through the tunnel, so `LOGIN_SECRET` is the
only thing in front of the nursery. Serve a production build rather than
`next dev`, which is slower and ships dev tooling.

### pm2 owns that process — never start one by hand

The process is a **pm2 app named `baby`**, running `bash -c 'cd
/home/rcwalsh/code/baby_app && yarn start'` on port **2026**. pm2 is what
restarts it after a crash or a reboot, so deploying is two steps:

```bash
yarn build && pm2 restart baby
```

Do not deploy with a bare `yarn start`, `nohup` or `setsid`, and do not reach
for `next dev` to look at something. Any of those puts a **second** copy of the
app on the machine, and the failure is quiet rather than loud:

- Whichever copy binds 2026 first wins, so pm2 can report `baby` **online**
  while the port is actually served by a stray — a deploy then appears to do
  nothing, because pm2 restarted a process that was not the one answering.
- `next-server` **releases the port on `SIGTERM` without exiting**. A killed
  stray disappears from `ss` but stays in `ps`, so "the port is free" is not
  evidence that anything was cleaned up. Check with `pgrep -af next-server` and
  follow up with `kill -KILL`.
- `yarn build` rewrites `.next` underneath whatever is already running, which
  leaves the live app serving a mix of old process and new chunks until it is
  restarted. That is fine as the first half of the deploy above, but it means a
  build is never a read-only "just checking it compiles" step while the nursery
  is being used.

`pm2 logs baby` for output; the files are `~/.pm2/logs/baby-{out,error}.log`.
`pm2 restart baby --update-env` if `.env` changed. Confirm a deploy landed by
reading `/version.json`, which the build stamps with the commit:

```bash
curl -s http://localhost:2026/version.json
```

## Working here

- `yarn typecheck`, `yarn lint`, `yarn prettier --write <files>`. All offline
  and safe to run. Yarn, not npm; `--exact` when adding.
- There is no dev server to attach to: the app runs as the pm2-managed
  production build on port 2026 described above. Starting `next dev` alongside
  it corrupts the `.next` the live app is serving from.
- `lib/environment.ts` validates lazily via envalid. That once meant `next
build` ran without secrets present, but no longer: `APP_TITLE` is read by
  `app/layout.tsx` and `app/manifest.ts`, both of which prerender, so a build
  now touches `getEnvironment()` and needs a full `.env` beside it. Envalid
  validates the whole object at once, so a missing `NANIT_PASSWORD` fails the
  build just as a missing `APP_TITLE` would.
- Client components must not import `lib/nanit/night-light.ts` (drags in `ws`
  and protobuf). Shared constants live in `lib/nanit/brightness.ts`.
