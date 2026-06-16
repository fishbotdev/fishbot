"""
This is a throwaway script for learning how binary heaps work.
"""

import random

class MyBinaryHeap:
    def __init__(self):

        COUNT = 27

        self.heap = list(range(COUNT))
        # self.heap = [random.randint(0, 99) for _ in range(COUNT)]
        # self.heap = []


    def print_heap(self):
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


    def insert(self):
        pass

    def delete(self):
        pass

    def create_heap(self):
        pass


if __name__ == '__main__':
    h = MyBinaryHeap()
    h.print_heap()
