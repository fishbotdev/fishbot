/*
	This file is part of FishBot, a Warzone 2100 AI.

	FishBot is free software; you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation; either version 2 of the License, or
	(at your option) any later version.

	FishBot is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License along with this program.
	If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * This file implements FishBot's *telemetry* output.
 *
 * Telemetry answers "how well did FishBot play?", as opposed to the automated tests, which only
 * answer "did FishBot survive?". It is emitted during autogames and harvested by
 * `tests/run_telemetry_parser.py`.
 *
 * Events are emitted from the *decision* sites, using the local variables the decision actually
 * used, so telemetry reports what FishBot believed and decided rather than a re-derivation of it.
 *
 * --- WIRE FORMAT ---
 *
 * One event per line:
 *
 *      TEL|<schemaVersion>|<eventName>|<compact json payload>
 * e.g.
 *      TEL|1|OIL|{"t":300000,"p":1,"tot":12,"dpp":6,"alive":[1,2],"der":[5,3],"dom":false}
 *
 * The payload always carries `t` (gameTime, ms) and `p` (player ID), so a consumer never has to
 * infer them from surrounding lines. `eventName` is the consumer's dispatch key.
 * `tests/_telemetry.py` is the only consumer; keep the two in step.
 *
 * `p` is always FishBot itself: it says who emitted the line, not who the line is about. An event
 * describing another player carries that player in `o` (as `BRIG` does when opponent instrumentation
 * is on), so `o === p` reads as "this is FishBot's own".
 *
 * Events: `OIL` periodic oil position | `OILCMT` trucks committed to a derrick |
 * `OILRES` how that commitment ended | `OILLOST` a derrick destroyed |
 * `BRIG` periodic force strength and position, per player | `END` game finished.
 *
 * A `BRIG` line for FishBot itself also carries `as`/`ai`/`an`: its whole army, counted the way an
 * opponent's is. The per-brigade arrays cover the commanded brigades only, so the gap between `as`
 * and the sum of `s` is the force FishBot owns but has not committed to a brigade. Indirect-fire
 * units are counted separately (`ai`, and `i` for an opponent) rather than added to strength, so
 * that a mortar army is visible instead of reading as no army at all.
 *
 * --- DESIGN INVARIANTS ---
 *
 * These exist so richer telemetry (map control, group locations, eventually full world state
 * snapshots replayable against a future version of the bot) can be added without rework:
 *
 * 1. Payloads are plain JSON-serialisable objects, never pre-formatted strings. A full-state
 *    projection is then the same code path, just a bigger object.
 * 2. `#emit()` is the single transport chokepoint. The transport today is the game console, scraped
 *    by `tests/_run_and_save_autogames.py`. That console has limited scrollback, so a full state
 *    snapshot will NOT fit through it - when that day comes, `#emit()` and the Python reader change,
 *    and nothing else does.
 * 3. Every event uses the envelope above, so a new event type needs no format or parser change.
 * 4. An event may pair the state that fed a decision with the decision itself. `OILCMT`/`OILRES` do
 *    this across two events correlated by `c`, which keeps each line short. A future snapshot too
 *    large for one line should split the same way rather than widening a line.
 * 5. Emit sites live next to the code they describe: a new event is one method here, plus one call
 *    where the relevant local variables exist.
 *
 * Lines are kept short because the scraper reads back a fixed number of console *rows*, and a line
 * longer than the console width wraps onto a second row (splitting the JSON). Hence the abbreviated
 * payload keys, and `debug()` rather than `deb()`, whose "F1:  05:00:  " prefix would eat width.
 */

const TEL_SCHEMA_VERSION = 1;

/**
 * Whether `BRIG` also samples the opponents' forces, so a game can be read as a contest rather than
 * as FishBot alone. Set to `false` to sample FishBot only: the opponent lines then cost nothing at
 * all, not even the unit enumeration behind them.
 *
 * This reads the opponents' units directly. That is only sound because telemetry is an observer -
 * nothing here feeds a decision, and the bot's own intelligence still comes from `hq_toc.js`. Do not
 * route any of this into the bot's own reasoning: it would be cheating, and it would invalidate
 * every test result measured against it.
 */
const TEL_INSTRUMENT_OPPONENTS = true;

/**
 * `b` entry used when the subject has no brigade structure to report - i.e. an opponent, whose army
 * is emitted as a single force. Negative so it can never collide with a real brigade ID.
 */
const TEL_WHOLE_ARMY = -1;

/** Why an oil-capture commitment failed. Emitted as `why` on an `OILRES` event. */
const TEL_FAILURE_REASON = {
	TRUCKS_LOST: "trucks",		// every assigned truck died; also costs the production time to replace them
	ENEMY_BUILT: "enemy",		// an enemy claimed the derrick first
	TOO_DANGEROUS: "danger",	// called off because the target became threatened
	UNEXPECTED: "err",			// more than one structure found on the site
};
Object.freeze(TEL_FAILURE_REASON);

class Telemetry {

	constructor() {
		// Correlates a commitment with its later resolution. Short, so the emitted line cannot wrap.
		this.nextCommitmentID = 0;
	}

	/**
	 * The single point at which telemetry leaves the bot. See design invariant 2 above.
	 * @param {string} eventName Dispatch key for the consumer, e.g. `"OIL"`.
	 * @param {Object} payload Plain JSON-serialisable object. Must include `t` and `p`.
	 * @returns {void}
	 */
	#emit(eventName, payload) {
		if (!TELEMETRY_ON) {
			return;
		}
		debug(`TEL|${TEL_SCHEMA_VERSION}|${eventName}|${JSON.stringify(payload)}`);
	}

	/**
	 * Records FishBot's oil position, as seen by the strategic layer.
	 * Raw derrick counts are emitted (rather than the share ratios `hq_command.js` computes) so the
	 * consumer can derive share, fair-share and unclaimed-oil without back-calculating anything.
	 * @param {Object} p
	 * @param {number} p.totalDerricks Total number of derrick positions on the map.
	 * @param {number} p.derricksPerPlayer Derricks each living player would hold at an even split.
	 * @param {number[]} p.livingPlayers Player IDs still alive.
	 * @param {number[]} p.derricksByLivingPlayer Derricks held per entry of `livingPlayers`.
	 * @param {boolean} p.oilDominance Whether FishBot currently considers itself oil-dominant.
	 * @returns {void}
	 */
	oilSample({totalDerricks, derricksPerPlayer, livingPlayers, derricksByLivingPlayer, oilDominance}) {
		this.#emit('OIL', {
			't': gameTime,
			'p': me,
			'tot': totalDerricks,
			'dpp': derricksPerPlayer,
			'alive': livingPlayers,
			'der': derricksByLivingPlayer,
			'dom': oilDominance,
		});
	}

	/**
	 * Records where FishBot's brigades are and how strong they are, as the strategic layer sees them.
	 * Every brigade goes in one event as parallel arrays (as `OIL` does for players) so that a sample
	 * costs one console row rather than one per brigade. Should a brigade ever carry enough fields to
	 * threaten the line width, split per brigade rather than widening this line (design invariant 4).
	 * Nothing is computed here: `strength` and `location` are read from `state.brigades`, which is
	 * refreshed far faster than this samples (in `hq_toc.js` 30/min and `hq_g3_ground_ops.js` 20/min
	 * respectively), and the unit count comes from the brigade's group.
	 * @param {worldState} state
	 * @param {number[]} brigadeIDs The brigades actually commanded, i.e. `hq.BRIGADE_DESIGNATIONS`.
	 * @returns {void}
	 */
	brigadeSample(state, brigadeIDs) {
		if (!TELEMETRY_ON) {
			return;		// this function does real work (a group lookup per brigade), so check first
		}

		const ownUnits = enumDroid(me);

		this.#emit('BRIG', {
			't': gameTime,
			'p': me,
			'o': me,		// this sample is FishBot's own; an opponent's carries their player ID
			'b': brigadeIDs,
			// `s` is smoothed and counts direct-fire units only, so `n` (every unit in the brigade)
			// is emitted alongside it to tell "understrength" apart from "decaying after a fight".
			's': brigadeIDs.map(id => Math.round(state.brigades[id].strength)),
			'n': brigadeIDs.map(id => state.g.enumGroup(id).length),
			'x': brigadeIDs.map(id => Math.round(state.brigades[id].location.x)),
			'y': brigadeIDs.map(id => Math.round(state.brigades[id].location.y)),
			// FishBot's whole army, counted the way an opponent's is, so the two are comparable. The
			// brigade arrays above cover only the commanded brigades, so anything sitting in the
			// reserve or not yet grouped is missing from them - the gap between `as` and the sum of
			// `s` is exactly the force FishBot owns but has not committed.
			'as': this.#directFireCount(ownUnits),
			'ai': this.#indirectCount(ownUnits),
			'an': ownUnits.length,
		});

		if (!TEL_INSTRUMENT_OPPONENTS) {
			return;
		}

		state.enumLivingPlayers().forEach(playerID => {
			if (isEnemy(playerID)) {
				this.#opponentSample(playerID);
			}
		});
	}

	/**
	 * Emits one opponent's army as a `BRIG` sample, so it can be read against FishBot's own on the
	 * same timeline. The opponent has no brigade structure to report, so its whole army is emitted as
	 * a single force under `TEL_WHOLE_ARMY`.
	 *
	 * `s` counts direct-fire units, matching what brigade `strength` counts - but unsmoothed, because
	 * smoothing exists to stop FishBot's *own* estimator flapping, and an observer wants the reading
	 * as it is. Consumers comparing the two should expect the opponent's to be the twitchier series.
	 * @param {number} playerID
	 * @returns {void}
	 */
	#opponentSample(playerID) {
		const units = enumDroid(playerID);
		const directFireUnits = units.filter(droid => this.#isDirectFireCombatUnit(droid));
		const center = this.#armyCenter(directFireUnits);

		this.#emit('BRIG', {
			't': gameTime,
			'p': me,
			'o': playerID,
			'b': [TEL_WHOLE_ARMY],
			's': [directFireUnits.length],
			'i': [this.#indirectCount(units)],
			'n': [units.length],
			'x': [center.x],
			'y': [center.y],
		});
	}

	/**
	 * Whether a droid counts towards direct-fire strength.
	 *
	 * `weapons` is empty on trucks, sensors and repair units, so testing it excludes them without
	 * having to enumerate droid types - which matters because an army's truck count says nothing
	 * about how hard it hits, and counting it would flatter whichever side built more of them.
	 * @param {DroidObject} droid
	 * @returns {boolean}
	 */
	#isDirectFireCombatUnit(droid) {
		return droid.weapons.length > 0 && !droid.hasIndirect;
	}

	/**
	 * How many of `units` count towards direct-fire strength.
	 * @param {DroidObject[]} units
	 * @returns {number}
	 */
	#directFireCount(units) {
		return units.filter(droid => this.#isDirectFireCombatUnit(droid)).length;
	}

	/**
	 * How many of `units` are armed indirect-fire (mortars, artillery).
	 *
	 * Reported separately rather than folded into strength, because an indirect army fights nothing
	 * like a direct-fire one of the same size. Without it, an opponent that builds mortars reads as
	 * having almost no army at all, and the strength ratio flatters whoever is losing to it.
	 * @param {DroidObject[]} units
	 * @returns {number}
	 */
	#indirectCount(units) {
		return units.filter(droid => droid.weapons.length > 0 && droid.hasIndirect).length;
	}

	/**
	 * Approximates where an army is, mirroring `getForceCenterLoc()` in `hq_g3_ground_ops.js` so that
	 * an opponent's position is measured the same way FishBot measures its own: a per-axis median
	 * (outlier-resistant, so stragglers do not drag the estimate backwards), snapped to the nearest
	 * real unit because a per-axis median is not a true 2D median and can land on an empty tile.
	 * @param {DroidObject[]} units Direct-fire units. May be empty.
	 * @returns {{x: number, y: number}} `{x: 0, y: 0}` if there are no units; `n` is then 0 too, so
	 *                                   the consumer discards the position rather than plotting it.
	 */
	#armyCenter(units) {
		if (units.length === 0) {
			return {'x': 0, 'y': 0};
		}

		const estimate = {
			'x': arrayMedian(units.map(droid => droid.x)),
			'y': arrayMedian(units.map(droid => droid.y)),
		};

		let nearestUnit = units[0];
		let nearestDistSq = Infinity;

		units.forEach(droid => {
			const currDistSq = distSq(droid.x, estimate.x, droid.y, estimate.y);
			if (currDistSq < nearestDistSq) {
				nearestDistSq = currDistSq;
				nearestUnit = droid;
			}
		});

		return {'x': nearestUnit.x, 'y': nearestUnit.y};
	}

	/**
	 * Records FishBot committing trucks to capture a derrick (or a sector of derricks).
	 * This is the "intent" half of the intent -> outcome pair. Without it, a derrick that stays
	 * unclaimed is ambiguous: trucks may have been sent and failed, or nothing may have been sent
	 * at all. Those are opposite problems with opposite fixes.
	 * @param {Object} p
	 * @param {string|number} p.sectorID Derrick ID, or grid-cell ID for a whole-sector task.
	 * @param {boolean} p.isSector Whether this commits to a sector rather than a single derrick.
	 * @param {number} p.x Target tile x.
	 * @param {number} p.y Target tile y.
	 * @param {number} p.distanceFromBase Tiles from FishBot's base, to spot unrealistic targets.
	 * @param {number} p.truckCount Trucks assigned.
	 * @returns {number} Correlation ID to store on the mission, for the matching `#oilResolution()`.
	 */
	#oilCommitment({sectorID, isSector, x, y, distanceFromBase, truckCount}) {
		const commitmentID = this.nextCommitmentID++;

		this.#emit('OILCMT', {
			't': gameTime,
			'p': me,
			'c': commitmentID,
			'sec': sectorID,
			'typ': isSector ? 'S' : 'D',
			'x': x,
			'y': y,
			'd': distanceFromBase,
			'n': truckCount,
		});

		return commitmentID;
	}

	/**
	 * Records how an oil-capture commitment ended. Pairs with `#oilCommitment()` on `c`.
	 * The reason matters because the failures have very different costs: losing the trucks also
	 * costs the production time to replace them, while being beaten to the derrick costs only the walk.
	 * @param {number} commitmentID The value returned by `#oilCommitment()`.
	 * @param {string} outcome `"ok"` built, `"fail"` failed, `"abort"` called off.
	 * @param {string} [reason] Why it failed. See `TEL_FAILURE_REASON`.
	 * @returns {void}
	 */
	#oilResolution(commitmentID, outcome, reason) {
		this.#emit('OILRES', {
			't': gameTime,
			'p': me,
			'c': commitmentID,
			'out': outcome,
			'why': defined(reason) ? reason : '',
		});
	}

	/**
	 * Records an oil derrick being destroyed, so losses can be located rather than merely counted.
	 * Called for every destroyed object; anything which is not a derrick is ignored here, which
	 * keeps the check out of `_events.js`.
	 * @param {Object} object The destroyed game object.
	 * @returns {void}
	 */
	reportObjectDestroyed(object) {
		if (object.type !== STRUCTURE || object.stattype !== RESOURCE_EXTRACTOR) {
			return;
		}

		this.#emit('OILLOST', {
			't': gameTime,
			'p': me,
			'o': object.player,			// whose derrick it was; `o === p` means FishBot lost one
			'x': object.x,
			'y': object.y,
		});
	}

	/**
	 * Reports an approved oil-capture task as a commitment, and tags the mission so its outcome can
	 * be matched back to it. Non-oil tasks are ignored.
	 * Lives here rather than in `hq_toc.js` so the scheduling code stays free of telemetry plumbing.
	 * @param {worldState} state
	 * @param {Object} task The approved build request.
	 * @param {Object} missionData The mission created from it.
	 * @returns {void}
	 */
	reportOilCaptureCommitment(state, task, missionData) {
		if (!TELEMETRY_ON) {
			return;		// this function does real work (group lookup, distance), so check before doing it
		}

		const isSector = (task.missionType === MISSION_TYPE.CONSTRUCT_ALL_DERRICKS_IN_SECTOR);

		if (task.missionType !== MISSION_TYPE.CONSTRUCT_OIL_DERRICK && !isSector) {
			return;
		}

		// A sector task carries the grid cell; take its first derrick as the representative target.
		const target = isSector ? task.payload.derricks[0] : task.payload;

		if (!defined(target)) {
			return;
		}

		missionData.telemetryCommitmentID = this.#oilCommitment({
			sectorID: missionData.sectorID,
			isSector: isSector,
			x: target.x,
			y: target.y,
			distanceFromBase: Math.round(Math.sqrt(distSq(target.x, baseLocation.x, target.y, baseLocation.y))),
			truckCount: state.g.enumGroup(missionData.taskForceID).length,
		});
	}

	/**
	 * Reports the outcome of a mission which was recorded as a commitment. Missions which were never
	 * tagged (i.e. everything except oil capture) are ignored.
	 * @param {Object} md Mission data.
	 * @param {string} outcome `"ok"`, `"fail"` or `"abort"`.
	 * @param {string} [reason] Why it failed. See `TEL_FAILURE_REASON`.
	 * @returns {void}
	 */
	reportMissionOutcome(md, outcome, reason) {
		if (!defined(md.telemetryCommitmentID)) {
			return;
		}
		this.#oilResolution(md.telemetryCommitmentID, outcome, reason);
	}

	/**
	 * Marks the end of the game, so the consumer has a definite end time to weight the final
	 * sampling interval against (rather than assuming the last sample ran to the end).
	 * @returns {void}
	 */
	endOfGame() {
		this.#emit('END', {
			't': gameTime,
			'p': me,
		});
	}
}
