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
The purpose of this file is to run the oil-capture metrics over a console log saved by hand, rather
than over a full batch test.

`run_telemetry_parser.py` reads the `.tel.jsonl` sidecar files produced by a batch test run. This
script is the manual equivalent: point it at a saved game console log (e.g. exported from the
Warzone 2100 console with "Export text", or copy-pasted out of the IDE console) and it reports the
same metrics for that single game.

Useful for:
    - checking a one-off game you ran by hand or watched in spectator mode,
    - re-analysing an old log after the metrics change,
    - sanity-checking telemetry output without waiting for a batch run.

Set `target` in `main()` to the log (or folder of logs) you want, then just run this file (e.g. F5 in the IDE).

Anything that is not a `TEL|...` line is ignored, so the raw console log can be pasted in as-is -
Warzone's own `info |...` lines, FishBot's `deb()` output and the Game State table are all skipped.
"""

import _telemetry
import run_telemetry_parser as tp
from run_result_parser import make_bar

from pathlib import Path
import sys


LOG_FILE_SUFFIXES = (".txt", ".log")


def read_console_log(log_path: Path) -> list[str]:
    """
    Reads a saved console log into the same list-of-lines shape the live console scraper produces.

    Decoded leniently: exported console logs often contain stray bytes from the game's own output,
    and one bad byte should not cost the whole log.
    """
    text = log_path.read_text(encoding="utf-8", errors="replace")

    return text.splitlines()


def parse_log_file(log_path: Path) -> tuple[list[dict], dict | None]:
    """Extracts telemetry events from one console log and computes its metrics."""

    events = _telemetry.extract_telemetry_events(read_console_log(log_path))

    metrics = {}

    for extractor in tp.EVENT_EXTRACTORS.values():
        extracted = extractor(events)
        if extracted:
            metrics.update(extracted)

    return events, (metrics or None)


def format_game_length(seconds: float) -> str:
    return f"{seconds:,.0f} s ({int(seconds // 60):02d}:{int(seconds % 60):02d})"


def print_metrics(label: str, events: list[dict], metrics: dict) -> None:

    event_counts = {}
    for event in events:
        event_counts[event["event"]] = event_counts.get(event["event"], 0) + 1

    counts_text = ", ".join(f"{count} {name}" for name, count in sorted(event_counts.items()))

    optional = lambda value: "  n/a" if value is None else f"{value:>5.2f}"

    print("-" * 25)
    print(label)
    print()
    if events:      # omitted for an aggregate row, which has no single event stream
        print(f"  events           {counts_text}")
    print(f"  game length      {format_game_length(metrics['game_length_s'])}")
    print()
    print(f"  fair share       {metrics['mean_fair_share']:>5.2f}  [{make_bar(min(metrics['mean_fair_share'] / 2.0, 1.0))}]"
          f"   contested only: {metrics['mean_fair_share_contested']:.2f}")
    print(f"  oil share        {metrics['mean_oil_share']:>5.2f}  [{make_bar(metrics['mean_oil_share'])}]")
    print(f"  free oil         {metrics['mean_unclaimed_share']:>5.2f}  [{make_bar(metrics['mean_unclaimed_share'])}]")
    print()
    print(f"  peak / final     {metrics['peak_oil_share']:>5.2f} /{metrics['final_oil_share']:>6.2f}")
    print(f"  @5min / @10min   {optional(metrics['share@5min'])} /{optional(metrics['share@10min']):>6}")

    # Commitment telemetry is only present in logs from a bot emitting OILCMT/OILRES.
    if "commitments" in metrics:
        rate = metrics["conversion_rate"]
        print()
        print(f"  truck commitments{metrics['commitments']:>5}"
              f"   converted {metrics['commitments_converted']}"
              f", failed {metrics['commitments_failed']}"
              f", aborted {metrics['commitments_aborted']}"
              f", unresolved {metrics['commitments_unresolved']}")
        print(f"  conversion rate  {rate:>5.2f}  [{make_bar(rate)}]")

        if metrics["mean_conversion_time_s"] is not None:
            print(f"  mean time to build {metrics['mean_conversion_time_s']:>3.0f} s")

        reasons = metrics.get("failure_reasons") or {}
        if reasons:
            breakdown = ", ".join(f"{name} {count}" for name, count in sorted(reasons.items()))
            print(f"  failure reasons  {breakdown}")

        near, far = metrics["mean_distance_converted"], metrics["mean_distance_lost"]
        if near is not None and far is not None:
            # Only call out a distance problem when the failures really are further away.
            hint = "   <- lost much further: unrealistic targets" if far > near * 1.5 else ""
            print(f"  mean distance    {near:>5.1f} converted vs {far:.1f} lost{hint}")

    if "derricks_lost_own" in metrics:
        print()
        print(f"  derricks lost    {metrics['derricks_lost_own']:>5} own"
              f", {metrics['derricks_lost_enemy']} enemy")
        if metrics["mean_held_time_s"] is not None:
            print(f"  mean held time   {metrics['mean_held_time_s']:>5.0f} s before being destroyed")

    # Force telemetry is only present in logs from a bot emitting BRIG.
    if "mean_total_strength" in metrics:
        print()
        print(f"  brigade strength {metrics['mean_total_strength']:>5.1f}"
              f"   peak {metrics['peak_total_strength']:.1f}"
              f", {metrics['mean_total_units']:.1f} units total")
        print(f"  brigades fielded {metrics['mean_brigades_fielded']:>5.1f}"
              f"   spread {metrics['mean_brigade_dispersion']:.1f} tiles between force centres")

        # Only present from the build that reports the whole army, not just the brigaded part.
        if "mean_army_strength" in metrics:
            print(f"  whole army       {metrics['mean_army_strength']:>5.1f}"
                  f"   peak {metrics['peak_army_strength']:.1f}"
                  f", {metrics['mean_army_units']:.1f} units total")
            print(f"  uncommitted      {metrics['mean_uncommitted_strength']:>5.1f}"
                  f"   direct-fire units owned but not in a commanded brigade")

        # Opponent telemetry is only present when the bot ran with TEL_INSTRUMENT_OPPONENTS on.
        if "mean_strength_ratio" in metrics:
            ratio = metrics["mean_strength_ratio"]
            print(f"  enemy strength   {metrics['mean_opponent_strength']:>5.1f}"
                  f"   peak {metrics['peak_opponent_strength']:.1f}"
                  f", {metrics['mean_opponent_units']:.1f} units total")
            print(f"  strength ratio   {ratio:>5.2f}  [{make_bar(min(ratio / 2.0, 1.0))}]"
                  f"   (above 1.00 means FishBot out-massed the opposition)")
            print(f"  forces apart     {metrics['mean_engagement_distance']:>5.1f} tiles"
                  f" between force centres")

    if metrics["truncated"]:
        print()
        print(f"  WARNING: the first sample arrives late, so early telemetry is missing from this log.")

    print()


def collect_log_paths(target: Path) -> list[Path]:
    """A single file, or every log file inside a folder (each treated as one game)."""

    if target.is_dir():
        return sorted(
            path for path in target.iterdir()
            if path.is_file() and path.suffix.lower() in LOG_FILE_SUFFIXES
        )

    return [target]


def plot_derricks(series: dict, label: str) -> None:
    """
    Plots derricks owned per player over time, from the lists built by `extract_derrick_series`.

    matplotlib is imported here rather than at module level so that the metrics still print if it
    is not installed.
    """
    import matplotlib.pyplot as plt

    SECONDS_PER_MINUTE = 60

    minutes = [seconds / SECONDS_PER_MINUTE for seconds in series["times_s"]]
    fishbot_player_id = series["fishbot_player_id"]

    figure, axes = plt.subplots(figsize=(10, 6))

    for player_id, derrick_counts in series["by_player"].items():
        is_fishbot = (player_id == fishbot_player_id)
        axes.plot(
            minutes,
            derrick_counts,
            label=f"Player {player_id} (FishBot)" if is_fishbot else f"Player {player_id} (opponent)",
            linewidth=2.5 if is_fishbot else 1.5,
        )

    # Reference lines: the map's capacity, and how much of it nobody has taken.
    axes.plot(minutes, series["total_on_map"], linestyle="--", color="grey", linewidth=1,
              label="Total derrick positions on map")
    axes.plot(minutes, series["unclaimed"], linestyle=":", color="grey", linewidth=1.5,
              label="Unclaimed (free oil)")

    axes.grid(color="grey", linestyle="-", linewidth=0.4, alpha=0.3)
    axes.set_xlabel("Game time (minutes)")
    axes.set_ylabel("Derricks owned")
    axes.set_xlim(left=0)
    axes.set_ylim(bottom=0)
    # Outside the axes: the interesting early-game expansion race sits top-left, under a normal legend.
    axes.legend(loc="upper left", bbox_to_anchor=(1.01, 1.0), borderaxespad=0)

    figure.suptitle(label)
    figure.tight_layout()


def use_utf8_output() -> None:
    """
    The bar charts use block-drawing characters, which the default Windows console codepage (cp1252)
    cannot encode - so printing them fails when stdout is not already UTF-8 (e.g. plain cmd.exe, or
    when the output is piped to a file). Harmless if the stream is UTF-8 already, as in most IDEs.
    """
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass


def main() -> None:

    use_utf8_output()

    # The log to score: a saved game console log, or a folder of them. Edit this and run the file.
    target = Path.cwd() / "telemetry_log.txt"
    SHOW_PLOT = True        # plot derricks-per-player over time

    print()
    print("OIL CAPTURE TELEMETRY - manual log parser")
    print()

    if not target.exists():
        print(f"\nNot found: {target.resolve()}")
        return

    log_paths = collect_log_paths(target)

    if not log_paths:
        print(f"\nNo {' / '.join(LOG_FILE_SUFFIXES)} files found in: {target.resolve()}")
        return

    print()

    parsed = []

    for log_path in log_paths:

        events, metrics = parse_log_file(log_path)

        if metrics is None:
            print(log_path.name)
            print()
            print(f"  No telemetry found in this log.")
            print(f"  Was `DEBUG_MODE_ON` set to `true` in the FishBot copy which produced it?")
            print()
            continue

        print_metrics(log_path.name, events, metrics)
        parsed.append((log_path, events, metrics))

    if not parsed:
        return

    if len(parsed) > 1:
        averaged = tp._average_metrics([metrics for _, _, metrics in parsed])
        print_metrics(f"AVERAGE OF {len(parsed)} LOGS", [], {**averaged, "game_length_s": averaged["game_length_s"]})

    if SHOW_PLOT:
        import matplotlib.pyplot as plt

        for log_path, events, _ in parsed:
            series = tp.extract_derrick_series(events)
            if series is not None:
                plot_derricks(series, log_path.name)

        plt.show()


if __name__ == "__main__":
    main()
