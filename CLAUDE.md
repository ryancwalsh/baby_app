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
  **unreachable through this cloud endpoint at all**. Every S-series device on
  the account reports `status: 0` while every Kasa one reports `status: 1`, and
  `passthrough` answers `-20571 "Device is offline"` no matter what the request
  contains. The legacy Kasa cloud has no route to them; they live on TP-Link's
  newer IoT cloud. `-20571` here means "this cloud cannot reach it", not
  "unplugged" — do not read it as a hardware problem.

Decode S-series aliases before putting them in `TAPO_DEVICES`.

### Reaching the Tapo devices: the V2 cloud

Tapo devices live on TP-Link's **V2 cloud**, which a probe has reached
successfully. The recipe, every part of it verified:

- Host `n-wap.i.tplinkcloud.com` (Kasa's is `n-wap.tplinkcloud.com`).
- TLS is signed by TP-Link's **own private CA**, and the root is not served, so
  an ordinary client fails with `UNABLE_TO_GET_ISSUER_CERT`. Pin the
  intermediate `CN=TP-Link Cloud Server CA` by SHA-256 fingerprint rather than
  disabling verification.
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
  `{deviceId, requestData}` — not Kasa's `{method, params}` wrapper.

**The account has MFA enabled**, so login returns `-20677 "MFA feature enabled"`
with an `MFAProcessId` and `supportedMFATypes`. Automated login alone cannot
finish; it needs the same one-time interactive pattern as Nanit
(`yarn nanit:login` → tokens on disk → refresh at request time).

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

## Working here

- `yarn typecheck`, `yarn lint`, `yarn prettier --write <files>`. All offline
  and safe to run. Yarn, not npm; `--exact` when adding.
- A dev server is usually already running on port 3000 — attach to it rather
  than starting another.
- `lib/environment.ts` validates lazily via envalid, because `next build` runs
  without secrets present.
- Client components must not import `lib/nanit/night-light.ts` (drags in `ws`
  and protobuf). Shared constants live in `lib/nanit/brightness.ts`.
