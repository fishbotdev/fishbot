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

FishBot writes one `OIL_TELEMETRY` line per strategy update (6 per game minute) from
`CommandCenter.#logOilTelemetry` in `hq_command.js`. Those lines go to `stderr`, so they appear in the game
console as the match runs, and can be captured to a file by redirecting `stderr`:

    "Warzone 2100\\bin\\warzone2100.exe" --configdir="Warzone 2100\\PRODCONFIG" --skirmish="GAMMA_HARD_COBRA_T2.json"
        --enableconsole --headless --autogame --nosound  2> oil_telemetry.log

Telemetry is only written while `DEBUG_MODE_ON` is set in `FishBot_vX_Y_Z.js` (it is on during development and
off in a release build), so check that first if a capture comes back empty.

Usage:
    No command-line arguments needed -- drop the captured log next to this script (any `.log` file will do) and
    run the file (e.g. hit Run/F5 in your IDE). The newest `.log` in this folder is used.
    Optionally: `python plot_oil_economy.py <logfile> --player 1 --save-dir out`

One figure is produced per FishBot in the log, so FFA games with several FishBots plot separately.

Requires `pandas` & `matplotlib` (`pip install pandas matplotlib`).

Authored by Claude.
"""

import argparse
import re
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent

MS_PER_MINUTE = 60000

# Matches the `deb()` prefix ("F0:  05:30:  ") followed by the telemetry tag. Anything the terminal or the game
# prepends to the line is skipped, so a scraped console capture parses as well as a clean `stderr` redirect.
TELEMETRY_LINE = re.compile(r"F(?P<player>\d+):\s+\d+:\d+:\s+OIL_TELEMETRY\s+(?P<fields>.*)$")
FIELD = re.compile(r"(?P<key>[a-z_]+)=(?P<value>-?\d+(?:\.\d+)?)")

# Fields written as whole numbers by `#logOilTelemetry`; every other field is kept as a float.
INTEGER_FIELDS = {"t", "connected", "idle", "banked", "factories", "labs"}


def parse_telemetry(filepath: Path) -> pd.DataFrame:
    """
    Reads every `OIL_TELEMETRY` line out of a captured game log.

    Returns a DataFrame with one row per telemetry line: a `player` column, a `t_min` column (game time in
    minutes) and one column per `key=value` field FishBot wrote. Non-telemetry lines are ignored, so a capture
    of the whole game console can be passed in as-is.
    """
    rows = []

    # `errors="replace"` because a scraped console capture can carry stray bytes from other output.
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            match = TELEMETRY_LINE.search(line)
            if match is None:
                continue

            row = {"player": int(match.group("player"))}
            for field in FIELD.finditer(match.group("fields")):
                key = field.group("key")
                row[key] = int(field.group("value")) if key in INTEGER_FIELDS else float(field.group("value"))

            rows.append(row)

    df = pd.DataFrame(rows)
    if df.empty:
        return df

    df["t_min"] = df["t"] / MS_PER_MINUTE
    return df.sort_values(["player", "t_min"]).reset_index(drop=True)


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
    ax1.plot(df["t_min"], df["income"], label="income", color="tab:green")
    ax1.plot(df["t_min"], df["spend"], label="expenditure", color="tab:red")
    ax1.fill_between(df["t_min"], df["income"], df["spend"],
                     where=df["income"] >= df["spend"], interpolate=True,
                     color="tab:green", alpha=0.15, label="surplus")
    ax1.fill_between(df["t_min"], df["income"], df["spend"],
                     where=df["income"] < df["spend"], interpolate=True,
                     color="tab:red", alpha=0.15, label="drawing down reserves")
    ax1.axhline(0, color="grey", linewidth=0.8)
    ax1.set_title("Oil income vs expenditure")
    ax1.set_ylabel("power / min")
    ax1.legend(loc="upper left", fontsize=8)

    # ---- 2. Power stocks & the derricks behind the income ----
    ax2.grid(**GRID)
    ax2.plot(df["t_min"], df["banked"], label="banked power", color="tab:blue")
    ax2.plot(df["t_min"], df["unmet"], label="unmet demand", color="tab:orange")
    ax2.set_title("Banked power & unmet demand, against the derricks earning")
    ax2.set_ylabel("power")
    ax2.legend(loc="upper left", fontsize=8)

    ax2_derricks = ax2.twinx()
    ax2_derricks.plot(df["t_min"], df["connected"], label="connected derricks",
                      color="tab:purple", linestyle="--", drawstyle="steps-post")
    ax2_derricks.plot(df["t_min"], df["idle"], label="idle derricks",
                      color="tab:brown", linestyle=":", drawstyle="steps-post")
    ax2_derricks.set_ylabel("derricks")
    ax2_derricks.legend(loc="upper right", fontsize=8)

    # ---- 3. Sufficiency & the caps it drives ----
    ax3.grid(**GRID)
    ax3.plot(df["t_min"], df["sufficiency"], label="oil sufficiency", color="black", linewidth=2)
    ax3.plot(df["t_min"], df["share"], label="oil share score", color="tab:green", alpha=0.6)
    ax3.plot(df["t_min"], df["budget"], label="power budget score", color="tab:red", alpha=0.6)
    ax3.plot(df["t_min"], df["surplus"], label="surplus bonus", color="tab:blue", alpha=0.6)
    ax3.set_ylim(-0.05, 1.05)
    ax3.set_title("Oil sufficiency (and its terms) vs the structure caps it sets")
    ax3.set_xlabel("game time (minutes)")
    ax3.set_ylabel("score (0 - 1)")
    ax3.legend(loc="upper left", fontsize=8)

    ax3_caps = ax3.twinx()
    ax3_caps.plot(df["t_min"], df["factories"], label="factory cap",
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
    print(f"  mean income        {df['income'].mean():8.1f} power/min  (peak {df['income'].max():.1f})")
    print(f"  mean expenditure   {df['spend'].mean():8.1f} power/min  (peak {df['spend'].max():.1f})")
    print(f"  mean banked power  {df['banked'].mean():8.1f}            (peak {df['banked'].max():.0f})")
    print(f"  mean sufficiency   {df['sufficiency'].mean():8.3f}            "
          f"(range {df['sufficiency'].min():.2f} - {df['sufficiency'].max():.2f})")

    # A job waiting on power means the base is outspending its income; an idle derrick means FishBot captured
    # oil it has no generator capacity to earn through, which is a build order problem rather than an oil one.
    waiting_pct = (df["unmet"] > 0).mean() * 100
    idle_pct = (df["idle"] > 0).mean() * 100
    print(f"  samples with jobs waiting on power:      {waiting_pct:.0f}%")
    print(f"  samples with idle (unconnected) derricks: {idle_pct:.0f}%")


def find_default_log() -> Path:
    """Picks the newest `.log` sitting next to this script, so the file can just be run from an IDE."""
    logs = sorted(SCRIPT_DIR.glob("*.log"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not logs:
        raise SystemExit(
            f"No .log file found in {SCRIPT_DIR}.\n"
            f"Capture one by redirecting the game's stderr (see the docstring at the top of this file), "
            f"then drop it in that folder or pass its path as an argument."
        )
    return logs[0]


def main() -> None:
    parser = argparse.ArgumentParser(description="Plot FishBot's oil income & expenditure from a captured game log.")
    parser.add_argument("logfile", nargs="?", type=Path, default=None,
                        help="captured game log (default: the newest .log next to this script)")
    parser.add_argument("--player", type=int, default=None,
                        help="only plot this FishBot's player ID (default: every FishBot in the log)")
    parser.add_argument("--save-dir", type=Path, default=None,
                        help="write the figures here as PNGs instead of opening a window")
    args = parser.parse_args()

    logfile = args.logfile or find_default_log()
    print(f"Reading {logfile}")

    df = parse_telemetry(logfile)
    if df.empty:
        raise SystemExit(
            f"No OIL_TELEMETRY lines in {logfile}.\n"
            f"Check that DEBUG_MODE_ON is set in FishBot_vX_Y_Z.js, and that the capture includes stderr."
        )

    players = [args.player] if args.player is not None else sorted(df["player"].unique())

    for player in players:
        player_df = df[df["player"] == player]
        if player_df.empty:
            print(f"No telemetry for player {player}; skipping.", file=sys.stderr)
            continue

        print_summary(player_df, player)
        fig = plot_oil_economy(player_df, player, suptitle=f"FishBot {player}: oil economy ({logfile.name})")

        if args.save_dir is not None:
            args.save_dir.mkdir(parents=True, exist_ok=True)
            out = args.save_dir / f"oil_economy_player{player}.png"
            fig.savefig(out, dpi=130)
            print(f"  saved {out}")

    if args.save_dir is None:
        plt.show()


if __name__ == "__main__":
    main()
