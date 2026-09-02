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

Two views:
  1. DETAIL  -- one map, large: regions as colour, gateways and seeds marked, region ids
                labelled. This is the view to judge "do the regions break where I would
                break them?"
  2. SWEEP   -- small multiples across chokepoint cost and minimum region area. This is
                the view to pick those two parameters.

Run `region_analysis.py` first (or just run this -- it calls the analysis itself).
Requires numpy + matplotlib, like the other plotting scripts in this folder.
"""

import numpy as np
import matplotlib.pyplot as plt
from matplotlib import colors

import region_analysis as ra

############################## USER CONFIG START ##############################

MAP_NAME = "gamma"

VIEW = "detail"        # "detail" or "sweep"

# Parameters for the DETAIL view.
CHOKEPOINT_COST = ra.CHOKEPOINT_COST
MIN_REGION_AREA = ra.MIN_REGION_AREA

# Axes of the SWEEP view.
# cost=1 is the "terrain ignored" control -- keep it in the sweep, it is the baseline the
# other columns have to beat.
SWEEP_CHOKEPOINT_COSTS = [1, 6, 20, 30]
SWEEP_MIN_AREAS = [30, 60, 120]

SAVE_TO_FILE = None     # e.g. "gamma_regions.png"; None shows an interactive window

############################### USER CONFIG END ###############################


def to_display_array(grid_xy, width, height, dtype=float):
    """
    `region_analysis` grids are [x][y] (the FishBot convention). matplotlib's imshow
    wants [row][col] == [y][x], so transpose on the way out.
    """
    array = np.empty((height, width), dtype=dtype)
    for x in range(width):
        column = grid_xy[x]
        for y in range(height):
            array[y][x] = column[y]
    return array


def build_region_image(result):
    """
    Regions as a masked array so unreachable ground drops out of the colour map and can
    be painted as background instead of as a region.
    """
    width, height = result["width"], result["height"]

    region_array = to_display_array(result["region_id"], width, height)
    reachable = to_display_array(result["reachable"], width, height, dtype=bool)

    return np.ma.masked_where(~reachable, region_array)


def region_colormap(region_count):
    """
    Distinct colours per region, cycling tab20. Neighbouring regions can still draw the
    same colour on a map with more than 20 regions, which is what the id labels are for.
    """
    base = plt.get_cmap("tab20").colors
    cmap = colors.ListedColormap([base[i % len(base)] for i in range(max(region_count, 1))])
    cmap.set_bad(color="#1b1b1b")     # unreachable: water, cliffs, off-map
    return cmap


def scatter_tiles(tiles, **kwargs):
    if not tiles:
        return
    xs = [t[0] for t in tiles]
    ys = [t[1] for t in tiles]
    plt.scatter(xs, ys, **kwargs)


def plot_detail(result):
    width, height = result["width"], result["height"]
    records = result["records"]

    plt.figure(figsize=(13, 12))

    image = build_region_image(result)
    cmap = region_colormap(len(records))
    plt.imshow(image, cmap=cmap, interpolation="nearest",
               vmin=0, vmax=max(len(records) - 1, 1))

    # Chokepoint tiles, faint: the terrain feature the regions are supposed to break on.
    chokepoints = [
        (x, y)
        for x in range(width)
        for y in range(height)
        if result["reachable"][x][y] and result["is_chokepoint"][x][y]
    ]
    scatter_tiles(chokepoints, s=1, c="white", alpha=0.18, marker="s", linewidths=0)

    # Gateway tiles: the ground you hold to deny passage between two regions.
    gateway_tiles = set()
    for entry in result["gateways"].values():
        gateway_tiles.update(entry["tiles"])
    scatter_tiles(sorted(gateway_tiles), s=7, c="black", marker="s", linewidths=0)

    # Seeds: the points of interest the flood grew from.
    scatter_tiles([seed["tile"] for seed in result["seeds"]],
                  s=70, facecolors="none", edgecolors="white", linewidths=1.4)

    for record in records:
        cx, cy = record["centroid"]
        plt.text(cx, cy, str(record["id"]),
                 color="white", fontsize=9, fontweight="bold",
                 ha="center", va="center",
                 bbox=dict(boxstyle="round,pad=0.15", facecolor="black", alpha=0.55, linewidth=0))

    narrowest = describe_narrowest_gateways(result, limit=3)
    plt.title(
        f"{result['map_name']}  --  {len(records)} regions, {len(result['gateways'])} gateways\n"
        f"chokepoint cost {CHOKEPOINT_COST}, min area {MIN_REGION_AREA}   |   "
        f"boundary: {result['gateway_tile_count']} tiles, "
        f"{100 * result['chokepoint_fraction']:.0f}% on a chokepoint\n"
        f"white squares = chokepoints, black = gateways, rings = seeds   |   "
        f"narrowest necks: {narrowest}",
        fontsize=10,
    )
    plt.xlabel("X")
    plt.ylabel("Y")
    plt.tight_layout()


def describe_narrowest_gateways(result, limit=3):
    pairs = sorted(result["gateways"].items(), key=lambda kv: kv[1]["min_width"])
    if not pairs:
        return "none"
    return ", ".join(
        f"{a}-{b} (w{entry['min_width']})" for (a, b), entry in pairs[:limit]
    )


def plot_sweep(map_name):
    """
    Small multiples over the two parameters that decide region shape. Reading down a
    column shows how merging cleans up shards; reading across a row shows chokepoint cost
    trading "one giant region" against "shards".
    """
    rows = len(SWEEP_MIN_AREAS)
    cols = len(SWEEP_CHOKEPOINT_COSTS)

    fig, axes = plt.subplots(rows, cols, figsize=(4.2 * cols, 4.0 * rows), squeeze=False)

    for row, min_area in enumerate(SWEEP_MIN_AREAS):
        for col, chokepoint_cost in enumerate(SWEEP_CHOKEPOINT_COSTS):
            result = ra.analyse_map(
                map_name,
                chokepoint_cost=chokepoint_cost,
                min_area=min_area,
                verbose=False,
            )

            axis = axes[row][col]
            image = build_region_image(result)
            axis.imshow(image, cmap=region_colormap(len(result["records"])),
                        interpolation="nearest",
                        vmin=0, vmax=max(len(result["records"]) - 1, 1))

            gateway_tiles = set()
            for entry in result["gateways"].values():
                gateway_tiles.update(entry["tiles"])
            if gateway_tiles:
                xs = [t[0] for t in gateway_tiles]
                ys = [t[1] for t in gateway_tiles]
                axis.scatter(xs, ys, s=1.5, c="black", marker="s", linewidths=0)

            status = "OK" if not result["failures"] else f"{len(result['failures'])} FAIL"
            axis.set_title(
                f"cost={chokepoint_cost}  min_area={min_area}\n"
                f"{len(result['records'])} regions, "
                f"{result['gateway_tile_count']} boundary tiles, "
                f"{100 * result['chokepoint_fraction']:.0f}% on choke  [{status}]",
                fontsize=9,
            )
            axis.set_xticks([])
            axis.set_yticks([])

    fig.suptitle(f"{map_name}: region decomposition parameter sweep", fontsize=13)
    fig.tight_layout()


def show_or_save():
    if SAVE_TO_FILE:
        plt.savefig(SAVE_TO_FILE, dpi=140)
        print(f"wrote {SAVE_TO_FILE}")
    else:
        plt.show()


if __name__ == "__main__":
    if VIEW == "sweep":
        plot_sweep(MAP_NAME)
    else:
        result = ra.analyse_map(
            MAP_NAME,
            chokepoint_cost=CHOKEPOINT_COST,
            min_area=MIN_REGION_AREA,
        )
        ra.print_region_table(result["records"])

        if result["failures"]:
            print("\nINVARIANT FAILURES:")
            for failure in result["failures"]:
                print(f"  - {failure}")
        else:
            print("\nAll invariants passed.")

        plot_detail(result)

    show_or_save()
