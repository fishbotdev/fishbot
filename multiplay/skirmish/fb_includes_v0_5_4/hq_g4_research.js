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


class FishBotResearchOrders {
	constructor() {

	}

	/**
	 * @returns {ResearchPath} Research priorities and & blacklist for Cannons @ Tech Level 2 (T2).
	 */
	getT2CannonResearchPath() {

		const FISHBOT_T2_CANNON_RESEARCH_PRIORITIES = [
			RESEARCHES["Dedicated Synaptic Link Data Analysis Mk3"].id,
			RESEARCHES["APFSDS Cannon Rounds Mk3"].id,
			"R-Struc-Power",

			RESEARCHES["Twin Assault Cannon"].id,
			RESEARCHES["Heavy Body - Tiger"].id,
			"R-Wpn-Cannon-Damage",			
			RESEARCHES["Dense Composite Alloys Mk2"].id,
			RESEARCHES["Neural Synapse Research Brain"].id,
			RESEARCHES["Neural Synapse Research Brain Mk2"].id,

			RESEARCHES["Needle Gun"].id,
			RESEARCHES["Rail Gun"].id,
			RESEARCHES["Gauss Cannon"].id,
			"R-Wpn-Rail-Damage",		

			RESEARCHES["Twin Assault Gun"].id,
			"R-Wpn-Cannon-ROF", 
			"R-Wpn-Mortar-Damage",
			
			RESEARCHES["Light Body - Retaliation"].id,
			RESEARCHES["Medium Body - Retribution"].id,
			RESEARCHES["Heavy Body - Vengeance"].id,
			
			RESEARCHES["Whirlwind AA Turret"].id,
			"R-Vehicle-Metals",
			"R-Wpn-MG-Damage",
			"R-Vehicle-Engine",
			"R-Wpn-Mortar-ROF",

			RESEARCHES["Advanced Engineering"].id,
			RESEARCHES["Advanced Repair Facility"].id,
			"R-Wpn-Rail-ROF", 
			"R-Wpn-Rail-Accuracy",

			RESEARCHES["Neural Synapse Research Brain Mk3"].id,

			RESEARCHES["Auto-Repair"].id,
			"R-Cyborg-Metals",

			"R-Vehicle-Armor-Heat",
			"R-Cyborg-Armor-Heat",
			
			"R-Struc-Factory-Upgrade",
			"R-Struc-VTOLPad-Upgrade",
		];

		const FISHBOT_T2_CANNON_RESEARCH_BLACKLIST = [
			"Flame", "Rocket", "Missile", "R-Defense", "R-Sys-VTOLStrike-Turret", "R-Wpn-PlasmaCannon", 
		];

		return {
			'researchPriorities': FISHBOT_T2_CANNON_RESEARCH_PRIORITIES, 
			'researchBlacklist': FISHBOT_T2_CANNON_RESEARCH_BLACKLIST,
		};
	}

	getFocusedT2CannonResearchPath() {

		// This list is intended to be fairly prescriptive (it is the research order for a sub-25min game)
		const FISHBOT_T2_CANNON_RESEARCH_PRIORITIES = [
			RESEARCHES["APFSDS Cannon Rounds Mk3"].id,
			RESEARCHES["Dedicated Synaptic Link Data Analysis Mk3"].id,
			RESEARCHES["HVAPFSDS Cannon Rounds"].id,
			RESEARCHES["Twin Assault Cannon"].id,
			"R-Struc-Power",
			"R-Wpn-Cannon-ROF", 
			"R-Wpn-Mortar-Damage",
			"R-Wpn-Cannon-Damage",		
			"R-Vehicle-Metals",
			RESEARCHES["Neural Synapse Research Brain"].id,
			"R-Wpn-Mortar-ROF",
			"R-Vehicle-Engine",
			RESEARCHES["Neural Synapse Research Brain Mk2"].id,
			"R-Wpn-MG-Damage",
			RESEARCHES["Auto-Repair"].id,
			"R-Cyborg-Metals",
		];

		const FISHBOT_T2_CANNON_RESEARCH_BLACKLIST = ["Flame", "Rocket", "Missile", "R-Defense", "R-Sys-VTOLStrike-Turret", "R-Wpn-PlasmaCannon"];

		return {
			'researchPriorities': FISHBOT_T2_CANNON_RESEARCH_PRIORITIES, 
			'researchBlacklist': FISHBOT_T2_CANNON_RESEARCH_BLACKLIST,
		};
	}
}


class armyResearchAndDevelopment {
	constructor() {
		this.researchOrders = new FishBotResearchOrders();
	}

	/**
	 * Chooses the next research (from the list of available researches) using the provided research path.
	 * @param {ResearchParameters} parameters 
	 */
	proposeResearch(parameters) {
		const researchPriorities = parameters.path.researchPriorities;
		const researchBlacklist = parameters.path.researchBlacklist;

		const currAvailableResearches = enumResearch();		

		let highPriority = [], highPriorityUnsorted = [], regularPriority = [];

		for (let i=0; i<currAvailableResearches.length; i++) {
			const curr = RESEARCHES_BY_ID[currAvailableResearches[i].id];

			// Check if high priority, if so, add to `highPriority` list 
			if (researchPriorities.some(searchText => curr.id.includes(searchText))) {
				highPriorityUnsorted.push(curr);
				continue;
			}

			// Else, check if blacklisted, if not, add to `regularPriority` list
			if (researchBlacklist.some(searchText => curr.id.includes(searchText))) {
				continue;
			}

			regularPriority.push(curr);
		}

		for (let i=0; i<researchPriorities.length; i++) {
			const f = highPriorityUnsorted.find(r => r.id.includes(researchPriorities[i]));
			if (f != null) {
				highPriority.push(f);
			}
		}

		return {
			'regularPriority': regularPriority,
			'highPriority': highPriority
		};

	}
}
