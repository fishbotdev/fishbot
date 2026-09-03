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
The purpose of this file is to turn FishBot's telemetry into a score for *how well it played*, as
opposed to `run_result_parser.py` which only reports whether it survived.

This file deliberately mirrors the structure of `run_result_parser.py` (parse one test -> parse all
tests -> group by map -> print), and reuses its bar-chart helper, so that the two reports read the
same way.

--- ADDING NEW TELEMETRY ---

Metrics are computed from the event stream, dispatched on the event name via `EVENT_EXTRACTORS`.
Adding e.g. map-control telemetry means:
    1. adding an emit method in `_telemetry.js` and a call site in `hq_command.js`, then
    2. adding one entry to `EVENT_EXTRACTORS` here.
Nothing in the wire format, the harvesting step, or the storage format has to change.

--- THE OIL METRICS ---

FishBot's economy is derrick-count share (see `hq_command.js`, "Oil parameters"), so oil capture is
measured directly from the derrick counts which the strategic layer used.

Two headline numbers:

  `mean_fair_share`
        Time-weighted mean of (my derricks / derricks-per-player-at-an-even-split). This is
        FishBot's own notion of oil share - 1.0 means it holds exactly its fair share, above 1.0
        means it is out-capturing its opponents.

  `mean_oil_share`
        Time-weighted mean of (my derricks / total derricks on the map). A plain [0, 1] fraction,
        independent of how many players are alive.

Both are *time-weighted*: each sample counts for the time until the next sample, so an uneven
sampling cadence (FishBot's scheduler picks time slots by hash, so samples are only statistically
evenly spaced) does not bias the result.

Note on `mean_fair_share` in duels: once the opponent is knocked out, the even-split denominator
collapses to the whole map, so the ratio *drops* at the moment FishBot wins. `mean_fair_share_contested`
is the same average restricted to the period where more than one player was alive, and is therefore
the better measure of capture skill in a duel.

--- THE FORCE METRICS ---

FishBot fights with brigades (`hq_command.js`, `BRIGADE_DESIGNATIONS`), so its military position is
measured from the strength and force centre which the strategic layer itself acted on.

  `mean_total_strength`
        Time-weighted mean of the summed brigade strength. `strength` is smoothed and counts only
        direct-fire units (see `_telemetry.js`), so it is what FishBot *believes* it can fight with,
        not a raw headcount - `mean_total_units` is the raw headcount beside it.

  `mean_brigades_fielded`
        Time-weighted mean number of brigades that actually held units. Brigades with no units are
        designations rather than forces, and are excluded from the spread below.

  `mean_brigade_dispersion`
        Time-weighted mean distance, in tiles, between every pair of fielded force centres. Low
        means the brigades are fighting as one mass, high means they are split across the map.
        Read it against the win rate: losses at high dispersion suggest defeat in detail.

With `TEL_INSTRUMENT_OPPONENTS` on in `_telemetry.js`, the opposition is sampled on the same tick and
the game can be read as a contest:

  `mean_strength_ratio`
        Time-weighted mean of (own strength / opposition strength). `1.00` means the two sides were
        evenly matched; below it FishBot was fighting outnumbered. Samples where the opposition held
        nothing are skipped rather than counted as an infinite ratio.

  `mean_engagement_distance`
        Time-weighted mean distance, in tiles, between the two sides' force centres. Read it with the
        ratio: a good ratio at a large distance means FishBot massed an army it never brought to bear.

In an FFA every living opponent is summed into one "the opposition", so both mean the same thing in
a duel and in a free-for-all.
"""

import math

import _telemetry
from run_result_parser import make_bar, read_json

import pandas as pd
from pathlib import Path
from collections import defaultdict


# A sample is treated as "late" (i.e. earlier telemetry was lost) if the first one arrives well after
# the game began. FishBot samples roughly every 10 s, so this is a generous multiple of that.
EXPECTED_FIRST_SAMPLE_MS = 60_000

MS_PER_SECOND = 1000

# Fixed game-time checkpoints reported alongside the time-weighted means, to show capture *speed*.
CHECKPOINTS_MS = [5 * 60_000, 10 * 60_000]


def _sample_durations(sample_times_ms: list[int], end_time_ms: int) -> list[int]:
    """
    How long each sample stood for: the gap to the next sample, or to the end of the game for the last.

    Durations are derived from the *full* sample timeline, so that a metric computed over a subset of
    samples (e.g. only the contested part of a duel) still weights each of its samples by the time it
    actually stood, rather than stretching its final sample to the end of the game.
    """

    durations = []

    for index, time_ms in enumerate(sample_times_ms):
        next_time_ms = sample_times_ms[index + 1] if (index + 1) < len(sample_times_ms) else end_time_ms
        durations.append(max(next_time_ms - time_ms, 0))

    return durations


def _time_weighted_mean(samples: list[tuple[int, float]]) -> float:
    """Averages a (duration_ms, value) series, weighting each value by how long it stood."""

    if not samples:
        return 0.0

    total_weight = sum(duration for duration, _ in samples)

    if total_weight == 0:
        # Degenerate case: a single sample, or every sample at the same instant. Fall back to a plain mean.
        return sum(value for _, value in samples) / len(samples)

    return sum(value * duration for duration, value in samples) / total_weight


def _value_at(samples: list[tuple[int, float]], time_ms: int, end_time_ms: int) -> float | None:
    """
    Value in effect at `time_ms`, or None if the game never reached that point.

    Returning None (rather than the last known value) matters: a game which ended after 40 s has no
    "share at 5 minutes", and reporting its final share there would overstate early capture speed.
    """

    if time_ms > end_time_ms:
        return None

    value_at_time = None

    for sample_time_ms, value in samples:
        if sample_time_ms > time_ms:
            break
        value_at_time = value

    return value_at_time


def extract_oil_metrics(events: list[dict]) -> dict | None:
    """
    Computes the oil-capture metrics for a single match from its `OIL` events.

    Each `OIL` event carries the derrick counts which FishBot's strategic layer used:
        t     game time (ms)
        p     FishBot's player ID
        tot   total derrick positions on the map
        dpp   derricks per player at an even split between living players
        alive living player IDs
        der   derricks held, aligned to `alive`
    """

    oil_events = [e for e in events if e.get("event") == "OIL"]

    if not oil_events:
        return None

    oil_events.sort(key=lambda e: e["t"])

    # The game end time, so the last sample can be weighted. Falls back to the last sample itself if
    # the END event is missing (e.g. the game was cut short).
    end_events = [e for e in events if e.get("event") == "END"]
    end_time_ms = max(e["t"] for e in end_events) if end_events else oil_events[-1]["t"]
    end_time_ms = max(end_time_ms, oil_events[-1]["t"])

    # How long each sample stood for. Derived once from the full timeline so that every metric below
    # weights its samples by real elapsed time, even when it only uses some of them.
    durations = _sample_durations([e["t"] for e in oil_events], end_time_ms)

    fair_share_samples = []
    contested_fair_share_samples = []
    oil_share_samples = []
    unclaimed_share_samples = []

    # Kept as (game_time, value) for the fixed checkpoints, which need the time rather than a duration.
    oil_share_series = []

    for index, event in enumerate(oil_events):

        duration = durations[index]
        total_derricks = event["tot"]
        derricks_per_player = event["dpp"]
        living_players = event["alive"]
        derricks = event["der"]
        me = event["p"]

        if total_derricks <= 0 or me not in living_players:
            # FishBot is dead (or the map reports no oil); it holds no oil from here on.
            my_derricks = 0
        else:
            my_derricks = derricks[living_players.index(me)]

        time_ms = event["t"]

        if derricks_per_player > 0:
            fair_share = my_derricks / derricks_per_player
            fair_share_samples.append((duration, fair_share))

            # Once only one player is left the even-split denominator collapses to the whole map, so
            # the ratio drops at the moment FishBot wins. Track the contested period separately.
            if len(living_players) > 1:
                contested_fair_share_samples.append((duration, fair_share))

        if total_derricks > 0:
            oil_share = my_derricks / total_derricks
            oil_share_samples.append((duration, oil_share))
            oil_share_series.append((time_ms, oil_share))
            unclaimed_share_samples.append(
                (duration, max(total_derricks - sum(derricks), 0) / total_derricks)
            )

    oil_share_values = [value for _, value in oil_share_samples]

    metrics = {
        "mean_fair_share": _time_weighted_mean(fair_share_samples),
        "mean_fair_share_contested": _time_weighted_mean(contested_fair_share_samples),
        "mean_oil_share": _time_weighted_mean(oil_share_samples),
        "mean_unclaimed_share": _time_weighted_mean(unclaimed_share_samples),
        "peak_oil_share": max(oil_share_values) if oil_share_values else 0.0,
        "final_oil_share": oil_share_values[-1] if oil_share_values else 0.0,
        "game_length_s": end_time_ms / MS_PER_SECOND,

        # Set if the earliest sample arrived late, which means telemetry was lost (most likely the
        # console scrollback overflowed). Reported rather than silently averaged over.
        # Cast to a plain bool: pandas hands back numpy scalars, which are not `bool` instances.
        "truncated": bool(oil_events[0]["t"] > EXPECTED_FIRST_SAMPLE_MS),
    }

    for checkpoint_ms in CHECKPOINTS_MS:
        key = f"share@{checkpoint_ms // 60_000}min"
        metrics[key] = _value_at(oil_share_series, checkpoint_ms, end_time_ms)

    return metrics


def extract_commitment_metrics(events: list[dict]) -> dict | None:
    """
    Measures how reliably FishBot turns a decision to capture a derrick into an actual derrick.

    Pairs each `OILCMT` (trucks committed) with its `OILRES` (how it ended) on the correlation id `c`.
    Without this pair, persistent free oil is ambiguous - trucks may have been sent and failed, or
    nothing may have been sent at all.

    An unresolved commitment is one still in flight when the game ended; it is reported separately
    rather than counted as a failure.
    """

    commitments = {e["c"]: e for e in events if e.get("event") == "OILCMT"}

    if not commitments:
        return None

    resolutions = {e["c"]: e for e in events if e.get("event") == "OILRES"}

    outcomes = {"ok": 0, "fail": 0, "abort": 0}
    failure_reasons = {}
    conversion_times_s = []
    distances_converted = []
    distances_lost = []

    for commitment_id, commitment in commitments.items():

        resolution = resolutions.get(commitment_id)

        if resolution is None:
            continue

        outcome = resolution["out"]
        outcomes[outcome] = outcomes.get(outcome, 0) + 1

        if outcome != "ok":
            reason = resolution.get("why") or "unknown"
            failure_reasons[reason] = failure_reasons.get(reason, 0) + 1

        if outcome == "ok":
            conversion_times_s.append((resolution["t"] - commitment["t"]) / MS_PER_SECOND)
            distances_converted.append(commitment["d"])
        else:
            distances_lost.append(commitment["d"])

    resolved = sum(outcomes.values())

    mean = lambda values: (sum(values) / len(values)) if values else None

    return {
        "commitments": len(commitments),
        "commitments_unresolved": len(commitments) - resolved,
        "conversion_rate": (outcomes["ok"] / resolved) if resolved else 0.0,
        "commitments_converted": outcomes["ok"],
        "commitments_failed": outcomes["fail"],
        "commitments_aborted": outcomes["abort"],
        "mean_conversion_time_s": mean(conversion_times_s),

        # Why commitments failed. Losing the trucks also costs the production time to replace them,
        # whereas being beaten to the derrick costs only the walk.
        "failure_reasons": failure_reasons,

        # A commitment that fails from further away suggests the target was unrealistic to begin with,
        # rather than the execution being at fault.
        "mean_distance_converted": mean(distances_converted),
        "mean_distance_lost": mean(distances_lost),
    }


def extract_loss_metrics(events: list[dict]) -> dict | None:
    """
    Locates derrick losses, rather than only counting them.

    `OILLOST` carries the owner and the tile, so a loss can be placed on the map. Losses that cluster
    far from base and shortly after a capture are the signature of taking ground that cannot be held.
    """

    losses = [e for e in events if e.get("event") == "OILLOST"]

    if not losses:
        return None

    me = losses[0]["p"]

    own = [e for e in losses if e["o"] == me]
    enemy = [e for e in losses if e["o"] != me]

    # Pair each of FishBot's losses with the most recent commitment to that tile, to see how long a
    # captured derrick survived before it was destroyed.
    commitments = sorted((e for e in events if e.get("event") == "OILCMT"), key=lambda e: e["t"])
    held_times_s = []

    for loss in own:
        prior = [c for c in commitments if c["t"] <= loss["t"] and c["x"] == loss["x"] and c["y"] == loss["y"]]
        if prior:
            held_times_s.append((loss["t"] - prior[-1]["t"]) / MS_PER_SECOND)

    return {
        "derricks_lost_own": len(own),
        "derricks_lost_enemy": len(enemy),
        "mean_held_time_s": (sum(held_times_s) / len(held_times_s)) if held_times_s else None,
    }


def extract_derrick_series(events: list[dict]) -> dict | None:
    """
    Builds the per-player derrick-count time series from a match's `OIL` events.

    Kept separate from `EVENT_EXTRACTORS` (which produce single-number metrics that get averaged
    across matches) because this returns series rather than scalars. The output is plain lists, so
    that plotting code can consume it without this module depending on matplotlib.

    A player who disappears from `alive` has been eliminated, and is recorded as holding 0 derricks
    from that point rather than being left with a gap.

    Returns
    -------
    dict | None
        {
            "times_s":            [float, ...]        game time of each sample, in seconds
            "by_player":          {player_id: [int, ...]}
            "total_on_map":       [int, ...]          derrick positions on the map (constant)
            "unclaimed":          [int, ...]          derricks nobody holds
            "fishbot_player_id":  int
        }
    """

    oil_events = [e for e in events if e.get("event") == "OIL"]

    if not oil_events:
        return None

    oil_events.sort(key=lambda e: e["t"])

    players = sorted({int(player_id) for e in oil_events for player_id in e["alive"]})

    by_player = {player_id: [] for player_id in players}
    total_on_map = []
    unclaimed = []

    for event in oil_events:

        held = {int(player_id): count for player_id, count in zip(event["alive"], event["der"])}

        for player_id in players:
            by_player[player_id].append(held.get(player_id, 0))      # absent => eliminated

        total_on_map.append(int(event["tot"]))
        unclaimed.append(max(int(event["tot"]) - sum(event["der"]), 0))

    return {
        "times_s": [event["t"] / MS_PER_SECOND for event in oil_events],
        "by_player": by_player,
        "total_on_map": total_on_map,
        "unclaimed": unclaimed,
        "fishbot_player_id": int(oil_events[0]["p"]),
    }


def _mean_pairwise_distance(positions: list[tuple[float, float]]) -> float:
    """
    Mean distance in tiles between every pair of force centres.

    This is the concentration measure: 0 with fewer than two brigades in the field, small when the
    brigades are stacked, large when they are spread across the map.
    """

    if len(positions) < 2:
        return 0.0

    distances = [
        math.hypot(positions[i][0] - positions[j][0], positions[i][1] - positions[j][1])
        for i in range(len(positions))
        for j in range(i + 1, len(positions))
    ]

    return sum(distances) / len(distances)


def _subject_player(event: dict) -> int:
    """
    Which player a `BRIG` sample describes, as opposed to `p`, which is always the bot that emitted it.

    `o` arrived with opponent instrumentation, so a log recorded before that (or one recorded with
    `TEL_INSTRUMENT_OPPONENTS` off) carries own-force samples only: a missing `o` means the emitter.
    """

    subject = event.get("o")

    # None when no row in the file has the key; NaN when only some do, since the frame is a union of
    # every event's columns.
    if subject is None or subject != subject:
        return event["p"]

    return int(subject)


def _centroid(positions: list[tuple[float, float]]) -> tuple[float, float]:
    return (
        sum(x for x, _ in positions) / len(positions),
        sum(y for _, y in positions) / len(positions),
    )


def _fielded_positions(rows: list[dict]) -> list[tuple[float, float]]:
    """
    Positions of the forces in `rows` which actually held units.

    A force with no units has no meaningful position (`_telemetry.js` emits 0,0 for it), so it is
    dropped here rather than being counted or plotted.
    """

    return [
        (x, y)
        for row in rows
        for x, y, count in zip(row["x"], row["y"], row["n"])
        if count > 0
    ]


def extract_brigade_metrics(events: list[dict]) -> dict | None:
    """
    Computes the force metrics for a single match from its `BRIG` events.

    Each `BRIG` event is one force sample of one player, carried as parallel arrays:
        t  game time (ms)
        p  the player that emitted the line (always FishBot)
        o  the player the sample describes; `o == p` is FishBot's own force
        b  brigade IDs, or `[TEL_WHOLE_ARMY]` for an opponent, which has no brigade structure
        s  strength - direct-fire units, smoothed for FishBot's own and raw for an opponent
        n  every unit in the force, aligned to `b`
        x  force centre x, aligned to `b`
        y  force centre y, aligned to `b`

    FishBot and its opponents are sampled on the same tick, so samples are grouped by time before
    being weighted - otherwise the opponent row would hand the row beside it a zero-length duration.

    Like the oil metrics, the averages are time-weighted, so an uneven sampling cadence does not
    bias them.
    """

    brigade_events = [e for e in events if e.get("event") == "BRIG"]

    if not brigade_events:
        return None

    samples_by_time = defaultdict(list)

    for event in brigade_events:
        samples_by_time[event["t"]].append(event)

    sample_times = sorted(samples_by_time)

    end_events = [e for e in events if e.get("event") == "END"]
    end_time_ms = max(e["t"] for e in end_events) if end_events else sample_times[-1]
    end_time_ms = max(end_time_ms, sample_times[-1])

    durations = _sample_durations(sample_times, end_time_ms)

    own_strength_samples = []
    own_unit_samples = []
    fielded_samples = []
    dispersion_samples = []

    opponent_strength_samples = []
    opponent_unit_samples = []
    strength_ratio_samples = []
    engagement_samples = []

    saw_opponent = False

    for index, time_ms in enumerate(sample_times):

        duration = durations[index]
        rows = samples_by_time[time_ms]

        own_rows = [r for r in rows if _subject_player(r) == r["p"]]
        opponent_rows = [r for r in rows if _subject_player(r) != r["p"]]

        own_strength = sum(sum(r["s"]) for r in own_rows)
        own_positions = _fielded_positions(own_rows)

        own_strength_samples.append((duration, float(own_strength)))
        own_unit_samples.append((duration, float(sum(sum(r["n"]) for r in own_rows))))
        fielded_samples.append((duration, float(len(own_positions))))
        dispersion_samples.append((duration, _mean_pairwise_distance(own_positions)))

        if not opponent_rows:
            continue

        # Every living opponent is summed into one "the opposition" figure, so the metric means the
        # same thing in a duel and in an FFA.
        saw_opponent = True
        opponent_strength = sum(sum(r["s"]) for r in opponent_rows)
        opponent_positions = _fielded_positions(opponent_rows)

        opponent_strength_samples.append((duration, float(opponent_strength)))
        opponent_unit_samples.append((duration, float(sum(sum(r["n"]) for r in opponent_rows))))

        # Skipped rather than clamped when the opposition is wiped out: a ratio against nothing is
        # infinite, and averaging in a made-up number would flatter whatever came before it.
        if opponent_strength > 0:
            strength_ratio_samples.append((duration, own_strength / opponent_strength))

        if own_positions and opponent_positions:
            own_center = _centroid(own_positions)
            opponent_center = _centroid(opponent_positions)
            engagement_samples.append((
                duration,
                math.hypot(own_center[0] - opponent_center[0], own_center[1] - opponent_center[1]),
            ))

    own_strength_values = [value for _, value in own_strength_samples]

    metrics = {
        "mean_total_strength": _time_weighted_mean(own_strength_samples),
        "mean_total_units": _time_weighted_mean(own_unit_samples),
        "mean_brigades_fielded": _time_weighted_mean(fielded_samples),
        "mean_brigade_dispersion": _time_weighted_mean(dispersion_samples),
        "peak_total_strength": max(own_strength_values) if own_strength_values else 0.0,
    }

    # Only present when the bot under test had opponent instrumentation switched on, so a run without
    # it reports exactly the keys it always did.
    if saw_opponent:
        opponent_strength_values = [value for _, value in opponent_strength_samples]
        metrics.update({
            "mean_opponent_strength": _time_weighted_mean(opponent_strength_samples),
            "mean_opponent_units": _time_weighted_mean(opponent_unit_samples),
            "peak_opponent_strength": max(opponent_strength_values) if opponent_strength_values else 0.0,
            "mean_strength_ratio": _time_weighted_mean(strength_ratio_samples),
            "mean_engagement_distance": _time_weighted_mean(engagement_samples),
        })

    return metrics


# Dispatch table: event name -> function computing that event's metrics for one match.
# Add an entry here when a new telemetry event type is introduced (see the header).
EVENT_EXTRACTORS = {
    "OIL": extract_oil_metrics,
    "OILCMT": extract_commitment_metrics,
    "OILLOST": extract_loss_metrics,
    "BRIG": extract_brigade_metrics,
}


def parse_test_telemetry(telemetry_file_path: Path) -> dict | None:
    """
    Parses a single test's telemetry (.tel.jsonl), averaging the metrics across its matches.

    Returns None if the file holds no usable telemetry.
    """

    df = pd.read_json(telemetry_file_path, lines=True)

    if df.empty or "match_id" not in df.columns:
        return None

    per_match_metrics = []

    for _, match_df in df.groupby("match_id"):

        events = match_df.to_dict(orient="records")

        match_metrics = {}

        for extractor in EVENT_EXTRACTORS.values():
            extracted = extractor(events)
            if extracted:
                match_metrics.update(extracted)

        if match_metrics:
            per_match_metrics.append(match_metrics)

    if not per_match_metrics:
        return None

    return _average_metrics(per_match_metrics)


def _average_metrics(per_match_metrics: list[dict]) -> dict:
    """Averages each metric across matches. Booleans become "did this happen in any match?"."""

    averaged = {"matches": len(per_match_metrics)}

    for key in per_match_metrics[0].keys():

        values = [m[key] for m in per_match_metrics if m.get(key) is not None]

        if not values:
            averaged[key] = None
        elif isinstance(values[0], bool):
            averaged[key] = any(values)
            averaged[f"{key}_matches"] = sum(1 for value in values if value)
        elif isinstance(values[0], dict):
            # e.g. failure_reasons - totalled across matches rather than averaged.
            totals = {}
            for value in values:
                for name, count in value.items():
                    totals[name] = totals.get(name, 0) + count
            averaged[key] = totals
        else:
            averaged[key] = sum(values) / len(values)

    return averaged


def parse_all_telemetry(
    *,
    base_manifest: dict,
    test_results_folder: Path,
) -> list[dict]:
    """
    Parses telemetry for every test which produced any.

    Mirrors `run_result_parser.parse_all_results`, but reads the `.tel.jsonl` sidecar files.
    """

    parsed_tests = []

    for test_id, metadata in base_manifest["tests"].items():

        telemetry_file = test_results_folder / f"{test_id}.tel.jsonl"

        if not telemetry_file.exists() or telemetry_file.stat().st_size == 0:
            continue

        metrics = parse_test_telemetry(telemetry_file)

        if metrics is None:
            continue

        parsed_tests.append({
            "test_id": test_id,
            **metadata,
            **metrics,
        })

    return parsed_tests


def group_tests_by_map(parsed_tests: list[dict]) -> dict:
    """Groups parsed telemetry by map and test type."""

    grouped = defaultdict(
        lambda: {
            "duel": [],
            "ffa": [],
        }
    )

    for test in parsed_tests:
        grouped[test["map_name"]][test["test_type"]].append(test)

    for map_results in grouped.values():

        map_results["ffa"].sort(key=lambda t: t["fishbot_position"])

        map_results["duel"].sort(
            key=lambda t: (
                t["fishbot_position"],
                t["opponent_position"],
            )
        )

    return dict(grouped)


def _mean(tests: list[dict], key: str) -> float:
    values = [t[key] for t in tests if t.get(key) is not None]
    return sum(values) / len(values) if values else 0.0


def _total(tests: list[dict], key: str) -> int:
    """
    Recovers the true total of a count metric.

    `_average_metrics` divides every count by the number of matches in its test, so summing those
    averages across tests gives neither a total nor a mean. Multiplying back by `matches` first does.
    """
    total = sum(t[key] * t["matches"] for t in tests if t.get(key) is not None)
    return round(total)


def print_mode_summary(mode_name: str, tests: list[dict]) -> None:

    if not tests:
        return

    matches = sum(test["matches"] for test in tests)

    fair_share = _mean(tests, "mean_fair_share_contested")
    oil_share = _mean(tests, "mean_oil_share")
    unclaimed = _mean(tests, "mean_unclaimed_share")

    # `mean_fair_share_contested` is a ratio around 1.0, so the bar is scaled to a 0-2 range.
    print(
        f"{mode_name:<5}"
        f"{matches:>4} games  "
        f"fair share {fair_share:>4.2f}  "
        f"[{make_bar(min(fair_share / 2.0, 1.0))}]"
    )

    print(
        f"     "
        f"           "
        f"oil share  {oil_share:>4.2f}  "
        f"[{make_bar(oil_share)}]"
    )

    print(
        f"     "
        f"           "
        f"free oil   {unclaimed:>4.2f}   "
        f"peak {_mean(tests, 'peak_oil_share'):.2f}"
        f"   @5min {_mean(tests, 'share@5min'):.2f}"
        f"   @10min {_mean(tests, 'share@10min'):.2f}"
    )

    # Only present once the bot under test emits commitment telemetry.
    if any("conversion_rate" in test for test in tests):

        # Counted over every game, so the rate is the raw ratio of the two numbers printed beside it.
        # Unresolved commitments were still in flight at the final whistle, and are neither converted
        # nor failed, so they are excluded from the rate and reported separately.
        converted = _total(tests, "commitments_converted")
        failed = _total(tests, "commitments_failed")
        aborted = _total(tests, "commitments_aborted")
        unresolved = _total(tests, "commitments_unresolved")

        resolved = converted + failed + aborted
        rate = (converted / resolved) if resolved else 0.0

        print(
            f"     "
            f"           "
            f"conversion {rate:>4.2f}  "
            f"[{make_bar(rate)}]"
            f"   {converted} built / {resolved} resolved"
            f"   ({failed} failed, {aborted} aborted, {unresolved} unfinished)"
        )

    # Only present once the bot under test emits force telemetry.
    if any("mean_total_strength" in test for test in tests):

        strength = _mean(tests, "mean_total_strength")
        units = _mean(tests, "mean_total_units")
        fielded = _mean(tests, "mean_brigades_fielded")
        dispersion = _mean(tests, "mean_brigade_dispersion")

        print(
            f"     "
            f"           "
            f"strength  {strength:>5.1f}   "
            f"peak {_mean(tests, 'peak_total_strength'):.1f}"
            f"   units {units:.1f}"
        )

        print(
            f"     "
            f"           "
            f"brigades  {fielded:>5.1f}   "
            f"spread {dispersion:.1f} tiles"
        )

        # Only present when the bot under test also instrumented its opponents.
        if any("mean_strength_ratio" in test for test in tests):

            ratio = _mean(tests, "mean_strength_ratio")

            print(
                f"     "
                f"           "
                f"vs enemy  {ratio:>5.2f}   "
                f"[{make_bar(min(ratio / 2.0, 1.0))}]"
                f"   {strength:.1f} vs {_mean(tests, 'mean_opponent_strength'):.1f}"
                f"   {_mean(tests, 'mean_engagement_distance'):.0f} tiles apart"
            )

    worst = min(tests, key=lambda t: t["mean_fair_share_contested"] or 0.0)
    worst_fair_share = worst["mean_fair_share_contested"] or 0.0

    print(
        f"  Worst "
        f"fair share {worst_fair_share:>4.2f}  "
        f"{worst['config_file']}"
    )

    truncated_matches = sum(test.get("truncated_matches", 0) for test in tests)

    if truncated_matches:
        print(
            f"  WARNING: {truncated_matches} of {matches} games lost early telemetry "
            f"(console buffer overflowed - these games bias every metric above)"
        )


def print_map_summary(grouped_results: dict[str, dict]) -> None:

    #
    # Sort maps by their weakest individual test, so the worst oil capture is reported first.
    #
    ranked_maps = []

    for map_name, modes in grouped_results.items():

        all_tests = modes["duel"] + modes["ffa"]

        if not all_tests:
            continue

        ranked_maps.append((
            min((test["mean_fair_share_contested"] or 0.0) for test in all_tests),
            map_name,
        ))

    ranked_maps.sort()

    #
    # Print report.
    #
    for _, map_name in ranked_maps:

        duel_tests = grouped_results[map_name]["duel"]
        ffa_tests = grouped_results[map_name]["ffa"]

        print("-" * 78)
        print(map_name)
        print()

        print_mode_summary("Duel", duel_tests)

        if duel_tests and ffa_tests:
            print()

        print_mode_summary("FFA", ffa_tests)

        print()


def main(
    commit_sha: str,
    base_manifest_path: Path = None,
    test_results_path: Path = None,
) -> None:
    """Prints the oil-capture report for a completed batch test."""

    BASE_MANIFEST_PATH = base_manifest_path or (Path.cwd() / "base_manifest.json")
    base_manifest = read_json(BASE_MANIFEST_PATH)

    SHORT_SHA = commit_sha[:7]

    TEST_RESULTS_PATH = test_results_path or (Path.cwd() / "results" / SHORT_SHA)

    parsed_tests = parse_all_telemetry(
        base_manifest=base_manifest,
        test_results_folder=TEST_RESULTS_PATH,
    )

    print()
    print("=" * 78)
    print(f"OIL CAPTURE TELEMETRY  ({SHORT_SHA})")
    print("=" * 78)
    print()

    if not parsed_tests:
        print("No telemetry was captured.")
        print(f"Is `DEBUG_MODE_ON` set to `true` in the FishBot copy under test?")
        print(f"(Expected `<test_id>.tel.jsonl` files in: {TEST_RESULTS_PATH})")
        print()
        return

    print("fair share: my derricks / even split between living players (1.00 = fair share)")
    print("oil share:  my derricks / all derricks on the map")
    print("free oil:   derricks nobody has claimed")
    print()

    grouped_results = group_tests_by_map(parsed_tests)

    print_map_summary(grouped_results)


if __name__ == "__main__":

    COMMIT_SHA = "f2e70000c1f7855500253f6ee7655594f7bf5473"

    main(commit_sha=COMMIT_SHA)
