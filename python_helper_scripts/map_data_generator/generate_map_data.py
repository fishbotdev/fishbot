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
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter

#################################### USER CONFIG START ####################################

# Where Warzone 2100 is installed, relative to this file. The layout assumed here is the one in
# `docs/DEVELOPMENT.md`: a portable install inside the repo, with a PRODCONFIG config directory.
INSTALL_DIRECTORY = Path(__file__).resolve().parents[2] / "Warzone 2100"
CONFIG_DIRECTORY = INSTALL_DIRECTORY / "PRODCONFIG"

# The maps to capture, taken from the base map folders the test map packager reads. These are the
# ORIGINAL maps that ship with the game (e.g. `3c-Gamma`), not the repackaged `<N+1>c-` copies the
# test pipeline installs. That distinction matters here: repackaging duplicates Player 0 to add a
# slot, which leaves a start position at the map corner that is not a real base. Capturing the
# originals keeps that artefact out of the data entirely.
BASE_MAPS_DIRECTORY = (Path(__file__).resolve().parents[2]
                       / "tests" / "custom_test_map_packager" / "v4.7.0_base_maps")

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
CONSOLE_BUFFER_WIDTH = 3000
CONSOLE_BUFFER_HEIGHT = 12000

# Keep the scraped console text and challenge files instead of deleting them. For diagnosing a map
# that refuses to capture. The scraped text of a FAILED attempt is always kept regardless, since that
# is the only evidence of what went wrong.
KEEP_INTERMEDIATE_FILES = False

# Attempts per map before giving up. A capture depends on the game's output surviving a trip through
# the console buffer, which is not perfectly repeatable, so one retry costs a few seconds and saves a
# manual re-run.
ATTEMPTS_PER_MAP = 2

##################################### USER CONFIG END #####################################

DUMP_PREFIX = "MAPDUMP"

DUMPER_MOD_NAME = "mapdatadumper"

# Challenge files name an AI by its script filename, not by the mod it came from -- the game searches
# every loaded mod. This is the same form the Spectator mod is referenced by.
DUMPER_AI_PATH = "MapDataDumper.js"
SPECTATOR_AI_PATH = "Spectator.js"

# The slot the dumper occupies. Not adjustable: slot 0 is taken by the force-added human player,
# which overrides any AI put there, so the dumper would never run.
DUMPER_PLAYER_ID = 1

# Map folders are named `<players>c-<name>`, e.g. `3c-Gamma` -> 3 players.
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

def parse_stock_level_names() -> dict:
    """
    Returns {"3c-Gamma": {"levelName": "Gamma", "players": 3}, ...} by reading `addon.lev` out of the
    game's own `mp.wz`.

    This lookup is necessary, not incidental. A challenge file names a map by its LEVEL name, which is
    not the folder name and is not derivable from it: the folder `3c-Gamma` is the level `Gamma`, and
    `2c-startup` is `Sk-Startup`. Guessing gets you "Map not found!".

    `addon.lev` is a flat, line-based list of `<key> <value>` pairs, one block per level, so no regex
    is needed to read it.
    """
    archive_path = INSTALL_DIRECTORY / "data" / "mp.wz"
    if not archive_path.exists():
        raise FileNotFoundError(f"no map archive at {archive_path}")

    with zipfile.ZipFile(archive_path) as archive:
        text = archive.read("addon.lev").decode("utf-8", errors="ignore")

    levels = {}
    level_name, players = None, None

    for raw_line in text.splitlines():
        parts = raw_line.split()
        if not parts:
            continue

        key, value = parts[0], (parts[1] if len(parts) > 1 else "")

        if key == "level":
            level_name, players = value, None
        elif key == "players" and value.isdigit():
            players = int(value)
        elif key == "game" and level_name is not None:
            # e.g. "multiplay/maps/3c-Gamma.gam" -> folder "3c-Gamma"
            folder = value.strip('"').split("/")[-1]
            if folder.endswith(".gam"):
                folder = folder[:-len(".gam")]
            levels[folder] = {"levelName": level_name, "players": players}
            level_name, players = None, None

    return levels


def discover_maps() -> list:
    """
    Returns [{"mapName": "3c-Gamma", "levelName": "Gamma", "maxPlayers": 3}, ...].

    The base map folders are the list of WHAT to capture; the level name each one resolves to comes
    from the game's own archive. Nothing needs installing -- these are stock maps the engine already
    ships, unlike the repackaged copies the test pipeline builds.
    """
    if not BASE_MAPS_DIRECTORY.is_dir():
        raise FileNotFoundError(f"no base maps directory at {BASE_MAPS_DIRECTORY}")

    stock_levels = parse_stock_level_names()

    discovered = []
    for map_folder in sorted(BASE_MAPS_DIRECTORY.iterdir()):
        if not map_folder.is_dir():
            continue

        map_name = map_folder.name

        level = stock_levels.get(map_name)
        if level is None:
            print(f"  skipping {map_name}: no matching level in the game's map archive")
            continue

        match = MAP_NAME_PATTERN.match(map_name)
        players = level["players"] or (int(match.group(1)) if match else None)
        if players is None:
            print(f"  skipping {map_name}: player count unknown")
            continue

        discovered.append({
            "mapName": map_name,
            "levelName": level["levelName"],
            "maxPlayers": players,
        })

    return discovered


############################## CHALLENGE FILE ##############################

def remove_stale_challenge_files() -> None:
    """
    Clears out challenge files from an earlier run that was interrupted before it could tidy up.
    They are harmless but they accumulate in a folder the test pipeline also writes to.
    """
    tests_directory = CONFIG_DIRECTORY / "tests"
    if not tests_directory.is_dir():
        return

    stale = list(tests_directory.glob("mapdump_*.json"))
    for challenge_path in stale:
        challenge_path.unlink(missing_ok=True)

    if stale:
        print(f"removed {len(stale)} stale challenge file(s) from a previous run")


def write_challenge_file(map_info: dict) -> Path:
    """
    Writes the one-off challenge that loads a map with the dumper in it.

    THE DUMPER MUST BE PLAYER 1. Player 0 is the slot a challenge file force-adds for a human, and
    that human overrides whatever AI is placed there -- a dumper in slot 0 simply never runs. Every
    remaining slot is a Spectator.

    This is why 2-player maps are the tight case: slot 0 goes to the human and slot 1 to the dumper,
    leaving no spectators at all.
    """
    map_name = map_info["mapName"]

    if map_info["maxPlayers"] < DUMPER_PLAYER_ID + 1:
        raise ValueError(
            f"{map_name} has {map_info['maxPlayers']} slots, too few to place the dumper at "
            f"player {DUMPER_PLAYER_ID}"
        )

    config = {
        "challenge": {
            "bases": 1,
            # The engine resolves a map by its level name, not the folder it lives in.
            "map": map_info["levelName"],
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

    config[f"player_{DUMPER_PLAYER_ID}"] = {
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

    Both grids and position lists arrive as character-budgeted chunks, because a single long line
    gets silently truncated on its way through the console. They are reassembled here and checked:
    every grid row against mapWidth, and every position list against being a whole number of pairs.
    A chunk lost in transit therefore fails loudly instead of quietly producing a map with a dented
    edge or a derrick at half a coordinate.
    """
    record = {}
    grid_chunks = {}
    list_chunks = {}

    for line in dump_lines:
        parts = line.split("|")
        kind = parts[0]

        if kind == "meta":
            record.update(json.loads(parts[1]))
        elif kind == "list":
            name, chunk_index, values = parts[1], int(parts[2]), parts[3]
            list_chunks.setdefault(name, {})[chunk_index] = values
        elif kind == "grid":
            grid_name, y, chunk_index, values = parts[1], int(parts[2]), int(parts[3]), parts[4]
            grid_chunks.setdefault(grid_name, {}).setdefault(y, {})[chunk_index] = values

    if "mapName" not in record:
        raise ValueError(
            f"no meta line found in {len(dump_lines)} dumped line(s); "
            f"either the dumper did not run or its output never reached the console buffer"
        )

    width, height = record["mapWidth"], record["mapHeight"]

    for name, chunks in list_chunks.items():
        flat = []
        for chunk_index in sorted(chunks):
            values = chunks[chunk_index]
            if values:
                flat.extend(int(v) for v in values.split(","))

        if len(flat) % 2 != 0:
            raise ValueError(f"{name}: {len(flat)} values is not a whole number of x,y pairs")

        record[name] = [[flat[i], flat[i + 1]] for i in range(0, len(flat), 2)]

    for name in ("startPositions", "derricks"):
        if name not in record:
            raise ValueError(f"{name}: no data captured")

    for grid_name, rows in grid_chunks.items():
        if grid_name not in GRIDS_TO_KEEP:
            continue

        if len(rows) != height:
            raise ValueError(f"{grid_name}: got {len(rows)} rows, expected {height}")

        assembled = []
        for y in range(height):
            row = ",".join(rows[y][chunk_index] for chunk_index in sorted(rows[y]))

            value_count = row.count(",") + 1 if row else 0
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

def save_scraped_text(map_name: str, dump_lines: list, suffix: str = "") -> Path:
    WORKING_DIRECTORY.mkdir(parents=True, exist_ok=True)
    path = WORKING_DIRECTORY / f"{map_name}{suffix}.txt"
    path.write_text("\n".join(dump_lines), encoding="utf-8")
    return path


def capture_one_map_once(map_info: dict) -> dict:
    map_name = map_info["mapName"]
    challenge_path = write_challenge_file(map_info)

    try:
        dump_lines = run_dump_game(map_name, challenge_path)

        if KEEP_INTERMEDIATE_FILES:
            save_scraped_text(map_name, dump_lines)

        try:
            record = parse_dump_lines(dump_lines)
        except Exception:
            # The scraped text is the only evidence of what went wrong, so keep it even when the
            # run is not otherwise keeping intermediates.
            saved = save_scraped_text(map_name, dump_lines, suffix="_FAILED")
            print(f"  scraped output kept at {saved}")
            raise

        # The engine reports the LEVEL name, so that is what the dump comes back with. The console is
        # cleared before each game, but confirm anyway: silently writing one map's terrain under
        # another map's name would be near-impossible to notice later.
        if record["mapName"] != map_info["levelName"]:
            raise ValueError(
                f"scraped data is for level {record['mapName']}, expected {map_info['levelName']}"
            )

        # Key the record by the folder name, which is the identity the rest of the map tooling uses
        # and which carries the player count. The level name is kept alongside it.
        record["levelName"] = record["mapName"]
        record["mapName"] = map_name
        record["maxPlayers"] = map_info["maxPlayers"]
        return record
    finally:
        if not KEEP_INTERMEDIATE_FILES:
            challenge_path.unlink(missing_ok=True)


def capture_one_map(map_info: dict) -> dict:
    """
    Captures a map, retrying on failure. Whether the game's output survives the console buffer is not
    perfectly repeatable, so a second attempt is worth more than a manual re-run later.
    """
    last_error = None

    for attempt in range(1, ATTEMPTS_PER_MAP + 1):
        try:
            return capture_one_map_once(map_info)
        except Exception as error:
            last_error = error
            if attempt < ATTEMPTS_PER_MAP:
                print(f"  attempt {attempt} failed ({error}); retrying")

    raise last_error



def main() -> None:
    if not (INSTALL_DIRECTORY / "bin" / "warzone2100.exe").exists():
        raise FileNotFoundError(f"warzone2100.exe not found under {INSTALL_DIRECTORY}")

    prepare_console()
    remove_stale_challenge_files()

    all_maps = discover_maps()
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
