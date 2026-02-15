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

/*
T1 starts with these technologies to be researched
	Thermal armor Mk3
	Turbo-Charged Engine Mk2
	Dense Composite Alloys Mk2
	HE Bomb Shells
	Phosphor Bomb Bay
	APFSDS Cannon Rounds Mk3
	Cannon Autoloader Mk3
	Heavy Cannon
	Superhot Flamer Gel Mk3
	Flamer Autoloader Mk3
	Tungsten-Tipped MG Bullets Mk3
	HEAP Mortar Shells Mk2
	Mortar Autoloader Mk3
	Heat Rocket Warhead Mk3
	Heavy Rocket Array
	Tank Killer Rocket
	Thermal Imaging Rockets
	Dedicated Synaptic Link Research Analysis Mk3
	Gas Turbine Generator Mk3
	VTOL Strike Turret
	Hardened Base Structure Materials
	Automated VTOL Rearming Mk2
	Cyborg Dense Composite Alloys Mk3
	Ripple Rocket Battery
	Supercrete Mk2
*/

/* 
T2 starts with these technologies to be researched
	High Intensity Thermal Armor Mk2
	Gas Turbine Engine
	Plasmite Bomb
	HVAPFSDS Cannon Rounds Mk3
	EMP Cannon
	Hi Energy Laser Emitter
	Light Body - Retaliation
	Superdense Composite Alloys Mk2
	EMP Missile Launcher
	Cannon Rapid Loader Mk2
	Improved Laser Focusing
	Superhot Plasmite Gel
	Target Prediction Artillery Shells
	HE Howitzer Shells Mk3
	Heavy Howitzer - Ground Shaker
	Pulse Laser
	Depleted Uranium MG Bullets Mk3
	Seraph Missile Array 
	Avenger SAM
	Advanced Missile Allocation System
	Hardened Rail Dart
	HESH Rocket Warhead Mk3
	Neural Synapse Research Brain Mk3
	Auto-Repair
	Vapor Turbine Generator Mk2
	Advanced Engineering
	Nexus Link Turret
	Robotic VTOL Rearming Mk2
	Cyborg Hi-Intensity Thermal Armor Mk3
	Super Scourge Cyborg
	Cyborg Superdense Composite Alloys Mk2
	Heavy Rocket Bastion
*/


class armyResearchAndDevelopment {
	constructor() {

	}

	manageResearch() {
		getIdleStructuresOfType({structureID: STRUCTURES["Research Facility"].id}).forEach((lab) => this.#doResearch(lab));
	}

	#doResearch(lab) {
		let currAvailableResearches = enumResearch();
		if (currAvailableResearches.length === 0)
			return;		// no available researches, don't compute anything

		// Remove unnecessary available researches
		// FishBot will never use the plasma cannon 
		const FISHBOT_RESEARCH_BLACKLIST_KEYWORDS = [
			"Flame", "Rocket", "Missile", "R-Defense", 
			"R-Sys-VTOLStrike-Turret", "R-Wpn-PlasmaCannon", 
		];

		let filteredAvailableResearches = currAvailableResearches.filter((research) => {
			const isNotBlacklistedResearch = FISHBOT_RESEARCH_BLACKLIST_KEYWORDS.every(b => !research.id.includes(b));
			return isNotBlacklistedResearch;
		});

		if (filteredAvailableResearches.length === 0) {
			return false;		// no available (filtered) researches, don't compute anything
		}
			
		// Research priority items if they are available
		const FISHBOT_CANNON_RESEARCH_PRIORITIES = [
			"R-Struc-Research-Upgrade06", 	// Only prereq for twin assault cannon in T1
			"R-Vehicle-Body09",				// Tiger Body
			"R-Struc-Power", 
			"R-Wpn-Cannon-Damage",
			"R-Wpn-Mortar-Damage", 
			"R-Wpn-Cannon6TwinAslt",
			"R-Wpn-Mortar-ROF", 
			"R-Struc-Research-Upgrade",
			"R-Wpn-Cannon-ROF", 
			"R-Vehicle-Metals", 
			// "R-Cyborg-Metals",

			"R-Struc-Factory-Upgrade",
			"R-Wpn-MG5", 					// Twin AG

			"R-Struc-VTOLPad-Upgrade", 

			// "R-Wpn-RailGun01",
			// "R-Wpn-RailGun02",
			// "R-Wpn-RailGun03",
			// "R-Wpn-Rail-Damage",

			// "R-Wpn-Rail-ROF", 
			// "R-Wpn-Rail-Accuracy",

			// "R-Wpn-Cannon3Mk1", 
			// "R-Wpn-AAGun02", 


		];
		for (let i=0; i<FISHBOT_CANNON_RESEARCH_PRIORITIES.length; ++i) {
			const keyword = FISHBOT_CANNON_RESEARCH_PRIORITIES[i];

			let priorityResearches = currAvailableResearches.filter(research => research.id.includes(keyword));
			if (priorityResearches.length === 0) {
				continue;
			}

			const priorityResearch = priorityResearches[0];
			if (pursueResearch(lab, priorityResearch.id)) {
				if (false) {
					chat(0, `I'm researching as priority: ${priorityResearch.name}`);		// temporary
					debug(`I'm priority researching: ${priorityResearch.name}`);			// temporary
				}
				return true;
			}
		}

		// Class available researches into categories.
		let researchCategoriesLookup = {		// this is a "static plain object" so I need to use Object.keys later.
			// Sublists under each category are arranged in terms of priority
			'weapons': ['R-Wpn'],
			'armor': ['R-Vehicle-Metals', 'R-Cyborg-Metals', 'R-Cyborg-Armor-Heat', 'R-Vehicle-Armor-Heat'],
			'mobility': ['R-Vehicle-Prop', 'R-Vehicle-Engine', 'R-Vehicle-Body'],
			'prod': ['R-Struc'],
			'support': ['R-Sys'],
			'misc': ['']		// catch remaining uncategorised researches
		};

		let categorisedResearches = new Map();
		const categories = Object.keys(researchCategoriesLookup);
		categories.forEach((category) => categorisedResearches.set(category, []));

		filteredAvailableResearches.forEach ((research) => {
			let foundCategory = false;

			// Iterate through each category; append to list
			for (const [category, itemsInCategory] of categorisedResearches) {
				// Key is the category of research
				let lookupTerms = researchCategoriesLookup[category];	
				lookupTerms.forEach((term) => {
					if (research.id.includes(term)) {
						// Add to category & continue with next research in list
						let currResearchesInCategory = categorisedResearches.get(category);
						// adds whole research object for further processing
						categorisedResearches.set(category, [].concat(research, currResearchesInCategory));		
						
						foundCategory = true;
						return;
					}
				});

				if (foundCategory)
					break;
			}
		});

		// Now decide on which categorised research to use
		// 
		// categorisedResearches.get('weapons').forEach((research) => debug("weapons:", research.name));
		// categorisedResearches.get('armor').forEach((research) => debug("armor:", research.name));
		// categorisedResearches.get('mobility').forEach((research) => debug("mobility:", research.name));
		// categorisedResearches.get('prod').forEach((research) => debug("prod (R-Struc):", research.name));
		// categorisedResearches.get('support').forEach((research) => debug("support (R-Sys):", research.name));
		// categorisedResearches.get('misc').forEach((research) => debug("misc (no categ):", research.name));

		// now decide on which category based on user-weights which are modified by the METT-T
		// TODO: for now, fixed weights
		let researchCategoryWeights = {
			'weapons': 0.55,
			'armor': 0.05,
			'mobility': 0.15,
			'prod': 0.1,
			'support': 0.1,
			'misc': 0.05
		};

		const rr = Math.random();
		let prevUpperBoundary = 0.0;
		let selectedCategory = undefined;

		for (const [category, weight] of Object.entries(researchCategoryWeights)) {
			let lowerBoundary = prevUpperBoundary;
			let upperBoundary = lowerBoundary + weight;
			if (lowerBoundary <= rr && rr < upperBoundary) {
				selectedCategory = category;
				break;
			}
			prevUpperBoundary = upperBoundary;
		}

		// Get selected researches
		const researchesInCategory = categorisedResearches.get(selectedCategory);

		if (researchesInCategory.length === 0)
			return false; 	// try again

		const selectedResearch = researchesInCategory[Math.floor(Math.random() * researchesInCategory.length)];

		if (pursueResearch(lab, selectedResearch.id)) {
			// chat(0, `I'm researching: ${selectedResearch.name}`);		// temporary
			// debug(`I'm researching: ${selectedResearch.name}`);			// temporary
			return true;
		}

		return false;

	}
}
