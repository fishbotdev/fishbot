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

"""
The intent of this file is help me rebalance the FishBot production weights when:
1. Modifying the units per brigade
2. Adding new units to the brigade 

DIVISION_IDS = {
    GENERAL_RESERVE: 2001,
    HEAVY_CAV_RESERVE: 2002,
    LIGHT_CAV_RESERVE: 2003,
    INFANTRY_RESERVE: 2004,
    SHORT_RANGE_FIRE_SUPPORT_RESERVE: 2005,
    LONG_RANGE_FIRE_SUPPORT_RESERVE: 2006,
    AIR_DEFENCE_RESERVE: 2007,
    SENSOR_RESERVE: 2008,
    MAINTENANCE_RESERVE: 2009,
}
"""

ID_MAP = {
    'MAX_HEAVY_CAVALRY': "2002: HEAVY_CAV_RESERVE",
    'MAX_LIGHT_CAVALRY': "2003: LIGHT_CAV_RESERVE",
    'MAX_MORTAR': "2005: SHORT_RANGE_FIRE_SUPPORT_RESERVE",
    'MAX_ADA': "2007: AIR_DEFENCE_RESERVE",
    'MAX_SENSOR': "2008: SENSOR_RESERVE",
    'MAX_REPAIR': "2009: MAINTENANCE_RESERVE",
}

FISHBOT_BRIGADE_COMPOSITION = {
    'MAX_HEAVY_CAVALRY': 8,
    'MAX_LIGHT_CAVALRY': 3,
    'MAX_MORTAR': 6,
    'MAX_ADA': 3,
    'MAX_SENSOR': 1,
    'MAX_REPAIR': 1,
}

WEIGHTS = {
    'MAX_HEAVY_CAVALRY': 0.8,
    'MAX_LIGHT_CAVALRY': 1.0,
    'MAX_MORTAR': 0.77,
    'MAX_ADA': 0.62,
    'MAX_SENSOR': 0.40,
    'MAX_REPAIR': 0.5,
}

NUMBER_OF_BRIGADES = 3


def get_top_priority_category(brigade_composition):

    brigade_scores = {}
    for category, qty in brigade_composition.items():
        norm_deficit = (FISHBOT_BRIGADE_COMPOSITION[category] - qty) / FISHBOT_BRIGADE_COMPOSITION[category]
        brigade_scores[category] = WEIGHTS[category] * norm_deficit

    sorted_dict = dict(sorted(brigade_scores.items(), key=lambda item: item[1], reverse=True))

    return list(sorted_dict.keys())[0]


if __name__ == "__main__":

    initial = None

    BRIGADE_COMPOSITION = {
        'MAX_HEAVY_CAVALRY': 0,
        'MAX_LIGHT_CAVALRY': 0,
        'MAX_MORTAR': 0,
        'MAX_ADA': 0,
        'MAX_SENSOR': 0,
        'MAX_REPAIR': 0,
    }

    UNITS_PER_BRIGADE = 0
    for count in FISHBOT_BRIGADE_COMPOSITION.values():
        UNITS_PER_BRIGADE += count

    print("FishBot Production Order")
    for i in range(UNITS_PER_BRIGADE):
        category = get_top_priority_category(BRIGADE_COMPOSITION)
        print(f"{i+1}. {ID_MAP[category]}")

        BRIGADE_COMPOSITION[category] += 1
