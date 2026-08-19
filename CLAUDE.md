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

`TAPO_DEVICES` mixes device families and they are **not** interchangeable:

- `IOT.SMARTPLUGSWITCH` (HS-series, "Kasa"): plaintext `alias`, driven by
  `system.get_sysinfo` / `system.set_relay_state` through the cloud's
  `passthrough` method. This is what `lib/tapo/client.ts` implements, and the
  only family proven to work — in this app and in the POC.
- `SMART.TAPOSWITCH` (S-series, "Tapo"): **base64-encoded `alias`**, and
  **not reachable through any `tplinkcloud.com` endpoint**. They report
  `status: 0` while every Kasa device reports `status: 1`, and `passthrough`
  answers `-20571 "Device is offline"` whatever the request contains.

  **`status: 0` does not mean the device is offline**, and `-20571` is not a
  hardware problem. Both were proven misleading:
  1. The official Tapo app controls these switches remotely over **cellular**,
     with the phone on no local network. Remote control demonstrably works.
  2. Immediately after a successful app command, every `tplinkcloud.com` host
     still reported `status: 0` and `-20571`. Four were tried —
     `n-use1-wap.i`, `n-use1-wap-gw`, `n-use1-wap` and the legacy `use1-wap`,
     including the host the device's own record names as its `appServerUrl`.

  `tplinkcloud.com` is a legacy mirror: it lists Tapo devices but neither
  tracks nor relays them. The app uses TP-Link's **NBU** backend
  (`*.iot.i.tplinknbu.com`). That host is reachable and uses the same
  `tp-link-CA` root already pinned here, but its API shape is unknown — every
  guessed path 404s, and no community library implements it; they all target
  `tplinkcloud.com`, the path that fails.

  The app was slow on its first command and quicker after, suggesting the
  device holds no standing cloud session and one is established on demand.

  Finding the NBU protocol needs the app's own traffic captured (mitmproxy on
  the phone, with its CA trusted). Guessing endpoints has been tried; it does
  not work. Comparing device records is also exhausted: a working HS103 and a
  failing S505 differ only in `deviceType` and `status`.

Decode S-series aliases before putting them in `TAPO_DEVICES`.

### Reaching the Tapo devices: the V2 cloud

Tapo devices live on TP-Link's **V2 cloud**, which a probe has reached
successfully. The recipe, every part of it verified:

- Log in at `n-wap.i.tplinkcloud.com`, then send device commands to the
  **`appServerUrl` the login response names** (currently
  `n-use1-wap-gw.tplinkcloud.com`) — not the login host.
- **Two** TP-Link CAs are involved, neither in any public trust store, so both
  are pinned by SHA-256 fingerprint: `CN=TP-Link Cloud Server CA` for
  `*.i.tplinkcloud.com`, and the self-signed `CN=tp-link-CA` root for the
  `*.tplinkcloud.com` app servers. Pinning both, rather than disabling
  verification.
- A successful login still carries `result.errorCode: "0"`. Treating any present
  `errorCode` as a failure surfaces a bare "0" as the error message.
- Every request is HMAC-SHA1 signed. Headers `Content-MD5` and
  `X-Authorization: Timestamp=…, Nonce=…, AccessKey=…, Signature=…`. The signed
  string is `{contentMd5}\n{timestamp}\n{nonce}\n{path}` — **path only, no query
  string**, or the server answers `-10301 "Signature dose not match"`.
- Tapo app keys: access `4d11b6b9d5ea4d19a829adbb9714b057`, secret
  `6ed7d97f3e73467f8a5bab90b577ba4c`, fixed timestamp `9999999999`. These are
  app constants from the APK, not account secrets.
- `POST /api/v2/account/login` takes a **flat** body (`appType:
  "TP-Link_Tapo_Android"`, `cloudUserName`, `cloudPassword`, `terminalUUID`,
  `terminalName`, `terminalMeta`, `appVersion`, `platform`,
  `refreshTokenNeeded`, `supportBindAccount`) plus app query parameters
  (`appName`, `termID`, `appVer`, `ospf`, `netType`, `locale`). A `{method,
params}` envelope is wrong here and yields `-20107`.
- Device commands then `POST /api/v2/common/passthrough` with a flat
  `{deviceId, requestData, token}` — not Kasa's `{method, params}` wrapper.

Files under `secrets/` are written by the code, never by hand; an empty or
hand-made `tapo-v2-tokens.json` is treated as no session.

**The V2 client is verified working**: sign-in, token storage, signing and
certificate pinning were all exercised against the real cloud. What it cannot do
is reach a device TP-Link itself lists as offline — see the note above. Do not
spend more time on the client code.

**The account has MFA enabled**, so login returns `-20677 "MFA feature enabled"`
with an `MFAProcessId` and `supportedMFATypes: [2, 1]`. Redeem the code at
`/api/v2/account/checkMFACodeAndLogin` with the **same `terminalUUID`** as the
login that issued the challenge.

There is **no endpoint to dispatch or re-send the code**: `sendMFACode`,
`resendMFACode`, `getMFACode`, `sendVerificationCode` and `requestMFACode` all
answer `-20103 "The method does not exist"`. The login call itself sends it, by
whichever method the TP-Link account is configured for. TP-Link's default is a
**Tapo app notification to a trusted phone, not email**, so do not promise email
in the UI, and do not treat a missing email as a failure.

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
only thing in front of the nursery. Serve a production build (`yarn build` then
`yarn start`) rather than `next dev`, which is slower and ships dev tooling.

## Working here

- `yarn typecheck`, `yarn lint`, `yarn prettier --write <files>`. All offline
  and safe to run. Yarn, not npm; `--exact` when adding.
- A dev server is usually already running on port 3000 — attach to it rather
  than starting another.
- `lib/environment.ts` validates lazily via envalid, because `next build` runs
  without secrets present.
- Client components must not import `lib/nanit/night-light.ts` (drags in `ws`
  and protobuf). Shared constants live in `lib/nanit/brightness.ts`.
