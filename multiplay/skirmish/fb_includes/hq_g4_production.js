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
	 * Returns the number of units remaining for the specified FishBot brigade to be at full strength, and the number and type of units needing repair.
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
	getBrigadeSupplyStatus(state, brigadeID, brigadeComposition, totalUnitsPerBrigade, repairThreshold) {

        const brigadeUnits = state.g.enumGroup(brigadeID);

		const MAX_HEAVY_CAVALRY = brigadeComposition.MAX_HEAVY_CAVALRY;
        const MAX_LIGHT_CAVALRY = brigadeComposition.MAX_LIGHT_CAVALRY;
		const MAX_MORTAR = brigadeComposition.MAX_MORTAR;
        const MAX_ADA = brigadeComposition.MAX_ADA;
        const MAX_SENSOR = brigadeComposition.MAX_SENSOR;
        const MAX_INFANTRY = brigadeComposition.MAX_INFANTRY;
        const MAX_REPAIR = brigadeComposition.MAX_REPAIR;

        let heavyCavalryCount = 0;
        let lightCavalryCount = 0;
		let infantryCount = 0;
        let shortRangeFireSupportCount = 0;
        let airDefenceCount = 0;
        let sensorCount = 0;
        let repairCount = 0;

        const damagedHeavyCavalry = [];
        const damagedLightCavalry = [];
        const damagedInfantry = [];
        const damagedShortRangeFireSupport = [];
        const damagedAirDefence = [];
        const damagedSensor = [];
        const damagedRepairUnits = [];       // repair units do not retreat for repair (they can repair themselves)

        const VEHICLE_UNIT_TYPES = [DIVISION.HEAVY_CAV_RESERVE, DIVISION.LIGHT_CAV_RESERVE, DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, DIVISION.AIR_DEFENCE_RESERVE, DIVISION.SENSOR_RESERVE];
        const needsRepair = (unit, category) => {
            if (VEHICLE_UNIT_TYPES.includes(category)) {
                if (unit.health < repairThreshold) {
                    return true;
                }
            } else if (category === DIVISION.INFANTRY_RESERVE) {
                if (unit.health < repairThreshold) {
                    return true;
                }
            }
            return false;
        }

        for (let i=0; i<brigadeUnits.length; i++) {
            const unit = brigadeUnits[i];

            const category = getDroidFbGroupClassification(unit);

            switch (category) {
                case DIVISION.HEAVY_CAV_RESERVE:
                    heavyCavalryCount++;
                    if (needsRepair(unit, category)) {
                        damagedHeavyCavalry.push(unit);
                    }
                    break;
                case DIVISION.LIGHT_CAV_RESERVE:
                    lightCavalryCount++;
                    if (needsRepair(unit, category)) {
                        damagedLightCavalry.push(unit);
                    }
                    break;
                case DIVISION.INFANTRY_RESERVE:
                    infantryCount++;
                    if (needsRepair(unit, category)) {
                        damagedInfantry.push(unit);
                    }
                    break;
                case DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE:
                    shortRangeFireSupportCount++;
                    if (needsRepair(unit, category)) {
                        damagedShortRangeFireSupport.push(unit);
                    }
                    break;
                case DIVISION.AIR_DEFENCE_RESERVE:
                    airDefenceCount++;
                    if (needsRepair(unit, category)) {
                        damagedAirDefence.push(unit);
                    }
                    break;
                case DIVISION.SENSOR_RESERVE:
                    sensorCount++;
                    if (needsRepair(unit, category)) {
                        damagedSensor.push(unit);
                    }
                    break;
                case DIVISION.MAINTENANCE_RESERVE:
                    repairCount++;      // will not retreat for repair, because it can repair itself
                    break;
                default:
                    debug(`WARNING: ${brigadeUnits[i].name} was unclassified! Classifying as heavy cav.`);
                    heavyCavalryCount++;
            }
        }

        const getSupplyStatus = (category, maxVal, currCount, damagedUnitList) => {
            let deficit = maxVal - currCount;
            let norm = 0.0;
            if (maxVal > 0) {
                norm = deficit / maxVal;
            }
            return {
                'category': category,
                'absBaseDeficit': deficit,
                'normBaseDeficit': norm,

                'damagedUnitCount': damagedUnitList.length,
                'damagedUnitList': damagedUnitList
            }
        }

        const totalLandUnits = heavyCavalryCount + lightCavalryCount + infantryCount + shortRangeFireSupportCount + airDefenceCount + sensorCount;

		return {
            'totalLandUnits': totalLandUnits,
            'brigadeStrength': Math.floor(totalLandUnits / totalUnitsPerBrigade * 100),

            'heavyCavalry': getSupplyStatus(DIVISION.HEAVY_CAV_RESERVE, MAX_HEAVY_CAVALRY, heavyCavalryCount, damagedHeavyCavalry),
            'lightCavalry': getSupplyStatus(DIVISION.LIGHT_CAV_RESERVE, MAX_LIGHT_CAVALRY, lightCavalryCount, damagedLightCavalry),
            'infantry': getSupplyStatus(DIVISION.INFANTRY_RESERVE, MAX_INFANTRY, infantryCount, damagedInfantry),
            'shortRangeArtillery': getSupplyStatus(DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, MAX_MORTAR, shortRangeFireSupportCount, damagedShortRangeFireSupport),
            'ADA': getSupplyStatus(DIVISION.AIR_DEFENCE_RESERVE, MAX_ADA, airDefenceCount, damagedAirDefence),
            'sensor': getSupplyStatus(DIVISION.SENSOR_RESERVE, MAX_SENSOR, sensorCount, damagedSensor),
            'repair': getSupplyStatus(DIVISION.MAINTENANCE_RESERVE, MAX_REPAIR, repairCount, damagedRepairUnits),
		}
	}

}