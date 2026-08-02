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
	 * Prioritises the next land vehicle to produce (does not include infantry). 
	 * Then, forecasts production to return a list of production candidates.
	 * @param {BrigadeComposition} brigadeComposition 
	 * @param {ProductionParameters} parameters
	 */
	prioritiseLandVehicleCategory(brigadeComposition, parameters) {
		
		const maxBrigadeComposition = parameters.BRIGADE_COMPOSITION;
		const getMaxUnits = (category) => {
			switch(category) {
				case DIVISION.HEAVY_CAV_RESERVE:
					return maxBrigadeComposition['MAX_HEAVY_CAVALRY'];
				case DIVISION.LIGHT_CAV_RESERVE:
					return maxBrigadeComposition['MAX_LIGHT_CAVALRY'];
				case DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE:
					return maxBrigadeComposition['MAX_MORTAR'];
				case DIVISION.AIR_DEFENCE_RESERVE:
					return maxBrigadeComposition['MAX_ADA'];
				case DIVISION.SENSOR_RESERVE:
					return maxBrigadeComposition['MAX_SENSOR'];
				case DIVISION.MAINTENANCE_RESERVE:
					return maxBrigadeComposition['MAX_REPAIR'];
				default:
					deb(`WARNING: prioritiseLandVehicleCategory / getMaxUnits(): failed to recognise "${category}". Returning 1.`)
					return 1;
			}
		}

		const getDeficit = (category) => {
			const battalionComposition = brigadeComposition.get(category);
			if (battalionComposition == null) {
				deb(`WARNING: prioritiseLandVehicleCategory / getDeficit(): Attempted to get non-existent 'deficit' for category "${category}". Returning 0.`);
				return 0;
			}
			return battalionComposition["deficit"];
		}

		const getNormDeficit = (category) => getDeficit(category) / getMaxUnits(category);

		const makeCategory = (category) => {
			const normDeficit = getNormDeficit(category);
			let weight = parameters.UNIT_WEIGHTS.get(category);
			if (weight == null) {
				deb(`WARNING: prioritiseLandVehicleCategory / makeCategory(): weight for "${category}" returned null (missing). Defaulting to 0.5.`);
				weight = 0.5;
			}
			return {
				"type": category,
				"normDeficit": normDeficit,
				"w_strategic": weight,
				"score": normDeficit * weight,
			};
		};

		const CATEGORIES = [
			makeCategory(DIVISION.HEAVY_CAV_RESERVE), 
			makeCategory(DIVISION.LIGHT_CAV_RESERVE), 
			makeCategory(DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE), 
			makeCategory(DIVISION.AIR_DEFENCE_RESERVE),
			makeCategory(DIVISION.SENSOR_RESERVE),
			makeCategory(DIVISION.MAINTENANCE_RESERVE),
		];

		const FORECAST_STEPS = 15;

		const productionRequests = [];
		for (let i=0; i<FORECAST_STEPS; i++) {
			// Terminate when the biggest normDeficit is 0, which implies all following deficits are negative.
			CATEGORIES.sort((a,b) => b["score"] - a["score"]);
			if (CATEGORIES[0].normDeficit < 1e-3) {		// must account for FP rounding error
				break;		
			}

			productionRequests.push({...CATEGORIES[0]});									// takes a snapshot of the current score
			CATEGORIES[0].normDeficit -= 1 / getMaxUnits(CATEGORIES[0].type);				// simulates the unit being produced
			CATEGORIES[0].score = CATEGORIES[0].normDeficit * CATEGORIES[0].w_strategic;	// updates the score
		}

		if (false) {
			debug(`\t Next ${FORECAST_STEPS} units ->`);
			productionRequests.forEach(r => debug(`	${r.type}`));
		}
		
		return productionRequests;
	}	

}