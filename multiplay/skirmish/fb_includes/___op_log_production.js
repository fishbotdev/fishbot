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

class armyQuartermaster {
    
	constructor() {

	}

    #checkVtolProduction() {
        if (!iCanDesign()) return false; // don't cheat by producing vtols before design is available

        let vtolInProduction = false;
        const idleVtolFactories = getIdleStructuresOfType({structureID: STRUCTURES["VTOL Factory"].id});

        let r = Math.floor(Math.random() * 2);

        for (let i = 0; i < idleVtolFactories.length; i++) {
            const factory = idleVtolFactories[i];

            if (r === 0) {
                vtolInProduction = vtolInProduction || produceCloseAirSupport(factory);
            } else {
                vtolInProduction = vtolInProduction || produceDeepAirSupport(factory);
            }
            
        }

        return vtolInProduction;
    }

    #checkCyborgProduction() {
        let success = false;
        getIdleStructuresOfType({structureID: STRUCTURES["Cyborg Factory"].id}).forEach((factory) => {
            success = success || produceInfantry(factory);
        });
        return success;
    }

    #checkTruckProduction() {
        const MAX_OVERALL_TRUCKS = 6;

        const allTrucksCount = enumDroid(me, DROID_CONSTRUCT).length;

        if (allTrucksCount >= getDroidLimit(me, DROID_CONSTRUCT)) {
            return false;
        }

        if (allTrucksCount >= MAX_OVERALL_TRUCKS) {
            return false;
        }

        let success = false;
        if (enumStruct(me, CYBORG_FACTORY).length > 0) { 
            getIdleStructuresOfType({structureID: STRUCTURES["Cyborg Factory"].id}).forEach(factory => (success = success || produceCombatEngineer(factory)));
        } else {
            getIdleStructuresOfType({structureID: STRUCTURES["Factory"].id}).forEach(factory => (success = success || produceTruck(factory)));
        };
        return success;
    }

    #produceLandUnit(factory) {
        const directAssaultTanksCount = state.g.enumGroup(DIVISION.GENERAL_RESERVE).length;     
        const fireSupportCount = state.g.enumGroup(DIVISION.FIRE_SUPPORT_RESERVE).length;
        const airDefenceCount = state.g.enumGroup(DIVISION.AIR_DEFENCE_RESERVE).length;
        const sensorCount = enumDroid(me, DROID_SENSOR).length;

        let weights;    // weights are integers between 0 -> 10
        
        // Software implementation: 
        //  1. define the size of each 'bar' (like a bar in a bar chart) 
        //  2. find the sum of all bar lengths = 'sum'
        //  3. generate random number in [0, 'sum')
        //  4. place all 'bars' end to end, find which segment the random number falls in (the relative size of the bar determines the probability)
        if (directAssaultTanksCount <= 5) {
            // Only make direct assault tanks; overwrite weights
            weights = {
                'Heavy Cav': 10,
                'Light Cav': 2,
                'Fire Support': 2,
                'Air Defence': 2,
                'Sensor': 1
            };
        } else if (directAssaultTanksCount >= 6 && fireSupportCount === 0) {
            weights = {
                'Fire Support': 5,
            };
        } else {
            // DEFAULT WEIGHTS
            weights = {
                'Heavy Cav': 10,
                'Light Cav': 2,
                'Fire Support': 3,
                'Air Defence': 3,
                'Sensor': 1
            };
        }

        if (defined(weights['Sensor'] || getCurrGameTime() < 300000)) {
            if (sensorCount >= 1) {
                weights['Sensor'] = 0;
            }
        }

        if (defined(weights["Air Defence"])) {
            if (airDefenceCount >= 4 || getCurrGameTime() < 300000) {
                weights["Air Defence"] = 0;
            }
        }

        if (defined(weights["Fire Support"])) {
            if (getCurrGameTime() < 210000 && directAssaultTanksCount <= 5) {
                weights["Fire Support"] = 0;
            }

        }
        
        // Find the sum of all weights
        let weightSum = 0; 
        for (const value of Object.values(weights)) {
            weightSum += value;
        }

        let category;
        if (weightSum === 0) {
            // Default (should be impossible)
            debug(`produceLandUnit(): 'Light Cav' was chosen by default since the sum of all production weights was 0.`);
            category = "Light Cav";
        } else {
            // Generate random number on uniform distribution
            let r = Math.floor(Math.random() * weightSum);

            // Use this to decide on a category
            let l = 0;
            for (const [categoryName, weight] of Object.entries(weights)) {
                l += weight;
                if (r < l) {
                    category = categoryName;
                    break;
                }
            }
        }


        let factoryInProduction = false;   
        switch (category) {
            case 'Heavy Cav':
                factoryInProduction = factoryInProduction || produceHeavyCavalry(factory);
                break;
            case 'Light Cav':
                factoryInProduction = factoryInProduction || produceLightCavalry(factory);
                break;
            case 'Fire Support':
                factoryInProduction = factoryInProduction || produceLandFireSupport(factory);
                break;
            case 'Air Defence':
                factoryInProduction = factoryInProduction || produceLandAntiAir(factory);
                break;
            case 'Sensor': 
                factoryInProduction = factoryInProduction || produceLandRecon(factory);
                break;
            default:
                factoryInProduction = factoryInProduction || produceLightCavalry(factory);
        }

        // debug('produceLandUnit(): Manufactured ', category);

        return factoryInProduction;
    }


    #checkTankProduction() {
        if (!iCanDesign()) return false; // don't cheat by producing tanks before design is available 

        let success = false;
        getIdleStructuresOfType({structureID: STRUCTURES["Factory"].id}).forEach((factory) => {
            success = success || this.#produceLandUnit(factory);
        });
        return success;
    }

    manageProduction() {

        let truckInProduction = this.#checkTruckProduction();
        if (truckInProduction) {
            return;
        }

        const MIN_CYBORGS = 8;
        if (enumDroid(me, DROID_CYBORG).length < MIN_CYBORGS) {
            if (this.#checkCyborgProduction()) return;
        }

        let r = Math.floor(Math.random() * 8); 		
        if (0 <= r && r < 1) {
            // Airforce
            if (this.#checkVtolProduction()) return;
        } else {
            // Tanks
            if (this.#checkTankProduction()) return;
        }

        // if having too much energy, don't care about what we produce
        const TOO_MUCH_POWER = 300;
        if (myPower() > TOO_MUCH_POWER) {
            this.#checkTankProduction();
            this.#checkVtolProduction();
            this.#checkCyborgProduction();
        }

    }

    assignNewDroidIntoGroup(droid) {
        if (droid.isVTOL === true) {	
            state.g.addDroidToGroup({groupID: AIR_RESERVE, droidID: droid.id});
            return;
        }

        // Add new trucks to oil capture / base build groups
        if (droid.droidType == DROID_CONSTRUCT) {
            state.g.addDroidToGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
            return;
        }

        if (droid.droidType === DROID_CYBORG) {
            state.g.addDroidToGroup({groupID: DIVISION.INFANTRY_RESERVE, droidID: droid.id});
            return;
        }

        if (droid.droidType === DROID_WEAPON && droid.hasIndirect === true) {
            // debug("added to FIRE SUPPORT RESERVE");
            state.g.addDroidToGroup({groupID: DIVISION.FIRE_SUPPORT_RESERVE, droidID: droid.id});
            return;
        }

        if (droid.droidType === DROID_WEAPON && isAntiAirDefense(droid)) {
            // debug("added to AIR DEFENCE RESERVE");
            state.g.addDroidToGroup({groupID: DIVISION.AIR_DEFENCE_RESERVE, droidID: droid.id});
            return;
        }

        if (droid.droidType === DROID_WEAPON) {
            // debug("ADDED TO GENERAL RESERVE");
            state.g.addDroidToGroup({groupID: DIVISION.GENERAL_RESERVE, droidID: droid.id});		
            return;
        }
    }
    
}