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
	MapDataDumper: a throwaway "AI" whose only job is to print a map's static data and end the game.

	It is deliberately a SEPARATE MOD rather than a flag inside FishBot. Map data is only ever needed
	offline, by the analysis scripts, so FishBot itself carries no dumping code and no conditionals
	for it. `generate_map_data.py` installs this mod, runs one headless game per map, reads the lines
	below back out of the Windows console, and uninstalls it again.

	Everything here is read once, at `eventStartLevel`, from the engine's own globals -- so the output
	is ground truth for both pre-baked (JSONV2) maps and script-generated maps, which have no terrain
	on disk to parse offline.
*/

const DUMP_PREFIX = "MAPDUMP";

/*
	Maximum characters of payload per line.

	Output is written with `debug()` and recovered from the console, and a line that runs past the
	limit is silently cut off mid-value. This was measured on real maps: lines up to about 600
	characters came back intact, while longer ones were truncated at roughly 690 -- which corrupted
	the wide maps (8c-ziggurat, 9c-WindFury) and the derrick-heavy ones (7c-Thales, 8c-cockate).

	So nothing is emitted as one long line. Values are packed up to this budget and then flushed,
	which keeps the output independent of map width and derrick count. 400 leaves generous headroom
	under the shortest length observed to work.
*/
const MAX_PAYLOAD_CHARS = 400;

// End the game as soon as the dump is written. Without this the runner waits out a real match for
// data that was already complete a fraction of a second in.
const END_GAME_AFTER_DUMP = true;

function dumpLine(parts) {
	debug(`${DUMP_PREFIX}|${parts.join("|")}`);
}

/**
 * Emits `values` as comma-separated chunks, each within the payload budget.
 * Every line carries its own chunk index so the reader can reassemble them in order.
 * @param {(string|number)[]} headerParts line parts preceding the chunk index
 * @param {(string|number)[]} values
 * @returns {void}
 */
function dumpChunkedValues(headerParts, values) {
	let chunkIndex = 0;
	let chunk = [];
	let chunkLength = 0;

	const flush = () => {
		dumpLine(headerParts.concat([chunkIndex, chunk.join(",")]));
		chunkIndex++;
		chunk = [];
		chunkLength = 0;
	};

	for (let i = 0; i < values.length; i++) {
		const text = String(values[i]);

		// +1 for the comma that will join this value to the previous one.
		if (chunk.length > 0 && chunkLength + text.length + 1 > MAX_PAYLOAD_CHARS) {
			flush();
		}

		chunkLength += text.length + (chunk.length > 0 ? 1 : 0);
		chunk.push(text);
	}

	// Always flush, even when empty: the reader must see an empty row as empty rather than missing.
	flush();
}

/**
 * Emits one [y][x]-indexed grid, one row at a time.
 * @param {string} name grid name, used as the key in the generated JSON
 * @param {function(number, number): number} readValue called as readValue(x, y)
 * @returns {void}
 */
function dumpGrid(name, readValue) {
	for (let y = 0; y < mapHeight; y++) {
		const row = [];
		for (let x = 0; x < mapWidth; x++) {
			row.push(readValue(x, y));
		}
		dumpChunkedValues(["grid", name, y], row);
	}
}

/**
 * Emits a list of positions as a flat x,y,x,y sequence.
 *
 * Flat numbers rather than JSON, because these lists chunk cleanly whereas a JSON array cut in half
 * by a line limit is unparseable -- which is exactly how the derrick-heavy maps used to fail.
 * @param {string} name
 * @param {Object[]} positions objects with x and y
 * @returns {void}
 */
function dumpPositions(name, positions) {
	const flat = [];
	for (let i = 0; i < positions.length; i++) {
		flat.push(positions[i].x);
		flat.push(positions[i].y);
	}
	dumpChunkedValues(["list", name], flat);
}

function eventStartLevel() {
	dumpLine(["begin", mapName]);

	dumpLine(["meta", JSON.stringify({
		"mapName": mapName,
		"mapWidth": mapWidth,
		"mapHeight": mapHeight,
		"maxPlayers": maxPlayers,
		"tilesetType": tilesetType,
		"scavengers": scavengers,
	})]);

	// `startPositions` is indexed by playerID. Slots a map does not use, and the human slot that
	// challenge files force-add, still appear here; the reader keeps them as-is and the analysis
	// decides what is real, so nothing is silently discarded at capture time.
	dumpPositions("startPositions", startPositions);
	dumpPositions("derricks", derrickPositions);

	// The engine indexes MapTiles as [y][x].
	//
	// Only terrainType is dumped by default. Everything here has to survive a trip through the
	// Windows console buffer, which holds a bounded number of fixed-width rows, so each extra grid
	// is another mapHeight lines competing for that space. The others below are one line away when
	// something actually needs them:
	//   height           -- the heightmap
	//   limitedContinent -- the engine's own connected-land id for ground propulsion, i.e. the
	//                       authoritative answer to "can a tank drive from here to there"
	//   hoverContinent   -- the same, for hover propulsion
	dumpGrid("terrainType", (x, y) => MapTiles[y][x].terrainType);

	dumpLine(["end", mapName]);

	if (END_GAME_AFTER_DUMP) {
		gameOverMessage(true);
	}
}
