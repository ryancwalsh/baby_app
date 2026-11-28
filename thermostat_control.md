# Thermostat control: goals, challenges, and the algorithm

How the worker's loop steers the hallway ecobee from the crib's temperature, and why. `ecobee_plan.md` covers how we reach the thermostat (HomeKit), its history, and the fail-safe rules; this file covers what the loop is trying to do and how. The code is `services/ecobee/crib-switch.ts` (the pure decisions) and `services/ecobee/loop.ts` (reading, writing, and logging).

Every number below that describes a setting (the crib range, the active hours) is an **example**. Those are chosen on the `/thermostat` page and the Settings page and change over time. The constants in the code are starting points, to be tuned from the decision log (`/thermostat/log`, or `scripts/thermostat-log.ts`).

## Goals

1. **Keep the crib inside the range we set, at its lowest and highest points, not just on average.** The range on the `/thermostat` page means what it says: if we want the crib never below 66 °F, we set the low end to 66 °F and not to something higher to make up for the loop.
2. **Run the furnace (or air conditioner) only when the crib needs it.** Being in range is the goal, not being at the middle of it. Heating costs money and, more importantly, makes noise.
3. **Because the baby gets bothered by hearing the airflow turn on or off, keep in mind that we don't want to be turning it on and off frequently.** The sudden changes in noise and airflow disturb his sleep.
4. **A person always wins.** A change made at the thermostat or in the ecobee app pauses the loop until the active hours next end.
5. **Fail safe.** If the laptop, the camera, or the network dies, the ecobee must end up somewhere harmless on its own.

## Challenges

These are what the decision log showed on the nights of 2026-11-26 to 2026-11-28.

- **The thermostat measures the wrong room.** The ecobee is in the hallway. With the hallway held within about 1 °F, the crib swung by about 4 °F, for example from 64.5 to 69 °F. When the furnace runs is decided by the hallway and has nothing to do with the crib.
- **The nursery reacts quickly and strongly to a furnace run.** One run warmed the crib by about 2.5 °F within 10 minutes, and it kept warming for a while after the furnace stopped. Between runs it cooled steadily for an hour or more.
- **The hallway–crib difference is not a constant.** It moved between about 1.4 and 3 °F within every furnace cycle, so a setpoint computed from it is wrong for most of each cycle. Two designs built on it failed in opposite directions: aiming the heat at the low end of the range plus that difference left the crib below the range for about half of each night, and aiming at the middle heated a crib that was already well inside it.
- **The swing is nearly as wide as the range.** With a 5 °F range and a 4 °F swing per cycle, there is little room, and the edges are what matter, not the average.
- **Every start and stop is heard.** Goal 3 means the number of furnace starts in a night matters, not only the temperature.
- **Lag.** A change to a setpoint shows at the crib only after the next furnace run, so changing it every few minutes acts on stale evidence. That is what made the 2026-11-28 morning overshoot: the loop raised the heat twice before the first raise had reached the crib.
- **Noisy and missing readings.** The Nanit reading sometimes stops for an hour or more, and it jumps when warm air reaches it.
- **The ecobee's own rules.** It has its own on/off margin around a setpoint, it keeps auto mode's heat and cool setpoints at least 5 °F apart, and every write becomes a hold whose length is set by the Hold Action in the ecobee app and is still not verified (holds have lasted 2 hours, and also 4 to 5).
- **The schedule heats on its own.** Whenever the loop lets go, the ecobee's schedule takes over, and its heat setpoint will run the furnace for a crib that does not need it.

## The algorithm: the crib switches the furnace

The loop stops trying to predict a hallway setpoint that puts the crib somewhere. Instead it uses the thermostat as an on/off switch, and the crib's own reading decides when to flip it. The range's full width is used as the gap between switching on and switching off, because the wider that gap, the fewer starts in a night (goal 3).

### Switching

Checked every minute, since the crib reading arrives every 30 seconds and a run moves the crib quickly.

- **Start heating** when the crib falls to `low + margin + the dip after a start`. The crib goes on cooling briefly after the furnace starts, before warm air reaches it, so starting a little early puts the coldest point at about `low + margin`.
- **Stop heating** when the crib rises to `high − margin − the rise after a stop`. The crib goes on warming after the furnace stops, so stopping early puts the warmest point at about `high − margin`.
- **In between, change nothing.** A crib in the middle of the range never starts the furnace. Once a run has started it is allowed to finish, because one long run is one start and one stop, where two short runs are two of each.
- **Cooling is the mirror image** at the high end, for summer. In auto mode, heating and cooling never run at once, and neither starts within a few hours of the other having run (3 hours to begin with). A heating run that overshoots the top of the range is left to drift back down: on a winter night, a warm crib must never start the air conditioner. A toy simulation of the first version did exactly that.
- **Minimum run and rest times.** Once started, a run lasts at least a few minutes; once stopped, the furnace rests for a while before the next start. Only a crib that has actually left the range overrides these.
- **Learning the dip and the rise.** After every start and stop the loop watches how far the crib goes on moving the old way, and keeps a running average of each, within bounds. It starts from guesses and forgets them on a restart. Until it has learned them, the first run or two of a night may overshoot a little.

For example, with a range of 66–71 °F, a margin of 0.5 °F, a dip of 0.4 °F, and a rise of 1.5 °F, heating starts at about 66.9 °F and stops at about 69 °F, so the crib should run between about 66.5 and 70.5 °F, with one start and one stop per cycle. With the same numbers a narrower range, say 66–68 °F, leaves almost no gap, so the loop would start and stop far more often; a range that is narrower than the crib's natural swing trades goal 3 against goal 1.

### What is written to the thermostat

The loop holds the thermostat throughout the active hours, so that the schedule cannot run the furnace on its own. The setpoints are always placed relative to the hallway's own current reading:

- **Heating:** the heat setpoint a little above the hallway (for example 1.5 °F), so the furnace runs.
- **Resting:** the heat setpoint below the hallway, and in auto mode the cool setpoint above it, each by half of auto mode's minimum gap or a little more, so that nothing runs.
- **Cooling:** the cool setpoint a little below the hallway.

Keeping the setpoints close to the hallway's reading is the fail safe: if the laptop dies mid-run, the ecobee stops by itself once the hallway has warmed that little, and if it dies while resting, the hallway may only cool that little before the ecobee heats again. When a hold ends, the schedule takes over.

A small "on" offset also matters if the furnace has more than one stage: a large gap between setpoint and room temperature can bring on a second, louder stage. Whether ours does is not known.

**Keeping the hold where it is.** While nothing should switch, the loop moves the setpoints again (relative to the new hallway reading) when the hallway drifts close to one of them, which would otherwise make the ecobee start or stop on its own, and when the hold is old enough that it might expire. These writes do not change what the furnace is doing, so they make no noise.

### What stays the same

- The hard limits on setpoints (61–79 °F), whatever the arithmetic says.
- A person always wins: setpoints that differ from what the loop last wrote, before the hold could have ended, pause the loop until the active hours end.
- A stale or impossible crib reading makes the loop let go, and the schedule runs.
- Outside the active hours, or switched off on the Settings page, the loop lets go and only logs.
- In auto mode, the two thresholds are written one at a time, in the order `orderForWriting` gives (see `ecobee_plan.md` for why).

### Logging

Every switch, every write, and otherwise one decision every 10 minutes go to `thermostat_decisions`, with the setpoints sent, so a night can be read back on `/thermostat/log`.

## Ideas not built

- **Running the ecobee's fan all the time, or on a minimum per hour**, so that what starts and stops is the burner and not the airflow. Air moving constantly may be a steadier, less noticeable sound than air starting and stopping. The ecobee exposes fan settings over HomeKit, but this changes how the house sounds all night, so it needs a decision first.
- **Learning the cooling rate between runs**, to predict when the next start will come and stretch rest periods when the night is mild.
- **Adjusting the hallway setpoint once per cycle from the crib's lowest point**, and leaving the ecobee to do its own switching. Fewer writes, but it cannot shrink the swing, takes hours to settle, and still starts the furnace on the hallway's timing rather than the crib's.
