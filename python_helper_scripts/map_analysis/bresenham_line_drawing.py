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
from math import floor, ceil
import bresenham as b

# Disclaimer: plot_line is implemented by AI (ChatGPT), but the
# rest of the software was implemented by hand for learning.

# 02 Jun 2026 - passes some test cases, fails others (not general to Q2, Q3 or Q4)
# Decided to copy a JS implementation into Fishbot.


############################## HELPER FUNCTIONS ##############################


def plot_line(line: list[tuple], start: tuple, goal: tuple):
    """
    Plots a grid line using imshow, handling negative coordinates.
    Assumes start and goal scatter plots are handled outside or added here.
    """
    # 1. Collect all points to determine the dynamic bounding box
    all_points = line + [start, goal]
    x_coords = [p[0] for p in all_points]
    y_coords = [p[1] for p in all_points]

    # Define grid boundaries (add 1 buffer to comfortably fit the squares)
    min_x, max_x = min(x_coords), max(x_coords)
    min_y, max_y = min(y_coords), max(y_coords)

    # Calculate required dimensions of the pixel grid matrix
    width = max_x - min_x + 1
    height = max_y - min_y + 1

    # 2. Initialize an empty grid matrix
    # We use NaN or zeros. Using a masked array or zeros works well.
    grid = np.zeros((height, width))

    # 3. Populate the grid matrix
    # Map world coordinates to matrix indices, accounting for negative offsets
    for x, y in line:
        # X maps directly with offset
        col_idx = x - min_x
        # Y maps from the bottom up, so invert it relative to matrix height
        row_idx = (height - 1) - (y - min_y)

        # Guard clause to ensure coordinates stay inside matrix bounds
        if 0 <= row_idx < height and 0 <= col_idx < width:
            grid[row_idx, col_idx] = 1

    # 4. Render the pixel grid
    # 'extent' aligns the matrix cells perfectly with your world integer coordinates
    extent = [min_x - 0.5, max_x + 0.5, min_y - 0.5, max_y + 0.5]
    plt.imshow(grid, cmap="gray_r", extent=extent, origin="upper", alpha=0.6)

    # 5. Your existing start and goal scatter logic goes here
    # Rendered on top of the pixel grid
    # Start marker (green square)
    plt.scatter(
        start[0],
        start[1],
        marker="s",
        color="limegreen",
        s=150,
        zorder = 1,
    )

    # Destination marker (red diamond)
    plt.scatter(
        goal[0],
        goal[1],
        marker="D",
        color="red",
        s=150,
        zorder = 1,
    )

    # 6. Configure pixel-perfect grid aesthetics
    plt.grid(True, which='both', color='blue', linestyle='-', linewidth=0.5)
    plt.xticks(range(min_x, max_x + 1))
    plt.yticks(range(min_y, max_y + 1))
    plt.gca().set_aspect('equal', adjustable='box')

    plt.show()


def draw_line_unoptimised(start: tuple, goal: tuple, debug_print: bool=False) -> list[tuple]:
    """
    The purpose of this function is to approximate an ideal line drawn on a grid using Besenham's algorithm.
    The intent of this is to use a simple raymarching algorithm to be able to cheaply prioritise targets without BFS.

    This function is the unoptimised variant (e.g. uses FP division).
    """

    x0 = start[0]
    y0 = start[1]

    x1 = goal[0]
    y1 = goal[1]

    dx = x1 - x0
    dy = y1 - y0
    if dx == 0:
        return [(x0, y) for y in range(y0, y1+1)]       # special case of vertical line

    gradient = (dy) / (dx)                    # compute the gradient of the 'ideal line'

    xrange = list(range(x0, x1+1, 1 if (x1 > x0) else -1))      # creates an integer x-range

    y_offset = 1 if y1 > y0 else -1
    y_check_offset = 0.5 if y1 > y0 else -0.5

    result_x = [x0]
    result_y = [y0]

    xrange = xrange[1:]     # remove the first entry as its already in the result array

    for i, xi in enumerate(xrange):
        result_x.append(xi)
        # print(xi)

        # Compute ideal y at xi
        yi = gradient * (xi - x0) + y0
        # print(f" - {yi}")

        # Compute difference between yi and the current y value
        # NOTE: this part (which fills up the columns) has bugs in it, duplicate entries are common
        ############

        integer_offset = int(round(abs(result_y[-1] - yi), 0))
        # print(integer_offset)
        if integer_offset > 1:
            for i in range(1, integer_offset+1, 1):
                # check to see if the next point is going to be covered by the 'midpoint-check' below
                if abs((result_y[-1]+y_offset) - (gradient * xi + y0)) < 0.5:
                    break

                # Stuff values
                result_x.append(xi)
                result_y.append(result_y[-1]+y_offset)

        ############

        # Decide whether y0 should: (1) stay the same or (2) go up or down by `y_offset`
        y_checkpoint = result_y[-1] + y_check_offset

        # Check against the midpoint ('checkpoint')
        new_y = result_y[-1]
        if yi - y_checkpoint >= 0 and y1 > y0:
            new_y += y_offset
        elif yi - y_checkpoint <= 0 and y1 < y0:
            new_y += y_offset

        result_y.append(new_y)

    # Post-processing

    # Left to right (for human readability, makes no difference when used in an algorithm)
    if x1 < x0:
        result_y.reverse()
        result_x.reverse()

    result = list(zip(result_x, result_y))
    if debug_print:
        print(result)
    return result


class BasicLineTest:
    def __init__(self):

        self.inputs = [
            [(0, 0), (6, 6)],
            [(0, 0), (10, 0)], # horizontal
            [(0, 0), (0, 10)], # vertical
            [(0, 0), (10, 10)], # diagonal slope 1
            [(0, 0), (10, -10)], # diagonal slope -1
    
            [(0, 0), (10, 3)], # shallow positive
            [(0, 0), (3, 10)], # steep positive
    
            [(0, 0), (-10, 3)], # quadrant II
            [(0, 0), (-3, 10)],
    
            [(0, 0), (-10, -3)], # quadrant III
            [(0, 0), (-3, -10)],
    
            [(0, 0), (10, -3)], # quadrant IV
            [(0, 0), (3, -10)],
        ]
        self.tests = [self._create_test_case(idx, inputs) for idx, inputs in enumerate(self.inputs)]


    def _create_test_case(self, idx: int, input: list[tuple]) -> list[tuple]:
        inp = [num for tup in input for num in tup]      # flatten list of tuples to int: [(1,2), (3,4)] -> [1,2,3,4]

        test_case = {
            'name': idx,
            'inputs': input,
            'output': list(b.bresenham(*inp))
        }
        return test_case

    def _get_test_name(self, line_drawing_algorithm):
        CLASS_NAME = type(self).__name__
        ALGO_NAME = line_drawing_algorithm.__name__
        TEST_NAME = f"Test {CLASS_NAME} ({ALGO_NAME})"

        return TEST_NAME

    def run_tests(self, line_drawing_algorithm):

        TEST_NAME = self._get_test_name(line_drawing_algorithm)

        for test in self.tests:
            test_name = f"{TEST_NAME} ({test['name']})"
            answer = test['output']

            function_output = line_drawing_algorithm(*test['inputs'])

            if len(answer) != len(function_output):
                print(f"FAIL - {test_name} - (wrong length)")
                continue

            for i, step in enumerate(function_output):
                if step != answer[i]:
                    print(f"FAIL - {test_name} - (incorrect entry @ {i} ({step} != {answer[i]}) found)")
                    break
            else:
                print(f"PASS - {test_name}")


############################## MAIN ##############################
if __name__ == '__main__':

    ################### USER CONFIG START ###################

    INPUTS = [(3, -7), (10, 4)]

    line_drawing_algorithm = draw_line_unoptimised

    ENABLE_PLOT = True

    ################### USER CONFIG END ###################

    START = INPUTS[0]
    GOAL = INPUTS[1]

    print("\n--------------------------------------------------------------\n")
    START_TIME = get_time()
    new_line = line_drawing_algorithm(start=START, goal=GOAL, debug_print=True)
    END_TIME = get_time()

    EXECUTION_TIME_MS = round(END_TIME - START_TIME, 8) * 1000

    print(f"`{line_drawing_algorithm.__name__}` finished executing in: {EXECUTION_TIME_MS} ms")
    print("\n--------------------------------------------------------------\n")

    if ENABLE_PLOT:
        plot_line(line=new_line, start=START, goal=GOAL)

    test_harness = BasicLineTest()
    test_harness.run_tests(line_drawing_algorithm)
