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
Stage A0 visualisation: renders the terrain regions produced by `region_analysis.py`.

The map is drawn in two layers:
  1. TERRAIN  -- water, cliff face, and walkable ground that is stranded off the main
                 landmass, each in its own colour. Without this you cannot tell whether a
                 region boundary follows a real feature or was merely drawn across open
                 ground, and you cannot see when the analysis has landed on the wrong
                 landmass entirely.
  2. REGIONS  -- the decomposition, painted over the playable landmass only.

Two views:
  DETAIL -- one map, large, with seeds, gateways and region ids labelled. The view for
            "do the regions break where I would break them?"
  SWEEP  -- small multiples across chokepoint cost and minimum region area. The view for
            choosing those two parameters.

Requires numpy + matplotlib, like the other plotting scripts in this folder.
"""

import numpy as np
import matplotlib.pyplot as plt
from matplotlib import colors
from matplotlib.patches import Patch

import region_analysis as ra

############################## USER CONFIG START ##############################

MAP_NAME = "3c-Gamma"

VIEW = "detail"        # "detail" or "sweep"

# Parameters for the DETAIL view.
CHOKEPOINT_COST = ra.CHOKEPOINT_COST
MIN_REGION_AREA = ra.MIN_REGION_AREA

# Axes of the SWEEP view. cost=1 is the "terrain ignored" control -- keep it, it is the
# baseline the other columns have to beat.
SWEEP_CHOKEPOINT_COSTS = [1, 6, 20, 30]
SWEEP_MIN_AREAS = [30, 60, 120]

SAVE_TO_FILE = None     # e.g. "gamma_regions.png"; None shows an interactive window

############################### USER CONFIG END ###############################

# Terrain layer classes, in draw order.
TERRAIN_OTHER, TERRAIN_WATER, TERRAIN_CLIFF, TERRAIN_STRANDED, TERRAIN_LANDMASS = range(5)

TERRAIN_COLOURS = ["#101010", "#12314f", "#4a3f35", "#5c5a34", "#242424"]
TERRAIN_LABELS = [
    "impassable (map edge / other)",
    "water",
    "cliff face",
    "walkable, stranded off landmass",
    "playable landmass",
]


def to_display_array(grid_xy, width, height, dtype=float):
    """
    The region grids are [x][y] (the FishBot convention). matplotlib's imshow wants
    [row][col] == [y][x], so transpose on the way out.
    """
    array = np.empty((height, width), dtype=dtype)
    for x in range(width):
        column = grid_xy[x]
        for y in range(height):
            array[y][x] = column[y]
    return array


def build_terrain_image(result):
    """The base layer: what the ground actually is, before any region is drawn on it."""
    width, height = result["width"], result["height"]
    terrain = result["terrain"]
    reachable, is_walkable = result["reachable"], result["is_walkable"]

    image = np.empty((height, width), dtype=int)
    for x in range(width):
        for y in range(height):
            if reachable[x][y]:
                image[y][x] = TERRAIN_LANDMASS
            elif is_walkable[x][y]:
                image[y][x] = TERRAIN_STRANDED
            elif terrain[x][y] == ra.TER_WATER:
                image[y][x] = TERRAIN_WATER
            elif terrain[x][y] == ra.TER_CLIFFFACE:
                image[y][x] = TERRAIN_CLIFF
            else:
                image[y][x] = TERRAIN_OTHER
    return image


def build_region_image(result):
    """
    Regions as a masked array, so everything off the playable landmass drops out and the
    terrain layer underneath shows through.
    """
    width, height = result["width"], result["height"]
    region_array = to_display_array(result["region_id"], width, height)
    reachable = to_display_array(result["reachable"], width, height, dtype=bool)
    return np.ma.masked_where(~reachable, region_array)


def region_colormap(region_count):
    """
    Distinct colours per region, cycling tab20. On a map with more than 20 regions two
    neighbours can still draw the same colour, which is what the id labels are for.
    """
    base = plt.get_cmap("tab20").colors
    return colors.ListedColormap([base[i % len(base)] for i in range(max(region_count, 1))])


def landmass_tile_count(result):
    return sum(1 for x in range(result["width"]) for y in range(result["height"])
               if result["reachable"][x][y])


def draw_map(axis, result, detailed):
    """Paints terrain, then regions, then (in the detail view) gateways and seeds."""
    records = result["records"]

    axis.imshow(build_terrain_image(result),
                cmap=colors.ListedColormap(TERRAIN_COLOURS),
                vmin=0, vmax=len(TERRAIN_COLOURS) - 1,
                interpolation="nearest")

    axis.imshow(build_region_image(result),
                cmap=region_colormap(len(records)),
                vmin=0, vmax=max(len(records) - 1, 1),
                interpolation="nearest", alpha=0.85)

    gateway_tiles = set()
    for entry in result["gateways"].values():
        gateway_tiles.update(entry["tiles"])
    if gateway_tiles:
        axis.scatter([t[0] for t in gateway_tiles], [t[1] for t in gateway_tiles],
                     s=7 if detailed else 1.5, c="black", marker="s", linewidths=0)

    if not detailed:
        return

    # Chokepoint tiles, faint: the terrain feature the regions are meant to break on.
    chokepoints = [
        (x, y)
        for x in range(result["width"])
        for y in range(result["height"])
        if result["reachable"][x][y] and result["is_chokepoint"][x][y]
    ]
    if chokepoints:
        axis.scatter([t[0] for t in chokepoints], [t[1] for t in chokepoints],
                     s=1, c="white", alpha=0.20, marker="s", linewidths=0)

    axis.scatter([s["tile"][0] for s in result["seeds"]],
                 [s["tile"][1] for s in result["seeds"]],
                 s=70, facecolors="none", edgecolors="white", linewidths=1.4)

    for record in records:
        cx, cy = record["centroid"]
        axis.text(cx, cy, str(record["id"]),
                  color="white", fontsize=9, fontweight="bold",
                  ha="center", va="center",
                  bbox=dict(boxstyle="round,pad=0.15", facecolor="black",
                            alpha=0.55, linewidth=0))


def describe_narrowest_gateways(result, limit=3):
    pairs = sorted(result["gateways"].items(), key=lambda kv: kv[1]["min_width"])
    if not pairs:
        return "none"
    return ", ".join("{}-{} (w{})".format(a, b, entry["min_width"])
                     for (a, b), entry in pairs[:limit])


def plot_detail(result):
    figure, axis = plt.subplots(1, 1, figsize=(13, 12))
    draw_map(axis, result, detailed=True)

    axis.set_title(
        "{}  --  {} regions over {} landmass tiles, {} gateways\n"
        "chokepoint cost {}, min area {}   |   boundary: {} tiles, {:.0f}% on a chokepoint\n"
        "white squares = chokepoints, black = gateways, rings = seeds   |   "
        "narrowest necks: {}".format(
            result["map_name"], len(result["records"]), landmass_tile_count(result),
            len(result["gateways"]), CHOKEPOINT_COST, MIN_REGION_AREA,
            result["gateway_tile_count"], 100 * result["chokepoint_fraction"],
            describe_narrowest_gateways(result),
        ),
        fontsize=10,
    )
    axis.set_xlabel("X")
    axis.set_ylabel("Y")

    axis.legend(
        handles=[Patch(facecolor=c, label=l)
                 for c, l in zip(TERRAIN_COLOURS, TERRAIN_LABELS)],
        loc="upper left", bbox_to_anchor=(1.01, 1.0), fontsize=8, frameon=False,
    )
    figure.tight_layout()


def plot_sweep(map_name):
    """
    Small multiples over the two parameters that decide region shape. Reading down a
    column shows merging cleaning up shards; reading across a row shows chokepoint cost
    trading "one giant region" against "shards".
    """
    rows, cols = len(SWEEP_MIN_AREAS), len(SWEEP_CHOKEPOINT_COSTS)
    figure, axes = plt.subplots(rows, cols, figsize=(4.2 * cols, 4.0 * rows), squeeze=False)

    for row, min_area in enumerate(SWEEP_MIN_AREAS):
        for col, chokepoint_cost in enumerate(SWEEP_CHOKEPOINT_COSTS):
            result = ra.analyse_map(map_name, chokepoint_cost=chokepoint_cost,
                                    min_area=min_area, verbose=False)

            axis = axes[row][col]
            draw_map(axis, result, detailed=False)

            status = "OK" if not result["failures"] else "{} FAIL".format(len(result["failures"]))
            axis.set_title(
                "cost={}  min_area={}\n{} regions, {} boundary tiles, "
                "{:.0f}% on choke  [{}]".format(
                    chokepoint_cost, min_area, len(result["records"]),
                    result["gateway_tile_count"],
                    100 * result["chokepoint_fraction"], status),
                fontsize=9,
            )
            axis.set_xticks([])
            axis.set_yticks([])

    figure.suptitle("{}: region decomposition parameter sweep".format(map_name), fontsize=13)
    figure.tight_layout()


def show_or_save():
    if SAVE_TO_FILE:
        plt.savefig(SAVE_TO_FILE, dpi=140)
        print("wrote {}".format(SAVE_TO_FILE))
    else:
        plt.show()


if __name__ == "__main__":
    if VIEW == "sweep":
        plot_sweep(MAP_NAME)
    else:
        result = ra.analyse_map(MAP_NAME, chokepoint_cost=CHOKEPOINT_COST,
                                min_area=MIN_REGION_AREA)
        print(ra.terrain_summary(result))
        ra.print_region_table(result["records"])

        print()
        if result["failures"]:
            print("INVARIANT FAILURES:")
            for failure in result["failures"]:
                print("  - {}".format(failure))
        else:
            print("All invariants passed.")

        plot_detail(result)

    show_or_save()
