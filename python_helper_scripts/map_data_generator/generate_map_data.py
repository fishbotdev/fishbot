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
Generates `map_data.json`: every installed map's start positions, derrick positions and terrain,
keyed by map name. This is the input the region analysis in `../map_analysis` runs on.

This script has ONE job and stands apart from the test pipeline on purpose. It shares no code with
`fishbot/tests`, and FishBot itself carries no dumping code -- the data comes from `MapDataDumper.js`,
a separate throwaway AI mod that this script installs and removes again. Nothing about map capture
leaks into the shipped bot.

HOW IT WORKS
    For each installed map, one headless autogame is run with MapDataDumper in a playing slot and
    Spectators everywhere else. The dumper prints the map's data at `eventStartLevel` and immediately
    ends the game, so a map costs a few seconds rather than a full match.

    The dumped lines are recovered from the Windows console buffer after the game exits, the same
    channel `tests/_run_and_save_autogames.py` uses to recover autogame results. Script output does not
    reliably reach the file written by `--debugfile`, so the console is the channel that actually
    holds up.

    The console scraper below is a copy of the one in the test pipeline rather than an import of it.
    That keeps this script standalone, as intended: the test pipeline gains no branch for map capture,
    and a change on either side cannot break the other.

WINDOWS ONLY
    Reading the console buffer is a Win32 call. Run this from an IDE terminal that hosts a real
    console -- in PyCharm that means enabling "Emulate Terminal In Output Console" in the run
    configuration; VSCode does it by default. The same requirement is documented for the test
    pipeline.

WHY THE GAME HAS TO RUN AT ALL
    Terrain cannot be read off disk for every map. Script-generated maps (e.g. `3c-DustyMaze`) have no
    baked terrain -- `game.js` builds them at load time -- so the only source of truth for all map
    types is the running engine.

BEFORE RUNNING
    - Warzone 2100 must be installed at INSTALL_DIRECTORY below, with the maps already packaged into
      its config directory (`tests/run_test_generator.py` does that).
    - The Spectator mod must be installed, as described in `docs/DEVELOPMENT.md`.
    Then just run this file from your IDE.
"""

import ctypes
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter

#################################### USER CONFIG START ####################################

# Where Warzone 2100 is installed, relative to this file. The layout assumed here is the one in
# `docs/DEVELOPMENT.md`: a portable install inside the repo, with a PRODCONFIG config directory.
INSTALL_DIRECTORY = Path(__file__).resolve().parents[2] / "Warzone 2100"
CONFIG_DIRECTORY = INSTALL_DIRECTORY / "PRODCONFIG"

# Where the finished data lands. It goes straight into the analysis folder, which is what consumes it.
OUTPUT_FILE = Path(__file__).resolve().parents[1] / "map_analysis" / "map_data.json"

# Restrict the run to these map names (e.g. ["4c-Gamma"]). Empty means every installed map.
ONLY_THESE_MAPS = []

# Skip maps already present in the output file. Lets an interrupted run be resumed, and lets a single
# map be re-captured by deleting just its entry.
SKIP_MAPS_ALREADY_CAPTURED = True

# Grids to keep. Must match what MapDataDumper.js actually dumps. Terrain is what the region analysis
# needs, and every extra grid is another mapHeight lines competing for space in the console buffer,
# so the dumper emits this one alone -- see the note in MapDataDumper.js for the others.
GRIDS_TO_KEEP = ["terrainType"]

# A dump takes seconds. This only bounds a game that has hung.
GAME_TIMEOUT_SECONDS = 180

# The console buffer is resized before each game so that a whole grid row fits on one line and is not
# width-wrapped into unparseable pieces, and so that a whole map's dump fits without scrolling away.
# Width must exceed the longest line: roughly 40 characters of prefix plus 4 per tile of map width.
CONSOLE_BUFFER_WIDTH = 1400
CONSOLE_BUFFER_HEIGHT = 12000

# Keep the per-map debug logs and challenge files instead of deleting them. For diagnosing a map that
# refuses to capture.
KEEP_INTERMEDIATE_FILES = False

##################################### USER CONFIG END #####################################

DUMP_PREFIX = "MAPDUMP"

DUMPER_MOD_NAME = "mapdatadumper"

# Challenge files name an AI by its script filename, not by the mod it came from -- the game searches
# every loaded mod. This is the same form the Spectator mod is referenced by.
DUMPER_AI_PATH = "MapDataDumper.js"
SPECTATOR_AI_PATH = "Spectator.js"

# Matches the repackaged map naming convention, e.g. `4c-Gamma` -> 4 players.
MAP_NAME_PATTERN = re.compile(r"^(\d+)c-")

SCRIPT_DIRECTORY = Path(__file__).resolve().parent
WORKING_DIRECTORY = SCRIPT_DIRECTORY / "_work"


############################## MOD INSTALL / REMOVAL ##############################

def dumper_mod_directory() -> Path:
    return CONFIG_DIRECTORY / "mods" / "4.7.0" / "autoload" / DUMPER_MOD_NAME


def install_dumper_mod() -> Path:
    """
    Copies MapDataDumper into the game's autoload folder. Installed fresh every run so an edit to the
    dumper cannot be silently ignored in favour of a stale copy.
    """
    destination = dumper_mod_directory() / "multiplay" / "skirmish"
    destination.mkdir(parents=True, exist_ok=True)

    for file_name in ("MapDataDumper.js", "MapDataDumper.json"):
        shutil.copyfile(SCRIPT_DIRECTORY / file_name, destination / file_name)

    print(f"installed dumper mod -> {dumper_mod_directory()}")
    return destination


def remove_dumper_mod() -> None:
    """
    The dumper must not be left in autoload. Every future game on this install would load it, and any
    game it joined would end at once.
    """
    directory = dumper_mod_directory()
    if directory.exists():
        shutil.rmtree(directory)
        print(f"removed dumper mod  <- {directory}")


############################## MAP DISCOVERY ##############################

def discover_installed_maps() -> list:
    """
    Returns [{"mapName": "4c-Gamma", "maxPlayers": 4}, ...] for the packaged maps in the config
    directory, which are the same maps the test pipeline runs on.
    """
    maps_directory = CONFIG_DIRECTORY / "maps"
    if not maps_directory.is_dir():
        raise FileNotFoundError(
            f"no maps directory at {maps_directory}. "
            f"Run tests/run_test_generator.py first to package the maps."
        )

    discovered = []
    for map_file in sorted(maps_directory.glob("*.wz")):
        map_name = map_file.stem

        match = MAP_NAME_PATTERN.match(map_name)
        if match is None:
            print(f"  skipping {map_name}: name does not match the '<players>c-' convention")
            continue

        discovered.append({"mapName": map_name, "maxPlayers": int(match.group(1))})

    return discovered


############################## CHALLENGE FILE ##############################

def write_challenge_file(map_info: dict) -> Path:
    """
    Writes the one-off challenge that loads a map with the dumper in it.

    Player 0 is the slot challenge files force-add for a human, so the dumper goes in player 1 and
    every other slot is a Spectator. That leaves the dumper as the only participant, which is also why
    the game ends the moment it is done.
    """
    map_name = map_info["mapName"]

    config = {
        "challenge": {
            "bases": 1,
            "map": map_name,
            "powerLevel": 2,
            "scavengers": 0,
            "techLevel": 2,
        }
    }

    for player_id in range(map_info["maxPlayers"]):
        config[f"player_{player_id}"] = {
            "difficulty": "Easy",
            "team": 0,
            "ai": SPECTATOR_AI_PATH,
        }

    config["player_1"] = {
        "difficulty": "Easy",
        "team": 0,
        "ai": DUMPER_AI_PATH,
    }

    tests_directory = CONFIG_DIRECTORY / "tests"
    tests_directory.mkdir(parents=True, exist_ok=True)

    challenge_path = tests_directory / f"mapdump_{map_name}.json"
    challenge_path.write_text(json.dumps(config, indent=1), encoding="utf-8")
    return challenge_path


############################## WINDOWS CONSOLE ##############################

# Deliberately a copy of the scraper in `tests/_run_and_save_autogames.py`, not an import of it, so
# this script stays standalone and the test pipeline needs no awareness of map capture.

class _COORD(ctypes.Structure):
    _fields_ = [("X", ctypes.c_short), ("Y", ctypes.c_short)]


class _SMALL_RECT(ctypes.Structure):
    _fields_ = [("Left", ctypes.c_short), ("Top", ctypes.c_short),
                ("Right", ctypes.c_short), ("Bottom", ctypes.c_short)]


class _CONSOLE_SCREEN_BUFFER_INFO(ctypes.Structure):
    _fields_ = [("dwSize", _COORD), ("dwCursorPosition", _COORD),
                ("wAttributes", ctypes.c_ushort), ("srWindow", _SMALL_RECT),
                ("dwMaximumWindowSize", _COORD)]


STANDARD_OUTPUT_HANDLE = -11


def _console_handle():
    return ctypes.windll.kernel32.GetStdHandle(STANDARD_OUTPUT_HANDLE)


def _console_buffer_info():
    info = _CONSOLE_SCREEN_BUFFER_INFO()
    ok = ctypes.windll.kernel32.GetConsoleScreenBufferInfo(_console_handle(), ctypes.byref(info))
    if not ok:
        raise OSError(
            "no Windows console attached. Run this from a terminal that hosts a real console "
            "(in PyCharm, enable 'Emulate Terminal In Output Console')."
        )
    return info


def prepare_console() -> None:
    """
    Widens and heightens the console buffer so a grid row fits on one line and a whole dump fits
    without scrolling away. Without this, rows are width-wrapped into pieces the reader cannot
    reassemble, and long maps push their own beginning out of the buffer.
    """
    info = _console_buffer_info()

    width = max(info.dwSize.X, CONSOLE_BUFFER_WIDTH)
    height = max(info.dwSize.Y, CONSOLE_BUFFER_HEIGHT)

    # The buffer may not be smaller than the visible window, so shrink the window first.
    window = _SMALL_RECT(0, 0, 1, 1)
    ctypes.windll.kernel32.SetConsoleWindowInfo(_console_handle(), True, ctypes.byref(window))

    if not ctypes.windll.kernel32.SetConsoleScreenBufferSize(_console_handle(), _COORD(width, height)):
        raise OSError(f"could not resize the console buffer to {width}x{height}")

    print(f"console buffer set to {width} x {height}")


def clear_console() -> None:
    """Cleared before each game so a previous map's lines cannot be read back as this map's."""
    os.system("cls")


def scrape_console_lines(lines_to_read: int) -> list:
    """
    Reads text straight out of the console screen buffer.

    The buffer is a fixed grid of character cells, so this comes back as one fixed-width block that
    has to be sliced back into lines.
    """
    info = _console_buffer_info()

    start_row = max(0, info.dwCursorPosition.Y - lines_to_read)
    rows_to_read = info.dwCursorPosition.Y - start_row
    if rows_to_read <= 0:
        return []

    total_cells = info.dwSize.X * rows_to_read
    buffer_allocation = ctypes.create_string_buffer(total_cells)
    chars_read = ctypes.c_ulong(0)

    ctypes.windll.kernel32.ReadConsoleOutputCharacterA(
        _console_handle(), buffer_allocation, total_cells,
        _COORD(0, start_row), ctypes.byref(chars_read),
    )

    raw_text = buffer_allocation.value.decode("utf-8", errors="ignore")

    scraped = []
    for i in range(0, len(raw_text), info.dwSize.X):
        line = raw_text[i:i + info.dwSize.X].rstrip()
        if line:
            scraped.append(line)

    return scraped


############################## RUNNING THE GAME ##############################

def run_dump_game(map_name: str, challenge_path: Path) -> list:
    """Runs one headless autogame and returns the dumped lines scraped from the console."""
    clear_console()

    command = [
        str(INSTALL_DIRECTORY / "bin" / "warzone2100.exe"),
        f"--configdir={CONFIG_DIRECTORY}",
        f"--skirmish={challenge_path.name}",
        "--enableconsole",
        "--headless",
        "--autogame",
        "--nosound",
    ]

    try:
        subprocess.run(command, timeout=GAME_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        print(f"  TIMEOUT after {GAME_TIMEOUT_SECONDS}s")

    return extract_dump_lines(scrape_console_lines(CONSOLE_BUFFER_HEIGHT))


############################## PARSING THE OUTPUT ##############################

def extract_dump_lines(console_lines: list) -> list:
    """Pulls just this script's lines out, which the engine's own chatter is mixed in with."""
    marker = DUMP_PREFIX + "|"
    dump_lines = []

    for line in console_lines:
        index = line.find(marker)
        if index != -1:
            dump_lines.append(line[index + len(marker):])

    return dump_lines



def parse_dump_lines(dump_lines: list) -> dict:
    """
    Rebuilds one map's record from the dumped lines.

    Grid rows arrive in chunks; they are reassembled here and every row is checked against mapWidth,
    so a row lost to a truncated log line fails loudly instead of quietly producing a map with a
    dented edge.
    """
    record = {}
    chunks = {}

    for line in dump_lines:
        parts = line.split("|")
        kind = parts[0]

        if kind == "meta":
            record.update(json.loads(parts[1]))
        elif kind == "startPositions":
            record["startPositions"] = json.loads(parts[1])
        elif kind == "derricks":
            record["derricks"] = json.loads(parts[1])
        elif kind == "grid":
            grid_name, y, chunk_index, values = parts[1], int(parts[2]), int(parts[3]), parts[4]
            chunks.setdefault(grid_name, {}).setdefault(y, {})[chunk_index] = values

    if "mapName" not in record:
        raise ValueError("no meta line found; the dumper did not run")

    width, height = record["mapWidth"], record["mapHeight"]

    for grid_name, rows in chunks.items():
        if grid_name not in GRIDS_TO_KEEP:
            continue

        if len(rows) != height:
            raise ValueError(f"{grid_name}: got {len(rows)} rows, expected {height}")

        assembled = []
        for y in range(height):
            row = ",".join(rows[y][chunk_index] for chunk_index in sorted(rows[y]))

            value_count = row.count(",") + 1
            if value_count != width:
                raise ValueError(f"{grid_name} row {y}: got {value_count} values, expected {width}")

            assembled.append(row)

        record[grid_name] = assembled

    for grid_name in GRIDS_TO_KEEP:
        if grid_name not in record:
            raise ValueError(f"{grid_name}: no data captured")

    return record


############################## OUTPUT FILE ##############################

def load_existing_output() -> dict:
    if not OUTPUT_FILE.exists():
        return {"version": 1, "maps": {}}

    data = json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
    data.setdefault("maps", {})
    return data


def save_output(data: dict) -> None:
    data["generatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(data), encoding="utf-8")


############################## ENTRY POINT ##############################

def capture_one_map(map_info: dict) -> dict:
    map_name = map_info["mapName"]
    challenge_path = write_challenge_file(map_info)

    try:
        dump_lines = run_dump_game(map_name, challenge_path)

        if KEEP_INTERMEDIATE_FILES:
            WORKING_DIRECTORY.mkdir(parents=True, exist_ok=True)
            (WORKING_DIRECTORY / f"{map_name}.txt").write_text(
                "\n".join(dump_lines), encoding="utf-8")

        record = parse_dump_lines(dump_lines)

        # The console is cleared before each game, but confirm anyway: silently writing one map's
        # terrain under another map's name would be near-impossible to notice later.
        if record["mapName"] != map_name:
            raise ValueError(f"scraped data is for {record['mapName']}, not {map_name}")

        record["maxPlayers"] = map_info["maxPlayers"]
        return record
    finally:
        if not KEEP_INTERMEDIATE_FILES:
            challenge_path.unlink(missing_ok=True)


def main() -> None:
    if not (INSTALL_DIRECTORY / "bin" / "warzone2100.exe").exists():
        raise FileNotFoundError(f"warzone2100.exe not found under {INSTALL_DIRECTORY}")

    prepare_console()

    all_maps = discover_installed_maps()
    if ONLY_THESE_MAPS:
        all_maps = [m for m in all_maps if m["mapName"] in ONLY_THESE_MAPS]

    output = load_existing_output()

    pending = [
        m for m in all_maps
        if not (SKIP_MAPS_ALREADY_CAPTURED and m["mapName"] in output["maps"])
    ]

    print(f"\n{len(all_maps)} maps found, {len(pending)} to capture "
          f"({len(all_maps) - len(pending)} already in {OUTPUT_FILE.name})")

    if not pending:
        print("nothing to do.")
        return

    install_dumper_mod()

    captured, failed = 0, []
    started_at = perf_counter()

    try:
        for index, map_info in enumerate(pending, start=1):
            map_name = map_info["mapName"]
            print(f"\n[{index}/{len(pending)}] {map_name}")

            map_started_at = perf_counter()
            try:
                output["maps"][map_name] = capture_one_map(map_info)
                captured += 1
                # Saved after every map so an interrupted run keeps everything captured so far.
                save_output(output)
                print(f"  captured in {perf_counter() - map_started_at:.1f}s "
                      f"({output['maps'][map_name]['mapWidth']}"
                      f"x{output['maps'][map_name]['mapHeight']}, "
                      f"{len(output['maps'][map_name]['derricks'])} derricks)")
            except Exception as error:
                failed.append((map_name, str(error)))
                print(f"  FAILED: {error}")
    finally:
        remove_dumper_mod()

    print(f"\n{'=' * 70}")
    print(f"captured {captured}/{len(pending)} maps in {perf_counter() - started_at:.0f}s")
    print(f"{len(output['maps'])} maps now in {OUTPUT_FILE}")

    if failed:
        print(f"\n{len(failed)} failed:")
        for map_name, error in failed:
            print(f"  {map_name}: {error}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        # The mod must still come out of autoload, or every later game on this install loads it.
        remove_dumper_mod()
        print("\ninterrupted.")
        sys.exit(1)
