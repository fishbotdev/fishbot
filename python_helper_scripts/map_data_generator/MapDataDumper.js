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
	below out of the debug log, and uninstalls it again.

	Everything here is read once, at `eventStartLevel`, from the engine's own globals -- so the output
	is ground truth for both pre-baked (JSONV2) maps and script-generated maps, which have no terrain
	on disk to parse offline.
*/

const DUMP_PREFIX = "MAPDUMP";

// Grid rows are emitted in chunks of at most this many values. 256 is the engine's maximum map
// dimension, so in practice every row fits in one line.
//
// The chunking exists because the runner recovers these lines from the Windows console buffer, which
// stores a fixed number of columns per row: a line longer than the buffer is width-wrapped and would
// come back split into pieces. The runner widens the console buffer to fit a whole row before it
// launches the game, and the reader checks every reassembled row against mapWidth, so a line lost to
// wrapping is a loud failure rather than silently corrupt data.
const VALUES_PER_CHUNK = 256;

// End the game as soon as the dump is written. Without this the runner waits out a real match for
// data that was already complete a fraction of a second in.
const END_GAME_AFTER_DUMP = true;

/*
	`debug()` writes to the command line, which the runner then reads back out of the Windows console
	buffer. That is the same channel `fishbot/tests` uses to recover autogame results, and it is the
	one that actually holds up: the debug file written by `--debugfile` does not reliably receive
	script output.
*/
function dumpLine(parts) {
	debug(`${DUMP_PREFIX}|${parts.join("|")}`);
}

/**
 * Emits one [y][x]-indexed grid, one line per row per chunk.
 * @param {string} name grid name, used as the key in the generated JSON
 * @param {function(number, number): number} readValue called as readValue(x, y)
 * @returns {void}
 */
function dumpGrid(name, readValue) {
	for (let y = 0; y < mapHeight; y++) {
		let chunkIndex = 0;

		for (let xStart = 0; xStart < mapWidth; xStart += VALUES_PER_CHUNK) {
			const xEnd = Math.min(xStart + VALUES_PER_CHUNK, mapWidth);

			const values = [];
			for (let x = xStart; x < xEnd; x++) {
				values.push(readValue(x, y));
			}

			dumpLine(["grid", name, y, chunkIndex, values.join(",")]);
			chunkIndex++;
		}
	}
}

function dumpPointsOfInterest() {
	// `startPositions` is indexed by playerID. Slots that a map does not use, and the human slot
	// that challenge files force-add, still appear here; the reader keeps them as-is and the
	// analysis decides what is real, so nothing is silently discarded at capture time.
	const starts = [];
	for (let i = 0; i < startPositions.length; i++) {
		starts.push([startPositions[i].x, startPositions[i].y]);
	}
	dumpLine(["startPositions", JSON.stringify(starts)]);

	const derricks = [];
	for (let i = 0; i < derrickPositions.length; i++) {
		derricks.push([derrickPositions[i].x, derrickPositions[i].y]);
	}
	dumpLine(["derricks", JSON.stringify(derricks)]);
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

	dumpPointsOfInterest();

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
