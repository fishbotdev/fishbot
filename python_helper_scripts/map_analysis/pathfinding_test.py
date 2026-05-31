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
    GOAL = (50, 40)

    FILE_NAME = "gamma_terrainType"     # this is the data obtained from the `MapTiles.terrainType` global
    ################### USER CONFIG END ###################

    test_harness = BasicPathTest()

    if True:    # for development, overwrites all user parameters with those from the `test_harness`
        START = test_harness.start
        GOAL = test_harness.goal
        passability_map = test_harness.test_map
    else:
        terrain = load_map(FILE_NAME)
        passability_map = build_passability_map(terrain)

    # Run path finding and plot
    pathing_algorithm = find_path_bfs

    path = pathing_algorithm(map=passability_map, start=START, goal=GOAL)
    plot_map_and_path(raw_map=passability_map, found_path=path, start=START, goal=GOAL)

    # Run tests
    test_harness.run_test(pathing_algorithm)
