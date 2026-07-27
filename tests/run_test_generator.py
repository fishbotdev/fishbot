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

Its purpose is to
1. Repackage the base maps into N+1 player maps (where Player 0 is duplicated) defined in the JSONV2 format.
2. Generate challenge .json files so autogames can automatically be run across all supported base maps.

Note: The maximum player count is 10 players, so the map repackaging will not work for 10p maps (which would result in 11 total players).
    TODO: find a way to test 10p maps.
"""

import CONSTANTS as C

import _create_1v1_challenge_json as g
from custom_test_map_packager import run_test_map_packager as p

from pathlib import Path
import re


def extract_mapname_and_playercount(batch_report: list) -> list:
    """
    Build map metadata from successfully packaged maps.

    Returns:
    [
        {
            "mapName": "3p-Monocot",
            "maxPlayers": 3,
        },
    ]
    """
    settings = []

    for result in batch_report:
        if not result["success"]:
            continue

        map_name = Path(result["output"]).stem

        match = re.match(r"(\d+)c-", map_name)
        if match is None:
            raise ValueError(f"Invalid output filename: {result['output']}")

        settings.append({
            "mapName": map_name,
            "maxPlayers": int(match.group(1)),
        })

    return settings


def repackage_maps_and_generate_tests(base_maps_path, production_maps_path, production_tests_path) -> Path:
    # Step 1: Regenerate custom maps if needed.
    # TODO: check if the required maps are present & automatically generate if they are not
    batch_report = p.run_batch_map_packaging(base_maps_path, production_maps_path)
    p.print_report_pretty(batch_report)

    ## Note: `batch_report` is formatted like so:
    """
    results.append({
        "map": str -> folder_name.name,
        "success": bool,
        "error": str(e),
        "output": Optional[str]; where the string is the OUTPUT FILENAME = `output_path.name`
    })
    """

    # Step 2: Extract a list of successfully generated maps
    map_names_and_max_players_list = extract_mapname_and_playercount(batch_report)

    ## Note: `map_name_and_max_players` is formatted like so:
    """
    [
        {
            "mapName": "4c-Gamma",
            "maxPlayers": 4,
        },
    ]
    """

    # Step 3: Build prototype challenge.json files (for permutation in the following step).
    base_configs = g.build_all_base_map_configs(map_names_and_max_players_list,
                                                bases=C.NO_BASES,
                                                power_level=C.HIGH_POWER_LEVEL,
                                                scavengers=C.NO_SCAVENGERS,
                                                tech_level=C.TECH_LEVEL_2)

    ## Note: this function returns `List[config]` where:
    """
        config = {
            "challenge": {
                "bases": bases,
                "map": map_info["mapName"],
                "powerLevel": power_level,
                "scavengers": str(scavengers).lower(),
                "techLevel": tech_level,
            },
            "player_0": create_spectator_player(team=0)
        }

        # Create spectator slots (Team 0 = FishBot's team).
        for player_id in range(1, map_info["maxPlayers"]):
            config[f"player_{player_id}"] = create_spectator_player(team=0)

        configs.append(config)
    """
    # Each `config` can be directly outputted using json.dump at this point.

    # Step 4: For each base config, set up both 'FFA' and 'duel' automatic tests.
    final_configs = []

    for base_config in base_configs:
        player_count = len(base_config) - 1  # challenge entry excluded  # TODO refactor later into metadata

        # 'FFA' test is valid for 3-player maps and above.
        if player_count >= 3 + 1:       # Note: the "+1" is required to account for the overwriting of Player 0.
            final_configs.extend(g.generate_ffa_configs(base_config))

        # 'Duel' test is only valid up to 4-player maps.
        if player_count <= 4 + 1:
            final_configs.extend(g.generate_duel_configs(base_config))

    ## Note: Each entry in `final_configs` looks like this:
    """
        results.append({
            "test_type": C.FFA,
            "map_name": map_name,
            "fishbot_position": fishbot_position,
            "opponent_position": None,
            "fishbot_difficulty": C.MEDIUM_DIFFICULTY,
            "opponent_difficulty": C.MEDIUM_DIFFICULTY,
            "config": config,                               # <- This is the finalised config to be dumped to json
        })
    """
    # The first 6 pieces of metadata are just used to generate a unique `.json` filename,
    #   while the final piece of metadata (config) is dumped to json.

    # Step 5: Write generated test configurations to the disk, also generate a 'test manifest' which the downstream
    #   test runner will use as the point of reference for the existing test scripts.
    base_manifest_path = g.write_test_configs(
        final_configs,
        output_dir=production_tests_path,
        manifest_path=Path.cwd() / "base_manifest.json",
    )
    ## Note: the output file `base_manifest.json` has output formatted like so:
    """
    manifest = {
        "version": 1,
        "tests": {
            "00000": {
                "test_type": "ffa",
                "map_name": "11c-Emergence",
                "fishbot_position": 1,
                "opponent_position": null,
                "fishbot_difficulty": "Medium",
                "opponent_difficulty": "Medium",
                "config_file": "00000_11c-Emergence_ffa_f1.json"
            }, ...
        }
    }
    """

    return base_manifest_path


if __name__ == "__main__":

    #################################### USER CONFIG START ####################################

    # INPUT DIRECTORY DEFINITIONS
    BASE_MAPS_PATH = Path.cwd() / r'custom_test_map_packager\v4.7.0_base_maps_upto5p'

    # OUTPUT DIRECTORY DEFINITIONS
    BASE_PRODUCTION_DIRECTORY = r"..\Warzone 2100\PRODCONFIG"
    PRODUCTION_MAPS_FOLDER_PATH = Path(rf"{BASE_PRODUCTION_DIRECTORY}\maps")
    PRODUCTION_TEST_FOLDER_PATH = Path(rf"{BASE_PRODUCTION_DIRECTORY}\tests")

    BASE_DEV_DIRECTORY = r"~\Documents\wz2100_config_dir"
    DEV_MAPS_FOLDER_PATH = Path(rf"{BASE_DEV_DIRECTORY}\maps").expanduser()
    DEV_TEST_FOLDER_PATH = Path(rf"{BASE_DEV_DIRECTORY}\tests").expanduser()

    #################################### USER CONFIG END ####################################

    test_manifest_path = repackage_maps_and_generate_tests(base_maps_path=BASE_MAPS_PATH,
                                                           production_maps_path=DEV_MAPS_FOLDER_PATH,
                                                           production_tests_path=DEV_TEST_FOLDER_PATH)

    test_manifest_path = repackage_maps_and_generate_tests(base_maps_path=BASE_MAPS_PATH,
                                                           production_maps_path=PRODUCTION_MAPS_FOLDER_PATH,
                                                           production_tests_path=PRODUCTION_TEST_FOLDER_PATH)

    print(test_manifest_path)
