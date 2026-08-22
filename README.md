# baby_app

A PWA for the controls in a nursery. The homepage is currently just a
headline — the server actions below are wired up and working, but nothing calls
them yet.

## Getting started

```
yarn install
cp .env.example .env   # fill in the credentials
yarn nanit:login       # once, interactively — see "Nanit sign-in" below
yarn dev
```

Scripts: `yarn dev`, `yarn build`, `yarn start`, `yarn lint`, `yarn format`,
`yarn typecheck`, `yarn nanit:login`.

## Server actions

Two devices, in `app/actions/`:

| Action                             | What it does                                |
| ---------------------------------- | ------------------------------------------- |
| `getNightLightAction()`            | Reads the Nanit camera's night light        |
| `setNightLightBrightnessAction(n)` | Sets brightness, 0–100                      |
| `setNightLightPowerAction(isOn)`   | Switches the night light on or off          |
| `getLampAction()`                  | Reads the lamp's smart plug, with its alias |
| `setLampPowerAction(isOn)`         | Switches the lamp on or off                 |
| `toggleLampAction()`               | Flips the lamp                              |

Both read paths and both write paths have been run against the real hardware.

## The lamp (TP-Link)

An older Kasa-protocol plug reached through the TP-Link cloud, so it works from
anywhere. `services/tapo/client.ts` speaks to the cloud directly with `fetch`: log in
at `use1-wap.tplinkcloud.com` for a token, then `POST {method: "passthrough"}`
to the device's `appServerUrl` wrapping a `system.get_sysinfo` or
`system.set_relay_state` command.

The proof of concept used `tp-link-tapo-connect`, but that package does not
expose its passthrough helper, so reading state or toggling needed a
400-line `patch-package` patch. The two cloud calls involved are short enough to
own outright, which drops both the dependency and the patch.

`TAPO_DEVICES` holds `[[appServerUrl, alias, deviceId], ...]`, which is what the
cloud's `getDeviceList` returns — caching it in the environment avoids listing
devices on every request.

## The night light (Nanit)

`services/nanit/` talks to Nanit's unofficial, reverse-engineered cloud API: log in
over REST at `api.nanit.com`, list `/babies` for the `camera_uid`, then open a
protobuf-over-websocket connection to
`wss://api.nanit.com/focus/cameras/<camera_uid>/user_connect`. No local network
access is needed, and the Nanit app stays in sync with changes made here.

The REST API wants the bare access token in `Authorization`; the websocket wants
it with a `Bearer` prefix.

On/off is `PUT_CONTROL { control: { nightLight } }`; brightness is
`PUT_SETTINGS { settings: { nightLightBrightness } }` (field 24). Brightness and
on/off are **independent** — setting a level does not switch the light on, and
switching it on does not change the level. The Nanit app shows the same split, a
brightness slider above a separate power icon.

### Nanit sign-in

A fresh login is answered with a multi-factor challenge, which a web request has
nowhere to prompt for. `yarn nanit:login` does that half in a terminal and
writes `secrets/nanit-tokens.json`; at request time the app only ever refreshes
those tokens. When the refresh fails it says to run the script again.

### `isOn` is usually null, and that is honest

Brightness can be read back with `GET_SETTINGS`, but the on/off state cannot be
read at all:

- `GET_CONTROL` is never answered — the camera simply does not reply.
- Nothing is volunteered on connect. A fresh cloud connection was left listening
  for 20 seconds and announced nothing.
- It is absent from the REST payloads too.

The state only arrives as a `PUT_CONTROL` the camera pushes **when it changes**,
including changes made from the phone app. A server action opens a connection,
acts, and closes it, so it usually never sees one — hence `isOn: null` for
"unknown" rather than a guess, because reporting it as off would be wrong
precisely when the light is on.

Tracking on/off properly needs a **long-lived connection** that observes those
announcements, which means a persistent backend process rather than a per-request
one. That is a change to make deliberately, not something to paper over here.

### Do not trust the Nanit app as ground truth

The app does not reliably refresh state changed elsewhere: it showed "0%" and
"OFF" while the camera, the cloud, and the physical light were all at 100% and
on. Verify against the LED itself. Several wrong conclusions during the proof of
concept came from believing the app, including a stretch spent building a
local-network path to work around a cloud bug that did not exist.

### The cloud relay lies about success, but does deliver

`PUT_CONTROL` is answered `200` regardless of content: a frame whose `control`
submessage holds _only_ a nonexistent field 99 also returns `200`, and the
"state change" pushed back echoes field 99 verbatim, so the ack is blind and the
push is a byte-level echo rather than the camera. Commands **are** still
forwarded — verified by watching the camera on its local socket while commanding
over the cloud. Do not treat that `200`, or the echo, as confirmation.

### Notes on firmware 6.58.615

Things the published community projects do not document:

- `GET_SETTINGS` needs a `getSettings` submessage on **field 6** of `Request`,
  otherwise the camera answers `400 Bad Request: missed 'getsettings' field`. No
  published proto declares this field; it was found by trying each unused field
  number. `GET_STATUS` wants a `getStatus` field the same way.
- Declare every `RequestType` the camera might send, and mark **all** fields
  `optional` even where the protocol treats them as mandatory. The camera emits
  frames omitting them (one carried only an `id`), and protobuf2 responds to a
  missing `required` field by throwing away the whole frame — which crashes the
  client on an unrelated push.

The schema lives in `services/nanit/protocol.ts` as a string rather than a `.proto`
file: protobufjs resolves file paths against the working directory, which a
bundled Next.js server build cannot be relied upon to preserve.

### The camera is reachable directly, if ever needed

Not used, but worth recording: `wss://<private_address>` with an
`Authorization: token <uc_token>` header and TLS verification disabled (the
camera serves a self-signed certificate). `/babies` reports the address as
`babies[0].camera.private_address`, and `uc_token` comes from
`/focus/cameras/<camera_uid>/uc_token` — it is **single-use**, so reusing one
gives `403`. Unlike the cloud, this connection announces full state on connect,
which would make on/off readable. It requires being on the camera's network.

Protocol details reverse-engineered by:

- https://github.com/ulm0/homebridge-nanit-next
- https://github.com/gregory-m/nanit
- https://gitlab.com/adam.stanek/nanit
