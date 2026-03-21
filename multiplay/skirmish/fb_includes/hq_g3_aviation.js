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

class armyAviation {
	constructor() {

	}

	#createMissionOrders() {
		let missionDataTemplate = {
			'id': undefined, 
			'missionType': undefined, 
			'missionStatus': MISSION_STATUS.FAILED_CREATION, 
			'priority': MISSION_PRIORITY.LOW, 
			'taskForceID': undefined, 
			'orders': undefined, 
			'ceaseOrders': undefined,
			'timeStarted': -2,
			'timeCompleted': -1,
			
			'target': undefined,
		};

		return missionDataTemplate;
	}

	#mcb(callback, ...args) {
		// This function is here so we can schedule execution of the callback function at some later point
		return callback(...args);	//...args is important otherwise all remaining args will be interpreted as a single array of parameters
	}

	createVtolStagingMission() {
		// this is the default behaviour of all AIR_RESERVE aircraft

		// it returns either:
		// 	- missionData object (according to missionDataTemplate), if mission successfully created, OR
		//	- undefined, if mission was not able to be created	

		let md = this.#createMissionOrders();

		// Create mission details
		md.id = "MISSION_TYPE.VTOL_STAGING_MISSION";
		md.taskForceID = AIR_RESERVE;			// breaks the normal pattern: id === reserveGroup for a default action

		// Assign orders for conducting & ceasing operations			
		md.orders = () => this.#mcb(rearmVtolGroup, md.taskForceID);		
		md.ceaseOrders = () => {return;};	// doesn't do anything

		return md;
	}
	
	createAirStrikeMission({targetInfo, numRaidAircraft=1, tickUID=undefined, type="AIR_STRIKE_GENERIC"}) {
		// It returns either:
		// 	- missionData object (according to missionDataTemplate), if mission successfully created, OR
		//	- undefined, if mission was not able to be created	 

		let airReserve = state.g.enumGroup(AIR_RESERVE);
		if (airReserve.length < numRaidAircraft) {
			return undefined;
		}

		let md = this.#createMissionOrders();

		// Create mission details
		const id = getCurrGameTime() + `_${type}_` + tickUID;
		md.id = id;
		md.taskForceID = id;

		let taskForceUnits = airReserve.slice(0, numRaidAircraft);  
		if (airReserve.length > numRaidAircraft) {
			let armedAircraft = airReserve.filter(aircraft => vtolArmed(aircraft));		
			if (armedAircraft.length >= numRaidAircraft) {
				taskForceUnits = armedAircraft.slice(0, numRaidAircraft);
			}
		}

		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: AIR_RESERVE, droidID: droid.id});
		});		

		md.target = targetInfo;

		// Assign orders for conducting & ceasing operations			
		md.orders = () => this.#mcb(doAirStrike, targetInfo, md.taskForceID, numRaidAircraft);		// lambda is necessary otherwise md.orders is not interpreted as a function
		md.ceaseOrders = () => this.#mcb(this.#finaliseVtolMission, md);

		return md;
	}

	createCasPatrolMission({x, y, tickUID=undefined}) {
		// This function is a tactical level function - it defines:
		//	- Who will perform the mission
		//	- Orders to execute the mission

		// it returns either:
		// 	- missionData object (according to missionDataTemplate), if mission successfully created, OR
		//	- undefined, if mission was not able to be created

		let airReserve = state.g.enumGroup(AIR_RESERVE);
		const MIN_CAS_PATROL_AIRCRAFT = 2;

		// Not possible if no available recon units
		if (airReserve.length < MIN_CAS_PATROL_AIRCRAFT) {
			return undefined;
		}
		
		let md = this.#createMissionOrders();

		// Create mission details
		const id = getCurrGameTime() + "_CAS_PATROL_" + tickUID;
		md.id = id;
		md.taskForceID = id;
		
		let taskForceUnits = airReserve.slice(0, 2);  
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: AIR_RESERVE, droidID: droid.id});
		});	
		
		md.target = undefined;

		// Assign orders for conducting & ceasing operations
		const areWeaponsHot = true;
		md.orders = () => this.#mcb(doAirRecon, x, y, areWeaponsHot, md.taskForceID);		// lambda is necessary otherwise md.orders is not interpreted as a function
		md.ceaseOrders = () => this.#mcb(this.#finaliseVtolMission, md);

		return md;
	}

	createAirReconSilentMission({x, y, tickUID=undefined}) {
		// This function is a tactical level function - it defines:
		//	- Who will perform the mission
		//	- Orders to execute the mission

		// it returns either:
		// 	- missionData object (according to missionDataTemplate), if mission successfully created, OR
		//	- undefined, if mission was not able to be created

		let airReserve = state.g.enumGroup(AIR_RESERVE);

		// Not possible if no available recon units
		if (airReserve.length === 0) {
			return undefined;
		}

		let md = this.#createMissionOrders();

		// Create mission details
		const id = getCurrGameTime() + "_AIR_RECON_SILENT_" + tickUID;
		md.id = id;
		md.taskForceID = id;
		
		let taskForceUnits = airReserve.slice(0, 1);	// only need one aircraft for a silent recon mission
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: AIR_RESERVE, droidID: droid.id});
		});		

		md.target = undefined;

		// Assign orders for conducting & ceasing operations
		const areWeaponsHot = false;
		md.orders = () => this.#mcb(doAirRecon, x, y, areWeaponsHot, md.taskForceID);		// lambda is necessary otherwise md.orders is not interpreted as a function
		md.ceaseOrders = () => this.#mcb(this.#finaliseVtolMission, md);

		return md;
	}

	createAirReconPatrolMission({x, y, tickUID=undefined}) {
		// This function is a tactical level function - it defines:
		//	- Who will perform the mission
		//	- Orders to execute the mission

		// it returns either:
		// 	- missionData object (according to missionDataTemplate), if mission successfully created, OR
		//	- undefined, if mission was not able to be created

		let airReserve = state.g.enumGroup(AIR_RESERVE);

		// Not possible if no available recon units
		if (airReserve.length < 2) {
			return undefined;
		}
		
		let md = this.#createMissionOrders();

		// Create mission details
		const id = getCurrGameTime() + "_AIR_RECON_PATROL_" + tickUID;
		md.id = id;
		md.taskForceID = id;
		
		let taskForceUnits = airReserve.slice(0, 2);
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: AIR_RESERVE, droidID: droid.id});
		});		

		md.target = undefined;

		const areWeaponsHot = true;
		md.orders = () => this.#mcb(doAirRecon, x, y, areWeaponsHot, md.taskForceID);		// lambda is necessary otherwise md.orders is not interpreted as a function
		md.ceaseOrders = () => this.#mcb(this.#finaliseVtolMission, md);

		return md;
	}

	#finaliseVtolMission(md) {
		const taskForceUnits = state.g.enumGroup(md.taskForceID);
		if (taskForceUnits.length === 0) {
			return;
		} 
		
		// Else release resources
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: AIR_RESERVE, droidID: droid.id});
		});	
		state.g.deleteGroup(md.taskForceID);

		md.timeCompleted = getCurrGameTime();
	}
}