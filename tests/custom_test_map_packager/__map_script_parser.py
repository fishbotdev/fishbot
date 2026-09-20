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

r"""
Warzone2100 ships two flavours of multiplayer map inside `mp.wz`:

1. A *static* map, e.g. `multiplay/maps/2c-highground`, which is a folder of
   pre-baked data files (`game.map`, `ttypes.ttp`, `struct.json`, `droid.json`,
   `feature.json`). This is what `_map_packager.py` originally supported.

2. A *script-generated* ("js-defined") map, e.g. `multiplay/maps/2c-DustyMaze`,
   which is only `game.js` + `ttypes.ttp`. Here the terrain, the structures and
   the droids do not exist on disk at all: the engine runs `game.js` through its
   embedded QuickJS interpreter at map-load time and the script hands the whole
   map back in one call:

       setMapData(mapWidth, mapHeight, texture, height, structures, droids, features)

   See `lib/wzmaplib/src/map_script.cpp` in the Warzone2100 source for the host
   side of that API. `structures` and `droids` are arrays of objects shaped like:

       {name: "A0CommandCentre",  position: [x, y], direction: 0x4000*gameRand(4), modules: 0, player: 1}
       {name: "ConstructionDroid", position: [x, y], direction: gameRand(0x10000), player: 1}

   `player` here is the same index that `startpos` is in `struct.json` /
   `droid.json`, and `position` is in the same world units (128 == 1 game tile).

Because the map content only exists once the script has run, we cannot edit it
the way `_map_packager.py` edits `struct.json`. Re-implementing the script in
Python (including `gameRand`, which must stay in lockstep with the engine's
Mersenne Twister) would be both fragile and pointless.

Instead this module rewrites the *script*, so the exact same transformation
happens inside the engine, on the data the script just generated:

* a small prologue is prepended which defines `__fishbot_setMapData()`, and
* the script's single `setMapData(...)` call is redirected to it.

`__fishbot_setMapData()` mutates the `structures` / `droids` arrays and then
forwards everything to the real `setMapData()`, so every other part of the map
(terrain, heightmap, features, scavengers) is left exactly as the author
intended. The transformation it applies mirrors `duplicate_start_position()` /
`translate_start_position()` in `_map_packager.py`:

* every Player 0 structure and droid is handed to the new player `N`, and
* a copy of Player 0's command centre is left behind (nudged by
  `POSITION_OFFSET` so it does not sit exactly on top of the new player's own
  command centre) purely to keep start position 0 on the map.

Net effect, identical to the static-map path: start position 0 still exists so
'challenge' mode can force its human player into it, but the actual base that
used to belong to Player 0 now belongs to Player N.

Disclaimer: as with the rest of this pipeline, the intent is to stay hands-off
and only touch what is absolutely necessary.
"""

import re
from pathlib import Path


MAP_SCRIPT_FILENAME = "game.js"

# The engine's own entry point. Every stock script map calls it exactly once, as
# the last statement of `game.js`.
SET_MAP_DATA = "setMapData"

# Names injected into the script's global scope. Prefixed so they cannot collide
# with anything a map author declared.
INJECTED_PREFIX = "__fishbot_"

_SET_MAP_DATA_CALL_PATTERN = re.compile(r"\b" + SET_MAP_DATA + r"\s*\(")

_MAP_WIDTH_PATTERN = re.compile(r"\bmapWidth\s*=\s*(\d+)")
_MAP_HEIGHT_PATTERN = re.compile(r"\bmapHeight\s*=\s*(\d+)")

_COMMAND_CENTRE = "A0CommandCentre"


_PROLOGUE_TEMPLATE = """\
/*
    ------------------------------------------------------------------------
    Injected by the FishBot custom-map re-packager (`__map_script_parser.py`).

    Everything the map script gives Player {source_player} is handed over to
    Player {new_player}. Only a copy of Player {source_player}'s command centre is left behind
    (offset by {offset} world units), so that start position {source_player} still exists
    for the forced human slot in 'challenge' mode.

    Nothing below this block is edited except the final `{set_map_data}` call,
    which is redirected to `{prefix}setMapData` defined just below.
    ------------------------------------------------------------------------
*/
var {prefix}sourcePlayerId = {source_player};
var {prefix}newPlayerId = {new_player};
var {prefix}positionOffset = {offset};
var {prefix}commandCentreName = "{command_centre}";

function {prefix}cloneStartPositionAnchor(structure) {{
    return {{
        name: structure.name,
        position: [
            structure.position[0] + {prefix}positionOffset,
            structure.position[1] + {prefix}positionOffset
        ],
        direction: structure.direction,
        modules: structure.modules,
        player: {prefix}sourcePlayerId
    }};
}}

function {prefix}setMapData(mapWidth, mapHeight, texture, height, structures, droids, features) {{
    var anchors = [];
    var i, structure, droid;

    // Structures: hand Player `sourcePlayerId`'s base over to Player `newPlayerId`,
    // remembering its command centre so start position `sourcePlayerId` survives.
    // `structures.length` is read every iteration, so the anchors are collected
    // first and only appended once the sweep is finished.
    for (i = 0; i < structures.length; ++i) {{
        structure = structures[i];

        if (structure.player !== {prefix}sourcePlayerId) {{
            continue;
        }}

        if (structure.name === {prefix}commandCentreName) {{
            anchors.push({prefix}cloneStartPositionAnchor(structure));
        }}

        structure.player = {prefix}newPlayerId;
    }}

    if (anchors.length === 0) {{
        log("FishBot re-packager: no Player " + {prefix}sourcePlayerId
            + " command centre found; start position " + {prefix}sourcePlayerId + " will be missing.");
    }}

    for (i = 0; i < anchors.length; ++i) {{
        structures.push(anchors[i]);
    }}

    // Droids: same hand-over, nudged clear of the anchor left behind above.
    for (i = 0; i < droids.length; ++i) {{
        droid = droids[i];

        if (droid.player !== {prefix}sourcePlayerId) {{
            continue;
        }}

        droid.player = {prefix}newPlayerId;
        droid.position[0] += {prefix}positionOffset;
        droid.position[1] += {prefix}positionOffset;
    }}

    return {set_map_data}(mapWidth, mapHeight, texture, height, structures, droids, features);
}}


"""


def blank_code_noise(source: str) -> str:
    """
    Return `source` with the contents of every comment and string literal
    replaced by spaces.

    The result is the same length as the input (newlines are kept), so an offset
    found in the blanked copy points at the same character in the original. That
    lets us look for `setMapData(` / `mapWidth = ...` as *code*, without tripping
    over the commented-out examples, documentation and log messages that these
    map scripts carry.

    Regular-expression literals are not recognised - none of the stock map
    scripts use one, and treating `/.../` as a division keeps this simple.
    """

    out = list(source)
    index = 0
    length = len(source)

    while index < length:
        char = source[index]

        if char in "\"'`":
            quote = char
            index += 1

            while index < length:
                if source[index] == "\\":
                    out[index] = " "
                    if index + 1 < length and source[index + 1] != "\n":
                        out[index + 1] = " "

                    index += 2
                    continue

                if source[index] == quote:
                    index += 1
                    break

                if source[index] != "\n":
                    out[index] = " "

                index += 1

            continue

        if char == "/" and index + 1 < length and source[index + 1] == "/":
            while index < length and source[index] != "\n":
                out[index] = " "
                index += 1

            continue

        if char == "/" and index + 1 < length and source[index + 1] == "*":
            end = source.find("*/", index + 2)
            end = length if end == -1 else end + 2

            while index < end:
                if source[index] != "\n":
                    out[index] = " "

                index += 1

            continue

        index += 1

    return "".join(out)


def read_map_script(source_dir: Path) -> str:
    """
    Read `game.js` from a script-generated map folder.

    Raises
    ------
    ValueError
        If the script cannot be read.
    """

    script_path = source_dir / MAP_SCRIPT_FILENAME

    try:
        return script_path.read_text(encoding="utf-8")
    except OSError as e:
        raise ValueError(f"Failed to read '{MAP_SCRIPT_FILENAME}': {e}")


def parse_map_script_dimensions(script_source: str) -> tuple[int, int]:
    """
    Extract the map dimensions (in tiles) from a script-generated map.

    The dimensions are needed for `gam.json` (the scroll limits), which the
    engine reads before it ever runs the script, so they have to be recovered
    statically. Every stock script map declares them up front as plain integer
    literals, e.g.

        const mapWidth = 63;                    // 2c-DustyMaze
        var mapWidth = 128, mapHeight = 128;    // 6c-Entropy

    Raises
    ------
    ValueError
        If either dimension cannot be found.
    """

    blanked = blank_code_noise(script_source)

    width_match = _MAP_WIDTH_PATTERN.search(blanked)
    height_match = _MAP_HEIGHT_PATTERN.search(blanked)

    missing = []

    if width_match is None:
        missing.append("mapWidth")

    if height_match is None:
        missing.append("mapHeight")

    if missing:
        raise ValueError(
            f"Could not read {' and '.join(missing)} from "
            f"'{MAP_SCRIPT_FILENAME}' (expected a literal integer assignment)."
        )

    return int(width_match.group(1)), int(height_match.group(1))


def patch_map_script(
    script_source: str,
    source_player_id: int,
    new_player_id: int,
    position_offset: int,
) -> str:
    """
    Rewrite a script-generated map so Player `new_player_id` spawns on top of
    Player `source_player_id`.

    The script itself is left untouched apart from its single `setMapData(...)`
    call, which is redirected through the injected `__fishbot_setMapData()`
    wrapper (see this module's docstring).

    Raises
    ------
    ValueError
        If the script does not contain exactly one `setMapData(` call, or if it
        already carries an injected wrapper.
    """

    if INJECTED_PREFIX in script_source:
        raise ValueError(
            f"'{MAP_SCRIPT_FILENAME}' already contains '{INJECTED_PREFIX}' "
            f"symbols - it looks like an already-repackaged map."
        )

    blanked = blank_code_noise(script_source)
    calls = list(_SET_MAP_DATA_CALL_PATTERN.finditer(blanked))

    if len(calls) != 1:
        raise ValueError(
            f"Expected exactly one '{SET_MAP_DATA}(' call in "
            f"'{MAP_SCRIPT_FILENAME}', found {len(calls)}."
        )

    # `blanked` is the same length as `script_source`, so the match offset is
    # valid in the original text.
    start = calls[0].start()

    patched = (
        script_source[:start]
        + INJECTED_PREFIX
        + script_source[start:]
    )

    prologue = _PROLOGUE_TEMPLATE.format(
        prefix=INJECTED_PREFIX,
        set_map_data=SET_MAP_DATA,
        command_centre=_COMMAND_CENTRE,
        source_player=source_player_id,
        new_player=new_player_id,
        offset=position_offset,
    )

    return prologue + patched


if __name__ == "__main__":
    source = read_map_script(Path("v4.7.0_base_maps/2c-DustyMaze"))

    print(parse_map_script_dimensions(source))
    print(patch_map_script(source, 0, 2, 3)[:2000])
