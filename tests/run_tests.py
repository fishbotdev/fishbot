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
import _run_and_save_autogames as test_runner
import _process_autogame_results as test_processor

import json
from pathlib import Path
from datetime import datetime


def write_json(path: Path, obj: dict) -> None:
    """Write a JSON file with consistent formatting."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=4)
        f.write("\n")


def read_json(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def run_worker(*, run_manifest_path: Path, test_ids: list[str]):
    """
    Executes the supplied list of test IDs.

    The worker performs no scheduling. It simply:
        - loads the run manifest,
        - looks up each test in the linked base manifest,
        - executes the requested number of runs,
        - appends results to the corresponding XXXXX.jsonl file.

    Returns
    -------
    dict
        {
            "tests_completed": int,
            "failures": int,
            "elapsed_minutes": float,
        }
    """

    RUN_MANIFEST = read_json(run_manifest_path)
    TEST_IDS = test_ids

    RUNS_PER_TEST = RUN_MANIFEST["runs_per_test"]
    BASE_MANIFEST_TESTS = read_json(RUN_MANIFEST["base_manifest_path"])["tests"]
    RESULTS_FOLDER_PATH = RUN_MANIFEST["results_folder_path"]

    tests_completed = 0
    failures = 0
    elapsed_minutes = 0.0

    for test_id in TEST_IDS:

        try:
            test = BASE_MANIFEST_TESTS[test_id]
            test_file_name = test["config_file"]

            elapsed_minutes += test_runner.run_tests(
                test_file_name=test_file_name,
                in_progress_file_path=Path(RESULTS_FOLDER_PATH) / f"{test_id}.jsonl",
                cycles=RUNS_PER_TEST,
            )

            tests_completed += 1

        except Exception as e:

            failures += 1
            print(f"[ERROR] Test {test_id} failed: {e}")

    return {
        "tests_completed": tests_completed,
        "failures": failures,
        "elapsed_minutes": elapsed_minutes,
    }


# The run_manifest is a test config file that dictates how the test should be run.
def create_run_manifest(short_sha: str, runs_per_test: int, test_result_path: Path) -> Path:

    SHORT_SHA = short_sha
    RUNS_PER_TEST = runs_per_test

    BASE_MANIFEST_PATH = Path.cwd() / "base_manifest.json"
    TEST_RESULTS_PATH = test_result_path

    run_manifest = {
        "version": 1,
        "short_sha": SHORT_SHA,
        "generated": datetime.now().isoformat(timespec="seconds"),
        "runs_per_test": RUNS_PER_TEST,
        "base_manifest_path": str(BASE_MANIFEST_PATH),
        "results_folder_path": str(TEST_RESULTS_PATH),
    }

    RUN_MANIFEST_PATH = TEST_RESULTS_PATH / "run_manifest.json"
    RUN_MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)

    write_json(RUN_MANIFEST_PATH, run_manifest)

    return RUN_MANIFEST_PATH


def assign_test_ids_to_workers(
    base_manifest_path: Path,
    worker_count: int,
) -> dict[int, list[str]]:
    """
    Evenly distribute tests between workers.

    Tests are assigned round-robin in manifest order:

        Worker 0 -> 00000, 00005, 00010, ...
        Worker 1 -> 00001, 00006, 00011, ...
        ...

    Returns
    -------
    dict[int, list[str]]
        Mapping of worker ID to the test IDs assigned to that worker.
    """

    base_manifest = read_json(base_manifest_path)

    ALL_TEST_IDS = list(base_manifest["tests"].keys())

    assignments = {
        worker_id: []
        for worker_id in range(worker_count)
    }

    for index, test_id in enumerate(ALL_TEST_IDS):
        worker_id = index % worker_count
        assignments[worker_id].append(test_id)

    return assignments


def run_tests():

    COMMIT_SHA = "12345"
    SHORT_SHA = COMMIT_SHA[:7]
    RUNS_PER_TEST = 2
    TEST_RESULT_PATH = Path.cwd() / "results" / SHORT_SHA

    run_manifest_path = create_run_manifest(short_sha=SHORT_SHA, runs_per_test=RUNS_PER_TEST, test_result_path=TEST_RESULT_PATH)

    WORKER_COUNT = 5
    BASE_MANIFEST_PATH = Path.cwd() / "base_manifest.json"
    worker_assignments = assign_test_ids_to_workers(BASE_MANIFEST_PATH, WORKER_COUNT)

    # Temporary: run worker 0 only.
    summary = run_worker(
        run_manifest_path=run_manifest_path,
        test_ids=worker_assignments[0],
    )

    print(summary)


if __name__ == "__main__":
    run_tests()

    # TEMPORARY
    # FILE_NAME = f"00023.jsonl"
    # test_processor.print_test_summary(test_results_folder_path=Path("results/12345"), test_file_name=FILE_NAME)

