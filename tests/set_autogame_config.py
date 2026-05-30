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

import tests.CONSTANTS as C

# The purpose of this script is to generate a 'config file' which contains:
#   - game information (e.g. starting tech level, base development level, etc.)
#   - map information (e.g. which map, how many players, etc.)
# This config file is the input to the test generator which will create the corresponding .json files required by the game.


#################################### USER CONFIG START ####################################

SKIRMISH_SETTINGS_COBRA_HARD_1V1 = {
    # Challenge settings
    "version": 1,

    # Fishbot info
    "fishbotName": C.FISHBOT_AI,
    "fishbotDifficulty": C.MEDIUM_DIFFICULTY,

    # Opponent info
    "opponentName": C.COBRA_AI,
    "opponentDifficulty": C.HARD_DIFFICULTY,

    # Game settings
    "bases": 1,
    "powerLevel": 2,
    "scavengers": 0,
    "techLevel": 2,
}

MAP_SETTINGS_COBRA_1V1 = [

    # 2p maps (note: these are not included because challenge maps force add a human player as Player 0).

    # 3p maps
    {
        "mapName": "Monocot",
        "maxPlayers": 3,
        "fishbot_position": 1,
        "opponent_position": 2
    },
    {
        "mapName": "Gamma",
        "maxPlayers": 3,
        "fishbot_position": 1,
        "opponent_position": 2
    },

    # # 6p maps
    # {
    #     "name": "Entropy",
    #     "maxPlayers": 6,
    #     "fishbot_position": 1,
    #     "opponent_position": 5
    # },
    # {
    #     "name": "Melting",
    #     "maxPlayers": 6,
    #     "fishbot_position": 4,
    #     "opponent_position": 1
    # }
]

#################################### USER CONFIG END ####################################

#################################### HELPER FUNCTIONS ####################################
def generate_1v1_cobra_hard():
    return SKIRMISH_SETTINGS_COBRA_HARD_1V1, MAP_SETTINGS_COBRA_1V1
