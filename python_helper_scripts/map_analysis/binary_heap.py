"""
This is a throwaway script for learning how binary heaps work.
"""

import random
from math import floor
from typing import Optional


class MyBinaryMinHeap:
    # This heap is implemented zero-index formulas
    #   Node i (zero indexed)
    #   Left child `2*i+1`
    #   Right child `2*i+2`
    #   Parent node `floor((i - 1) / 2)`

    def __init__(self):
        self.heap: list[float | int] = []

        self.satifies_heap_invariant = self._satisfies_min_heap_invariant
        self.get_best_child = self._get_smallest_child

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

    @staticmethod
    def _satisfies_min_heap_invariant(parent_value, child_value):
        if parent_value < child_value:
            return True
        else:
            return False

    @staticmethod
    def _get_smallest_child(child1: tuple, child2: tuple) -> tuple:
        child1_idx, child1_value = child1
        child2_idx, child2_value = child2

        if child1_value <= child2_value:
            return child1
        else:
            return child2

    def push(self, value: float | int):
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
            if self.satifies_heap_invariant(parent_value=parent_value, child_value=curr_value):
                break

            self.heap[parent_idx] = curr_value
            self.heap[curr_idx] = parent_value
            curr_idx = parent_idx

    def peek(self) -> Optional[float | int]:
        return self.heap[0] if len(self.heap) > 0 else None

    def pop(self) -> Optional[float | int]:
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
                child_idx, child_value = self.get_best_child(child1, child2)

            if self.satifies_heap_invariant(parent_value=curr_value, child_value=child_value):
                break

            # Else swap & continue to recurse
            self.heap[curr_idx] = child_value
            self.heap[child_idx] = curr_value
            curr_idx = child_idx

        return first_entry


    def create_heap(self, values: list[float | int]) -> None:
        for v in values:
            self.push(v)


def run_heap_sort(values: list[float | int]) -> list[float | int]:
    sorted_values = []

    h = MyBinaryMinHeap()
    h.create_heap(values)

    while len(h):
        sorted_values.append(h.pop())

    return sorted_values


def run_adhoc_tests():
    h = MyBinaryMinHeap()

    COUNT = 17
    values = [random.randint(0, 99) for _ in range(COUNT)]

    h.create_heap(values)

    h.print_heap()

    for _ in range(5):
        print(h.pop())

    h.print_heap()

    print("\n\n\n")
    print("Heap Sort test")
    print(run_heap_sort(values))

def run_debug_tests():
    h = MyBinaryMinHeap()
    for x in [1,2,3,4,5]:
        h.push(x)

    h.print_heap()

    result = []
    while len(h):
        result.append(h.pop())

    print(result)

    print(run_heap_sort([1,2,3,4,5]))


if __name__ == '__main__':
    # run_adhoc_tests()
    run_debug_tests()
