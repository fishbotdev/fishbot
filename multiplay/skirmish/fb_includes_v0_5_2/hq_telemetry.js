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

/**
 * This file implements FishBot's *telemetry* output.
 *
 * The purpose of telemetry is to answer "how well did FishBot play?", as opposed to the existing
 * automated tests which only answer "did FishBot survive?". Telemetry lines are emitted during
 * autogames and are harvested by `tests/run_telemetry_parser.py`.
 *
 * Telemetry is emitted from the *decision* sites (i.e. from within `hq_command.js`), using the
 * local variables which the decision actually used. This is deliberate: it means telemetry reports
 * what FishBot believed and decided, not a separate re-derivation of the world state.
 *
 * --- WIRE FORMAT ---
 *
 * Each event is a single line:
 *
 *      TEL|<schemaVersion>|<eventName>|<compact json payload>
 *
 * e.g.
 *      TEL|1|OIL|{"t":300000,"p":1,"tot":12,"dpp":6,"alive":[1,2],"der":[5,3],"dom":false}
 *
 * The payload always carries `t` (gameTime, ms) and `p` (player ID), so a consumer never has to
 * infer them from surrounding lines. `eventName` is the consumer's dispatch key.
 *
 * --- DESIGN INVARIANTS ---
 *
 * These exist so that richer telemetry (map control, group locations, and eventually full world
 * state snapshots which can be replayed against a future version of the bot) can be added without
 * reworking anything:
 *
 * 1. Payloads are plain JSON-serialisable objects, never pre-formatted strings. A future full-state
 *    projection is then the same code path, just a bigger object.
 * 2. `#emit()` is the single transport chokepoint. Today the transport is the game console, which is
 *    scraped by `tests/_run_and_save_autogames.py`. That console has a limited scrollback, so a full
 *    state snapshot will NOT fit through it - when that day comes, `#emit()` (and the Python reader)
 *    change, and nothing else does.
 * 3. Every event uses the envelope above, so a new event type needs no format or parser change.
 * 4. The payload keys `in` and `out` are RESERVED for capturing decisions: `in` for the state
 *    projection which fed a decision, `out` for the decision which was taken. Unused for now, but
 *    reserving them means recording (state -> decision) pairs needs no schema bump.
 * 5. Emit sites live next to the code they describe. Adding an event = one method here, plus one
 *    call at the point where the relevant local variables exist.
 *
 * --- KEEPING LINES SHORT ---
 *
 * The console scraper reads back a fixed number of console *rows*, and a line longer than the
 * console width wraps onto a second row (which would split the JSON). Payload keys are therefore
 * abbreviated, and `debug()` is called directly rather than via `deb()` so that the
 * "F1:  05:00:  " prefix does not eat into the available width.
 */

const TEL_SCHEMA_VERSION = 1;

class Telemetry {

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
	 *
	 * Raw derrick counts are emitted (rather than the oil *share* ratios which `hq_command.js`
	 * computes) so that the consumer can derive share, fair-share and unclaimed-oil metrics without
	 * anything having to be back-calculated.
	 *
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
	 * Marks the end of the game, so that the consumer has a definite end time to weight the final
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
