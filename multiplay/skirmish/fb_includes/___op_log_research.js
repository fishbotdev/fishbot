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
T2 starts with these technologies to be researched
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
T3 starts with these technologies to be researched
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

/*
Reference: Original research categories

	'weapons': ['R-Wpn'],
	'armor': ['R-Vehicle-Metals', 'R-Cyborg-Metals', 'R-Cyborg-Armor-Heat', 'R-Vehicle-Armor-Heat'],
	'mobility': ['R-Vehicle-Prop', 'R-Vehicle-Engine', 'R-Vehicle-Body'],
	'prod': ['R-Struc'],
	'support': ['R-Sys'],
	'misc': ['']		// catch remaining uncategorised researches

*/


class armyResearchAndDevelopment {
	constructor() {

	}

	doResearch(lab) {

		const currAvailableResearches = enumResearch();

		if (currAvailableResearches.length === 0) {
			return;
		}
						
		/*
			Research priority items if they are available
			Heuristic algorithm:
			1. To determine priority, iterate through the list. 
			2. If the item I'm looking at is higher priority than the next entry, put it there, else, continue through the list

			v0.3.1 release -> Power upgrade, Heavy Cannon, Cannon Dmg, Research upgrade, ROF, twin aslt, vehicle metals

			Example v0.3.1 T2 research order:
				R-Wpn-Cannon-Damage06
				R-Struc-Power-Upgrade01c
				R-Wpn-Cannon3Mk1
				R-Struc-Research-Upgrade06
				R-Wpn-Cannon-Damage07
				R-Wpn-Cannon-ROF03
				R-Wpn-Cannon6TwinAslt
				R-Vehicle-Metals05
				R-Struc-Research-Upgrade07
				R-Cyborg-Metals06
				R-Wpn-Cannon-Damage08
				R-Wpn-Cannon-ROF04
				R-Vehicle-Metals06
				R-Struc-Power-Upgrade02
				R-Wpn-Cannon-ROF05
		*/

		const FISHBOT_CANNON_RESEARCH_PRIORITIES = [
			"R-Wpn-Cannon-Damage06",
			"R-Struc-Power",
			"R-Wpn-Cannon3Mk1", 
			"R-Struc-Research-Upgrade06",
			"R-Wpn-Cannon-Damage",
			"R-Wpn-Mortar-Damage", 	
			"R-Wpn-Cannon-ROF", 
			"R-Wpn-Cannon6TwinAslt",
			"R-Vehicle-Metals",
			"R-Struc-Research-Upgrade",
			"R-Vehicle-Body09",				// Tiger Body
			"R-Struc-Factory-Upgrade",
			"R-Cyborg-Metals",
			"R-Wpn-MG5", 					// Twin AG
			"R-Wpn-AAGun02", 		
			"R-Wpn-Mortar-ROF", 
			"R-Struc-VTOLPad-Upgrade", 
			
			"R-Wpn-RailGun01",
			"R-Wpn-RailGun02",
			"R-Wpn-RailGun03",
			"R-Wpn-Rail-Damage",

			"R-Wpn-Rail-ROF", 
			"R-Wpn-Rail-Accuracy",
		];

		for (let i=0; i<FISHBOT_CANNON_RESEARCH_PRIORITIES.length; ++i) {
			const keyword = FISHBOT_CANNON_RESEARCH_PRIORITIES[i];

			let priorityResearches = currAvailableResearches.filter(research => research.id.includes(keyword));
			if (priorityResearches.length === 0) {
				continue;
			}

			const priorityResearch = priorityResearches[0];
			if (pursueResearch(lab, priorityResearch.id)) {
				debug(`	${gameTime}: Priority researching: ${priorityResearch.name}`);			
				return true;
			}
		}

		// If priority research does not exist, pick a random technology not in the blacklist below
		const FISHBOT_RESEARCH_BLACKLIST_KEYWORDS = [
			"Flame", "Rocket", "Missile", "R-Defense", "R-Sys-VTOLStrike-Turret", "R-Wpn-PlasmaCannon", 
		];

		let filteredAvailableResearches = currAvailableResearches.filter(research => 
			FISHBOT_RESEARCH_BLACKLIST_KEYWORDS.every(b => !research.id.includes(b))
		);

		if (filteredAvailableResearches.length === 0) {
			return false;		
		}

		const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];

		const selectedResearch = randomChoice(filteredAvailableResearches);

		if (pursueResearch(lab, selectedResearch.id)) {
			debug(`	${gameTime}: Researching: ${selectedResearch.name}`);			
			return true;
		}

		return false;
	}
}
