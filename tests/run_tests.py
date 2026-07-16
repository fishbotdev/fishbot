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

import json
from pathlib import Path
from datetime import datetime
import argparse
import subprocess
import sys


def write_json(path: Path, obj: dict) -> None:
    """Write a JSON file with consistent formatting."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=4)
        f.write("\n")


def read_json(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def run_worker(*, run_manifest_path: Path, worker_id: int):
    """
    Executes all tests assigned to a worker.

    The worker performs no scheduling. It simply:
        - loads the run manifest,
        - retrieves its assigned test IDs,
        - looks up each test in the base manifest,
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

    # Load run configuration.
    RUN_MANIFEST = read_json(run_manifest_path)

    RUNS_PER_TEST = RUN_MANIFEST["runs_per_test"]
    RESULTS_FOLDER_PATH = Path(RUN_MANIFEST["results_folder_path"])
    BASE_MANIFEST_PATH = Path(RUN_MANIFEST["base_manifest_path"])

    # Load worker assignment.
    WORKER_ASSIGNMENTS = RUN_MANIFEST["worker_assignments"]
    TEST_IDS = WORKER_ASSIGNMENTS[str(worker_id)]

    # Load base manifest.
    BASE_MANIFEST_TESTS = read_json(BASE_MANIFEST_PATH)["tests"]

    tests_completed = 0
    failures = 0
    elapsed_minutes = 0.0

    for test_id in TEST_IDS:

        try:
            test = BASE_MANIFEST_TESTS[test_id]
            test_file_name = test["config_file"]

            elapsed_minutes += test_runner.run_tests(
                test_file_name=test_file_name,
                in_progress_file_path=RESULTS_FOLDER_PATH / f"{test_id}.jsonl",
                cycles=RUNS_PER_TEST,
            )

            tests_completed += 1

        except Exception as e:
            failures += 1
            print(f"[Worker {worker_id}] ERROR: Test {test_id} failed: {e}")

    return {
        "tests_completed": tests_completed,
        "failures": failures,
        "elapsed_minutes": elapsed_minutes,
    }


# The run_manifest is a test config file that dictates how the test should be run.
def write_run_manifest(short_sha: str, runs_per_test: int, base_manifest_path: Path, test_result_path: Path, worker_assignments: dict) -> Path:

    SHORT_SHA = short_sha
    RUNS_PER_TEST = runs_per_test
    BASE_MANIFEST_PATH = base_manifest_path
    TEST_RESULTS_PATH = test_result_path

    run_manifest = {
        "version": 1,
        "short_sha": SHORT_SHA,
        "generated": datetime.now().isoformat(timespec="seconds"),
        "runs_per_test": RUNS_PER_TEST,
        "base_manifest_path": str(BASE_MANIFEST_PATH),
        "results_folder_path": str(TEST_RESULTS_PATH),
        "worker_assignments": worker_assignments
    }

    RUN_MANIFEST_PATH = TEST_RESULTS_PATH / "run_manifest.json"
    RUN_MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)

    write_json(RUN_MANIFEST_PATH, run_manifest)

    return RUN_MANIFEST_PATH


def assign_test_ids_to_workers(
    test_ids: list[str],
    worker_count: int,
) -> dict[str, list[str]]:
    """
    Evenly distribute tests between workers.

    Tests are assigned round-robin in manifest order:

        Worker 0 -> 00000, 00005, 00010, ...
        Worker 1 -> 00001, 00006, 00011, ...
        ...

    Returns
    -------
    dict[str, list[str]]
        Mapping of worker ID to the test IDs assigned to that worker.
    """

    assignments = {
        str(worker_id): []
        for worker_id in range(worker_count)
    }

    for index, test_id in enumerate(test_ids):
        worker_id = str(index % worker_count)
        assignments[worker_id].append(test_id)

    return assignments


def filter_completed_tests(
    test_ids: list[str],
    results_folder: Path,
) -> list[str]:
    """
    Removes tests that already have result files.

    Returns only the test IDs that still need to be executed.
    """

    remaining = []

    for test_id in test_ids:

        result_path = results_folder / f"{test_id}.jsonl"

        if result_path.exists() and result_path.stat().st_size > 0:
            continue

        remaining.append(test_id)

    return remaining


def launch_workers(
    *,
    run_manifest_path: Path,
    worker_count: int,
):

    processes = []

    for worker_id in range(worker_count):

        process = subprocess.Popen(
            [
                sys.executable,
                str(Path(__file__).resolve()),
                "--run-manifest",
                str(run_manifest_path),
                "--worker-id",
                str(worker_id),
            ],
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        )

        processes.append(process)

    for process in processes:
        process.wait()


def run_batch_test() -> Path:

    WORKER_COUNT = 8

    COMMIT_SHA = "32d533f5a21991b6bd2be59bc7010496f0b5f786"
    SHORT_SHA = COMMIT_SHA[:7]
    RUNS_PER_TEST = 10

    BASE_MANIFEST_PATH = Path.cwd() / "base_manifest.json"
    TEST_RESULTS_PATH = Path.cwd() / "results" / SHORT_SHA

    base_manifest = read_json(BASE_MANIFEST_PATH)
    all_test_ids = list(base_manifest["tests"].keys())

    remaining_test_ids = filter_completed_tests(
        all_test_ids,
        TEST_RESULTS_PATH,
    )

    worker_assignments = assign_test_ids_to_workers(
        remaining_test_ids,
        WORKER_COUNT,
    )

    run_manifest_path = write_run_manifest(
        short_sha=SHORT_SHA,
        runs_per_test=RUNS_PER_TEST,
        base_manifest_path=BASE_MANIFEST_PATH,
        test_result_path=TEST_RESULTS_PATH,
        worker_assignments=worker_assignments,
    )

    launch_workers(
        run_manifest_path=run_manifest_path,
        worker_count=WORKER_COUNT,
    )

    return run_manifest_path


if __name__ == "__main__":

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--run-manifest",
        type=Path,
    )

    parser.add_argument(
        "--worker-id",
        type=int,
    )

    args = parser.parse_args()

    if args.run_manifest is not None:
        # Worker mode
        if args.worker_id is None:
            parser.error("--worker-id is required when using --run-manifest")

        summary = run_worker(
            run_manifest_path=args.run_manifest,
            worker_id=args.worker_id,
        )

        print(summary)
    else:
        # Orchestrator mode
        run_batch_test()
