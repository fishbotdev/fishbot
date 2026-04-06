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


class armyResearchAndDevelopment {
	constructor() {

	}

	proposeResearch(researchPriorities, researchBlacklist) {

		const currAvailableResearches = enumResearch();

		let highPriority = [], highPriorityUnsorted = [], regularPriority = [];

		for (let i=0; i<currAvailableResearches.length; i++) {
			const curr = currAvailableResearches[i];

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

		if (false) {
			debug(`\t==${gameTime}: highPriority==`); 
			highPriority.forEach(r => debug(`\t  ${r.name}`));
			debug(`\t==${gameTime}: regularPriority==`);
			regularPriority.forEach(r => debug(`\t  ${r.name}`));
		}

		return {
			'regularPriority': regularPriority,
			'highPriority': highPriority
		};

	}
}
