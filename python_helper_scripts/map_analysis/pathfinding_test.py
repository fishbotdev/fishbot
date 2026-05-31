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
Note: terrainType as of 4.7.0 are defined as:
warzone2100/lib/wzmaplib/include/wzmaplib/terrain_type.h

enum TYPE_OF_TERRAIN
{
	TER_SAND,               -> 0
	TER_SANDYBRUSH,
	TER_BAKEDEARTH,
	TER_GREENMUD,
	TER_REDBRUSH,
	TER_PINKROCK,
	TER_ROAD,
	TER_WATER,              -> 7 (not passable to wheeled vehicles)
	TER_CLIFFFACE,          -> 8 (not passable to wheeled vehicles)
	TER_RUBBLE,
	TER_SHEETICE,
	TER_SLUSH,
	
"""

import json
import numpy as np
import matplotlib.pyplot as plt
from time import perf_counter as get_time

# Disclaimer: most of the helper functions are implemented by AI (ChatGPT), but
# the `find_path_[x]` functions are implemented by hand for learning.

############################## HELPER FUNCTIONS ##############################

def load_map(file_name: str):
    with open(rf'{file_name}.json', 'r') as f:
        raw_data = json.load(f)

    # Convert strings to 2D numeric array
    map_data = np.array([list(map(float, row.split(','))) for row in raw_data])
    return map_data


def build_passability_map(terrain):
    """
    terrain: np.ndarray

    returns:
        np.ndarray of bool
    """
    return ~np.isin(terrain, [7, 8])


def plot_map_and_path(raw_map, found_path: list[tuple], start: tuple, goal: tuple):

    plt.figure(figsize=(10, 10))

    plt.imshow(raw_map, cmap='gray', aspect='auto')

    # Start marker (green square)
    plt.scatter(
        start[0],
        start[1],
        marker="s",
        color="limegreen",
        s=150
    )

    # Destination marker (red diamond)
    plt.scatter(
        goal[0],
        goal[1],
        marker="D",
        color="red",
        s=150
    )

    # Display path
    if len(found_path) > 0:
        xs = [p[0] for p in found_path]
        ys = [p[1] for p in found_path]

        plt.plot(
            xs,
            ys,
            color="blue",
            linewidth=4
        )

    plt.show()


def mock_find_path(map, start: tuple, goal: tuple) -> list[tuple]:
    if True:
        t = BasicPathTest()
        return t.correct_path
    else:
        return [(start[0]+i, start[1]) for i in range(0, 5)]        # to test display of path overlay on WZ2100 map


def find_path_bfs(map, start: tuple, goal: tuple) -> list[tuple]:
    """
    References
    1. DFS/BFS - Abdul Bari
    2. Breadth First Search Algorithm | Shortest Path | Graph Theory - WilliamFiset
    """

    queue = [start]
    visited = [start]
    parent_indexes = [None]

    result = [goal]

    def get_valid_neighbours(pos, map):
        ymax, xmax = map.shape

        valid_neighbours = []
        offsets = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1,-1), (-1, 1), (1, 1), (1,-1)]

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

            valid_tile = map[ty][tx]    # NOTE: array indexing map needs to be in this order because it looks up 'rows' = 'y', and then 'cols' = 'x'
            if valid_tile:
                valid_neighbours.append(new_pos)

        return valid_neighbours

    iters = 0
    max_iterations = 10000      # to prevent the algorithm from running forever if I make a mistake
    while len(queue) > 0 and iters < max_iterations:
        node = queue.pop(0)
        parent_index = visited.index(node) if (node in visited) else None       # never returns `None` since all parents are registered in 'visited' before the child is spawned

        neighbours = get_valid_neighbours(node, map)
        for neighbour in neighbours:
            if neighbour in visited:
                continue

            queue.append(neighbour)

            visited.append(neighbour)       # add the new neighbour so it's not reused in future iterations
            parent_indexes.append(parent_index)       # add the parent node of the newest visited node (used in path traceback)

        iters += 1

    # print(f"visited: {visited}")
    # print(f"parent: {parent_indexes}")
    print(f"BFS completed in {iters} iterations.")

    # back out the path, starting from the end node
    idx = visited.index(goal) if (goal in visited) else None
    # print(f'goal index in visited: {idx}')

    iters = 0
    while idx != None and iters < max_iterations:
        idx = parent_indexes[idx]

        if idx is not None:
            # Append parent node information to result
            p = visited[idx]
            result.append(p)
            # print(f"\t - parent: {p}")

        iters += 1

    if idx is None:
        result.reverse()        # start to finish

        # print(f"result: {result}")
        return result

    return []


def find_path_djikstra(map, start: tuple, goal: tuple) -> list[tuple]:
    return []


def find_path_astar(map, start: tuple, goal: tuple) -> list[tuple]:
    return []


class BasicPathTest:
    def __init__(self):
        self.test_map = np.array([
            [1, 1, 1],
            [0, 0, 1],
            [1, 1, 1]
        ], dtype=bool)

        self.start = (0, 0)
        self.goal = (0, 2)

        self.correct_path = [(0,0), (1,0), (2,0), (2,1), (2,2), (1,2), (0, 2)]

    def run_test(self, pathfinding_algorithm):

        found_path = pathfinding_algorithm(
            self.test_map,
            self.start,
            self.goal
        )

        TEST_NAME = type(self).__name__
        ALGO_NAME = pathfinding_algorithm.__name__

        if len(self.correct_path) != len(found_path):
            print(f"Test {TEST_NAME} ({ALGO_NAME}) - Failed (wrong length path)")
            return False

        for i, step in enumerate(found_path):
            if step != self.correct_path[i]:
                print(f"Test {TEST_NAME} ({ALGO_NAME}) - Failed (incorrect path found)")
                return False
        else:
            print(f"Test {TEST_NAME} ({ALGO_NAME}) - Passed!")
            return True


############################## MAIN ##############################

if __name__ == '__main__':

    ################### USER CONFIG START ###################
    START = (10, 15)
    GOAL = (70, 70)

    FILE_NAME = "gamma_terrainType"     # this is the data obtained from the `MapTiles.terrainType` global
    ################### USER CONFIG END ###################

    test_harness = BasicPathTest()

    if False:    # for development, overwrites all user parameters with those from the `test_harness`
        START = test_harness.start
        GOAL = test_harness.goal
        passability_map = test_harness.test_map
    else:
        terrain = load_map(FILE_NAME)
        passability_map = build_passability_map(terrain)

    # Run path finding and plot
    pathing_algorithm = find_path_bfs

    print("\n--------------------------------------------------------------\n")
    START_TIME = get_time()
    path = pathing_algorithm(map=passability_map, start=START, goal=GOAL)
    END_TIME = get_time()
    print(f"`{pathing_algorithm.__name__}` finished executing in: {round(END_TIME - START_TIME, 1)} secs")
    plot_map_and_path(raw_map=passability_map, found_path=path, start=START, goal=GOAL)
    print("\n--------------------------------------------------------------\n")

    # Run tests
    test_harness.run_test(pathing_algorithm)
