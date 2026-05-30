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

# The purpose of this file is to implement the test pipeline as laid out in `fishbot/docs/ARCHITECTURE` -> Automatic Testing Pipeline.
# 1. `create_1v1_challenge_json.py` creates test files which are then manually moved into the `wz2100_config_directory/tests` folder.
# 2. `run_and_save_autogames.py` automatically runs all tests in the `wz2100_config_directory/tests` folder and saves the results to an intermediate `jsonl` file.
#     - `jsonl` is picked for its pure-append capability (data robustness to runtime failures) and its native data storage format (which makes extraction of data into Python a one-liner).
#     - Increased storage requirements and write speed are not critical for this application.
# 3. `process_autogame_results.py` reads the `jsonl` formatted results and plots statistics.

import set_autogame_config as cfg
import create_1v1_challenge_json as g
# import run_and_save_autogames as test_runner
# import process_autogame_results as test_processor

#################################### USER CONFIG START ####################################

RUN_TESTS = True
PRODUCTION_TEST_FOLDER_PATH = rf""
TEST_RESULTS_FOLDER_PATH = rf""

#################################### USER CONFIG END ####################################


if RUN_TESTS:

    # Generate tests & save to tests folder.
    SKIRMISH_SETTINGS, MAP_SETTINGS = cfg.generate_1v1_cobra_hard()
    data = g.generate_json_test_data(skirmish_settings=SKIRMISH_SETTINGS, map_settings=MAP_SETTINGS)
    g.save_challenge_files(json_test_data=data, output_folder_path=PRODUCTION_TEST_FOLDER_PATH)

    # Run tests in tests folder.
    # TEST_RESULTS_FOLDER_PATH = test_runner.run_tests(output_folder_path=TEST_RESULTS_FOLDER_PATH)
    # test_processor.compile_results(test_results_folder_path=TEST_RESULTS_FOLDER_PATH)

else:
    pass
    # test_processor.compile_results(test_results_folder_path=TEST_RESULTS_FOLDER_PATH)
