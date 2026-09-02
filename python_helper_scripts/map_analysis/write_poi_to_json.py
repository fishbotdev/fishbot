"""
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
"""

# Companion to `write_map_data_to_json.py`, for the map's POINTS OF INTEREST rather than
# its terrain. `region_analysis.py` seeds one region per player start and one per derrick
# cluster, so it needs these two lists to produce the real region map; without them it
# falls back to seeding on open ground, which exercises the algorithm but is not the
# map's actual decomposition.
#
# TO CAPTURE, from a running game (debug mode is already on in development builds), add
# this to `eventStartLevel()` in `_run.js`, launch the map once, and copy the two lines it
# prints out of the console:
#
#     debug(`POI startPositions: ${JSON.stringify(startPositions.map(p => [p.x, p.y]))}`);
#     debug(`POI derricks: ${JSON.stringify(derrickPositions.map(p => [p.x, p.y]))}`);
#
# Paste the two arrays below, set MAP_NAME to match the terrain capture, and run this file.

import json

############################## USER CONFIG START ##############################

MAP_NAME = "gamma"

# One [x, y] per player start position (index == playerID, as in `startPositions`).
START_POSITIONS =  [[0,0],[6,16],[110,20],[58,98]]

# One [x, y] per oil resource on the map (as in `derrickPositions`).
DERRICKS = [[53,103],[107,16],[107,17],[108,17],[108,16],[7,13],[8,13],[8,12],[52,103],[52,104],[53,104],[7,12],[69,68],[42,68],[86,46],[70,25],[45,20],[53,67],[78,37],[33,42],[40,30],[47,81],[92,32],[87,24],[30,18],[61,81],[24,30]]

############################### USER CONFIG END ###############################

if __name__ == "__main__":
    if not START_POSITIONS and not DERRICKS:
        raise SystemExit(
            "Nothing to write: paste the captured startPositions / derricks into this file first.\n"
            "See the capture snippet in the comment at the top."
        )

    poi = {
        "startPositions": [list(p) for p in START_POSITIONS],
        "derricks": [list(p) for p in DERRICKS],
    }

    file_name = f"{MAP_NAME}_poi.json"
    with open(file_name, "w") as f:
        json.dump(poi, f)

    print(f"Generated: {file_name} "
          f"({len(poi['startPositions'])} start positions, {len(poi['derricks'])} derricks)")
