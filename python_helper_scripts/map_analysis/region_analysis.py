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
Stage A0 of the ground-objectives work: decompose a map into TERRAIN REGIONS.

This script is the reference implementation. The bot's JS port (in
`_world_state.js#initialiseMapTiles`) must reproduce its `regionID` output exactly,
so this file is deliberately written to mirror the JS:
  - grids are indexed [x][y] (the FishBot convention), NOT the [y][x] of the raw
    engine `MapTiles` / of `terrain_analysis.py`. Conversion happens once, on load.
  - `compute_directional_clearance` and the chokepoint derivation are line-for-line
    equivalents of the existing JS.
  - no numpy. The algorithm must be portable to the WZ2100 JS engine, and keeping it
    to plain lists means this file and the JS stay readable as the same algorithm.
    (Only `plot_regions.py`, which renders the result, uses numpy/matplotlib.)

Idea:
  1. Seed from points of interest (player start positions + clustered oil derricks).
  2. Flood outward from every seed at once over walkable tiles. Chokepoints cost more
     to cross than open ground, so the frontiers meet inside the narrow necks and the
     region boundaries land on the terrain's natural dividers.
  3. Where two regions touch, record a GATEWAY: the tiles you must pass through to get
     from one region to the other. A narrow gateway is a defensive neck.
  4. Merge away shards so a map does not fragment into noise.
"""

import json
import os
from collections import deque

############################## USER CONFIG START ##############################

MAP_NAME = "gamma"

# Chokepoint traversal cost. 1 == chokepoints are ordinary ground, so regions become a
# plain Voronoi of the seeds and ignore terrain entirely; larger == frontiers stall in the
# necks and boundaries settle there.
# Measured on gamma (see `measure_boundary_quality`): the share of gateway tiles that sit
# on an actual chokepoint climbs from ~5% at cost 1 to ~45-70% by cost 20, then saturates.
# 20 is at the knee for both sparse and dense seeding, so it is the default.
CHOKEPOINT_COST = 20

# Regions smaller than this (in tiles) are merged into their best neighbour.
MIN_REGION_AREA = 60

# Derricks within this distance of each other seed ONE region, not one each.
# Mirrors PROXIMITY_RADIUS in hq_g4_construction.js#generateOilDefenceConstructionOptions.
DERRICK_CLUSTER_RADIUS = 9

# Hard ceiling on region count; the smallest regions are merged until it is met.
MAX_REGIONS = 24

# How far a captured start position may be from walkable ground before it is treated as
# bogus rather than snapped inland. A real base sits on or beside ground it can build on.
BASE_SNAP_RADIUS = 4

# Oil sitting this close to a start position is that player's own base oil. It is absorbed
# into the base region rather than seeded as a separate one: a derrick inside your own base
# is not ground to go and capture, and seeding it separately splits the base lobe in two
# along an arbitrary line through open ground.
BASE_ABSORBS_OIL_RADIUS = 12

############################### USER CONFIG END ###############################

# terrainType enum, from warzone2100/lib/wzmaplib/include/wzmaplib/terrain_type.h
TER_WATER = 7
TER_CLIFFFACE = 8
IMPASSABLE_TERRAIN = (TER_WATER, TER_CLIFFFACE)

# Mirrors CHOKEPOINT_WIDTH_THRESHOLD in _world_state.js
CHOKEPOINT_WIDTH_THRESHOLD = 4

ADJACENT_OFFSETS = ((-1, 0), (1, 0), (0, -1), (0, 1))

NO_REGION = -1


############################## LOADING ##############################

# Every map's data in one file, keyed by map name, as produced by
# `../map_data_generator/generate_map_data.py`. Preferred over the older one-file-per-map captures.
MAP_DATA_FILE = "map_data.json"


def rows_to_grid_xy(raw_rows):
    """
    Turns a list of comma-separated rows (one per y, the format every capture in this folder uses)
    into (grid, width, height) where `grid[x][y]` is an int -- the FishBot indexing convention.
    """
    rows = [[int(float(v)) for v in row.split(",")] for row in raw_rows]

    height = len(rows)
    width = len(rows[0])
    for y, row in enumerate(rows):
        if len(row) != width:
            raise ValueError(f"row {y} has {len(row)} entries, expected {width}")

    grid = [[rows[y][x] for y in range(height)] for x in range(width)]
    return grid, width, height


def load_grid_xy(file_name):
    """Reads a single-grid capture written by `write_map_data_to_json.py`."""
    with open(f"{file_name}.json", "r") as f:
        raw_rows = json.load(f)

    return rows_to_grid_xy(raw_rows)


def load_map_record(map_name):
    """
    Returns one map's entry from the combined `map_data.json`, or None if that file does not exist or
    does not have the map. Callers fall back to the per-map captures, so a map captured by hand before
    the generator existed still works.
    """
    if not os.path.exists(MAP_DATA_FILE):
        return None

    with open(MAP_DATA_FILE, "r") as f:
        data = json.load(f)

    return data.get("maps", {}).get(map_name)


def create_grid(width, height, value):
    return [[value for _ in range(height)] for _ in range(width)]


############################## TERRAIN ##############################

def build_is_walkable(terrain, width, height):
    """
    Mirrors the water/cliff removal and map-edge stripping in
    `_world_state.js#initialiseMapTiles`.

    Note: the JS also excludes map FEATURES (trees, buildings, oil resources). Those are
    not part of a terrainType capture, so a region map built here is very slightly more
    permissive than the bot's. Features are small and scattered, so they shift region
    boundaries by a tile or two at most -- they do not move a neck.
    """
    is_walkable = create_grid(width, height, False)

    for x in range(width):
        for y in range(height):
            if terrain[x][y] in IMPASSABLE_TERRAIN:
                continue
            is_walkable[x][y] = True

    # Remove the very edges of the map since these are likely to be invalid tiles
    for x in range(width):
        is_walkable[x][0] = False
        is_walkable[x][height - 1] = False
    for y in range(height):
        is_walkable[0][y] = False
        is_walkable[width - 1][y] = False

    return is_walkable


def compute_directional_clearance(is_walkable, width, height, dx, dy):
    """
    Port of `computeDirectionalClearance` in `_world_state.js`.

    For each walkable tile, the number of consecutive walkable tiles counting backward
    from (x, y) along (dx, dy), inclusive of (x, y) itself.
    """
    clearance = create_grid(width, height, 0)

    x_start, x_step = (width - 1, -1) if dx < 0 else (0, 1)
    y_start, y_step = (height - 1, -1) if dy < 0 else (0, 1)

    for i in range(width):
        for j in range(height):
            x = x_start + i * x_step
            y = y_start + j * y_step

            if not is_walkable[x][y]:
                continue  # clearance stays 0

            px = x - dx
            py = y - dy

            if px < 0 or px >= width or py < 0 or py >= height:
                clearance[x][y] = 1
                continue

            clearance[x][y] = clearance[px][py] + 1

    return clearance


def compute_chokepoints(is_walkable, width, height):
    """
    Port of the chokepoint derivation in `_world_state.js`.
    Returns (chokepoint_width, is_chokepoint), both [x][y].
    """
    clearance_north = compute_directional_clearance(is_walkable, width, height, 0, 1)
    clearance_south = compute_directional_clearance(is_walkable, width, height, 0, -1)
    clearance_east = compute_directional_clearance(is_walkable, width, height, 1, 0)
    clearance_west = compute_directional_clearance(is_walkable, width, height, -1, 0)

    chokepoint_width = create_grid(width, height, 0)
    is_chokepoint = create_grid(width, height, False)

    for x in range(width):
        for y in range(height):
            if not is_walkable[x][y]:
                continue

            width_ns = clearance_north[x][y] + clearance_south[x][y] - 1
            width_ew = clearance_east[x][y] + clearance_west[x][y] - 1
            corridor_width = min(width_ns, width_ew)

            chokepoint_width[x][y] = corridor_width
            is_chokepoint[x][y] = corridor_width <= CHOKEPOINT_WIDTH_THRESHOLD

    return chokepoint_width, is_chokepoint


def find_largest_walkable_component(is_walkable, width, height):
    """
    Returns (reachable, component_sizes) for the LARGEST 4-connected block of walkable
    tiles: the main landmass.

    Deriving the playable area from the terrain itself, rather than by flooding out from
    some point of interest, is what keeps this honest. A map like gamma is 68% water and
    cliff and breaks into dozens of walkable pieces -- ponds, ledges, coastal pockets --
    and seeding the flood from a bad point of interest lands the whole analysis on a
    pocket instead of the map. Regions must be carved out of the ground the army can
    actually drive around, so the ground comes first and the points of interest are fitted
    to it afterwards.
    """
    visited = create_grid(width, height, False)
    best_tiles = []
    component_sizes = []

    for sx in range(width):
        for sy in range(height):
            if not is_walkable[sx][sy] or visited[sx][sy]:
                continue

            tiles = []
            visited[sx][sy] = True
            queue = deque([(sx, sy)])
            while queue:
                x, y = queue.popleft()
                tiles.append((x, y))
                for ox, oy in ADJACENT_OFFSETS:
                    nx, ny = x + ox, y + oy
                    if nx < 0 or nx >= width or ny < 0 or ny >= height:
                        continue
                    if visited[nx][ny] or not is_walkable[nx][ny]:
                        continue
                    visited[nx][ny] = True
                    queue.append((nx, ny))

            component_sizes.append(len(tiles))
            if len(tiles) > len(best_tiles):
                best_tiles = tiles

    reachable = create_grid(width, height, False)
    for x, y in best_tiles:
        reachable[x][y] = True

    component_sizes.sort(reverse=True)
    return reachable, component_sizes
def cluster_points(points, radius):
    """
    Groups points within `radius` of an already-accepted point.
    Mirrors the derrick grouping in `hq_g4_construction.js`, which walks the derrick list
    and skips any derrick within PROXIMITY_RADIUS of one already seen.

    Returns a list of clusters; each cluster is a list of points.
    """
    radius_sq = radius ** 2
    clusters = []

    for point in points:
        for cluster in clusters:
            ax, ay = cluster[0]
            if (ax - point[0]) ** 2 + (ay - point[1]) ** 2 < radius_sq:
                cluster.append(point)
                break
        else:
            clusters.append([point])

    return clusters


def centroid_of(points):
    cx = sum(p[0] for p in points) // len(points)
    cy = sum(p[1] for p in points) // len(points)
    return (cx, cy)


def snap_to_reachable(point, reachable, width, height, max_radius=None):
    """
    Returns the reachable tile nearest `point` (spiral search), or None if there is none
    within `max_radius`. A cluster centroid can easily land on a cliff or in water, and a
    seed must sit on real ground.

    `max_radius` matters: without a bound, a point of interest that is nowhere near the
    playable area (the forced-spectator slot at (0, 0), say) silently snaps onto the map
    edge and manufactures a region that has no business existing. Better to drop it.
    """
    px, py = point
    if 0 <= px < width and 0 <= py < height and reachable[px][py]:
        return (px, py)

    limit = max_radius if max_radius is not None else max(width, height)
    for r in range(1, limit + 1):
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                if max(abs(dx), abs(dy)) != r:
                    continue
                nx, ny = px + dx, py + dy
                if nx < 0 or nx >= width or ny < 0 or ny >= height:
                    continue
                if reachable[nx][ny]:
                    return (nx, ny)
    return None


def load_points_of_interest(map_name):
    """
    Reads `<map>_poi.json`, if present:
        {"startPositions": [[x, y], ...], "derricks": [[x, y], ...]}

    Capture it the same way the terrain grids are captured -- print `startPositions` and
    `derrickPositions` from the running bot and save them next to the terrain JSON.
    Returns None when no capture exists.
    """
    path = f"{map_name}_poi.json"
    if not os.path.exists(path):
        return None

    with open(path, "r") as f:
        poi = json.load(f)

    return {
        "startPositions": [tuple(p) for p in poi.get("startPositions", [])],
        "derricks": [tuple(p) for p in poi.get("derricks", [])],
    }


def nearest_base_seed(point, seeds, max_distance):
    """Returns the base seed within `max_distance` of `point`, nearest first, else None."""
    best = None
    best_distance_sq = max_distance ** 2
    for seed in seeds:
        if seed["kind"] != "base":
            continue
        distance_sq = (seed["tile"][0] - point[0]) ** 2 + (seed["tile"][1] - point[1]) ** 2
        if distance_sq <= best_distance_sq:
            best_distance_sq = distance_sq
            best = seed
    return best


def build_seeds_from_poi(poi, reachable, width, height):
    """
    The real seeding: one seed per start position, one per derrick cluster.

    Points of interest that do not sit on the main landmass are DROPPED, not snapped onto
    it. Two real cases this guards against:
      - In debug mode player 0 is forced to spectator and its start position is (0, 0),
        the map corner. Snapping it inland invents a base region against the map edge --
        and because base regions are protected from merging, that phantom survives and
        drags the decomposition out to the outline.
      - A derrick on an island the army cannot drive to is not an objective.

    Returns (seeds, dropped), where `dropped` explains what was discarded and why.
    """
    seeds = []
    dropped = []

    for start_position in poi["startPositions"]:
        tile = snap_to_reachable(start_position, reachable, width, height,
                                 max_radius=BASE_SNAP_RADIUS)
        if tile is None:
            dropped.append(f"start position {tuple(start_position)}: not on the main landmass")
            continue
        seeds.append({"tile": tile, "kind": "base"})

    for cluster in cluster_points(poi["derricks"], DERRICK_CLUSTER_RADIUS):
        # A cluster earns a region only if the army can actually reach one of its derricks.
        # The centroid itself is synthetic and may legitimately sit in water between them,
        # so it is allowed to snap further than a base.
        reachable_derricks = [
            d for d in cluster
            if 0 <= d[0] < width and 0 <= d[1] < height and reachable[d[0]][d[1]]
        ]
        if not reachable_derricks:
            dropped.append(f"derrick cluster at {centroid_of(cluster)} "
                           f"({len(cluster)} derricks): none reachable")
            continue

        centroid = centroid_of(cluster)
        home_base = nearest_base_seed(centroid, seeds, BASE_ABSORBS_OIL_RADIUS)
        if home_base is not None:
            home_base.setdefault("derricks", []).extend(reachable_derricks)
            continue

        tile = snap_to_reachable(centroid, reachable, width, height,
                                 max_radius=DERRICK_CLUSTER_RADIUS)
        if tile is None:
            tile = reachable_derricks[0]

        seeds.append({"tile": tile, "kind": "oil", "derricks": reachable_derricks})

    return deduplicate_seeds(seeds), dropped


def build_seeds_from_open_ground(chokepoint_width, reachable, width, height):
    """
    Fallback seeding for a map whose points of interest have not been captured yet.

    Picks the most open tiles on the map (highest corridor width) subject to a minimum
    separation. Open pockets are where bases and oil clusters actually sit, so this
    approximates the real seed set well enough to judge whether the FLOOD is behaving --
    which is what Stage A0 is really asking. It is not a substitute for a real
    `<map>_poi.json` capture.
    """
    candidates = []
    for x in range(width):
        for y in range(height):
            if reachable[x][y]:
                candidates.append((chokepoint_width[x][y], x, y))
    candidates.sort(reverse=True)

    # Seeds must be spread out, at roughly the spacing real points of interest sit at.
    # Scaled off the map's short side so it holds on small and large maps alike; floored
    # at the derrick clustering radius, since two seeds closer than that would have been
    # one cluster anyway.
    separation = max(DERRICK_CLUSTER_RADIUS, min(width, height) // 8)
    separation_sq = separation ** 2

    seeds = []
    for _, x, y in candidates:
        if len(seeds) >= MAX_REGIONS:
            break
        if any((s["tile"][0] - x) ** 2 + (s["tile"][1] - y) ** 2 < separation_sq for s in seeds):
            continue
        seeds.append({"tile": (x, y), "kind": "open"})

    return seeds


def deduplicate_seeds(seeds):
    """Two points of interest can snap to the same tile; one tile can only seed one region."""
    seen = set()
    unique = []
    for seed in seeds:
        if seed["tile"] in seen:
            continue
        seen.add(seed["tile"])
        unique.append(seed)
    return unique


############################## THE FLOOD ##############################

def flood_regions(reachable, is_chokepoint, seeds, width, height, chokepoint_cost):
    """
    Multi-source weighted flood (Dial's algorithm -- a bucket queue, valid because edge
    costs are small positive integers).

    Every seed expands at once. Entering an open tile costs 1; entering a chokepoint tile
    costs `chokepoint_cost`. A tile is claimed by whichever seed reaches it most cheaply,
    so frontiers stall in the narrow necks and meet there. That is what puts region
    boundaries on chokepoints without ever treating a chokepoint as a wall -- important,
    because `isChokepoint` is a crude heuristic that also fires on open ground.

    Returns (region_id, cost_to_seed), both [x][y]; region_id is NO_REGION off-region.
    """
    region_id = create_grid(width, height, NO_REGION)
    cost_to_seed = create_grid(width, height, -1)

    max_edge_cost = max(1, chokepoint_cost)
    buckets = [[] for _ in range(max_edge_cost + 1)]

    for index, seed in enumerate(seeds):
        x, y = seed["tile"]
        region_id[x][y] = index
        cost_to_seed[x][y] = 0
        buckets[0].append((x, y))

    current_cost = 0
    settled = 0
    # Highest cost we could ever assign, used only to bound the outer loop.
    max_total_cost = width * height * max_edge_cost

    while current_cost <= max_total_cost:
        bucket = buckets[current_cost % len(buckets)]

        if not bucket:
            current_cost += 1
            if settled and all(not b for b in buckets):
                break
            continue

        x, y = bucket.pop()

        # Stale entry: this tile was re-reached more cheaply after being queued.
        if cost_to_seed[x][y] != current_cost:
            continue

        settled += 1
        tile_region = region_id[x][y]

        for ox, oy in ADJACENT_OFFSETS:
            nx, ny = x + ox, y + oy
            if nx < 0 or nx >= width or ny < 0 or ny >= height:
                continue
            if not reachable[nx][ny]:
                continue

            step_cost = chokepoint_cost if is_chokepoint[nx][ny] else 1
            new_cost = current_cost + step_cost

            if cost_to_seed[nx][ny] != -1 and cost_to_seed[nx][ny] <= new_cost:
                continue

            cost_to_seed[nx][ny] = new_cost
            region_id[nx][ny] = tile_region
            buckets[new_cost % len(buckets)].append((nx, ny))

    return region_id, cost_to_seed


############################## GATEWAYS ##############################

def extract_gateways(region_id, chokepoint_width, width, height):
    """
    Finds where regions touch. For each unordered pair of neighbouring regions, collects
    the boundary tiles and the narrowest corridor width among them.

    The gateway is the ground you must hold to deny passage between two regions -- the
    thing that makes "capture and hold" cheap. A pair with a small `min_width` is a neck;
    a pair with a large one is an open border that cannot be plugged.
    """
    gateways = {}

    for x in range(width):
        for y in range(height):
            a = region_id[x][y]
            if a == NO_REGION:
                continue

            # Only look right and down, so each boundary is visited once.
            for ox, oy in ((1, 0), (0, 1)):
                nx, ny = x + ox, y + oy
                if nx >= width or ny >= height:
                    continue

                b = region_id[nx][ny]
                if b == NO_REGION or b == a:
                    continue

                key = (a, b) if a < b else (b, a)
                entry = gateways.setdefault(key, {"tiles": [], "min_width": None})
                entry["tiles"].append((x, y))
                entry["tiles"].append((nx, ny))

                pair_width = min(chokepoint_width[x][y], chokepoint_width[nx][ny])
                if entry["min_width"] is None or pair_width < entry["min_width"]:
                    entry["min_width"] = pair_width

    return gateways


############################## MERGING ##############################

def region_areas(region_id, width, height, region_count):
    areas = [0] * region_count
    for x in range(width):
        for y in range(height):
            r = region_id[x][y]
            if r != NO_REGION:
                areas[r] += 1
    return areas


def merge_small_regions(region_id, chokepoint_width, seeds, width, height,
                        min_area, max_regions):
    """
    Repeatedly dissolves the smallest region into the neighbour it shares the WIDEST
    gateway with, until every surviving region clears `min_area` and there are no more
    than `max_regions`.

    Widest-gateway is the right merge target: it is the neighbour this region is least
    separated from, so dissolving into it destroys the least terrain meaning. Merging into
    the largest neighbour instead would happily jump a neck.

    A region holding a seed of kind "base" is never dissolved -- a player's home ground is
    a region by definition, however cramped its start corner is.

    Returns a new region_id grid and the surviving seeds, both renumbered to be dense.
    """
    region_count = len(seeds)
    protected = {i for i, seed in enumerate(seeds) if seed["kind"] == "base"}
    alive = set(range(region_count))

    while True:
        areas = region_areas(region_id, width, height, region_count)
        gateways = extract_gateways(region_id, chokepoint_width, width, height)

        candidates = [r for r in alive if r not in protected and areas[r] > 0]
        if not candidates:
            break

        too_many = len(alive) > max_regions
        smallest = min(candidates, key=lambda r: areas[r])

        if areas[smallest] >= min_area and not too_many:
            break

        neighbours = []
        for (a, b), entry in gateways.items():
            if a == smallest:
                neighbours.append((len(entry["tiles"]), b))
            elif b == smallest:
                neighbours.append((len(entry["tiles"]), a))

        if not neighbours:
            # Isolated (can happen if a seed sits in a pocket nothing else reaches).
            # Nothing to merge into, so leave it and stop considering it.
            alive.discard(smallest)
            protected.add(smallest)
            continue

        _, target = max(neighbours)

        for x in range(width):
            for y in range(height):
                if region_id[x][y] == smallest:
                    region_id[x][y] = target

        alive.discard(smallest)

    return renumber_regions(region_id, seeds, alive, width, height)


def renumber_regions(region_id, seeds, alive, width, height):
    """Compacts surviving region ids to 0..n-1 so downstream arrays stay dense."""
    surviving = sorted(r for r in alive)
    remap = {old: new for new, old in enumerate(surviving)}

    new_region_id = create_grid(width, height, NO_REGION)
    for x in range(width):
        for y in range(height):
            r = region_id[x][y]
            if r != NO_REGION:
                new_region_id[x][y] = remap[r]

    new_seeds = [seeds[old] for old in surviving]
    return new_region_id, new_seeds


############################## REGION RECORDS ##############################

def build_region_records(region_id, cost_to_seed, chokepoint_width, seeds,
                         width, height, cell_size=10):
    """
    Builds the record the bot will hold in `state.regions`. `cells` is the list of
    coarse (gx, gy) grid cells the region covers -- the bridge to `state.fields`, which
    is indexed at cellSize=10 resolution.
    """
    region_count = len(seeds)

    tiles = [[] for _ in range(region_count)]
    cells = [set() for _ in range(region_count)]

    for x in range(width):
        for y in range(height):
            r = region_id[x][y]
            if r == NO_REGION:
                continue
            tiles[r].append((x, y))
            cells[r].add((x // cell_size, y // cell_size))

    gateways = extract_gateways(region_id, chokepoint_width, width, height)

    per_region_gateways = [[] for _ in range(region_count)]
    neighbours = [set() for _ in range(region_count)]
    for (a, b), entry in gateways.items():
        neighbours[a].add(b)
        neighbours[b].add(a)
        tile_count = len(set(entry["tiles"]))
        per_region_gateways[a].append({"to_region": b, "min_width": entry["min_width"],
                                       "tile_count": tile_count})
        per_region_gateways[b].append({"to_region": a, "min_width": entry["min_width"],
                                       "tile_count": tile_count})

    records = []
    for r in range(region_count):
        seed = seeds[r]
        # The centroid is only a label; snap it to a tile the region actually owns so it
        # is always a legal move order.
        centroid = centroid_of(tiles[r]) if tiles[r] else seed["tile"]
        if not tiles[r] or region_id[centroid[0]][centroid[1]] != r:
            centroid = min(tiles[r], key=lambda t: (t[0] - centroid[0]) ** 2 + (t[1] - centroid[1]) ** 2) \
                if tiles[r] else seed["tile"]

        records.append({
            "id": r,
            "seed_kind": seed["kind"],
            "seed_tile": seed["tile"],
            "centroid": centroid,
            "area_tiles": len(tiles[r]),
            "derrick_count": len(seed.get("derricks", [])),
            "neighbour_ids": sorted(neighbours[r]),
            "gateways": sorted(per_region_gateways[r], key=lambda g: g["min_width"]),
            "cells": sorted(cells[r]),
        })

    return records, gateways


############################## BOUNDARY QUALITY ##############################

def measure_boundary_quality(region_id, gateways, is_chokepoint):
    """
    The objective version of the Stage A0 eyeball test: "do the regions break where the
    terrain breaks?"

    Returns (chokepoint_fraction, gateway_tile_count).
      - `chokepoint_fraction` is the share of gateway tiles that are genuine chokepoints.
        Low means the boundaries are drawn across open ground (a Voronoi of the seeds,
        terrain ignored); high means they follow the necks.
      - `gateway_tile_count` is the total boundary length. Shorter is better for the same
        region count: it means regions meet through tight necks rather than broad fronts,
        and a tight neck is what makes a region cheap to hold.

    Judge a parameter change on both: a change that raises the fraction while shrinking
    the boundary is unambiguously better.
    """
    tiles = set()
    for entry in gateways.values():
        tiles.update(entry["tiles"])

    if not tiles:
        return 0.0, 0

    on_chokepoint = sum(1 for (x, y) in tiles if is_chokepoint[x][y])
    return on_chokepoint / len(tiles), len(tiles)


############################## VERIFICATION ##############################

def check_invariants(region_id, reachable, records, width, height,
                     min_area, max_regions):
    """
    The Stage A0 acceptance checks. Returns a list of failure strings (empty == pass).
    Visual approval is the real gate, but these catch the errors an eyeball misses.
    """
    failures = []

    unassigned = sum(
        1
        for x in range(width)
        for y in range(height)
        if reachable[x][y] and region_id[x][y] == NO_REGION
    )
    if unassigned:
        failures.append(f"{unassigned} reachable tiles have no region")

    leaked = sum(
        1
        for x in range(width)
        for y in range(height)
        if not reachable[x][y] and region_id[x][y] != NO_REGION
    )
    if leaked:
        failures.append(f"{leaked} unreachable tiles were assigned a region")

    if len(records) > max_regions:
        failures.append(f"{len(records)} regions exceeds the cap of {max_regions}")

    for record in records:
        if record["area_tiles"] == 0:
            failures.append(f"region {record['id']} is empty")
        elif record["area_tiles"] < min_area and record["seed_kind"] != "base":
            failures.append(
                f"region {record['id']} has {record['area_tiles']} tiles, below the {min_area} minimum"
            )

    by_id = {record["id"]: record for record in records}
    for record in records:
        for neighbour in record["neighbour_ids"]:
            if neighbour not in by_id:
                failures.append(f"region {record['id']} names unknown neighbour {neighbour}")
            elif record["id"] not in by_id[neighbour]["neighbour_ids"]:
                failures.append(
                    f"adjacency is not symmetric: {record['id']} -> {neighbour} but not back"
                )

    if not check_regions_are_connected(region_id, records, width, height):
        failures.append("at least one region is not a single connected area")

    return failures


def check_regions_are_connected(region_id, records, width, height):
    """
    A region must be one contiguous piece of ground. Merging can in principle join two
    areas that only touch through a third region, which would make "hold this region"
    meaningless, so this is worth checking explicitly.
    """
    for record in records:
        r = record["id"]
        start = None
        for x in range(width):
            for y in range(height):
                if region_id[x][y] == r:
                    start = (x, y)
                    break
            if start:
                break
        if start is None:
            continue

        seen = {start}
        queue = deque([start])
        while queue:
            x, y = queue.popleft()
            for ox, oy in ADJACENT_OFFSETS:
                nx, ny = x + ox, y + oy
                if nx < 0 or nx >= width or ny < 0 or ny >= height:
                    continue
                if (nx, ny) in seen or region_id[nx][ny] != r:
                    continue
                seen.add((nx, ny))
                queue.append((nx, ny))

        if len(seen) != record["area_tiles"]:
            return False

    return True


############################## OUTPUT ##############################

REGION_GLYPHS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def render_ascii(result):
    """
    Prints the map one character per tile, so terrain and regions can be read together.

      ~  water          #  cliff face      ,  walkable, but not on the main landmass
      .  off-map        *  seed            +  gateway tile      0-9/A-Z  region

    Showing water and cliff separately from "not a region" matters: it is how you tell a
    boundary that follows a real feature from one the flood merely drew across open
    ground, and how you spot a landmass that is not the one you meant to analyse.
    """
    width, height = result["width"], result["height"]
    terrain = result["terrain"]
    reachable = result["reachable"]
    is_walkable = result["is_walkable"]
    region_id = result["region_id"]

    seed_tiles = {seed["tile"] for seed in result["seeds"]}

    gateway_tiles = set()
    for entry in result["gateways"].values():
        gateway_tiles.update(entry["tiles"])

    lines = []
    for y in range(height):
        row = []
        for x in range(width):
            if reachable[x][y]:
                if (x, y) in seed_tiles:
                    row.append("*")
                elif (x, y) in gateway_tiles:
                    row.append("+")
                else:
                    r = region_id[x][y]
                    row.append(REGION_GLYPHS[r % len(REGION_GLYPHS)] if r != NO_REGION else "?")
            elif is_walkable[x][y]:
                row.append(",")
            elif terrain[x][y] == TER_WATER:
                row.append("~")
            elif terrain[x][y] == TER_CLIFFFACE:
                row.append("#")
            else:
                row.append(".")
        lines.append("".join(row))
    return "\n".join(lines)


def terrain_summary(result):
    """One line per terrain class, so the map's makeup is visible at a glance."""
    width, height = result["width"], result["height"]
    terrain = result["terrain"]
    reachable, is_walkable = result["reachable"], result["is_walkable"]

    water = cliff = stranded = 0
    for x in range(width):
        for y in range(height):
            if reachable[x][y]:
                continue
            if is_walkable[x][y]:
                stranded += 1
            elif terrain[x][y] == TER_WATER:
                water += 1
            elif terrain[x][y] == TER_CLIFFFACE:
                cliff += 1

    return (f"terrain        : {water} water (~), {cliff} cliff (#), "
            f"{stranded} walkable but stranded off the landmass (,)")



def print_region_table(records):
    print(f"\n{'id':>3}  {'kind':<5} {'area':>6} {'oil':>4} {'cells':>6}  "
          f"{'seed':>10}  {'centroid':>10}  neighbours (gateway min width)")
    print("-" * 100)
    for record in records:
        gateway_text = ", ".join(
            f"{g['to_region']}(w{g['min_width']})" for g in record["gateways"]
        ) or "-"
        print(f"{record['id']:>3}  {record['seed_kind']:<5} {record['area_tiles']:>6} "
              f"{record['derrick_count']:>4} {len(record['cells']):>6}  "
              f"{str(record['seed_tile']):>10}  {str(record['centroid']):>10}  {gateway_text}")


def export_region_id(map_name, region_id, width, height):
    """
    Writes `<map>_regionID.json` in the same wire format as every other capture (one
    comma-separated row per y), so `plot_regions.py` can load it with the existing
    `load_map`, and so the JS port's own dump can be diffed against it byte for byte.
    """
    rows = [",".join(str(region_id[x][y]) for x in range(width)) for y in range(height)]
    path = f"{map_name}_regionID.json"
    with open(path, "w") as f:
        json.dump(rows, f)
    return path


############################## ENTRY POINT ##############################

def load_map_inputs(map_name):
    """
    Returns (terrain, width, height, poi, source) for a map, preferring the combined
    `map_data.json` and falling back to the older per-map captures.
    """
    record = load_map_record(map_name)
    if record is not None:
        terrain, width, height = rows_to_grid_xy(record["terrainType"])
        poi = {
            "startPositions": [tuple(p) for p in record.get("startPositions", [])],
            "derricks": [tuple(p) for p in record.get("derricks", [])],
        }
        return terrain, width, height, poi, MAP_DATA_FILE

    terrain, width, height = load_grid_xy(f"{map_name}_terrainType")
    return terrain, width, height, load_points_of_interest(map_name), f"{map_name}_poi.json"


def analyse_map(map_name, chokepoint_cost=CHOKEPOINT_COST, min_area=MIN_REGION_AREA,
                max_regions=MAX_REGIONS, verbose=True):
    terrain, width, height, poi, poi_source = load_map_inputs(map_name)

    is_walkable = build_is_walkable(terrain, width, height)
    chokepoint_width, is_chokepoint = compute_chokepoints(is_walkable, width, height)

    # Ground first: the playable area is the largest connected block of walkable tiles,
    # derived from the terrain alone. Points of interest are fitted to it afterwards.
    reachable, component_sizes = find_largest_walkable_component(is_walkable, width, height)

    if poi:
        seeds, dropped_poi = build_seeds_from_poi(poi, reachable, width, height)
        seed_source = poi_source
    else:
        seeds = build_seeds_from_open_ground(chokepoint_width, reachable, width, height)
        dropped_poi = []
        seed_source = "open-ground fallback (no _poi.json capture)"

    if not seeds:
        raise ValueError(
            f"no usable seeds for {map_name}: all {len(dropped_poi)} points of interest "
            f"were off the main landmass"
        )

    region_id, cost_to_seed = flood_regions(
        reachable, is_chokepoint, seeds, width, height, chokepoint_cost
    )
    region_id, seeds = merge_small_regions(
        region_id, chokepoint_width, seeds, width, height, min_area, max_regions
    )

    records, gateways = build_region_records(
        region_id, cost_to_seed, chokepoint_width, seeds, width, height
    )
    failures = check_invariants(
        region_id, reachable, records, width, height, min_area, max_regions
    )
    chokepoint_fraction, gateway_tile_count = measure_boundary_quality(
        region_id, gateways, is_chokepoint
    )

    if verbose:
        reachable_tiles = sum(1 for x in range(width) for y in range(height) if reachable[x][y])
        walkable_tiles = sum(1 for x in range(width) for y in range(height) if is_walkable[x][y])
        chokepoint_tiles = sum(
            1 for x in range(width) for y in range(height)
            if reachable[x][y] and is_chokepoint[x][y]
        )
        impassable = width * height - walkable_tiles
        print()
        print(f"map            : {map_name} ({width} x {height} = {width * height} tiles)")
        print(f"impassable     : {impassable} tiles "
              f"({100 * impassable // (width * height)}% water, cliff or map edge)")
        print(f"walkable       : {walkable_tiles} tiles in {len(component_sizes)} "
              f"disconnected pieces; largest {component_sizes[:4]}")
        print(f"landmass used  : {reachable_tiles} tiles "
              f"({100 * reachable_tiles // max(walkable_tiles, 1)}% of walkable), of which "
              f"{chokepoint_tiles} are chokepoint "
              f"({100 * chokepoint_tiles // max(reachable_tiles, 1)}%)")
        print(f"seeds          : {len(seeds)} from {seed_source}")
        for reason in dropped_poi:
            print(f"  dropped      : {reason}")
        print(f"parameters     : chokepoint_cost={chokepoint_cost} "
              f"min_area={min_area} max_regions={max_regions}")
        print(f"regions        : {len(records)}")
        print(f"gateway pairs  : {len(gateways)}")
        print(f"boundary       : {gateway_tile_count} gateway tiles, "
              f"{100 * chokepoint_fraction:.1f}% of them on a chokepoint")

    return {
        "map_name": map_name,
        "width": width,
        "height": height,
        "reachable": reachable,
        "is_chokepoint": is_chokepoint,
        "chokepoint_width": chokepoint_width,
        "region_id": region_id,
        "seeds": seeds,
        "records": records,
        "gateways": gateways,
        "failures": failures,
        "chokepoint_fraction": chokepoint_fraction,
        "gateway_tile_count": gateway_tile_count,
        "is_walkable": is_walkable,
        "terrain": terrain,
        "component_sizes": component_sizes,
        "dropped_poi": dropped_poi,
    }

if __name__ == "__main__":
    result = analyse_map(MAP_NAME)
    print(terrain_summary(result))

    print_region_table(result["records"])

    print()
    print(render_ascii(result))

    path = export_region_id(result["map_name"], result["region_id"],
                            result["width"], result["height"])
    print()
    print(f"wrote {path}")

    print()
    if result["failures"]:
        print("INVARIANT FAILURES:")
        for failure in result["failures"]:
            print(f"  - {failure}")
    else:
        print("All invariants passed.")