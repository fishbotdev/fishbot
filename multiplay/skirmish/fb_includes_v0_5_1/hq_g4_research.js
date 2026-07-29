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

	getT2CannonResearchPath() {
		/* Example FishBot v0.5.1 research order (7c-Thales, with basically infinite oil):
			04:43 Dedicated Synaptic Link Data Analysis Mk3
			07:23 APFSDS Cannon Rounds Mk3
			07:39 Gas Turbine Generator Mk3
			09:39 Twin Assault Cannon
			09:47 Dense Composite Alloys Mk2
			10:11 HVAPFSDS Cannon Rounds
			10:55 Neural Synapse Research Brain
			11:59 Twin Assault Gun
			12:27 Cannon Autoloader Mk3
			13:03 Heavy Body - Tiger
			13:39 HVAPFSDS Cannon Rounds Mk2
			14:19 Vapor Turbine Generator
			14:31 Neural Synapse Research Brain Mk2
			15:07 Needle Gun
			16:43 Cannon Rapid Loader
			17:19 HVAPFSDS Cannon Rounds Mk3
			17:31 Vapor Turbine Generator Mk2
			18:47 HEAP Mortar Shells Mk2
			20:03 Cannon Rapid Loader Mk2
			20:07 Hardened Rail Dart
			21:03 Whirlwind AA Turret
			21:19 Vapor Turbine Generator Mk3
			21:23 HEAP Mortar Shells Mk3
			23:27 Cannon Rapid Loader Mk3
			24:11 Dense Composite Alloys Mk3
			24:11 Tungsten-Tipped MG Bullets Mk3
			24:19 Hardened Rail Dart Mk2
			24:47 Turbo-Charged Engine Mk2
			26:39 Depleted Uranium MG Bullets
			27:15 Turbo-Charged Engine Mk3
			27:19 Mortar Autoloader Mk3
			27:23 Superdense Composite Alloys
			29:03 Mortar Fast Loader
			29:23 Depleted Uranium MG Bullets Mk2
			30:19 Advanced Engineering
			30:55 Rail Target Prediction Computer
			31:07 Light Body - Retaliation
			32:11 Superdense Composite Alloys Mk2
			32:15 Rail Gun
			32:59 Depleted Uranium MG Bullets Mk3
			33:07 Gas Turbine Engine
			34:55 Advanced Repair Facility
			36:15 Rail Gun ROF
			36:31 Medium Body - Retribution
			36:43 Superdense Composite Alloys Mk3
			37:43 Neural Synapse Research Brain Mk3
			40:11 Gauss Cannon
			40:15 Hardened Rail Dart Mk3
			40:31 Gas Turbine Engine Mk2
			41:35 Heavy Body - Vengeance
			41:35 Rail Gun ROF Mk2
			44:27 Auto-Repair
			48:07 Cyborg Dense Composite Alloys Mk3
			48:55 Gas Turbine Engine Mk3
			48:55 Rail Gun ROF Mk3
			50:35 Cyborg Superdense Composite Alloys
			51:15 Thermal Armor Mk3
			51:19 Cyborg High Intensity Thermal Armor
			53:15 Advanced Manufacturing
			53:23 Cyborg High Intensity Thermal Armor Mk2
			53:35 Cyborg Superdense Composite Alloys Mk2
			53:35 High Intensity Thermal Armor
			55:55 Cyborg High Intensity Thermal Armor Mk3
			56:23 High Intensity Thermal Armor Mk2
			57:03 Cyborg Superdense Composite Alloys Mk3
			57:07 Self-Replicating Manufacturing
			58:59 Cyborg Superdense Thermal Armor
			59:43 High Intensity Thermal Armor Mk3
			59:51 Automated VTOL Rearming Mk2
			61:03 Command Turret Upgrade				~~~ the start of random researches
			61:23 Automated VTOL Rearming Mk3
			61:43 Super Rail-Gunner
			61:59 Hardened Base Structure Materials
			62:35 Cyborg Superdense Thermal Armor Mk2
			63:07 Sensor Upgrade Mk3
			63:27 Robotic VTOL Rearming
			63:31 Vehicle Superdense Thermal Armor
			63:31 Heavy Body - Wyvern
			64:59 Nexus Link Turret
			65:59 Robotic VTOL Rearming Mk2
		*/

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

		return [FISHBOT_T2_CANNON_RESEARCH_PRIORITIES, FISHBOT_T2_CANNON_RESEARCH_BLACKLIST];
	}
}


class armyResearchAndDevelopment {
	constructor() {
		this.researchOrders = new FishBotResearchOrders();

	}

	proposeResearch(researchPriorities, researchBlacklist) {

		const currAvailableResearches = enumResearch();		
		// Note: this does not return important parameters such as: r.researchPoints / r.researchPower / r.resultComponents / r.requiredResearch.
		//	It returns parameters similar to the Stats.Research global.
		// debug(`${gameTime} (FishBot ${me}): `);
		// currAvailableResearches.forEach(r => {
		// 	debug(`\t- ${r.id}`);
		// });

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
			if (defined(f)) {
				highPriority.push(f);
			}
		}

		return {
			'regularPriority': regularPriority,
			'highPriority': highPriority
		};

	}
}
