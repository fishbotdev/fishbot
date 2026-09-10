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

# Parses the telemetry lines FishBot writes to the autogame console.
#
# The end-of-game summary table gives one row per player at a single instant. It has no column for the
# things a tuning run needs most: how FishBot's oil share moved over the game, what it lost, and what
# brigade composition it was actually running. Those are emitted as tagged console lines by the
# `emitStaticTelemetry` / `emitSampleTelemetry` / `emitFinalTelemetry` methods in `hq_command.js`.
#
# Line formats (positional, comma separated, one tag per line):
#
#   FBTCFG,<player>,<mapWidth>,<mapHeight>,<walkableTiles>,<totalDerricks>,<maxPlayers>,<droidLimit>
#   FBTBDE,<player>,<brigadeSize>,<heavyCav>,<lightCav>,<mortar>,<ada>,<sensor>,<repair>,<infantry>,<numBrigades>
#   FBTUW,<player>,<heavyCav>,<lightCav>,<mortar>,<ada>,<sensor>,<maintenance>
#   FBT,<player>,<t_sec>,<derricks>,<oilShare>,<livingPlayers>,<power>,<units>,<unitsLost>,<powerLost>,
#       <enemyDirectFire>,<enemyIndirect>,<enemyAir>,<enemyRepair>
#   FBTEND,<player>,<t_sec>,<unitsLost>,<structuresLost>,<powerLostToUnits>,<powerLostToStructures>
#
# FBTBDE gives the brigade a game was filling up to; FBTUW gives the order it filled in. Both are needed
# to interpret a result, since brigade size decides how long the bot spends part-filled and therefore how
# much the order matters.
#
# The tag is searched for anywhere in the line rather than anchored at the start, so any prefix the engine
# puts in front of script output is harmless.

from typing import Dict, List, Optional

# Field names after the tag, in order. The player id is first in every line.
SCHEMAS: Dict[str, List[str]] = {
    "FBTCFG": ["player", "map_width", "map_height", "walkable_tiles", "total_derricks",
               "max_players", "droid_weapon_limit"],
    "FBTBDE": ["player", "brigade_size", "heavy_cav", "light_cav", "mortar", "ada",
               "sensor", "repair", "infantry", "num_brigades"],
    "FBTUW":  ["player", "w_heavy_cav", "w_light_cav", "w_mortar", "w_ada", "w_sensor",
               "w_maintenance"],
    "FBT":    ["player", "t_sec", "derricks", "oil_share", "living_players", "power", "units",
               "units_lost", "power_lost", "enemy_direct_fire", "enemy_indirect", "enemy_air",
               "enemy_repair"],
    "FBTEND": ["player", "t_sec", "units_lost", "structures_lost", "power_lost_units",
               "power_lost_structures"],
}

# Everything is an integer except the oil share and the production-order weights.
FLOAT_FIELDS = {"oil_share", "w_heavy_cav", "w_light_cav", "w_mortar", "w_ada", "w_sensor",
                "w_maintenance"}


def _parse_line(line: str, tag: str) -> Optional[dict]:
    """
    Extracts one telemetry record from a console line, or None if the line does not hold a well-formed
    record for this tag.
    """
    start = line.find(tag + ",")
    if start == -1:
        return None

    fields = SCHEMAS[tag]
    parts = line[start + len(tag) + 1:].split(",")

    # A line split by console word wrap arrives truncated. Drop it rather than guessing.
    if len(parts) < len(fields):
        return None

    record = {}
    for name, raw in zip(fields, parts):
        try:
            record[name] = float(raw) if name in FLOAT_FIELDS else int(raw)
        except ValueError:
            return None

    return record


def parse_console_telemetry(console_history: List[str], player: Optional[int] = None) -> dict:
    """
    Pulls all telemetry out of a scraped console history.

    Parameters
    ----------
    console_history
        Console lines, as returned by `windows_scrape_terminal_history`.
    player
        When given, keep only this player's records. Needed if a test ever runs more than one FishBot,
        since they all write to the same console.

    Returns
    -------
    dict
        {
            "config": dict | None,          # FBTCFG, the last one seen
            "brigade": dict | None,         # FBTBDE, the last one seen
            "unit_weights": dict | None,    # FBTUW, the last one seen
            "samples": list[dict],          # FBT, in the order emitted
            "final": dict | None,           # FBTEND, the last one seen
        }
    """
    result = {"config": None, "brigade": None, "unit_weights": None, "samples": [], "final": None}

    for line in console_history:
        # Order matters: every other tag starts with "FBT", so the longer tags are checked first and a
        # line holding e.g. "FBTEND," is not also read as an "FBT," record.
        for tag, key in (("FBTCFG", "config"), ("FBTBDE", "brigade"), ("FBTUW", "unit_weights"),
                         ("FBTEND", "final"), ("FBT", "samples")):
            record = _parse_line(line, tag)
            if record is None:
                continue

            if player is not None and record["player"] != player:
                break

            if key == "samples":
                result["samples"].append(record)
            else:
                result[key] = record
            break

    return result


def summarise_telemetry(telemetry: dict) -> dict:
    """
    Reduces a game's telemetry to the scalar outcome metrics a tuning run scores on.

    Oil share is summarised two ways: its time integral (share-seconds, the area under the curve, which
    rewards holding oil early as well as at the end) and its final value. The integral uses the trapezium
    rule over the samples, which are evenly spaced apart from dropped lines.

    Returns
    -------
    dict
        Flat metrics, prefixed `tlm_`. Empty if there are no samples to work from.
    """
    samples = telemetry.get("samples") or []
    final = telemetry.get("final")
    brigade = telemetry.get("brigade")
    config = telemetry.get("config")
    unit_weights = telemetry.get("unit_weights")

    metrics = {}

    if config:
        metrics.update({
            "tlm_map_width": config["map_width"],
            "tlm_map_height": config["map_height"],
            "tlm_walkable_tiles": config["walkable_tiles"],
            "tlm_total_derricks": config["total_derricks"],
            "tlm_max_players": config["max_players"],
            "tlm_droid_weapon_limit": config["droid_weapon_limit"],
        })

    if brigade:
        metrics.update({
            "tlm_brigade_size": brigade["brigade_size"],
            "tlm_brigade_heavy_cav": brigade["heavy_cav"],
            "tlm_brigade_light_cav": brigade["light_cav"],
            "tlm_brigade_mortar": brigade["mortar"],
            "tlm_brigade_ada": brigade["ada"],
            "tlm_brigade_infantry": brigade["infantry"],
            "tlm_num_brigades": brigade["num_brigades"],
        })

    if unit_weights:
        # Ratios to the reference category, which is what actually determines production order: scaling
        # every weight leaves the order unchanged. Recorded as ratios so a regression sees one number per
        # category rather than a set carrying a redundant overall scale.
        reference = unit_weights["w_heavy_cav"] or 1.0
        metrics.update({
            "tlm_w_light_cav_ratio": round(unit_weights["w_light_cav"] / reference, 4),
            "tlm_w_mortar_ratio": round(unit_weights["w_mortar"] / reference, 4),
            "tlm_w_ada_ratio": round(unit_weights["w_ada"] / reference, 4),
            "tlm_w_sensor_ratio": round(unit_weights["w_sensor"] / reference, 4),
            "tlm_w_maintenance_ratio": round(unit_weights["w_maintenance"] / reference, 4),
        })

    if samples:
        samples = sorted(samples, key=lambda s: s["t_sec"])

        oil_share_seconds = 0.0
        for previous, current in zip(samples, samples[1:]):
            dt = current["t_sec"] - previous["t_sec"]
            oil_share_seconds += 0.5 * (previous["oil_share"] + current["oil_share"]) * dt

        last = samples[-1]
        duration = max(last["t_sec"], 1)

        metrics.update({
            "tlm_oil_share_seconds": round(oil_share_seconds, 2),
            "tlm_oil_share_mean": round(oil_share_seconds / duration, 4),
            "tlm_oil_share_final": last["oil_share"],
            "tlm_derricks_final": last["derricks"],
            "tlm_derricks_peak": max(s["derricks"] for s in samples),
            "tlm_power_final": last["power"],
            "tlm_units_final": last["units"],
            "tlm_units_peak": max(s["units"] for s in samples),
            "tlm_enemy_direct_fire_peak": max(s["enemy_direct_fire"] for s in samples),
            "tlm_enemy_indirect_peak": max(s["enemy_indirect"] for s in samples),
            "tlm_enemy_air_peak": max(s["enemy_air"] for s in samples),
            "tlm_enemy_repair_peak": max(s["enemy_repair"] for s in samples),
            "tlm_sample_count": len(samples),
        })

    # `FBTEND` is authoritative for attrition and duration: it is emitted when the game actually ends,
    # whereas the last periodic sample can be up to a strategy interval earlier.
    source = final if final else (samples[-1] if samples else None)
    if source:
        metrics["tlm_duration_sec"] = source["t_sec"]
        metrics["tlm_units_lost"] = source["units_lost"]

    if final:
        metrics["tlm_structures_lost"] = final["structures_lost"]
        metrics["tlm_power_lost"] = final["power_lost_units"] + final["power_lost_structures"]
        metrics["tlm_power_lost_units"] = final["power_lost_units"]
        metrics["tlm_power_lost_structures"] = final["power_lost_structures"]
        metrics["tlm_reached_game_end"] = True
    else:
        # No FBTEND means the game was cut short, or the line was scrolled out of the console buffer.
        metrics["tlm_reached_game_end"] = False

    return metrics
