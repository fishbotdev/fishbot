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

"""
Plots FishBot's oil income & expenditure over the course of a game.

While `DEBUG_MODE_ON` is set, FishBot prints one `OIL` line per strategy update (6 per game minute) from
`CommandCenter.#logOilTelemetry` in `hq_command.js`:

    F0:  05:30:   OIL conn=8 idle=2 bank=146 inc=396 spend=380 unmet=0 share=0.80 surp=0.00 budg=1.00 suff=0.80 fac=4 labs=4

~ Why this script runs the game itself ~

The output cannot be captured by redirecting stdout/stderr. `--enableconsole` makes the game call
`SetStdOutToConsole_Win()`, which reopens both streams onto the console device:

    freopen_s(&fi, "CONOUT$", "w", stderr);      // warzone2100/src/clparse.cpp

That discards whatever redirection the launching process set up, which is why `tests/_run_and_save_autogames.py`
scrapes the Win32 console screen buffer instead of piping. This script reuses that same scraper, so it has to
launch the game itself: the scrape reads the console that this Python process owns.

That also caps how much history is recoverable. The game sets the console buffer to 9999 rows
(`MAX_CONSOLE_LINES` in `clparse.cpp`), and telemetry costs ~6 rows per game minute per FishBot, so a long FFA
can push the start of the game out of the buffer. `parse_telemetry` warns when that has happened.

Usage:
    No command-line arguments needed -- set TEST_FILE_NAME in the configuration block at the bottom and run the
    file (e.g. hit Run/F5 in your IDE). The scraped telemetry is saved next to this script before plotting, so a
    run is never lost; set RUN_GAME = False to re-plot the newest saved capture without running a game.

Platform & IDE notes (these mirror `tests/run_tests.py`, and apply for the same reasons):
    - The scraper is Windows-only. On Linux/Mac, plot a capture saved elsewhere (RUN_GAME = False).
    - In PyCharm, enable "Emulate Terminal in Output Console" in the Run Configuration, or the game's console
      output never reaches the console this script scrapes. VSCode generally needs no change.
    - A telemetry line is ~120 characters. If the console is narrower it wraps; wrapped rows are stitched back
      together by the parser, but widening/undocking the console keeps the live output readable.

Requires `pandas` & `matplotlib` (`pip install pandas matplotlib`).

Authored by Claude.
"""

import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Callable, List

import matplotlib.pyplot as plt
import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
TESTS_DIR = REPO_ROOT / "tests"

# The game sets the console scroll-back to this many rows (`MAX_CONSOLE_LINES` in its `clparse.cpp`), so there is
# nothing to be gained by asking the scraper for more.
CONSOLE_SCROLLBACK_ROWS = 9999

# Matches the `deb()` prefix ("F0:  05:30:  ") followed by the telemetry tag, and takes the game time from it.
TELEMETRY_ROW = re.compile(r"F(?P<player>\d+):\s+(?P<mins>\d+):(?P<secs>\d{2}):\s+OIL\s+(?P<fields>.*)$")
FIELD = re.compile(r"(?P<key>[a-z_]+)=(?P<value>-?\d+(?:\.\d+)?)")
# The tail of a telemetry line that wrapped. The console splits at a fixed column, which can fall in the middle
# of a field ("surp=0." | "00 budg=...") or leave a tail with no "=" in it at all ("labs=" | "4"), so this only
# asserts that the row looks like telemetry. It is applied solely to the row following a telemetry line that is
# still missing fields, and that narrow window is what keeps it from swallowing unrelated output.
CONTINUATION_ROW = re.compile(r"^[a-z0-9_=.\- ]+$")

# The fields `#logOilTelemetry` writes. Declared here so that a rename on the FishBot side fails loudly instead
# of silently dropping a column.
INTEGER_FIELDS = {"conn", "idle", "bank", "inc", "spend", "unmet", "fac", "labs"}
FLOAT_FIELDS = {"share", "surp", "budg", "suff"}
EXPECTED_FIELDS = INTEGER_FIELDS | FLOAT_FIELDS


def load_console_scraper() -> Callable[[int], List[str]]:
    """
    Borrows `windows_scrape_terminal_history` from the test runner rather than duplicating it -- that function is
    the proven way to get output out of Warzone 2100, and is documented in `tests/_run_and_save_autogames.py`.
    """
    sys.path.insert(0, str(TESTS_DIR))
    try:
        import _run_and_save_autogames as test_runner
    except ImportError as exc:
        raise SystemExit(f"Could not import the console scraper from {TESTS_DIR}: {exc}")
    return test_runner.windows_scrape_terminal_history


def build_autogame_command(test_file_name: str) -> List[str]:
    """
    Builds the same autogame command `tests/run_tests.py` uses, but with paths resolved from the repo root so that
    this script can be run from any working directory.
    """
    return [
        str(REPO_ROOT / "Warzone 2100" / "bin" / "warzone2100.exe"),
        rf'--configdir="{REPO_ROOT / "Warzone 2100" / "PRODCONFIG"}"',
        rf'--skirmish="{test_file_name}"',
        r"--enableconsole",     # attaches a console -- also what reopens stdout/stderr onto it
        r"--headless",
        r"--autogame",
        r"--nosound",
    ]


def run_autogame_and_scrape(test_file_name: str, timeout_seconds: int = 1200) -> List[str]:
    """
    Runs one autogame to completion (letting it write straight to this console), then returns the console rows.
    """
    scrape_console = load_console_scraper()

    command = build_autogame_command(test_file_name)
    print(f"Running {test_file_name} (up to {timeout_seconds // 60} minutes)...")
    subprocess.run(command, timeout=timeout_seconds)        # blocking; returns once the game exits

    return scrape_console(CONSOLE_SCROLLBACK_ROWS)


def _scan_console(console_rows: List[str]):
    """
    Walks scraped console rows once, returning `(records, telemetry_rows)`.

    A telemetry line which wrapped is stitched back together here. The console splits a line at a fixed column,
    which can land in the middle of a field, so the *raw text* of the rows is joined before any field is read --
    parsing the rows separately would mangle whichever field straddles the split. A row is only considered a
    continuation while the preceding telemetry line is still missing fields, which is what stops an unrelated
    `key=value` row from being absorbed.
    """
    records = []
    telemetry_rows = []

    pending_record = None       # the record whose line wrapped, still missing fields
    pending_text = ""           # its raw field text so far

    for row in console_rows:
        match = TELEMETRY_ROW.search(row)

        if match is not None:
            record = {
                "player": int(match.group("player")),
                "t_min": int(match.group("mins")) + int(match.group("secs")) / 60,
            }
            pending_text = match.group("fields")
            _read_fields(pending_text, into=record)

            records.append(record)
            telemetry_rows.append(row)
            pending_record = None if EXPECTED_FIELDS.issubset(record) else record
            continue

        if pending_record is not None and CONTINUATION_ROW.match(row):
            pending_text += row
            _read_fields(pending_text, into=pending_record)      # re-read the joined text, not the row alone
            telemetry_rows.append(row)
            if EXPECTED_FIELDS.issubset(pending_record):
                pending_record = None
            continue

        pending_record = None

    return records, telemetry_rows


def extract_telemetry_rows(console_history: List[str]) -> List[str]:
    """Keeps the telemetry rows (and the wrapped tails that belong to them), dropping all other console output."""
    _, telemetry_rows = _scan_console(console_history)
    return telemetry_rows


def save_capture(rows: List[str], path: Path) -> Path:
    """Writes the scraped rows out before plotting, so that a game does not have to be re-run to re-plot it."""
    path.write_text("\n".join(rows) + "\n", encoding="utf-8")
    print(f"Saved {len(rows)} telemetry rows to {path}")
    return path


def load_capture(path: Path) -> List[str]:
    return path.read_text(encoding="utf-8", errors="replace").splitlines()


def parse_telemetry(console_rows: List[str]) -> pd.DataFrame:
    """
    Reads every telemetry line out of scraped console rows.

    Returns a DataFrame with one row per telemetry line: `player`, `t_min` (game time in minutes, taken from the
    `deb()` prefix) and one column per field FishBot wrote, plus the derived `net` (income less expenditure).
    Rows that are not telemetry are ignored, so a whole console capture can be passed in as-is.

    A telemetry line which wrapped across console rows is stitched back together (see `_scan_console`).
    """
    records, _ = _scan_console(console_rows)

    df = pd.DataFrame(records)
    if df.empty:
        return df

    missing = EXPECTED_FIELDS - set(df.columns)
    if missing:
        raise SystemExit(
            f"Telemetry is missing the field(s) {sorted(missing)}.\n"
            f"`#logOilTelemetry` in hq_command.js and this script have drifted apart -- update EXPECTED_FIELDS."
        )

    # Dropped from the logged line to keep it inside a console width; it is exactly income less expenditure.
    df["net"] = df["inc"] - df["spend"]

    df = df.sort_values(["player", "t_min"]).reset_index(drop=True)
    _warn_if_truncated(df)
    return df


def _read_fields(text: str, into: dict) -> None:
    """Parses `key=value` pairs out of `text` into `into`, typed by which set the key belongs to."""
    for field in FIELD.finditer(text):
        key = field.group("key")
        if key in INTEGER_FIELDS:
            into[key] = int(field.group("value"))
        elif key in FLOAT_FIELDS:
            into[key] = float(field.group("value"))
        # An unrecognised key is ignored here; `parse_telemetry` reports missing ones after the whole capture.


def _warn_if_truncated(df: pd.DataFrame) -> None:
    """
    The console keeps a fixed number of rows, so a long game can push its own opening out of the buffer. FishBot
    starts logging within the first few strategy updates, so telemetry that only begins minutes in was truncated.
    """
    FIRST_SAMPLE_TOLERANCE_MIN = 1.0

    earliest = df["t_min"].min()
    if earliest > FIRST_SAMPLE_TOLERANCE_MIN:
        print(
            f"\nWARNING: the earliest telemetry is at {earliest:.1f} game minutes, so the start of the game has\n"
            f"         scrolled out of the {CONSOLE_SCROLLBACK_ROWS}-row console buffer. The plot below is only the\n"
            f"         part that survived -- shorten the game, or plot fewer FishBots, to capture the opening.",
            file=sys.stderr,
        )


def plot_oil_economy(df: pd.DataFrame, player: int, suptitle: str = ""):
    """
    Plots one FishBot's oil economy as three stacked panels sharing a game-time axis:
        1. the power rates (income vs expenditure), which is the headline supply-and-demand picture,
        2. the power stocks (banked power & unmet demand) against the derricks earning the income, and
        3. the oil sufficiency score & the structure caps FishBot derived from it.
    """
    GRID = {"color": "grey", "linestyle": "-", "linewidth": 0.4, "alpha": 0.3}

    fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(11, 9), sharex=True)
    fig.suptitle(suptitle or f"FishBot {player}: oil economy", size=16)

    # ---- 1. Power rates ----
    ax1.grid(**GRID)
    ax1.plot(df["t_min"], df["inc"], label="income", color="tab:green")
    ax1.plot(df["t_min"], df["spend"], label="expenditure", color="tab:red")
    ax1.fill_between(df["t_min"], df["inc"], df["spend"],
                     where=df["inc"] >= df["spend"], interpolate=True,
                     color="tab:green", alpha=0.15, label="surplus")
    ax1.fill_between(df["t_min"], df["inc"], df["spend"],
                     where=df["inc"] < df["spend"], interpolate=True,
                     color="tab:red", alpha=0.15, label="drawing down reserves")
    ax1.axhline(0, color="grey", linewidth=0.8)
    ax1.set_title("Oil income vs expenditure")
    ax1.set_ylabel("power / min")
    ax1.legend(loc="upper left", fontsize=8)

    # ---- 2. Power stocks & the derricks behind the income ----
    ax2.grid(**GRID)
    ax2.plot(df["t_min"], df["bank"], label="banked power", color="tab:blue")
    ax2.plot(df["t_min"], df["unmet"], label="unmet demand", color="tab:orange")
    ax2.set_title("Banked power & unmet demand, against the derricks earning")
    ax2.set_ylabel("power")
    ax2.legend(loc="upper left", fontsize=8)

    ax2_derricks = ax2.twinx()
    ax2_derricks.plot(df["t_min"], df["conn"], label="connected derricks",
                      color="tab:purple", linestyle="--", drawstyle="steps-post")
    ax2_derricks.plot(df["t_min"], df["idle"], label="idle derricks",
                      color="tab:brown", linestyle=":", drawstyle="steps-post")
    ax2_derricks.set_ylabel("derricks")
    ax2_derricks.legend(loc="upper right", fontsize=8)

    # ---- 3. Sufficiency & the caps it drives ----
    ax3.grid(**GRID)
    ax3.plot(df["t_min"], df["suff"], label="oil sufficiency", color="black", linewidth=2)
    ax3.plot(df["t_min"], df["share"], label="oil share score", color="tab:green", alpha=0.6)
    ax3.plot(df["t_min"], df["budg"], label="power budget score", color="tab:red", alpha=0.6)
    ax3.plot(df["t_min"], df["surp"], label="surplus bonus", color="tab:blue", alpha=0.6)
    ax3.set_ylim(-0.05, 1.05)
    ax3.set_title("Oil sufficiency (and its terms) vs the structure caps it sets")
    ax3.set_xlabel("game time (minutes)")
    ax3.set_ylabel("score (0 - 1)")
    ax3.legend(loc="upper left", fontsize=8)

    ax3_caps = ax3.twinx()
    ax3_caps.plot(df["t_min"], df["fac"], label="factory cap",
                  color="tab:purple", linestyle="--", drawstyle="steps-post")
    ax3_caps.plot(df["t_min"], df["labs"], label="research lab cap",
                  color="tab:brown", linestyle=":", drawstyle="steps-post")
    ax3_caps.set_ylabel("structure cap")
    ax3_caps.legend(loc="upper right", fontsize=8)

    fig.tight_layout()
    return fig


def print_summary(df: pd.DataFrame, player: int) -> None:
    """Prints the headline numbers, for when a plot window is not wanted (or not available)."""
    print(f"\nFishBot {player}: {len(df)} samples over {df['t_min'].max():.1f} game minutes")
    print(f"  mean income        {df['inc'].mean():8.1f} power/min  (peak {df['inc'].max():.0f})")
    print(f"  mean expenditure   {df['spend'].mean():8.1f} power/min  (peak {df['spend'].max():.0f})")
    print(f"  mean banked power  {df['bank'].mean():8.1f}            (peak {df['bank'].max():.0f})")
    print(f"  mean sufficiency   {df['suff'].mean():8.2f}            "
          f"(range {df['suff'].min():.2f} - {df['suff'].max():.2f})")

    # A job waiting on power means the base is outspending its income; an idle derrick means FishBot captured
    # oil it has no generator capacity to earn through, which is a build order problem rather than an oil one.
    print(f"  samples with jobs waiting on power:       {(df['unmet'] > 0).mean() * 100:.0f}%")
    print(f"  samples with idle (unconnected) derricks: {(df['idle'] > 0).mean() * 100:.0f}%")


def find_newest_capture() -> Path:
    """Picks the newest saved capture next to this script, so a previous run can be re-plotted."""
    captures = sorted(SCRIPT_DIR.glob("oil_telemetry_*.log"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not captures:
        raise SystemExit(
            f"No saved capture (oil_telemetry_*.log) found in {SCRIPT_DIR}.\n"
            f"Set RUN_GAME = True to run a game and scrape one."
        )
    return captures[0]


if __name__ == "__main__":

    ######## PROGRAM CONFIGURATION ########

    RUN_GAME = True                 # False re-plots the newest saved capture instead of running a game

    # Make sure this json file exists in `%Warzone Configuration Directory%/tests`.
    TEST_FILE_NAME = "GAMMA_1_2_COBRA_HARD_T2.json"

    PLAYER = None                   # a player ID to plot only that FishBot, or None for every FishBot in the capture
    SAVE_FIGURES_TO = None          # a Path to write PNGs to instead of opening plot windows

    ######## END PROGRAM CONFIGURATION ########

    if RUN_GAME:
        console_history = run_autogame_and_scrape(TEST_FILE_NAME)
        telemetry_rows = extract_telemetry_rows(console_history)

        if not telemetry_rows:
            raise SystemExit(
                "No telemetry found in the console.\n"
                "Check that DEBUG_MODE_ON is set in FishBot_vX_Y_Z.js, that the mod under test is the one in\n"
                "PRODCONFIG, and (in PyCharm) that 'Emulate Terminal in Output Console' is enabled."
            )

        capture_name = f"oil_telemetry_{datetime.now():%Y%m%d_%H%M%S}_{Path(TEST_FILE_NAME).stem}.log"
        capture_path = save_capture(telemetry_rows, SCRIPT_DIR / capture_name)
    else:
        capture_path = find_newest_capture()
        telemetry_rows = load_capture(capture_path)
        print(f"Re-plotting {capture_path}")

    df = parse_telemetry(telemetry_rows)
    if df.empty:
        raise SystemExit(f"No telemetry lines could be parsed out of {capture_path}.")

    players = [PLAYER] if PLAYER is not None else sorted(df["player"].unique())

    for fishbot in players:
        player_df = df[df["player"] == fishbot]
        if player_df.empty:
            print(f"No telemetry for player {fishbot}; skipping.", file=sys.stderr)
            continue

        print_summary(player_df, fishbot)
        figure = plot_oil_economy(player_df, fishbot, suptitle=f"FishBot {fishbot}: oil economy ({capture_path.name})")

        if SAVE_FIGURES_TO is not None:
            SAVE_FIGURES_TO.mkdir(parents=True, exist_ok=True)
            output_path = SAVE_FIGURES_TO / f"oil_economy_player{fishbot}.png"
            figure.savefig(output_path, dpi=130)
            print(f"  saved {output_path}")

    if SAVE_FIGURES_TO is None:
        plt.show()
