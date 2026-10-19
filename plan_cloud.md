# Plan: host on Vercel and Turso, and keep working with the laptop off

Status: proposal, 2026-10-19. Nothing here has been built, and nothing on Vercel, Turso, Cloudflare, or GitHub has been created or changed.

## Verdict

Possible, with one honest caveat about what "degrade gracefully" will mean in practice.

Most of the app can move to Vercel outright: the tracking log (already on Turso), the noise page, the lullabies, the Tapo and Kasa switches, the login, and webcam mode. Those keep working with the laptop off.

The Nanit camera (night light, its fade, temperature, room audio, and video) and the Snoo cannot run on Vercel without breaking rules this codebase was built around: each needs a connection held open for hours, and Nanit media needs a long-running ffmpeg. Those stay on a long-lived Node process — called the **worker** below — and the Vercel app shows them as unavailable, with their last known state, whenever the worker cannot be reached.

So with the laptop off, the room's lamp and fan, tracking, white noise, lullabies, and the two-phone webcam monitor all work; the Nanit and the Snoo do not.

### The recommendation behind the recommendation

Nothing the worker does needs to be _at home_. Every device is reached through its own cloud (Nanit's, Happiest Baby's AWS IoT, TP-Link's), and the plugs are already on the guest network precisely because LAN reach was never needed. The laptop is only the worker's current host.

So the cheapest way to make the Nanit and the Snoo survive the laptop being off is not more code but a different host for the worker: a Raspberry Pi left plugged in at home (about $80 once), or a small always-on VM (Hetzner, Fly.io, or Railway, about $4–6 a month). The plan below is written so the worker can move to either later with no code change — only a DNS record. I would do the Vercel split first, because it is needed either way, and decide on the worker's host afterwards.

## What ties the app to the laptop today

From `AGENTS.md` ("How this is deployed, and why it matters") and the code:

| Tie                                                            | Where                                                                             | Can it move to Vercel?                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Token and state files written at runtime under `secrets/`      | `services/nanit/auth.ts`, `services/tapo/cloud-v2.ts`, `services/snoo/auth.ts`, … | Yes, into Turso, for the services that move.                                                      |
| Nanit websocket held open, keepalives, and announcements       | `services/nanit/connection.ts`                                                    | No. Stays on the worker.                                                                          |
| Snoo MQTT connection held open                                 | `services/snoo/connection.ts`                                                     | No, by the same rule. Stays on the worker.                                                        |
| Nanit audio and video through one ffmpeg                       | `services/nanit/media.ts`                                                         | No. Stays on the worker.                                                                          |
| Night light two-minute fade loop                               | `services/nanit/night-light.ts`                                                   | No. Stays on the worker.                                                                          |
| Login rate limit in process memory                             | `auth/login-rate-limit.ts`                                                        | Yes, into Turso.                                                                                  |
| Pending Tapo MFA `terminalUUID` in memory                      | `services/tapo/cloud-v2.ts`                                                       | Yes, into Turso (and MFA is broken anyway — see `AGENTS.md`).                                     |
| Webcam signaling hub in memory, over event streams             | `services/webcam/signaling.ts`                                                    | Yes, but it must be rebuilt on Turso; an in-memory hub is wrong across serverless instances.      |
| Lullabies on the filesystem, converted with ffmpeg             | `storage/lullabies.ts`                                                            | Yes, into Vercel Blob, with ffmpeg bundled into the function.                                     |
| Pre-migration backups written to `backups/`                    | `storage/database.ts`                                                             | Yes, but the backup must go somewhere durable (Vercel's filesystem is read-only and ephemeral).   |
| `public/version.json` stamped from `git branch --show-current` | `scripts/record_commit_hash_and_build_time.sh`                                    | Yes, from `VERCEL_GIT_COMMIT_REF` and `VERCEL_GIT_COMMIT_SHA` (Vercel builds on a detached head). |
| Lullaby names use the server's local time zone                 | `formatTimestamp` in `storage/lullabies.ts`                                       | Yes, but Vercel runs in UTC, so the phone must supply the time zone or the name.                  |

## Target architecture

```
phone (PWA)
  │
  ├── https://<app domain>  ──►  Vercel (Next.js, always on)
  │                                ├── Turso "baby-app": tracking, settings, tokens, rate limit, webcam signaling, last-known device state
  │                                ├── Vercel Blob: lullabies, migration backups
  │                                └── TP-Link clouds (Kasa and NBU): lamp, fan
  │
  └── https://worker.<app domain>  ──►  Cloudflare tunnel  ──►  worker (laptop today, under pm2)
                                         ├── Nanit websocket, night light and fade, temperature, audio and video (ffmpeg)
                                         ├── Snoo MQTT
                                         └── writes last-known Nanit and Snoo state to Turso
```

Decisions in that picture, and why:

- **One codebase, two roles.** A new `APP_ROLE` environment variable, `cloud` or `worker`. The cloud never imports `services/nanit/*` or `services/snoo/*` at runtime; the worker serves only the `/api/worker/*` routes and refuses everything else. Keeping one repository means one set of types for the messages between them, and one `main` to deploy from.
- **The phone talks to the worker directly, not through Vercel.** Proxying through Vercel would make HLS video count against Vercel's bandwidth (a night of 1080p is several gigabytes), and Vercel function time limits would cut long event streams. Direct means cross-origin, which costs CORS and an auth header — both small.
- **The worker needs no LAN.** It reaches every device through the cloud, so it can later run on a Pi or a VM with nothing but a changed DNS record.
- **Vercel never talks to the Nanit, not even as a fallback.** A per-request Nanit socket from Vercel is exactly what `AGENTS.md` forbids, and every one counts against the camera's connection limit (the `403 … above limit` lockout). Graceful degradation here means saying "unavailable", not quietly reintroducing the slow path. See open question 2 if you want that fallback anyway.

## What works when

| Feature                                                   | Laptop (worker) on                      | Laptop off                                                                                            |
| --------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Login                                                     | Works                                   | Works                                                                                                 |
| Tracking (sleeps, bottles, diapers, reports, predictions) | Works                                   | Works                                                                                                 |
| Noise page                                                | Works (all in the browser)              | Works                                                                                                 |
| Lullabies (play, record, rename, delete)                  | Works                                   | Works                                                                                                 |
| Lamp and fan (Kasa and Tapo)                              | Works                                   | Works                                                                                                 |
| Webcam mode (two phones)                                  | Works                                   | Works — and nights away are exactly when the laptop is likeliest to be off, so this one matters most. |
| Nanit night light and brightness                          | Works, live                             | Shown dimmed: "Worker offline — last known: on, 60%, as of 9:04 PM". Controls disabled.               |
| Night light fade                                          | Works                                   | Disabled. A fade running when the worker goes down stops where it is, as it would today on a crash.   |
| Nanit temperature                                         | Works, live                             | Last known reading with its time, dimmed.                                                             |
| Monitor tab in Nanit mode (audio and video)               | Works                                   | Says the worker is offline and offers a one-tap switch to Webcam mode. Nothing is queued.             |
| Snoo                                                      | Works, live                             | Last known state, dimmed, controls disabled.                                                          |
| Version footer                                            | Shows the cloud build, and the worker's | Shows the cloud build, and "worker offline"                                                           |

## Detailed design

### 1. Knowing whether the worker is there

- A client hook, `hooks/use-worker-status.ts`, fetches `${NEXT_PUBLIC_WORKER_ORIGIN}/api/worker/health` with a 2 second timeout. It answers `checking`, `online`, or `offline`.
- It re-checks every 30 seconds while the page is visible, immediately on `visibilitychange` to visible, and whenever a worker call or stream fails. A stream that drops flips it to `offline` straight away rather than waiting for the next poll.
- The browser asks directly rather than Vercel asking on its behalf, because what matters is whether _this phone_ can reach the worker through the tunnel — a process that is up behind a dead tunnel is as offline as one that is down.
- `health` is unauthenticated and returns only `{ ok: true, commit }`, so it leaks nothing and costs nothing to probe.

### 2. Calling the worker from a page served by Vercel

- Server actions are same-origin only, so the worker's features become route handlers under `app/api/worker/`: `night-light` (GET state, POST power, brightness, and fade), `night-light/stream`, `temperature/stream`, `nanit/media/[file]`, `nanit/stream-start` (the explicit, tap-driven `PUT_STREAMING`), `snoo` (GET and POST), and `health`. Each wraps the same `services/` functions the current actions call; the services themselves do not change.
- **Auth** is the same login hash the actions take today, checked by the same `attemptLogin` with the same rate limit: an `Authorization` header for `fetch`, and the existing `secretHash` query parameter for `EventSource` and media elements (hls.js could use a header via `xhrSetup`, but native iOS playback cannot, so the query parameter stays).
- **CORS** allows exactly one origin, the cloud's, read from a `CLOUD_ORIGIN` variable, and answers preflights. Nothing else is opened up.
- The client components that talk to Nanit and Snoo (`components/night-light.tsx`, `components/nanit-temperature.tsx`, `components/nanit-audio-provider.tsx`, `components/camera-feed.tsx`, `components/snoo-toggle.tsx`, and the bottom-nav actions) switch from server actions to a small `components/worker-client.ts` that builds worker URLs and adds the header. When the worker is offline they render the last known state from Turso instead (see 4).

### 3. The sleeping-baby rules, across the split

These are the parts most likely to be broken by accident, so they are listed on their own:

- **A page load still never writes to the camera.** Pages served by Vercel only read the last known state from Turso and open the worker's read-only streams.
- **A Monitor tab tap is still the only thing that starts a stream, and it is never queued.** If the worker is offline when the tap happens, the tap is consumed and thrown away, exactly as webcam mode already does. It must not be remembered and replayed when the worker comes back — that would start the camera minutes later, unasked. `components/navigation-tap.ts` stays a module variable.
- **No retry loop may write.** Reconnecting streams and health checks only read. A failed POST to the night light is reported, not retried.
- **Two Nanit sockets is the failure mode to avoid**, so there must only ever be one worker. The worker's `health` reports its host name; if the laptop and a future Pi were both running it, the version footer would show the mismatch.

### 4. Last known state in Turso

- The worker writes the night light (`isOn`, `brightness`), the latest temperature, and the Snoo report to a new `device_state` table whenever they change, with the time. This replaces `secrets/nanit-night-light.json` and the Snoo state file as the cache, and gives the cloud something honest to show when the worker is down.
- These are still _last known_, exactly as `AGENTS.md` says of the current cache, and the UI always shows their age.
- Writes are throttled (temperature arrives every ~30 s; storing one per minute at most is plenty).

### 5. Secrets and tokens

- New table `stored_secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`, wrapped by `storage/stored-secrets.ts` with `read(name)` and `compareAndSwap(name, expectedUpdatedAt, value)`.
- **The Tapo V2 refresh token moves first and most carefully.** `AGENTS.md` says losing it means losing the S-series switches, because MFA login is broken. On serverless, two instances can refresh at the same moment; if TP-Link rotates the refresh token on use, the loser's write would store a token that is already dead. So refreshes go through `compareAndSwap`, the loser re-reads instead of writing, and every refresh also appends the previous value to a `stored_secret_history` table so a bad write can be undone by hand. Before moving it, copy `secrets/tapo-v2-tokens.json` into `backups/` on the laptop.
- The Kasa cloud token, currently cached in a module variable, is cached in `stored_secrets` too, so cold starts do not log in to TP-Link on every press.
- Nanit and Snoo tokens stay as files on the worker, since only the worker uses them. `yarn nanit:login` is unchanged.
- Device credentials go into Vercel's encrypted environment variables. `constants/environment.ts` makes each one required only for the role that uses it (Nanit and Snoo credentials for `worker`, Tapo ones for `cloud`), so neither side needs the other's secrets.

### 6. Login rate limit

`auth/login-rate-limit.ts` keeps its interface and moves its map into a `login_failures (client TEXT PRIMARY KEY, failure_count INTEGER, locked_until TEXT)` table. The client address comes from `x-forwarded-for` on Vercel, which `getClient` already falls back to; the worker keeps `cf-connecting-ip`. Each side throttles separately against the same table, so guessing against the worker counts against the cloud too.

### 7. Webcam signaling on Turso

The current hub is an in-memory object reached over one event stream per phone. On Vercel, the camera's stream and a watcher's stream may land on different instances, so the hub moves into Turso and each stream polls it.

- Tables: `webcam_camera` (a single row: `camera_id`, `started_at`, `heartbeat_at`), `webcam_retired_cameras (camera_id, retired_at)`, and `webcam_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, recipient_id, message, created_at)`.
- `sendWebcamSignalAction` inserts into `webcam_signals`. Claiming the camera is one transaction: retire the previous id, write the new row, and queue `replaced` for the old camera.
- `app/api/webcam/stream/route.ts` keeps its shape for the browser, but its loop now selects new rows for its recipient once a second, sends them, and deletes them. The camera's stream also bumps `heartbeat_at` every 10 seconds; a camera whose heartbeat is older than 30 seconds is treated as gone. The deliberate-stop `bye` keeps working as now, so a stopped camera still does not alarm.
- The stream ends itself just before the function's `maxDuration` (set to 300 seconds), and `EventSource` reconnects on its own. The client already copes with reconnects, because a restart does the same thing today.
- Cost is small: signaling is only busy while phones are pairing (offers and answers carry their candidates, one message each way), and idle polling is a cheap indexed read once a second per phone. The picture itself never touches Vercel, as now.
- Rows older than a day are pruned on each claim.

The alternative is a hosted realtime service (Ably, Pusher, or a Cloudflare Durable Object), which would push instead of poll. It is another vendor and another key for a few messages a night, so I would not, unless the one-second delay turns out to matter.

### 8. Lullabies on Vercel Blob

- Files move to a **private** Vercel Blob store under `lullabies/`, served through the existing `app/api/lullabies/[file]` route so they stay behind the login. Listing, renaming (copy then delete), and deleting use the Blob API, and `compareFileNames` is unchanged.
- **Uploads go straight from the phone to Blob** with a client upload token, because a Vercel function rejects request bodies over 4.5 MB and a few minutes of recording passes that. The token route checks the login hash before issuing.
- A server action then pulls the upload, converts it to mp3 with an ffmpeg binary bundled into that one function (`ffmpeg-static`, added with `yarn add --exact`, about 75 MB of the 250 MB function limit), stores the mp3, and deletes the original.
- The recording's name is made on the phone, in its own time zone, and sent with the upload, since the server's clock is UTC on Vercel.
- A one-time `scripts/upload-lullabies.ts` copies the current `lullabies/` folder up, and the folder is kept on the laptop as a backup.

### 9. Migrations, backups, and deploys

You asked for migrations that allow zero-downtime deploys and rollbacks, backed up and verified first, and run by the Vercel build. The existing design is most of the way there:

- Migrations stay additive (new tables and nullable columns only), so the previous deployment keeps working against the new schema, and rolling back is Vercel's "promote previous deployment".
- **They move from lazy, at runtime, to the build.** A new `scripts/migrate.ts` (`yarn migrate`) runs from the Vercel build command, `yarn migrate && yarn build`, but only when `VERCEL_ENV` is `production`. The running app never migrates, so neither a cold start on Vercel nor the worker can start one; if the app finds the schema behind its code, it throws a clear error rather than migrating without a backup.
- The backup keeps today's dump, replay into an in-memory database, and table-by-table row-count check, and adds an upload of the dump to the private Blob store under `backups/YYYY-MM-DD_HH-MM-SS_tracking.sql`. A failed check, or a failed upload, fails the build, so the old deployment keeps serving untouched.
- Vercel's build filesystem is thrown away, so `backups/` on Vercel is meaningless; the laptop's gitignored `backups/` keeps its role for anything run by hand there.
- **Preview deployments must not see the production database.** The Turso variables are set for the Production environment only. See open question 4 for what previews get instead.
- `version.json` is stamped from `VERCEL_GIT_COMMIT_REF` and `VERCEL_GIT_COMMIT_SHA` when they exist, and from git otherwise, so the laptop's build keeps working.

After this, a push to `main` deploys the cloud with no manual step. The worker is still deployed by hand on the laptop with `yarn build && pm2 restart baby`, from `main` only, as now. Because the two can briefly run different commits, the worker's routes are treated as a public contract: change them additively, never rename one in place.

### 10. Domains and the tunnel

- Today the tunnel serves the whole app. After: the app domain points at Vercel, and the tunnel moves to a `worker.` subdomain.
- Cloudflare stays the DNS provider. The Vercel record should be DNS-only (grey cloud) rather than proxied, which is what Vercel recommends for its own certificates.
- `NEXT_PUBLIC_WORKER_ORIGIN` on Vercel holds the worker's address, and `CLOUD_ORIGIN` on the worker holds the app's, for CORS.
- The installed PWA keeps its address, so phones do not need reinstalling. Its saved login hash lives in local storage per origin, so that carries over too.

### 11. Vercel and Turso limits worth knowing

- Vercel Hobby is meant for personal, non-commercial use, which this is. Functions get up to 300 seconds with Fluid compute; waiting on the network is cheap because only active CPU is billed.
- Put the Vercel functions in the region nearest the Turso database (or move the database), since every tracking page and every token read is a round trip to it.
- Turso's free tier is far above what this uses, even with webcam polling.
- The tunnel and the worker are unchanged in cost.

## Phases

Each phase ships alone, leaves the laptop deployment working, and has a check before the next starts.

1. **Make the code role-aware, still all on the laptop.** Add `APP_ROLE` (default `worker`, so today's deployment is unchanged), the role-specific environment validation, `stored_secrets`, `device_state`, and `login_failures` as additive migrations, and move the rate limit and the Kasa token cache to Turso. Leave the Tapo refresh token where it is for now.
   Check: `yarn typecheck`, `yarn lint`, the laptop deploy runs as before, `/version.json` reports `main`.
2. **Add the worker API.** The `/api/worker/*` routes, CORS, `health`, and the `device_state` writes. The current pages keep using server actions, so nothing visible changes.
   Check: `curl` the health route through the tunnel; read-only GETs return the night light and Snoo state. No POSTs against the real camera without asking first.
3. **Move webcam signaling and lullabies off the filesystem and memory.** Turso signaling, Blob lullabies, phone-side names, and the upload script. These still run on the laptop at this stage, which proves them before Vercel is involved.
   Check: pair two phones in webcam mode on a dev server; record, rename, play, and delete a lullaby.
4. **Move the Tapo refresh token into Turso,** with the compare-and-swap and history, after a backup of the file.
   Check: a read of the S505 `Family Room wall switch` (dev only) through the new store, then a forced refresh that the stored value survives. A write only if you ask for one.
5. **Point the pages at the worker.** `use-worker-status`, `worker-client`, and the offline renderings, including the Monitor tab's "switch to Webcam" offer.
   Check: on a dev server, stop the worker and confirm every Nanit and Snoo control dims with a last-known reading and nothing errors; restart it and confirm they come back without a reload.
6. **Stand up Vercel** — only after you approve each step in "Changes outside the repository" below. Production-only Turso variables, the private Blob store, `yarn migrate && yarn build`, `APP_ROLE=cloud`.
   Check: the deployment's `/version.json`; log in, add and delete a test diaper, toggle nothing.
7. **Move the domain.** The app domain to Vercel, the tunnel to `worker.`.
   Check: the installed PWA on both phones opens, logs in, and shows the worker online; then with the laptop asleep, everything in the "Laptop off" column behaves as described.
8. **Tidy up.** Update `AGENTS.md`, `CLAUDE.private.md`, and `README.md` for the new deployment, and remove the code paths the move made dead (`secrets/nanit-night-light.json` reads, the in-memory hub, the filesystem lullabies).

## Changes outside the repository, each needing your approval first

None of these will be done without a specific prompt to you first, per your standing instruction:

- Vercel: create a project linked to the GitHub repository, set the build command, set the environment variables (listing each by name, scoped to Production), create a private Blob store, and set the function region.
- Turso: create a database token for Vercel (separate from the laptop's, so either can be revoked alone), and possibly a preview database.
- Cloudflare: change the app domain's record to Vercel, and add the `worker.` route to the existing tunnel.
- GitHub: nothing beyond Vercel's app installation.

## Risks

- **The Tapo refresh token.** The one secret whose loss cannot be fixed. Mitigated by the backup, compare-and-swap, history, and moving it in its own phase.
- **A second Nanit socket.** A dev server, a forgotten second worker, or a fallback path each count against the camera's limit. Mitigated by keeping Vercel away from the Nanit entirely.
- **Cross-origin on iOS.** Safari is stricter about cross-origin media and event streams in an installed PWA. Native HLS with a query-parameter credential and plain CORS should be fine, but this is the first thing to test on a real iPhone in phase 5.
- **Version skew between the cloud and the worker.** Handled by treating worker routes as an additive contract, and by the version footer showing both commits.
- **Webcam signaling latency.** Pairing may take a second or two longer than now. Acceptable; it happens once a night.

## Open questions

1. **Where should the worker live long term?** The laptop (degrades when it is off), a Raspberry Pi at home (about $80, nothing degrades unless the house loses power or internet), or a small VM (about $5 a month, nothing degrades at all, but the camera's video then crosses the internet twice). My recommendation is a Pi, after the split is done.
2. **Should Vercel ever reach the Nanit itself when the worker is down?** A one-shot connection per press would let the night light be switched with the laptop off, at the cost of the slow presses, the unknown state, and the connection-limit risk `AGENTS.md` warns about. My recommendation is no.
3. **The Snoo: worker, or Vercel?** It has never been run. On the worker it follows the existing rule of one held connection. On Vercel it would work with the laptop off, but each press would sign in, connect, publish, and disconnect, and its state would be unknown between presses. My recommendation is the worker for now, and revisit once it has run against the real bassinet.
4. **Preview deployments.** Turn them off, or give them a separate `baby-app-preview` Turso database? My recommendation is off — there is one user, and the dev server covers trying things out.
5. **Keep lullabies as mp3?** If both phones play their own recordings natively (WebM on Android, MP4 on iOS), the ffmpeg step could go entirely and the function would shrink. Worth a quick test before bundling ffmpeg.
