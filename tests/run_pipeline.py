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
The purpose of this file is to run the whole test pipeline from one place:

    1. [optional] generate tests    (`run_test_generator.py`)
    2. run the autogames            (`run_tests.py`)
    3. report win / loss            (`run_result_parser.py`)
    4. report oil capture           (`run_telemetry_parser.py`)

Previously these were run by hand in sequence, with the commit SHA edited separately in
`run_tests.py` and `run_result_parser.py`. Those scripts still work standalone; this file just
chains them, and gathers the settings which used to be edited in three different files into the
single USER CONFIG block below.

=== BEFORE RUNNING ===
1. Set `fishbot/tests` as the current working directory.
2. Oil-capture telemetry is emitted whenever `DEBUG_MODE_ON` is `true` in the *production* copy of
   `FishBot_vX_Y_Z.js` (the copy under test), which is its normal state during development.
   With debug mode off, steps 1-3 still work but step 4 reports nothing.
3. The console must be wide enough that lines do not wrap - both the Game State summary table and
   the telemetry lines are recovered by scraping the console. In PyCharm, enable
   "Emulate Terminal In Output Console" in the Run Configuration.
"""

import CONSTANTS as C
import run_test_generator as generator
import run_tests as runner
import run_result_parser
import run_telemetry_parser

from pathlib import Path
import subprocess
import time


def get_current_commit_sha() -> str:
    """
    Reads the commit SHA of the working tree, so it doesn't have to be pasted in by hand.

    Note this is the SHA of the *test runner* checkout. If the production copy under test is at a
    different commit, set COMMIT_SHA explicitly below.
    """
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
    )

    return result.stdout.strip()


def run_pipeline(
    *,
    commit_sha: str,
    runs_per_test: int,
    worker_count: int,
    regenerate_tests: bool,
    base_maps_path: Path,
    maps_output_path: Path,
    tests_output_path: Path,
    test_set_name: str = "",
    opponent_ai: str = C.COBRA_AI,
    test_types: tuple = (C.DUEL, C.FFA),
) -> None:

    SHORT_SHA = commit_sha[:7]

    # A named test set keeps its manifest and its results apart from every other set. Without it a
    # duel-only run and the full matrix share `base_manifest.json` and `results/<sha>/`, where the same
    # test ID means different things - the runner would then skip tests it wrongly believes are done.
    manifest_name = f"base_manifest_{test_set_name}.json" if test_set_name else "base_manifest.json"
    manifest_path = Path.cwd() / manifest_name

    results_path = Path.cwd() / "results" / SHORT_SHA
    if test_set_name:
        results_path = results_path / test_set_name

    print(f"\nFishBot test pipeline - commit {SHORT_SHA}\n")

    print(f"  test set   {test_set_name or '(full matrix)'}")
    print(f"  types      {', '.join(test_types)}")
    print(f"  opponent   {opponent_ai}")
    print(f"  manifest   {manifest_name}")
    print(f"  results    {results_path}")
    print()

    # Step 1: repackage the maps & regenerate the challenge .json files + the test manifest.
    # Only needed when the map set or the skirmish settings have changed.
    if regenerate_tests:
        generator.repackage_maps_and_generate_tests(
            base_maps_path=base_maps_path,
            production_maps_path=maps_output_path,
            production_tests_path=tests_output_path,
            manifest_path=manifest_path,
            opponent_ai=opponent_ai,
            test_types=test_types,
        )

    # Step 2: run the autogames. This is the slow step (up to ~1 day for the full test matrix).
    start_time = time.time()

    runner.run_batch_test(
        commit_sha=commit_sha,
        runs_per_test=runs_per_test,
        worker_count=worker_count,
        base_manifest_path=manifest_path,
        test_results_path=results_path,
    )

    duration_minutes = (time.time() - start_time) / 60
    print(f"Batch test completed in {duration_minutes:.2f} minutes ({(duration_minutes / 60):.2f} hours).")

    # Step 3: did FishBot win?
    run_result_parser.main(
        commit_sha=commit_sha,
        base_manifest_path=manifest_path,
        test_results_path=results_path,
    )

    # Step 4: how well did FishBot capture oil?
    run_telemetry_parser.main(
        commit_sha=commit_sha,
        base_manifest_path=manifest_path,
        test_results_path=results_path,
    )


if __name__ == "__main__":

    #################################### USER CONFIG START ####################################

    # Which commit is under test. Used to name the results folder (`results/<short sha>/`).
    COMMIT_SHA = get_current_commit_sha()

    # Games per test. The full matrix is large, so lower this when checking a code change quickly.
    RUNS_PER_TEST = 3

    # Match to the number of CPU cores. Each worker gets its own console window.
    WORKER_COUNT = 10

    # Re-run the map repackaging & test generation. Only needed when the maps or the skirmish
    # settings have changed - the generated tests are reused between runs otherwise.
    REGENERATE_TESTS = True

    # Names this test set. Its manifest becomes `base_manifest_<name>.json` and its results land in
    # `results/<short sha>/<name>/`, so switching sets never collides with another set's test IDs.
    # Leave empty for the full E2E matrix, which keeps `base_manifest.json` and `results/<short sha>/`.
    TEST_SET_NAME = "duel_maps"

    # Which kinds of test to generate. `(C.DUEL,)` for duel-only, `(C.FFA,)` for FFA-only.
    # The map still has to suit the type: duels are generated up to 4 players, FFA from 3 players up.
    TEST_TYPES = (C.DUEL,)

    # The script every non-FishBot player runs, e.g. `C.COBRA_AI` or `C.PEACEMAKER_AI`.
    OPPONENT_AI = C.PEACEMAKER_AI

    BASE_MAPS_PATH = Path.cwd() / r'custom_test_map_packager\\v4.7.0_duel_maps'

    # Where the generated maps & tests are written (only used when REGENERATE_TESTS is set).
    BASE_PRODUCTION_DIRECTORY = r"..\Warzone 2100\PRODCONFIG"
    MAPS_OUTPUT_PATH = Path(rf"{BASE_PRODUCTION_DIRECTORY}\maps")
    TESTS_OUTPUT_PATH = Path(rf"{BASE_PRODUCTION_DIRECTORY}\tests")

    #################################### USER CONFIG END ####################################

    run_pipeline(
        commit_sha=COMMIT_SHA,
        runs_per_test=RUNS_PER_TEST,
        worker_count=WORKER_COUNT,
        regenerate_tests=REGENERATE_TESTS,
        base_maps_path=BASE_MAPS_PATH,
        maps_output_path=MAPS_OUTPUT_PATH,
        tests_output_path=TESTS_OUTPUT_PATH,
        test_set_name=TEST_SET_NAME,
        opponent_ai=OPPONENT_AI,
        test_types=TEST_TYPES,
    )
