/*
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
*/

class armySupply {
    
	constructor() {

	}

	/**
	 * Returns the number of units still required to form a full strength FishBot brigade.
	 * This function also defines what a FishBot brigade composition looks like.
     * @param {worldState} state
     * @returns Object with numeric deficits of the following categories: 
     *  - `heavyCavalry`
     *  - `lightCavalry`
     *  - `infantry`
     *  - `shortRangeArtillery`
     *  - `ADA`
     *  - `aviation`
     *  - `sensor`
	 */
	getBrigadeUnitDeficit(state) {
		const MAX_HEAVY_CAVALRY = 8;
        const MAX_LIGHT_CAVALRY = 3;
		const MAX_MORTAR = 6;
        const MAX_ADA = 3;
        const MAX_SENSOR = 1;
        const MAX_INFANTRY = 8;
		const MAX_VTOL = 8;

		const countUnitsIn = (groupID) => state.g.enumGroup(groupID).length;

        const heavyCavalryCount = countUnitsIn(DIVISION.HEAVY_CAV_RESERVE);
        const lightCavalryCount = countUnitsIn(DIVISION.LIGHT_CAV_RESERVE);
		const infantryCount = state.playerInfo[me]["numInfantryUnits"];
        const shortRangeFireSupportCount = state.playerInfo[me]["numShortRangeIndirectUnits"];
        const airDefenceCount = state.playerInfo[me]["numADAUnits"];
        const sensorCount = countUnitsIn(DIVISION.SENSOR_RESERVE);
        const vtolCount = state.playerInfo[me]["numAirUnits"];

        const computeDeficit = (maxVal, currCount) => {
            let deficit = maxVal - currCount;
            let norm = 0.0;
            if (maxVal > 0) {
                norm = deficit / maxVal;
            }
            return {
                'absolute': deficit,
                'norm': norm,
            }
        }

		return {
            'totalLandUnits': heavyCavalryCount + lightCavalryCount + infantryCount + shortRangeFireSupportCount + airDefenceCount + sensorCount,\
            'totalAirUnits': vtolCount,
            'heavyCavalry': computeDeficit(MAX_HEAVY_CAVALRY, heavyCavalryCount),
            'lightCavalry': computeDeficit(MAX_LIGHT_CAVALRY, lightCavalryCount),
            'infantry': computeDeficit(MAX_INFANTRY, infantryCount),
            'shortRangeArtillery': computeDeficit(MAX_MORTAR, shortRangeFireSupportCount),
            'ADA': computeDeficit(MAX_ADA, airDefenceCount),
            'aviation': computeDeficit(MAX_VTOL, vtolCount),
            'sensor': computeDeficit(MAX_SENSOR, sensorCount),
		}
	}

}