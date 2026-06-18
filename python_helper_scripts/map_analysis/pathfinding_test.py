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
	TER_ROAD,               -> 6
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
from typing import List, Callable, Any, Optional
import line_profiler        # pip install line_profiler
from math import floor

# Disclaimer: most of the helper functions are implemented by AI (ChatGPT), but
# all of the `find_path_[x]` functions & the binary heap are implemented by hand for learning.
# (This may explain some of the residual parallel redundant logic)

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

    # Secondary marker (for illustration purposes)
    if False:
        plt.scatter(94, 70, marker="D", color="red", s=150)

    # Display path
    if True:
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


def is_invalid_position(map, position: tuple):
    x = position[0]
    y = position[1]
    valid_tile = map[y][x]  # NOTE: array indexing map needs to be in this order because it looks up 'rows' = 'y', and then 'cols' = 'x'
    return True if not valid_tile else False


def find_path_bfs(map, start: tuple, goal: tuple) -> list[tuple]:
    """
    References
    1. DFS/BFS - Abdul Bari
    2. Breadth First Search Algorithm | Shortest Path | Graph Theory - WilliamFiset
    3. https://www.redblobgames.com/pathfinding/a-star/introduction.html
    """

    if is_invalid_position(map, start) or is_invalid_position(map, goal):
        print(f"Terminating - start or goal is an invalid position")
        return []

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
    max_iterations = 50000      # to prevent the algorithm from running forever if I make a mistake
    while len(queue) > 0 and iters < max_iterations:
        node = queue.pop(0)
        if node == goal:
            print(f'goal found - terminated early ({iters} iterations)')
            break

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


def find_path_greedy_best_first_search(map, start: tuple, goal: tuple) -> list[tuple]:
    """
    References
    1. https://www.redblobgames.com/pathfinding/a-star/introduction.html
    """

    if is_invalid_position(map, start) or is_invalid_position(map, goal):
        print(f"Terminating - start or goal is an invalid position")
        return []

    def dist_to_goal_heuristic(a, b):
        # Euclidean distance SQ (can also use Manhattan distance)
        return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2

    # Note: I am implementing PriorityQueue myself for learning
    start_to_goal_dist = dist_to_goal_heuristic(start, goal)
    frontier = [{'pos': start, 'score': start_to_goal_dist}]
    visited = [start]
    parent_indexes: List = [None]
    result = [goal]

    def get_valid_neighbours(pos: tuple, map):
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
    max_iterations = 50000      # to prevent the algorithm from running forever if I make a mistake
    while len(frontier) > 0 and iters < max_iterations:
        node = frontier.pop()
        pos = node['pos']

        if pos == goal:
            print(f'goal found - terminated early ({iters} iterations)')
            break

        parent_index = visited.index(pos) if (pos in visited) else None       # never returns `None` since all parents are registered in 'visited' before the child is spawned

        neighbours = get_valid_neighbours(pos, map)
        for neighbour in neighbours:
            if neighbour in visited:
                continue

            neighbour_score = dist_to_goal_heuristic(goal, neighbour)
            frontier.append({'pos': neighbour, 'score': neighbour_score})       # constructs a new node

            visited.append(neighbour)       # add the new neighbour so it's not reused in future iterations
            parent_indexes.append(parent_index)       # add the parent node of the newest visited node (used in path traceback)

        frontier.sort(key=lambda x: x['score'], reverse=True)

        # if iters < 10:
        #     print(f"Iter {iters}:\t{frontier[-2:]} (frontier len: {len(frontier)})")

        iters += 1

    # print(f"visited: {visited}")
    # print(f"parent: {parent_indexes}")
    print(f"Greedy-Best-FS completed in {iters} iterations.")

    # back out the path, starting from the end node
    idx = visited.index(goal) if (goal in visited) else None
    # print(f'goal index in visited: {idx}')

    iters = 0
    while idx is not None and iters < max_iterations:
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


class MyAStarMinHeap:
    # This heap is implemented zero-index formulas
    #   Node i (zero indexed)
    #   Left child `2*i+1`
    #   Right child `2*i+2`
    #   Parent node `floor((i - 1) / 2)`

    def __init__(self):
        self.heap: list[float | int] = []

    def __len__(self) -> int:
        return len(self.heap)

    def print_heap(self) -> None:
        # Function 1: Visualisation is important for learning & debugging, so I build this first
        # The implementation is not very clean but it does the job.

        print(f"\n{self.heap} represented as:\n")
        curr_heap_index = 0
        curr_upper_bound = 0
        HEAP_LEN = len(self.heap)

        all_level_entries = []

        for i in range(10):       # max displayable depth
            curr_upper_bound += 2 ** i

            entries_on_level = []
            while curr_heap_index < min(curr_upper_bound, HEAP_LEN):
                entries_on_level.append(f'{self.heap[curr_heap_index]:2d}')
                curr_heap_index += 1

            # print('  '.join(entries_on_level))

            all_level_entries.append(entries_on_level)

            if curr_upper_bound > HEAP_LEN:
                break
        else:
            raise ValueError("TREE IS GREATER THAN 10 LEVELS DEEP")

        # print(len(all_level_entries))

        print_rows = []

        # Build the tree from the bottom
        NUM_ENTRIES = 2 ** (len(all_level_entries) - 1)
        last_row_entries = ['__' for _ in range(NUM_ENTRIES)]

        # build the last row, including blanks where there are no entries
        for i, entry in enumerate(all_level_entries[-1]):
            last_row_entries[i] = entry

        # add spaces in between each entry to form the final row
        NUM_SPACES = (NUM_ENTRIES - 1)
        last_row = []
        for i in range(NUM_SPACES):
            last_row.append(last_row_entries[i])
            last_row.append('  ')
        last_row.append(last_row_entries[-1])

        NUM_SLOTS = NUM_ENTRIES + NUM_SPACES        # these is the slots for printing

        # print(''.join(last_row))

        print_rows.append(last_row)

        # After manually constructing the last row, algorithmically generate the rest of the spacing / rows
        filled_indexes = [2*i for i in range(NUM_ENTRIES)]

        for i in range(len(all_level_entries)-2, -1, -1):
            # Calculate positions for numbers to live
            temp_filled_indexes = []
            while len(filled_indexes) > 0:
                last_entry = filled_indexes.pop()
                second_last_entry = filled_indexes.pop()

                temp_filled_indexes.append(int((last_entry+second_last_entry)/2))

            temp_filled_indexes.reverse()

            # print(temp_filled_indexes)
            filled_indexes = temp_filled_indexes

            # Use the new filled indexes to insert entries
            curr_row_entries = all_level_entries[i]
            curr_print_row = ['  ' for _ in range(NUM_SLOTS)]
            for entry_idx, print_idx in enumerate(filled_indexes):
                curr_print_row[print_idx] = curr_row_entries[entry_idx]

            print_rows.append(curr_print_row)

        print_rows.reverse()

        for row in print_rows:
            print(''.join(row))


    def push(self, value) -> None:
        self.heap.append(value)     # this adds it to the end of the complete binary tree

        # Bubble up the tree to make the heap-invariant true
        # Algorithm:
        #   1. Compare with parent.
        #   2. If smaller, swap, else, do nothing.
        #   3. Recursively perform until curr_idx is at the root (index 0) or the parent is smaller

        curr_idx = len(self.heap) - 1

        while curr_idx > 0:
            parent_idx = floor((curr_idx - 1) / 2)

            curr_value = self.heap[curr_idx]
            parent_value = self.heap[parent_idx]

            if parent_value['f'] < curr_value['f']:  # normal minheap invariant for f
                break
            elif parent_value['f'] == curr_value['f'] and parent_value['h'] <= curr_value['h']:  # A-star prioritisation of nodes closer to the target
                break

            self.heap[parent_idx] = curr_value
            self.heap[curr_idx] = parent_value
            curr_idx = parent_idx

    def peek(self) -> Optional:
        return self.heap[0] if len(self.heap) > 0 else None

    def pop(self) -> Optional:
        if len(self.heap) == 0:
            return None

        last_entry = self.heap.pop()
        if len(self.heap) == 0:
            return last_entry

        first_entry = self.heap[0]
        self.heap[0] = last_entry

        # Bubble down to preserve the heap invariant
        # Algorithm:
        #   1. Find the min of the two children nodes
        #   2. Compare the parent to the minimum of the two children nodes
        #   3. If child is smaller, swap, else, break.
        curr_idx = 0
        LAST_IDX = len(self.heap) - 1

        while curr_idx <= LAST_IDX:
            curr_value = self.heap[curr_idx]

            child1_idx = 2 * curr_idx + 1
            child2_idx = 2 * curr_idx + 2

            child1 = None
            child2 = None
            if child1_idx <= LAST_IDX:
                child1_value = self.heap[child1_idx]
                child1 = (child1_idx, child1_value)

            if child2_idx <= LAST_IDX:
                child2_value = self.heap[child2_idx]
                child2 = (child2_idx, child2_value)

            if child1 is None and child2 is None:
                break

            if child1 is not None and child2 is None:
                child_idx, child_value = child1
            elif child1 is None and child2 is not None:
                child_idx, child_value = child2
            else:
                if child1_value['f'] < child2_value['f']:  # normal minheap invariant for f
                    child_idx, child_value = child1
                elif child1_value['f'] == child2_value['f'] and child1_value['h'] <= child2_value['h']: # A-star prioritisation of nodes closer to the target
                    child_idx, child_value = child1
                else:
                    child_idx, child_value = child2

            if curr_value['f'] < child_value['f']:  # normal minheap invariant for f
                break
            elif curr_value['f'] == child_value['f'] and curr_value['h'] <= child_value['h']:  # A-star prioritisation of nodes closer to the target
                break

            # Else swap & continue to recurse
            self.heap[curr_idx] = child_value
            self.heap[child_idx] = curr_value
            curr_idx = child_idx

        return first_entry


    def create_heap(self, values: list[float | int]) -> None:
        for v in values:
            self.push(v)

# kernprof -l pathfinding_test.py
# python -m line_profiler pathfinding_test.py.lprof

# Using this method, I found that these lines had the highest percentage usage:
#    442    241700    6197741.3     25.6     ((((60.8%))))    existing_idx = find_index_in_node_list(node=nn, visited_list=seen_nodes)
#    438     34400    1052046.3     30.6     ((((10.3%))))     neighbour_nodes = get_valid_neighbour_nodes(node, goal_node, map)
#    447    127400     854746.0      6.7     (((((8.4%))))     existing_idx = find_index_in_node_list(node=nn, visited_list=to_be_processed)
@line_profiler.profile   # this decorator & the first terminal above causes a .lprof file to be saved, which can be processed by the second terminal command
def find_path_astar(map, start: tuple, goal: tuple) -> list[tuple]:
    """
    References
    1. https://www.redblobgames.com/pathfinding/a-star/introduction.html
    2. Pathfinding - Understanding A* (A star) - Tarodev (YouTube)
    """

    if is_invalid_position(map, start) or is_invalid_position(map, goal):
        print(f"Terminating - start or goal is an invalid position")
        return []

    def h_cost_heuristic(tx: int, ty: int, gx: int, gy: int):
        # return 0      # returns close to the optimal path but is similar to BFS in computational efficiency (Djikstra)
        return abs(tx - gx) + abs(ty - gy)

    def create_node(node_pos, g_cost, h_cost, parent_node):
        return {'pos': node_pos, 'f': g_cost+h_cost, 'g': g_cost, 'h': h_cost, 'parent': parent_node, 'stale': False}

    def calculate_seen_index(x, y, width):
        return y * width + x

    def is_invalid_neighbour_node(x1, y1, passability_map, xmax: int, ymax: int) -> bool:
        # Check map bounds
        if x1 < 0 or x1 >= xmax:
            return True
        if y1 < 0 or y1 >= ymax:
            return True

        # Check walkable
        valid_tile = passability_map[y1][x1]  # NOTE: array indexing map needs to be in this order because it looks up 'rows' = 'y', and then 'cols' = 'x'
        if not valid_tile:
            return True

        return False

    ymax, xmax = map.shape
    seen_nodes = [None] * (ymax * xmax)
    to_be_processed_lookup: list[Any] = [None] * (ymax * xmax)

    start_h_cost = h_cost_heuristic(start[0], start[1], goal[0], goal[1])

    start_node = create_node(start, 0, start_h_cost, None)
    gx, gy = goal

    # Initialise heap
    h = MyAStarMinHeap()

    h.push(start_node)

    neighbour_offsets_and_gcosts = [
        # The data format chosen below is chosen for performance reasons (this does make the code harder to read though):
        #   (xoffset, yoffset, gcost delta (additional g cost compared to the parent))

        # Manhattan heuristic remains admissible because diagonal cost == 2, equivalent to two orthogonal moves.
        # If diagonal cost changes (e.g. sqrt(2)), the heuristic must change.
        (-1, 0, 1), (1, 0, 1), (0, -1, 1), (0, 1, 1), (-1, -1, 2), (-1, 1, 2), (1, 1, 2), (1, -1, 2)
    ]

    iters = 0
    max_iterations = 5000      # to prevent the algorithm from running forever if I make a mistake
    while len(h) > 0 and iters < max_iterations:

        node = h.pop()
        if node['stale']:
            continue

        g_cost = node['g']

        pos = node['pos']
        nx, ny = pos

        nidx = calculate_seen_index(nx, ny, xmax)
        to_be_processed_lookup[nidx] = None
        seen_nodes[nidx] = node

        if nx == gx and ny == gy:
            print(f'goal found - terminated early ({iters} iterations)')
            break

        for nn in neighbour_offsets_and_gcosts:
            ox, oy, gdelta = nn
            nnx = nx + ox
            nny = ny + oy

            if is_invalid_neighbour_node(nnx, nny, map, xmax, ymax):
                continue

            # Search in the `seen_nodes` list (!) for the node (seen nodes are not updated)
            nb_idx = calculate_seen_index(nnx, nny, xmax)

            NODE_PREVIOUSLY_PROCESSED = seen_nodes[nb_idx]
            if NODE_PREVIOUSLY_PROCESSED is not None:
                continue

            # Search in the `to_be_processed` list (!) for the node
            existing_node = to_be_processed_lookup[nb_idx]      # this now contains a reference to the actual node
            if existing_node is not None:

                potential_new_g_cost = g_cost + gdelta      # the g cost if the current node is taken as parent

                # Check if new g cost is lower than the existing gcost
                if potential_new_g_cost < existing_node['g']:
                    existing_node['stale'] = True       # This sets the old node as 'stale' which will be ignored during processing. This is required because binary trees cannot 'readjust themselves'

                    new_node = create_node(
                        node_pos=(nnx, nny),
                        g_cost=potential_new_g_cost,                # take on new g cost
                        h_cost=h_cost_heuristic(nnx, nny, gx, gy),
                        parent_node=node                            # take on current parent
                    )
                    h.push(new_node)
                    to_be_processed_lookup[nb_idx] = new_node

                continue

            # Else not yet available
            new_node = create_node(
                node_pos=(nnx, nny),
                g_cost=g_cost + gdelta,
                h_cost=h_cost_heuristic(nnx, nny, gx, gy),
                parent_node=node
            )

            h.push(new_node)
            to_be_processed_lookup[nb_idx] = new_node

        # if iters < 10:
        #     print(f"Iter {iters}:\t{to_be_processed[-2:]} (frontier len: {len(to_be_processed)})")

        iters += 1

    print(f"A* completed in {iters} iterations.")

    ##################################################################################

    # back out the path, starting from the end node
    result = []
    gidx = calculate_seen_index(gx, gy, xmax)       # index the goal node
    n = seen_nodes[gidx]                            # retrieve the goal node

    if n is None:
        return []

    iters = 0
    while n['parent'] is not None and iters < max_iterations:
        result.insert(0, n['pos'])
        n = n['parent']

        iters += 1

    # print(f"result: {result}")
    return result


def run_reference_astar_implementation(passability_map, start: tuple, goal: tuple):
    # Disclaimer: this function was mostly generated by AI.
    # pip install pathfinding

    # The imports are here for code clarity
    from pathfinding.core.diagonal_movement import DiagonalMovement
    from pathfinding.core.grid import Grid
    from pathfinding.finder.a_star import AStarFinder

    # # 1. Represent your map (1 = walkable, 0 = obstacle/wall)
    # matrix = [
    #   [1, 1, 1],
    #   [1, 0, 1],
    #   [1, 1, 1]
    # ]
    grid = Grid(matrix=passability_map)

    # 2. Set start and end node objects
    start_node = grid.node(START[0], START[1])
    end_node = grid.node(GOAL[0], GOAL[1])

    # 3. Initialize the finder (supports DiagonalMovement.always, .never, etc.)
    finder = AStarFinder(diagonal_movement=DiagonalMovement.always)

    print("\n--------------------------------------------------------------")
    START_TIME = get_time()

    # 4. Run the finder
    path, runs = finder.find_path(start_node, end_node, grid)

    END_TIME = get_time()

    EXECUTION_TIME_MS = round((END_TIME - START_TIME) * 1000, 2)
    print(f"`Python 'pathfinding' library A*` -> {EXECUTION_TIME_MS} ms")
    print("--------------------------------------------------------------")

    plotting_path = [(n.x, n.y) for n in path]
    plot_map_and_path(raw_map=passability_map, found_path=plotting_path, start=start, goal=goal)


class BasicPathTest:
    def __init__(self):
        self.test_map = np.array([
            [1, 1, 1],
            [0, 0, 1],
            [1, 1, 1]
        ], dtype=bool)

        self.start = (0, 0)
        self.goal = (0, 2)

        # self.correct_path = [(0,0), (1,0), (2,0), (2,1), (2,2), (1,2), (0, 2)]      # up / down / left / right neighbours only
        self.correct_path = [(0,0), (1,0), (2,1), (1,2), (0, 2)]      # diagonal search included

    def run_test(self, pathfinding_algorithm: Callable):

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


def run_and_time_pathing(pathfinding_algorithm: Callable) -> None:
    print("\n--------------------------------------------------------------")
    START_TIME = get_time()
    path = pathfinding_algorithm(map=passability_map, start=START, goal=GOAL)
    END_TIME = get_time()

    EXECUTION_TIME_MS = round((END_TIME - START_TIME) * 1000, 2)

    print(f"`{pathfinding_algorithm.__name__}` -> {EXECUTION_TIME_MS} ms")
    plot_map_and_path(raw_map=passability_map, found_path=path, start=START, goal=GOAL)
    print("--------------------------------------------------------------")


def profile_algorithm(pathfinding_algorithm: Callable, passability_map, start: tuple, goal: tuple):
    # Using this function showed the highest performance impact functions (7f889f2) were:
    #   1. find_index_in_node_list (369200 calls, 2.383s cumulative time)
    #   2. get_valid_neighbour_nodes (34400 calls, 0.513s cumulative time)
    #   3. get_f_cost (1427900 calls, 0.143s cumulative)
    #   4. h_cost_heuristic (241800 calls, 0.125s cumulative)
    #   5. create_node (241900 calls, 0.042s cumulative)

    import cProfile
    import pstats

    pr = cProfile.Profile()
    pr.enable()

    for _ in range(100):
        pathfinding_algorithm(map=passability_map, start=start, goal=goal)

    pr.disable()

    stats = pstats.Stats(pr)
    stats.sort_stats("tottime")
    stats.print_stats(20)


############################## MAIN ##############################

if __name__ == '__main__':

    ################### USER CONFIG START ###################
    FILE_NAME = "bloat_terrainType"  # this is the data obtained from the `MapTiles.terrainType` global

    START = (90, 65)
    GOAL = (83, 75)

    PLOT_RESULTS = False
    RUN_PROFILING = True
    RUN_TESTS = False
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
    if PLOT_RESULTS:
        run_and_time_pathing(find_path_bfs)
        run_and_time_pathing(find_path_greedy_best_first_search)
        run_and_time_pathing(find_path_astar)
        run_reference_astar_implementation(passability_map, START, GOAL)

    if RUN_PROFILING:
        profile_algorithm(find_path_astar, passability_map, START, GOAL)

    if RUN_TESTS:
        pathing_algorithm = find_path_greedy_best_first_search
        test_harness.run_test(pathing_algorithm)
