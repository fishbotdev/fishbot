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

r"""
The purpose of this file is to implement the test pipeline as laid out in `fishbot/docs/ARCHITECTURE` in the
*Automatic Testing Pipeline* section.

I cloned FishBot into a new configuration directory ('PRODCONFIG') and am running autogames from 
    this 'production' folder (this explains the file paths for `warzone2100.exe` & `PRODCONFIG`).
This means I can run autogames & perform development simultaneously using the same `warzone2100.exe`, e.g. 
1. different config directories for dev / prod (which allows for) 
2. different mods directories (which allows for)
3. different FishBot instances

The split between the development / production environment is not strictly necessary,
    but it has made development + testing a lot more streamlined!
"""

import _set_autogame_config as cfg
import _create_1v1_challenge_json as g
import _run_and_save_autogames as test_runner
import _process_autogame_results as test_processor

from os import getcwd

#################################### USER CONFIG START ####################################

PRODUCTION_TEST_FOLDER_PATH = r"..\Warzone 2100\PRODCONFIG\tests"

REGENERATE_TESTS = True
# config_generator = cfg.generate_1v1_cobra_med_3P
# config_generator = cfg.generate_1v1_cobra_hard_3P
# config_generator = cfg.generate_1v1_cobra_insane_3P
# config_generator = cfg.generate_1v1_peacemaker_med_3P
config_generator = cfg.generate_1v1_peacemaker_hard_3P

RUN_TESTS = True               # Please see `__main__` in `_run_and_save_autogames.py` for how to set up your console.
NUM_CYCLES_PER_TEST = 100
TEST_RESULTS_FOLDER_PATH = getcwd()

# Test metadata
COMMIT_SHA = r"""
3781360b96ba82f5e096bdde6868a8764f3522fb
"""

#################################### USER CONFIG END ####################################

# Preprocess information
SHORT_SHA = COMMIT_SHA.lstrip()[:7]

# Generate test.json files
SKIRMISH_SETTINGS, MAP_SETTINGS = config_generator()
data = g.generate_json_test_data(skirmish_settings=SKIRMISH_SETTINGS, map_settings=MAP_SETTINGS)

test_file_names = []
for d in data:
    FILE_NAME, _ = g.extract_file_name_and_data(d)
    test_file_names.append(FILE_NAME)

if REGENERATE_TESTS:
    g.save_challenge_files(generated_test_data=data, output_folder_path=PRODUCTION_TEST_FOLDER_PATH)

wip_file_names = []

total_test_time_mins = 0.0

for test_file_name in test_file_names:
    TEMP_FILE_NAME = f"{SHORT_SHA},{test_file_name},{NUM_CYCLES_PER_TEST}G.jsonl"
    wip_file_names.append(TEMP_FILE_NAME)

    if RUN_TESTS:
        mins_to_complete = test_runner.run_tests(
            test_file_name=test_file_name,
            in_progress_file_name=TEMP_FILE_NAME,
            cycles=NUM_CYCLES_PER_TEST
        )

        total_test_time_mins += mins_to_complete

# Now loop through WIP filenames
print(f"Total test time: {round(total_test_time_mins, 2)} mins.")
for file_name in wip_file_names:
    test_processor.print_test_summary(test_results_folder_path=TEST_RESULTS_FOLDER_PATH, test_file_name=file_name)
