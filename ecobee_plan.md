# Plan: keep the crib in a temperature range by steering the ecobee

Status: planned 2026-11-04. Phase 0 mostly done 2026-11-10: route A (HomeKit) chosen, the thermostat paired, and everything it exposes listed below. Still open from phase 0: the ecobee Hold Action setting. Phase 1 partly built the same day: tapping the temperature on the Switches tab opens a dialog with the crib and hallway readings and the range the ecobee is holding. Phase 2 built and deployed the same day: the crib range is set in that dialog, and the worker's loop decides every 10 minutes and logs what it would do, writing nothing. Nothing has written a setpoint yet. Read `AGENTS.md` first; its standing rules (the sleeping baby, pm2, deploy only from `main`, and asking before touching Vercel, Turso, Cloudflare, or GitHub) all apply.

## Goal

The thermostat is an **ecobee3 lite** in the hallway, so it regulates the hallway, not the nursery. The temperature that matters is the Nanit's reading at the crib. The app should let us set a target range for the crib (for example 68–72 °F) and move the ecobee's setpoints so that the crib lands in it, overriding the ecobee schedule only while it is needed.

## Decisions already made

- **No ecobee SmartSensor.** Researched earlier and rejected: it comes in a two-pack for about $100 when only one is wanted, it runs on a battery rather than plugging into the wall, and it leaves us inside ecobee's 30-minute schedule increments. Ecobee accepts only its own sensors, so no cheaper third-party sensor can stand in for one.
- **The Nanit is the crib sensor.** It is already at the crib, already on wall power, and the app already reads it every 30 seconds (`POLL_MILLISECONDS` in `services/nanit/connection.ts`). No new hardware.
- **No ecobee developer API key.** We do not have one, and ecobee stopped issuing them in late 2024. So the official API with our own key is out.
- **We do not use Apple Home.** The household uses the ecobee apps on iOS and Android, so pairing the thermostat to this app over HomeKit takes nothing away from anyone.
- **Setpoint holds, not equipment switching.** Neither route below can turn the furnace or air conditioner on or off directly, and that is a good thing: the thermostat keeps its own protections (minimum compressor off time, staging, and fan logic). The app only chooses setpoints and places holds on them.

## Two ways to reach the thermostat

Both are hidden behind one interface in `services/ecobee/`, so the control loop does not care which is used. Phase 0 decides which one gets built.

### A. HomeKit on the local network (preferred)

The ecobee3 lite supports HomeKit. HomeKit Accessory Protocol (HAP) over IP is local, needs no account and no cloud, and has no key to be revoked. The `hap-controller` package on npm (TypeScript, maintained by the ioBroker project) pairs with an accessory, reads and writes characteristics, and subscribes to change events.

- Pairing needs the thermostat's 8-digit HomeKit setup code, shown on the thermostat's screen (and on a label that came with it). It is done once. It produces a long-term key pair that must be stored like any other secret, in `stored_secrets` through `compareAndSwapStoredSecret`.
- Losing the pairing keys is **recoverable**, unlike the Tapo refresh token: reset HomeKit on the thermostat and pair again.
- Exposed: current temperature, current heating or cooling state, target mode (off, heat, cool, or auto), target temperature, and heating and cooling thresholds for auto mode. Not exposed: the comfort settings, the schedule, or remote sensors.
- A write over HomeKit becomes an ecobee hold, and how long that hold lasts is ecobee's **Hold Action** preference (in the ecobee app). Whether ecobee exposes a way to clear a hold over HomeKit (vendor characteristics, as Home Assistant's `homekit_controller` suggests) must be checked in phase 0. If it does not, the hold length setting becomes the way holds end (see "Fail safe" below).
- **Resolved 2026-11-10.** On 2026-11-04 the laptop saw no HomeKit accessories. The thermostat was then put on the main wifi and removed from Apple Home, and it now advertises as `Upstairs` (`md=ecobee3 lite`, `id=FE:EF:78:75:63:0C`) at `192.168.1.73`, port `40797`, firmware `4.8.70240`. `scripts/ecobee-pair.ts` paired with it. See "Phase 0 findings" below.

### B. The ecobee cloud with the account's own sign-in (fallback)

Since 2026.3, Home Assistant's ecobee integration signs in with the ecobee username and password instead of a developer key. We would copy what it does. After sign-in it is the same JSON API that ecobee documents publicly at `api.ecobee.com/1/thermostat`, which is richer than HomeKit:

- `setHold` with `holdType: "holdHours"` and `holdHours: 1`, so every hold ends by itself within an hour. That is the best fail safe on offer.
- `resumeProgram` to hand control back to the schedule cleanly.
- `equipmentStatus` says which equipment is running, which the log can record.

Risks: the sign-in is unofficial and can break without notice, forum reports say shared keys get throttled, and an ecobee account with two-factor sign-in may block the password route entirely. Like the Tapo session, a refresh token would be kept in `stored_secrets` and refreshed by compare-and-swap. `ECOBEE_USERNAME` and `ECOBEE_PASSWORD` would go in `.env.production.local` and be added to `constants/environment.ts`.

## How the control loop works

It runs **in the worker on the laptop**, next to `services/nanit/connection.ts`, because that is where the crib reading arrives. That matches `plan_cloud.md`, which keeps long-running loops and sockets on the laptop.

The thermostat is good at holding the hallway at a setpoint; it is just measuring the wrong room. So rather than switching heat or cooling on and off ourselves, the loop learns how far the hallway is from the crib and shifts the setpoints by that amount:

1. Every reading, compute `offset = hallway − crib`, and smooth it (an exponential moving average over about 30 minutes) so that a door opening or a burst of sun does not swing it.
2. Every 10 minutes, compute the setpoints that should put the crib in range:
   - Heat setpoint = crib low + offset.
   - Cool setpoint = crib high + offset.
   - In heat mode only the heat setpoint is sent, in cool mode only the cool one, and in auto mode both. In off mode the loop does nothing; it never changes the mode itself.
3. Clamp both to fixed hard limits, 61–79 °F (16–26 °C), whatever the arithmetic says.
4. Send a hold only if a setpoint moved by at least 1 °F since the last one, so the thermostat is not nudged constantly.
5. If the crib is back in range and the schedule's own setpoints would keep it there, release the hold and let the schedule run.

Ecobee's auto mode enforces a minimum gap between the heat and cool setpoints (5 °F by default). A crib range narrower than that is widened around its middle, and the settings page says so.

The Nanit sits on electronics and may read warm. Decided 2026-11-10 not to check it against a separate thermometer; the Nanit is taken as the crib temperature as it reads.

## Fail safe

A thermostat write turns on equipment, noise, and airflow in the house with a sleeping baby in it, and a stuck hold could leave the nursery cold or hot all night. So:

- **A stale crib reading stops the loop.** If the Nanit reading is more than 10 minutes old, or the socket is down, the loop releases its hold (route B) or stops renewing it (route A) and the ecobee schedule takes over.
- **Holds expire on their own.** Route B holds last one hour and are renewed while the loop is healthy. For route A, the ecobee app's Hold Action is set to the shortest timed option (2 hours, if that is still the shortest), so a dead laptop costs at most that long.
- **Readings out of a sane range are ignored** (below 10 °C or above 35 °C), along with any jump of more than 3 °C between two readings 30 seconds apart.
- **A person always wins.** If the thermostat's setpoint is changed by anything other than this loop (at the thermostat or in the ecobee app), the loop pauses for 4 hours and the app shows that it has paused and why, with a button to resume.
- **One switch turns it all off**, on the settings page, and turning it off releases any hold.
- **Every action is logged** (see below), so "why is the hallway at 76" always has an answer.

## Data

All additive, per the migration rules in `AGENTS.md`:

- `settings` gains nullable columns `crib_low_celsius` and `crib_high_celsius` (migration `2026-11-10_thermostat`), and later `thermostat_automation_enabled` for phase 3's switch. Stored in Celsius like the Nanit reading, and shown in Fahrenheit as `components/nanit-temperature.tsx` does today.
- A new table `thermostat_decisions` (built as `thermostat_actions` was planned): when, the outcome, crib reading, hallway reading, smoothed offset, mode, the current heat and cool setpoints, and the proposed ones. The outcome says why (for example `crib below range`, `released: reading stale`, `paused: changed by a person`). Times as UTC ISO strings.
- `device_state` gains a `thermostat` row with the last known hallway reading, setpoints, and pause state, so pages served from Vercel can show them dimmed while the worker is offline. `DeviceStateName` in `storage/device-state.ts` grows to include it.
- The pairing keys (route A) or refresh token (route B) go in `stored_secrets`.

## In the app

- Everything lives in the dialog that tapping the temperature on the Switches tab opens (`components/temperature-dialog.tsx`). Today it shows the crib and hallway readings in large type and the range the ecobee is holding. It will gain the crib range, the on/off switch, what the loop is doing (holding, released, paused, or off), and when it last acted.
- The range and the switch are shared, in the `settings` table, not per phone, because there is one nursery.
- The worker serves the reading at `/api/worker/thermostat`, called through `components/worker-client.ts`; the switch and the resume button will be POSTs to the same route.

## Phase 0 findings (2026-11-10)

- **Paired.** `scripts/ecobee-pair.ts` found the thermostat by browsing `_hap._tcp` (5 seconds of browsing was too short to see it, so it waits for up to 20) and paired with the setup code. The pairing is the `ecobee-homekit-pairing` row of `stored_secrets` in the production database, with a copy at `secrets/ecobee-homekit-pairing.json`. It holds the address and port too, which DHCP may change, so the client should rediscover by device id when the stored address stops answering. Losing it means resetting HomeKit on the thermostat and pairing again, nothing worse.
- **Read works.** `scripts/ecobee-describe.ts` lists every service and characteristic, reading only. Run either script with `NODE_ENV=production yarn tsx --env-file=.env --env-file=.env.production.local scripts/<name>.ts` so it reaches the production database rather than the dev SQLite file.
- **The standard thermostat service has everything the loop needs.** Characteristic ids are `aid.iid`, all on accessory 1:
  - `1.17` current heating or cooling state (0 off, 1 heating, 2 cooling), with events.
  - `1.18` target mode (0 off, 1 heat, 2 cool, 3 auto). It read 3, auto.
  - `1.19` current temperature, °C in 0.1 steps. It read 20.9.
  - `1.20` target temperature, `1.22` cooling threshold (18.3–33.3 °C), and `1.23` heating threshold (7.2–26.1 °C), all writable, all °C in 0.1 steps. In auto mode the thresholds are what matter: they read 22.8 and 18.3.
  - `1.21` display units (1 is Fahrenheit), `1.24` humidity (49%), and `1.75` and `1.76` the fan.
- **Ecobee's own characteristics are there too, including a way to clear a hold.** Named here as Home Assistant's `aiohomekit` names them; the names are not yet checked against the thermostat's behaviour:
  - `1.48` `FA128DE6-…` **clear hold**, a write-only bool. This answers phase 0's main question: the loop can hand control back to the schedule over HomeKit.
  - `1.33` `B7DDB9A3-…` current comfort setting (0 home, 1 sleep, 2 away, 3 something else, probably a hold). It read 3.
  - `1.34`–`1.39` the heat and cool setpoints of the Home, Sleep, and Away comfort settings, readable and writable. They read 18.9/22.8, 18.9/25.0, and 18.9/22.2 °C. The loop must never write these: they change the schedule itself, not a hold.
  - `1.40` `1B300BC2-…` hold a comfort setting (write only), `1.41` a timestamp, `1.49`–`1.53` fan and other settings, and `1.54` the status message.
- **The Nanit and the hallway read almost the same today.** At 21:28 UTC the Nanit read 20.7 °C (`device_state`) and the thermostat 20.9 °C. One reading proves nothing about the offset at night with doors shut, but it is the first data point.
- **`hap-controller` brings `@stoprocent/noble`**, a native Bluetooth module, as a hard dependency even though only IP is used here. It built on the laptop. Check that it does not break the Vercel build before this reaches `main`; if it does, the HomeKit client has to stay out of what Vercel installs.

Next in phase 0, for a person rather than code:

- Set the ecobee app's **Hold Action** to the shortest timed option, so a hold placed by the loop ends by itself if the laptop dies. Then one supervised write (phase 3) checks that a threshold written over HomeKit really becomes a hold of that length.

## First supervised write (2026-11-12) and where things stand

At 10:30 AM EST, with a 2-hour Hold Action set in the ecobee app, `scripts/ecobee-set.ts` raised the auto-mode setpoints from 66–72 °F to 70–75 °F. The crib went from 66.2 °F to 67.8 °F within about 10 minutes, while the hallway went from 68.5 °F to 69.4 °F, so the crib follows hallway heating quickly. The user stopped the test: **the crib must stay close to 67 °F, even during tests**. The hold was cleared at 10:43 AM, which returned the thermostat to its schedule (heat 66 °F).

**No more writes to the thermostat until the user explicitly asks again.** Any later test or control design has to keep the crib near 67 °F rather than overshoot it, for example by small steps toward a target instead of a jump. The dry-run loop goes on reading and logging.

## Phases

0. **Find out what is possible. Read only, nothing written to the thermostat.**
   1. On the thermostat or in the ecobee app, find which wifi network it is on. If it is on the guest network, decide whether moving it to the main network is acceptable (it is not a smart plug, so the reason the plugs stay on guest may not apply), or whether to go with route B.
   2. If it is reachable: browse for `_hap._tcp` again, pair with `hap-controller` from a script, and dump every service and characteristic. Look for a way to clear a hold. Pairing writes nothing to the HVAC.
   3. If it is not reachable: try route B's sign-in and a read-only `GET /1/thermostat`. Check whether the account has two-factor sign-in.
   4. Write the findings here and choose route A or B.
1. **Read only in the app.** Built 2026-11-10: `services/ecobee/thermostat.ts` reads the thermostat over HomeKit (about 2 seconds a read, most of it HomeKit's pair-verify, since no connection is kept), `/api/worker/thermostat` serves it, and `components/temperature-dialog.tsx` is the dialog the Switches tab's temperature opens: the crib and hallway readings in large type, the range the ecobee is holding, and whether it is heating or cooling. It reads every 30 seconds, only while open. Still to do: the last known hallway reading in `device_state`, for when the laptop cannot be reached, and rediscovering the thermostat if DHCP gives it a new address. Still no writes.
2. **The loop in dry-run.** The settings, the migration, and the loop running and logging what it _would_ send, for a few days and nights. Tests in `tests/ecobee/` for the arithmetic, the clamps, the stale-reading release, and the pause on a person's change.

   Built 2026-11-10:
   - `services/ecobee/decide.ts` is the arithmetic, pure and tested in `tests/ecobee/decide.test.ts`: the offset smoothing, the shift, the hard limits, the widening in auto mode, and the 0.5 °C change threshold.
   - `services/ecobee/loop.ts` runs it every 10 minutes (the first a minute after start) and writes each decision to `thermostat_decisions`, with an outcome of `would change`, `would leave`, `thermostat is off`, `no crib range set`, `crib reading is stale`, or `could not read the thermostat: …`. The smoothed offset lives in memory and starts afresh after a restart.
   - `instrumentation.ts` starts the loop once per process, only in a production build with `APP_ROLE=worker`, so neither Vercel nor a dev server runs it. Starting it also opens the shared Nanit connection, read only, so the crib reading arrives without a phone having a page open. Before this, that socket opened only when a page first asked for it.
   - The dialog shows the crib range with − and + buttons in whole °F, saved to Turso on every tap (60–80 °F, low below high), and the latest decision with its time.
   - Still to do in this phase: the pause on a person's change, which needs writes to have something to compare against, so it moves to phase 3; and reading the log after a few nights to see whether the offset holds steady.

3. **Writes, with someone watching.** One supervised write and release, asked for first and done while awake and nearby, then the loop switched on.

## Questions for later

- Should the loop run all day, or only during sleeps logged in the tracking pages?
- Should the app warn (or sound the webcam-style alarm) when the crib leaves the range and the loop cannot bring it back, for example with the furnace off or the mode set to off?

## Sources

- [Home Assistant ecobee integration](https://www.home-assistant.io/integrations/ecobee): sign-in without a developer key since 2026.3.
- [API Evangelist on ecobee](https://providers.apievangelist.com/providers/ecobee/): developer key registration closed.
- [Home Assistant community: migrating ecobee to local HomeKit Controller](https://community.home-assistant.io/t/how-to-migrate-from-ecobee-cloud-integration-to-local-homekit-controller/491319).
- [Home Assistant community: ecobee via the cloud vs. local](https://community.home-assistant.io/t/the-difference-of-an-ecobee-thermostat-integration-via-the-cloud-vs-local/386116?page=2): HomeKit exposes only basic thermostat features.
