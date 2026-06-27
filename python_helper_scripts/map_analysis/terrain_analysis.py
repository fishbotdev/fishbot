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

import json
import numpy as np
import matplotlib.pyplot as plt
from time import perf_counter as get_time

def load_map(file_name: str):
    with open(rf'{file_name}.json', 'r') as f:
        raw_data = json.load(f)

    # Convert strings to 2D numeric array
    map_data = np.array([list(map(float, row.split(','))) for row in raw_data])
    return map_data


def categorize(arr):

    conditions = [
        arr <= 5,
        (arr > 5) & (arr <= 6),
        (arr > 6) & (arr <= 8),
        arr > 8
    ]

    categories = [1, 2, 0, 1]

    return np.select(conditions, categories)


def build_mobility_map(terrain):
    """
    terrain: np.ndarray

    returns:
        np.ndarray of bool
    """

    return categorize(terrain)


def plot_map(data):

    plt.figure(figsize=(10, 10))

    plt.imshow(data, cmap='gray', aspect='auto')

    plt.show()


def max_neighbour_difference(arr):
    result = np.zeros_like(arr)

    # Up
    diff = np.abs(arr[1:, :] - arr[:-1, :])
    result[1:, :] = np.maximum(result[1:, :], diff)
    result[:-1, :] = np.maximum(result[:-1, :], diff)

    # Left
    diff = np.abs(arr[:, 1:] - arr[:, :-1])
    result[:, 1:] = np.maximum(result[:, 1:], diff)
    result[:, :-1] = np.maximum(result[:, :-1], diff)

    return result




def run_map_bfs(map, start: tuple) -> list[tuple]:

    queue = [start]
    visited = [start]

    def get_valid_neighbours(pos, map):
        ymax, xmax = map.shape

        valid_neighbours = []
        offsets = [(-1, 0), (1, 0), (0, -1), (0, 1)]

        tx = 0  # initialise these variables so they are reused
        ty = 0

        # Test for valid locations
        for offset in offsets:
            new_pos = (pos[0] + offset[0], pos[1] + offset[1])
            # print(f"new pos: {new_pos}")

            # Test in map bounds
            tx = new_pos[0]
            ty = new_pos[1]

            if tx < 0 or tx >= xmax:
                continue
            if ty < 0 or ty >= ymax:
                continue

            tile_val = map[ty][tx]    # NOTE: array indexing map needs to be in this order because it looks up 'rows' = 'y', and then 'cols' = 'x'
            if tile_val != 0:
                valid_neighbours.append(new_pos)

        return valid_neighbours

    iters = 0
    max_iterations = 100000      # to prevent the algorithm from running forever if I make a mistake
    while len(queue) > 0 and iters < max_iterations:
        node = queue.pop(0)

        neighbours = get_valid_neighbours(node, map)
        for neighbour in neighbours:
            if neighbour in visited:
                continue

            queue.append(neighbour)

            visited.append(neighbour)       # add the new neighbour so it's not reused in future iterations

        iters += 1

    print(f"BFS completed in {iters} iterations.")

    return visited


def plot_bfs_flood_fill(passability_map, visited):

    x, y = zip(*visited)

    COLOURED_IN_VISIT_ORDER = False
    if COLOURED_IN_VISIT_ORDER:
        plt.scatter(x, y, c=range(len(visited)), alpha=0.05)
    else:
        plt.scatter(x, y, alpha=0.05)

    plt.imshow(passability_map, cmap='gray', interpolation='nearest')

    plt.show()


if __name__ == '__main__':

    ################### USER CONFIG START ###################

    map_name = "gamma"

    ################### USER CONFIG END ###################

    terrainType_file_name = f"{map_name}_terrainType"     # this is the data obtained from the `MapTiles.terrainType` global
    height_file_name = f"{map_name}_height"                   # this is the data obtained from the `MapTiles.height` global

    # Part 1: Build passability map
    terrainTypeMap = load_map(terrainType_file_name)
    mobility_map = build_mobility_map(terrainTypeMap)
    plot_map(data=mobility_map)

    # Part 2: Build height map
    heightMap = load_map(height_file_name)
    plot_map(data=heightMap)

    # Part 3: Build slope map
    slopeMap = max_neighbour_difference(heightMap)
    plot_map(data=slopeMap)

    # # Flood fill all reachable nodes
    visited_nodes = run_map_bfs(mobility_map, start=(40, 25))
    plot_bfs_flood_fill(mobility_map, visited_nodes)
