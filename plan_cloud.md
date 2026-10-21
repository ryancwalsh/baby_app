# Plan: host on Vercel and Turso, and keep working with the laptop off

Status: phases 0 to 5 are built and deployed on the laptop, and the Snoo is removed (2026-10-21). On Vercel there is an empty `baby-app` project, not connected to GitHub, and the private Blob store `baby-app-lullabies`; nothing on Turso, Cloudflare, or GitHub has been changed. As built, webcam signaling also has a `webcam_watchers` table, so a new camera can say hello to everyone already waiting, and the camera notices it was replaced by reading the slot rather than by a queued message. The laptop still converts recordings with its own ffmpeg; `ffmpeg-static` waits for phase 6, where it is first needed.

Decided so far:

- The Snoo is being sold, so it is out of scope. Nothing here moves it, and its code is removed in the tidy-up phase.
- Losing some features while the laptop is off is acceptable. Where the worker runs is not a question for now.
- Preview deployments are off.
- Lullabies stay mp3, converted with ffmpeg, so every browser gets the same format.
- Every timestamp is saved in UTC, filenames included, and converted to local time only for display.

## Verdict

Possible.

Most of the app can move to Vercel outright: the tracking log (already on Turso), the noise page, the lullabies, the Tapo and Kasa switches, the login, and webcam mode. Those keep working with the laptop off.

The Nanit camera (night light, its fade, temperature, room audio, and video) cannot run on Vercel without breaking rules this codebase was built around. It stays on the laptop, in a long-lived Node process called the **worker** below, and the Vercel app shows it as unavailable, with its last known state, whenever the worker cannot be reached.

So with the laptop off, the room's lamp and fan, tracking, white noise, lullabies, and the two-phone webcam monitor all work; the Nanit does not.

## What the worker does, and why it cannot be on Vercel

With the Snoo gone, the worker is only the Nanit. It is today's app, running under pm2 on the laptop, with everything but the Nanit switched off. It does four things, and all four need a process that stays alive for hours:

1. **Holds one websocket to the Nanit cloud open.** That is what makes the night light's on/off knowable at all: the camera never answers a question about it, but announces every change on an open connection (`AGENTS.md`, "State that is knowable"). It is also what makes a press fast — no sign-in, TLS handshake, and three-second wait each time.
2. **Runs the night light's two-minute fade,** as a loop that steps the brightness down. It has to live on a server because a phone freezes a backgrounded page's timers.
3. **Streams the temperature,** which the camera pushes about every 30 seconds over that same websocket.
4. **Relays the room's audio and video:** one ffmpeg pulls the camera's RTMP stream and cuts it into HLS segments that the phone plays.

Vercel runs code only for the length of a request, at most 300 seconds, and keeps nothing between requests. It cannot hold the websocket, so the night light's state would be unknown again, and it cannot run ffmpeg continuously, so there would be no audio or video.

Moving the worker off the laptop later (to a Raspberry Pi or a rented server) would be a DNS change rather than a code change, because the worker reaches the camera through Nanit's cloud and needs nothing on the home network. That is only recorded here so the design does not close the door; it is not part of this plan.

## What ties the app to the laptop today

From `AGENTS.md` ("How this is deployed, and why it matters") and the code:

| Tie                                                            | Where                                                    | Can it move to Vercel?                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Token and state files written at runtime under `secrets/`      | `services/nanit/auth.ts`, `services/tapo/cloud-v2.ts`, … | The Tapo ones move into Turso; the Nanit ones stay with the worker.                               |
| Nanit websocket held open, keepalives, and announcements       | `services/nanit/connection.ts`                           | No. Stays on the worker.                                                                          |
| Nanit audio and video through one ffmpeg                       | `services/nanit/media.ts`                                | No. Stays on the worker.                                                                          |
| Night light two-minute fade loop                               | `services/nanit/night-light.ts`                          | No. Stays on the worker.                                                                          |
| Login rate limit in process memory                             | `auth/login-rate-limit.ts`                               | Yes, into Turso.                                                                                  |
| Pending Tapo MFA `terminalUUID` in memory                      | `services/tapo/cloud-v2.ts`                              | Yes, into Turso (and MFA is broken anyway — see `AGENTS.md`).                                     |
| Webcam signaling hub in memory, over event streams             | `services/webcam/signaling.ts`                           | Yes, but it must be rebuilt on Turso; an in-memory hub is wrong across serverless instances.      |
| Lullabies on the filesystem, converted with ffmpeg             | `storage/lullabies.ts`                                   | Yes, into Vercel Blob, with ffmpeg bundled into the function.                                     |
| Pre-migration backups written to `backups/`                    | `storage/database.ts`                                    | Yes, but the backup must go somewhere durable (Vercel's filesystem is read-only and ephemeral).   |
| `public/version.json` stamped from `git branch --show-current` | `scripts/record_commit_hash_and_build_time.sh`           | Yes, from `VERCEL_GIT_COMMIT_REF` and `VERCEL_GIT_COMMIT_SHA` (Vercel builds on a detached head). |
| Lullaby recordings and backups named in local time             | `formatTimestamp` in `storage/lullabies.ts`              | Yes, and it has to change anyway: names become UTC (see 8).                                       |

## Target architecture

```
phone (PWA)
  │
  ├── https://<app domain>  ──►  Vercel (Next.js, always on)
  │                                ├── Turso "baby-app": tracking, settings, Tapo tokens, rate limit, webcam signaling, last-known Nanit state
  │                                ├── Vercel Blob: lullabies, migration backups
  │                                └── TP-Link clouds (Kasa and NBU): lamp, fan
  │
  └── https://worker.<app domain>  ──►  Cloudflare tunnel  ──►  worker (the laptop, under pm2)
                                         ├── Nanit websocket, night light and fade, temperature, audio and video (ffmpeg)
                                         └── writes last-known Nanit state to Turso
```

Decisions in that picture, and why:

- **One codebase, two roles.** A new `APP_ROLE` environment variable, `cloud` or `worker`. The cloud never imports `services/nanit/*` at runtime; the worker serves only the `/api/worker/*` routes and refuses everything else. Keeping one repository means one set of types for the messages between them, and one `main` to deploy from.
- **The phone talks to the worker directly, not through Vercel.** Proxying through Vercel would make HLS video count against Vercel's bandwidth (a night of 1080p is several gigabytes, against a 100 GB monthly allowance), and Vercel's time limits would cut long event streams. Direct means cross-origin, which costs CORS and an auth header — both small.
- **Vercel never talks to the Nanit, not even as a fallback.** See open question 1.

## What works when

| Feature                                                   | Laptop (worker) on                      | Laptop off                                                                                            |
| --------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Login                                                     | Works                                   | Works                                                                                                 |
| Tracking (sleeps, bottles, diapers, reports, predictions) | Works                                   | Works                                                                                                 |
| Noise page                                                | Works (all in the browser)              | Works                                                                                                 |
| Lullabies (play, record, rename, delete)                  | Works                                   | Works                                                                                                 |
| Lamp and fan (Kasa and Tapo)                              | Works                                   | Works                                                                                                 |
| Webcam mode (two phones)                                  | Works                                   | Works — and nights away are exactly when the laptop is likeliest to be off, so this one matters most. |
| Nanit night light and brightness                          | Works, live                             | Shown dimmed: "Laptop offline — last known: on, 60%, as of 9:04 PM". Controls disabled.               |
| Night light fade                                          | Works                                   | Disabled. A fade running when the worker goes down stops where it is, as it would today on a crash.   |
| Nanit temperature                                         | Works, live                             | Last known reading with its time, dimmed.                                                             |
| Monitor tab in Nanit mode (audio and video)               | Works                                   | Says the laptop is offline and offers a one-tap switch to Webcam mode. Nothing is queued.             |
| Version footer                                            | Shows the cloud build, and the worker's | Shows the cloud build, and "laptop offline"                                                           |

## Detailed design

### 1. Knowing whether the worker is there

- A client hook, `hooks/use-worker-status.ts`, fetches `${NEXT_PUBLIC_WORKER_ORIGIN}/api/worker/health` with a 2 second timeout. It answers `checking`, `online`, or `offline`.
- It re-checks every 30 seconds while the page is visible, immediately on `visibilitychange` to visible, and whenever a worker call or stream fails. A stream that drops flips it to `offline` straight away rather than waiting for the next poll.
- The browser asks directly rather than Vercel asking on its behalf, because what matters is whether _this phone_ can reach the worker through the tunnel — a process that is up behind a dead tunnel is as offline as one that is down.
- `health` is unauthenticated and returns only `{ ok: true, commit }`, so it leaks nothing and costs nothing to probe.

### 2. Calling the worker from a page served by Vercel

- Server actions are same-origin only, so the worker's features become route handlers under `app/api/worker/`: `night-light` (GET state, POST power, brightness, and fade), `night-light/stream`, `temperature/stream`, `nanit/media/[file]`, `nanit/stream-start` (the explicit, tap-driven `PUT_STREAMING`), and `health`. Each wraps the same `services/` functions the current actions call; the services themselves do not change.
- **Auth** is the same login hash the actions take today, checked by the same `attemptLogin` with the same rate limit: an `Authorization` header for `fetch`, and the existing `secretHash` query parameter for `EventSource` and media elements (hls.js could use a header via `xhrSetup`, but native iOS playback cannot, so the query parameter stays).
- **CORS** allows exactly one origin, the cloud's, read from a `CLOUD_ORIGIN` variable, and answers preflights. Nothing else is opened up.
- The client components that talk to the Nanit (`components/night-light.tsx`, `components/nanit-temperature.tsx`, `components/nanit-audio-provider.tsx`, `components/camera-feed.tsx`, and the bottom-nav actions) switch from server actions to a small `components/worker-client.ts` that builds worker URLs and adds the header. When the worker is offline they render the last known state from Turso instead (see 4).

### 3. The sleeping-baby rules, across the split

These are the parts most likely to be broken by accident, so they are listed on their own:

- **A page load still never writes to the camera.** Pages served by Vercel only read the last known state from Turso and open the worker's read-only streams.
- **A Monitor tab tap is still the only thing that starts a stream, and it is never queued.** If the worker is offline when the tap happens, the tap is consumed and thrown away, exactly as webcam mode already does. It must not be remembered and replayed when the worker comes back — that would start the camera minutes later, unasked. `components/navigation-tap.ts` stays a module variable.
- **No retry loop may write.** Reconnecting streams and health checks only read. A failed POST to the night light is reported, not retried.
- **Only one worker, ever.** A second one is a second Nanit socket against the camera's connection limit. The worker's `health` reports its host name and commit, and the version footer shows them.

### 4. Last known Nanit state in Turso

- The worker writes the night light (`isOn`, `brightness`) and the latest temperature to a new `device_state` table whenever they change, with the time in UTC. This replaces `secrets/nanit-night-light.json` as the cache, and gives the cloud something honest to show when the worker is down.
- These are still _last known_, exactly as `AGENTS.md` says of the current cache, and the UI always shows their age.
- Writes are throttled (temperature arrives every ~30 s; storing one per minute at most is plenty).

### 5. Secrets and tokens

- New table `stored_secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`, wrapped by `storage/stored-secrets.ts` with `read(name)` and `compareAndSwap(name, expectedUpdatedAt, value)`.
- **The Tapo V2 refresh token moves most carefully.** `AGENTS.md` says losing it means losing the S-series switches, because MFA login is broken. On serverless, two instances can refresh at the same moment; if TP-Link rotates the refresh token on use, the loser's write would store a token that is already dead. So refreshes go through `compareAndSwap`, the loser re-reads instead of writing, and every refresh also appends the previous value to a `stored_secret_history` table so a bad write can be undone by hand. Before moving it, copy `secrets/tapo-v2-tokens.json` into `backups/` on the laptop.
- The Kasa cloud token, currently cached in a module variable, is cached in `stored_secrets` too, so cold starts do not log in to TP-Link on every press.
- Nanit tokens stay as files on the worker, since only the worker uses them. `yarn nanit:login` is unchanged.
- Device credentials go into Vercel's encrypted environment variables. `constants/environment.ts` makes each one required only for the role that uses it (Nanit credentials for `worker`, Tapo ones for `cloud`), so neither side needs the other's secrets.

### 6. Login rate limit

`auth/login-rate-limit.ts` keeps its interface and moves its map into a `login_failures (client TEXT PRIMARY KEY, failure_count INTEGER, first_failed_at TEXT)` table, `first_failed_at` in UTC, which keeps the old rule of five failures in fifteen minutes from the first. A success with no failures on record costs one read and no write, because every media segment is a login check. The client address comes from `x-forwarded-for` on Vercel, which `getClient` already falls back to; the worker keeps `cf-connecting-ip`. Both sides throttle against the same table, so guessing against the worker counts against the cloud too.

### 7. Webcam signaling on Turso

The current hub is an in-memory object reached over one event stream per phone. On Vercel, the camera's stream and a watcher's stream may land on different instances, so the hub moves into Turso and each stream polls it.

- Tables: `webcam_camera` (a single row: `camera_id`, `started_at`, `heartbeat_at`), `webcam_retired_cameras (camera_id, retired_at)`, and `webcam_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, recipient_id, message, created_at)`. All times UTC.
- `sendWebcamSignalAction` inserts into `webcam_signals`. Claiming the camera is one transaction: retire the previous id, write the new row, and queue `replaced` for the old camera.
- `app/api/webcam/stream/route.ts` keeps its shape for the browser, but its loop now selects new rows for its recipient once a second, sends them, and deletes them. The camera's stream also bumps `heartbeat_at` every 10 seconds; a camera whose heartbeat is older than 30 seconds is treated as gone. The deliberate-stop `bye` keeps working as now, so a stopped camera still does not alarm.
- The stream ends itself just before the function's `maxDuration` (set to 300 seconds), and `EventSource` reconnects on its own. The client already copes with reconnects, because a restart does the same thing today.
- Cost is small: signaling is only busy while phones are pairing (offers and answers carry their candidates, one message each way), and idle polling is a cheap indexed read once a second per phone. The picture itself never touches Vercel, as now.
- Rows older than a day are pruned on each claim.

The alternative is a hosted realtime service (Ably, Pusher, or a Cloudflare Durable Object), which would push instead of poll. It is another vendor and another key for a few messages a night, so I would not, unless the one-second delay turns out to matter.

### 8. Lullabies on Vercel Blob

- Files move to a **private** Vercel Blob store under `lullabies/`, served through the existing `app/api/lullabies/[file]` route so they stay behind the login. Listing, renaming (copy then delete), and deleting use the Blob API, and `compareFileNames` is unchanged.
- **Uploads go straight from the phone to Blob** with a client upload token, because a Vercel function rejects request bodies over 4.5 MB and a few minutes of recording passes that. The token route checks the login hash before issuing.
- A server action then pulls the upload, converts it to mp3 with an ffmpeg binary bundled into that one function (`ffmpeg-static`, added with `yarn add --exact`, about 75 MB of the 250 MB function limit), stores the mp3, and deletes the original. mp3 stays the format because browsers do not all play the same recorded formats: Android records WebM and iOS records MP4, and older iPhones cannot play WebM at all. Converting once means no phone ever meets a recording it cannot play.
- **Recording names become UTC.** `formatTimestamp` switches to the `getUTC*` getters, so the name no longer depends on which machine wrote it. The lullabies page shows a recording's name converted to the phone's local time, so `2026-10-20_02-15-00` is shown as the evening it was recorded. Sorting is unaffected.
- A one-time `scripts/upload-lullabies.ts` copies the current `lullabies/` folder up, renaming any recording still named in local time to UTC on the way, and the folder is kept on the laptop as a backup.

The UTC change does not depend on Vercel and can be made on its own first (phase 0).

### 9. Migrations, backups, and deploys

You asked for migrations that allow zero-downtime deploys and rollbacks, backed up and verified first, and run by the Vercel build. The existing design is most of the way there:

- Migrations stay additive (new tables and nullable columns only), so the previous deployment keeps working against the new schema, and rolling back is Vercel's "promote previous deployment".
- **They move from lazy, at runtime, to the build.** A new `scripts/migrate.ts` (`yarn migrate`) runs from the Vercel build command, `yarn migrate && yarn build`, but only when `VERCEL_ENV` is `production`. The running app never migrates, so neither a cold start on Vercel nor the worker can start one; if the app finds the schema behind its code, it throws a clear error rather than migrating without a backup.
- The backup keeps today's dump, replay into an in-memory database, and table-by-table row-count check, and adds an upload of the dump to the private Blob store under `backups/YYYY-MM-DD_HH-MM-SS_tracking.sql`, named in UTC. A failed check, or a failed upload, fails the build, so the old deployment keeps serving untouched.
- Vercel's build filesystem is thrown away, so `backups/` on Vercel is meaningless; the laptop's gitignored `backups/` keeps its role for anything run by hand there.
- Preview deployments are turned off, so no build but production ever sees the database. The Turso variables are scoped to Production as well, so that stays true if previews are turned back on by mistake.
- `version.json` is stamped from `VERCEL_GIT_COMMIT_REF` and `VERCEL_GIT_COMMIT_SHA` when they exist, and from git otherwise, so the laptop's build keeps working.

After this, a push to `main` deploys the cloud with no manual step. The worker is still deployed by hand on the laptop with `yarn build && pm2 restart baby`, from `main` only, as now. Because the two can briefly run different commits, the worker's routes are treated as a public contract: change them additively, never rename one in place.

### 10. Domains and the tunnel

- Today the tunnel serves the whole app. After: the app domain points at Vercel, and the tunnel moves to a `worker.` subdomain.
- Cloudflare stays the DNS provider. The Vercel record should be DNS-only (grey cloud) rather than proxied, which is what Vercel recommends for its own certificates.
- `NEXT_PUBLIC_WORKER_ORIGIN` on Vercel holds the worker's address, and `CLOUD_ORIGIN` on the worker holds the app's, for CORS.
- The installed PWA keeps its address, so phones do not need reinstalling. Its saved login hash lives in local storage per origin, so that carries over too.

### 11. What it costs

Expected to be free, on Vercel's Hobby plan and Turso's free tier.

- **Vercel Hobby** is meant for personal, non-commercial use, which this is. Functions get up to 300 seconds with Fluid compute, and waiting on the network is cheap because only active CPU is counted. Hobby has no overage billing: past an allowance, things stop rather than charge.
- **Vercel Blob on Hobby** includes, per month, 1 GB of storage, 10,000 simple operations (reads that miss the cache), 2,000 advanced operations (uploads, copies, and listings), and 10 GB of data transfer. Lullabies are a few megabytes each, so storage is not close. The number to watch is advanced operations: every recording is an upload, a conversion upload, and a delete; every rename is a copy; and every visit to the lullabies page is a listing. A few hundred a month is likely. If it ever gets tight, the listing can be cached in Turso. Migration backups are small and rare.
- **Turso's free tier** is far above what this uses, even with webcam polling.
- Put the Vercel functions in the region nearest the Turso database (or move the database), since every tracking page and every token read is a round trip to it.
- The tunnel and the laptop are unchanged in cost.

## Phases

Each phase ships alone, leaves the laptop deployment working, and has a check before the next starts.

0. **Save timestamps in UTC.** `formatTimestamp` in UTC for lullaby names and backup files, the lullabies page converts recording names to local time for display, and a one-off rename of existing recordings on the laptop. Needs nothing else from this plan.
   Check: record a lullaby, and confirm its file name is UTC and its displayed name is local; a migration backup's name is UTC.
1. **Make the code role-aware, still all on the laptop.** Add `APP_ROLE` (default `worker`, so today's deployment is unchanged), the role-specific environment validation, `stored_secrets`, `device_state`, and `login_failures` as additive migrations, and move the rate limit and the Kasa token cache to Turso. Leave the Tapo refresh token where it is for now.
   Check: `yarn typecheck`, `yarn lint`, the laptop deploy runs as before, `/version.json` reports `main`.
2. **Add the worker API.** The `/api/worker/*` routes, CORS, `health`, and the `device_state` writes. The current pages keep using server actions, so nothing visible changes.
   Check: `curl` the health route through the tunnel; a read-only GET returns the night light state. No POSTs against the real camera without asking first.
3. **Move webcam signaling and lullabies off the filesystem and memory.** Turso signaling, Blob lullabies, and the upload script. These still run on the laptop at this stage, which proves them before Vercel is involved. (The Blob store has to exist for this, so it is the first approval needed.)
   Check: pair two phones in webcam mode on a dev server; record, rename, play, and delete a lullaby.
4. **Move the Tapo refresh token into Turso,** with the compare-and-swap and history, after a backup of the file.
   Check: a read of the S505 `Family Room wall switch` (dev only) through the new store, then a forced refresh that the stored value survives. A write only if you ask for one.
5. **Point the pages at the worker.** `use-worker-status`, `worker-client`, and the offline renderings, including the Monitor tab's "switch to Webcam" offer.
   Check: on a dev server, stop the worker and confirm every Nanit control dims with a last-known reading and nothing errors; restart it and confirm they come back without a reload.
6. **Stand up Vercel** — only after you approve each step in "Changes outside the repository" below. Production-only Turso variables, previews off, `yarn migrate && yarn build`, `APP_ROLE=cloud`.
   Check: the deployment's `/version.json`; log in, add and delete a test diaper, toggle nothing.
7. **Move the domain.** The app domain to Vercel, the tunnel to `worker.`.
   Check: the installed PWA on both phones opens, logs in, and shows the laptop online; then with the laptop asleep, everything in the "Laptop off" column behaves as described.
8. **Tidy up.** Remove the Snoo (`services/snoo/`, `app/actions/snoo.ts`, `components/snoo-toggle.tsx`, `components/swaddle-icon.tsx` if nothing else uses it, `scripts/snoo-check.ts`, the `mqtt` dependency, and its environment variables), update `AGENTS.md`, `CLAUDE.private.md`, and `README.md` for the new deployment, and remove the code paths the move made dead (`secrets/nanit-night-light.json` reads, the in-memory hub, the filesystem lullabies). The Snoo removal does not depend on the rest and can be done whenever you like.

## Changes outside the repository, each needing your approval first

None of these will be done without a specific prompt to you first, per your standing instruction:

- Vercel: create a project linked to the GitHub repository, set the build command, turn off preview deployments, set the environment variables (listing each by name, scoped to Production), create a private Blob store, and set the function region.
- Turso: create a database token for Vercel, separate from the laptop's, so either can be revoked alone.
- Cloudflare: change the app domain's record to Vercel, and add the `worker.` route to the existing tunnel.
- GitHub: nothing beyond Vercel's app installation.

## Risks

- **The Tapo refresh token.** The one secret whose loss cannot be fixed. Mitigated by the backup, compare-and-swap, history, and moving it in its own phase.
- **A second Nanit socket.** A dev server, a second worker, or a fallback path each count against the camera's limit. Mitigated by keeping Vercel away from the Nanit entirely.
- **Cross-origin on iOS.** Safari is stricter about cross-origin media and event streams in an installed PWA. Native HLS with a query-parameter credential and plain CORS should be fine, but this is the first thing to test on a real iPhone in phase 5.
- **Version skew between the cloud and the worker.** Handled by treating worker routes as an additive contract, and by the version footer showing both commits.
- **Webcam signaling latency.** Pairing may take a second or two longer than now. Acceptable; it happens once a night.

## Open question

1. **Should Vercel ever reach the Nanit itself when the laptop is off?** It would make the night light (and only the night light) switchable with the laptop off. On each press, Vercel would sign in to Nanit, open a websocket to the camera, send the one command, and close it — the "socket per press" that `AGENTS.md` describes and forbids. The costs: each press takes a few seconds; the on/off state is unknown, because nothing is listening for the camera's announcements, so the page could only show what was last asked for; each press opens a socket the camera counts against its connection limit for minutes after, so a few quick presses can lock streaming out when the laptop comes back; and the Nanit tokens would have to move into Turso, shared between Vercel and the worker. The fade, temperature, audio, and video would stay unavailable either way. My recommendation is no.
