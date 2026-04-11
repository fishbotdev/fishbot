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
	 * Returns the number of units remaining for the specified FishBot brigade to be at full strength.
     * @param {worldState} state
     * @returns Object with numeric deficits of the following categories: 
     *  - `heavyCavalry`
     *  - `lightCavalry`
     *  - `infantry`
     *  - `shortRangeArtillery`
     *  - `ADA`
     *  - `sensor`
     * 
     * as well as:
     *  - `totalLandUnits`
     *  - `targetTotalLandUnits`
	 */
	getBrigadeUnitDeficit2(state, brigadeID, brigadeComposition) {

        const brigadeUnits = state.g.enumGroup(brigadeID);

		const MAX_HEAVY_CAVALRY = brigadeComposition.MAX_HEAVY_CAVALRY;
        const MAX_LIGHT_CAVALRY = brigadeComposition.MAX_LIGHT_CAVALRY;
		const MAX_MORTAR = brigadeComposition.MAX_MORTAR;
        const MAX_ADA = brigadeComposition.MAX_ADA;
        const MAX_SENSOR = brigadeComposition.MAX_SENSOR;
        const MAX_INFANTRY = brigadeComposition.MAX_INFANTRY;

        let heavyCavalryCount = 0;
        let lightCavalryCount = 0;
		let infantryCount = 0;
        let shortRangeFireSupportCount = 0;
        let airDefenceCount = 0;
        let sensorCount = 0;

        for (let i=0; i<brigadeUnits.length; i++) {
            const category = getDroidFbGroupClassification(brigadeUnits[i]);

            switch (category) {
                case DIVISION.HEAVY_CAV_RESERVE:
                    heavyCavalryCount++;
                    break;
                case DIVISION.LIGHT_CAV_RESERVE:
                    lightCavalryCount++;
                    break;
                case DIVISION.INFANTRY_RESERVE:
                    infantryCount++;
                    break;
                case DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE:
                    shortRangeFireSupportCount++;
                    break;
                case DIVISION.AIR_DEFENCE_RESERVE:
                    airDefenceCount++;
                    break;
                case DIVISION.SENSOR_RESERVE:
                    sensorCount++;
                    break;
                default:
                    debug(`WARNING: ${brigadeUnits[i].name} was unclassified! Classifying as heavy cav.`);
                    heavyCavalryCount++;
            }
        }

        const computeDeficit = (category, maxVal, currCount) => {
            let deficit = maxVal - currCount;
            let norm = 0.0;
            if (maxVal > 0) {
                norm = deficit / maxVal;
            }
            return {
                'category': category,
                'abs': deficit,
                'norm': norm,
            }
        }

		return {
            'totalLandUnits': heavyCavalryCount + lightCavalryCount + infantryCount + shortRangeFireSupportCount + airDefenceCount + sensorCount,
            'targetTotalLandUnits': MAX_HEAVY_CAVALRY + MAX_LIGHT_CAVALRY + MAX_INFANTRY + MAX_MORTAR + MAX_ADA + MAX_SENSOR, 

            'heavyCavalry': computeDeficit(DIVISION.HEAVY_CAV_RESERVE, MAX_HEAVY_CAVALRY, heavyCavalryCount),
            'lightCavalry': computeDeficit(DIVISION.LIGHT_CAV_RESERVE, MAX_LIGHT_CAVALRY, lightCavalryCount),
            'infantry': computeDeficit(DIVISION.INFANTRY_RESERVE, MAX_INFANTRY, infantryCount),
            'shortRangeArtillery': computeDeficit(DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, MAX_MORTAR, shortRangeFireSupportCount),
            'ADA': computeDeficit(DIVISION.AIR_DEFENCE_RESERVE, MAX_ADA, airDefenceCount),
            'sensor': computeDeficit(DIVISION.SENSOR_RESERVE, MAX_SENSOR, sensorCount),
		}
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
            'totalLandUnits': heavyCavalryCount + lightCavalryCount + infantryCount + shortRangeFireSupportCount + airDefenceCount + sensorCount,
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