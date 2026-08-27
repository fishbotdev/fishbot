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

import pandas as pd
from pathlib import Path
import json
from collections import defaultdict


def read_json(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def parse_test_results(test_file_path: Path) -> dict:
    """
    Parse a single test result (.jsonl).

    Returns
    -------
    dict
        {
            "games": 40,
            "wins": 40,
            "win_rate": 1.0,
        }
    """

    df = pd.read_json(test_file_path, lines=True)

    wins = 0
    games = 0

    for _, match_df in df.groupby("match_id"):

        search_result = match_df[
            match_df["name"].str.contains("Fis")
        ]

        if search_result.empty:
            print(f"'Fis' not found in: {test_file_path.resolve()}")
            break

        fishbot_row = search_result.iloc[0]

        if not fishbot_row["defeated"]:
            wins += 1

        games += 1

    return {
        "games": games,
        "wins": wins,
        "win_rate": wins / games if games else 0.0,
    }


def parse_all_results(
    *,
    base_manifest: dict,
    test_results_folder: Path,
) -> list[dict]:
    """
    Parses every completed test.

    Returns
    -------
    list[dict]

    Example entry:
    {
        "test_id": "00042",

        "test_type": "duel",
        "map_name": "3c-highground",
        "fishbot_position": 1,
        "opponent_position": 2,
        "config_file": "...",

        "games": 40,
        "wins": 39,
        "win_rate": 0.975,
    }
    """

    parsed_tests = []

    for test_id, metadata in base_manifest["tests"].items():

        result_file = test_results_folder / f"{test_id}.jsonl"

        if not result_file.exists():
            continue

        stats = parse_test_results(result_file)

        parsed_tests.append({
            "test_id": test_id,
            **metadata,
            **stats,
        })

    return parsed_tests


def group_tests_by_map(parsed_tests: list[dict]) -> dict:
    """
    Groups parsed test results by map and test type.

    Returns
    -------
    dict

        {
            "3c-highground": {
                "duel": [
                    {...},
                    {...},
                ],
                "ffa": [
                    {...},
                    {...},
                    {...},
                ],
            },

            "5c-cockpit": {
                ...
            },
        }
    """

    grouped = defaultdict(
        lambda: {
            "duel": [],
            "ffa": [],
        }
    )

    for map_results in grouped.values():

        map_results["ffa"].sort(
            key=lambda t: t["fishbot_position"]
        )

        map_results["duel"].sort(
            key=lambda t: (
                t["fishbot_position"],
                t["opponent_position"],
            )
        )

    for test in parsed_tests:
        grouped[test["map_name"]][test["test_type"]].append(test)

    return dict(grouped)


def make_bar(win_rate: float, *, length: int = 20) -> str:
    filled = round(win_rate * length)
    return "█" * filled + "░" * (length - filled)


def summarise_tests(test_list: list[dict]) -> dict | None:

    if not test_list:
        return None

    wins = sum(test["wins"] for test in test_list)
    games = sum(test["games"] for test in test_list)

    return {
        "wins": wins,
        "games": games,
        "win_rate": wins / games if games else 0.0,
    }


def print_mode_summary(
    mode_name: str,
    tests: list[dict],
) -> None:

    if not tests:
        return

    summary = summarise_tests(tests)
    worst = min(tests, key=lambda t: t["win_rate"])

    print(
        f"{mode_name:<5}"
        f"{summary['wins']:>4}/{summary['games']:<4}"
        f" ({summary['win_rate']*100:>3.0f}%)  "
        f"[{make_bar(summary['win_rate'])}]"
    )

    print(
        f"  Worst"
        f"{worst['wins']:>4}/{worst['games']:<4}"
        f" ({worst['win_rate']*100:>3.0f}%)  "
        f"[{make_bar(worst['win_rate'])}]"
    )

    print(
        f"  Config "
        f"{worst['config_file']}"
    )


def print_map_summary(grouped_results: dict[str, dict]) -> None:

    #
    # Sort maps by their weakest individual test.
    #
    ranked_maps = []

    for map_name, modes in grouped_results.items():

        all_tests = modes["duel"] + modes["ffa"]

        if not all_tests:
            continue

        ranked_maps.append((
            min(test["win_rate"] for test in all_tests),
            map_name,
        ))

    ranked_maps.sort()

    #
    # Print report.
    #
    for _, map_name in ranked_maps:

        duel_tests = grouped_results[map_name]["duel"]
        ffa_tests = grouped_results[map_name]["ffa"]

        print("-" * 60)
        print(map_name)
        print()

        print_mode_summary("Duel", duel_tests)

        if duel_tests and ffa_tests:
            print()

        print_mode_summary("FFA", ffa_tests)

        print()


def main(
    commit_sha: str,
    base_manifest_path: Path = None,
    test_results_path: Path = None,
) -> None:
    """
    Prints the win/loss report for a completed batch test.

    Exposed as a function (rather than living in `__main__`) so that `run_pipeline.py` can run the
    whole generate -> run -> parse sequence without the commit SHA having to be edited in two files.
    """

    BASE_MANIFEST_PATH = base_manifest_path or (Path.cwd() / "base_manifest.json")
    base_manifest = read_json(BASE_MANIFEST_PATH)

    SHORT_SHA = commit_sha[:7]

    TEST_RESULTS_PATH = test_results_path or (Path.cwd() / "results" / SHORT_SHA)

    parsed_tests = parse_all_results(
        base_manifest=base_manifest,
        test_results_folder=TEST_RESULTS_PATH,
    )

    grouped_results = group_tests_by_map(parsed_tests)

    print_map_summary(grouped_results)


if __name__ == "__main__":

    COMMIT_SHA = "b155be21ee55cffe7240ab54bd39e5a2ced12ab2"

    main(commit_sha=COMMIT_SHA)