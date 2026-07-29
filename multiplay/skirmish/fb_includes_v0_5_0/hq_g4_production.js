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
	 * Forecasts production to return a list of production candidates.
	 * @param {BrigadeComposition} brigadeComposition 
	 * @param {*} maxBrigadeComposition
	 */
	prioritiseLandVehicleCategory(brigadeComposition, maxBrigadeComposition) {
		
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
					debug(`${gameTime}: prioritiseLandVehicleCategory2() / getMaxUnits(): failed to recognise "${category}". Returning "1".`)
					return 1;
			}
		}

		const getDeficit = (category) => {
			const battalionComposition = brigadeComposition.get(category);
			if (battalionComposition == null) {
				debug(`${gameTime}: WARNING - Attempted to get non-existent 'deficit' for category "${category}". Returning 0.`);
				return 0;
			}
			return battalionComposition["deficit"];
		}

		const getNormDeficit = (category) => getDeficit(category) / getMaxUnits(category);

		const makeCategory = (category, weight) => {
			const normDeficit = getNormDeficit(category);
			return {
				"type": category,
				"normDeficit": normDeficit,
				"w_strategic": weight,
				"score": normDeficit * weight,
			};
		};

		const CATEGORIES = [
			// Production weights (which influences production order) are tuned using `python_helper_scripts / production_scheduling.py`.
			// Must be rebalanced each time the brigade composition is changed.	
			makeCategory(DIVISION.HEAVY_CAV_RESERVE, 0.95), 
			makeCategory(DIVISION.LIGHT_CAV_RESERVE, 1.0), 
			makeCategory(DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, 0.7), 
			makeCategory(DIVISION.AIR_DEFENCE_RESERVE, 0.65),
			makeCategory(DIVISION.SENSOR_RESERVE, 0.25),
			makeCategory(DIVISION.MAINTENANCE_RESERVE, 0.5),
		];

		const FORECAST_STEPS = 15;

		const productionRequests = [];
		for (let i=0; i<FORECAST_STEPS; i++) {
			// Terminate when the biggest normDeficit is 0 => all following deficits are negative.
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