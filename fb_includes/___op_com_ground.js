/*
	This file is part of FishBot, a Warzone 2100 AI.

	FishBot is free software: you can redistribute it and/or modify it under the terms of the 
	GNU General Public License as published by the Free Software Foundation, either version 3 
	of the License, or (at your option) any later version.

	FishBot is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; 
	without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. 
	See the GNU General Public License for more details.

	You should have received a copy of the GNU General Public License along with this program. 
	If not, see <https://www.gnu.org/licenses/> or <https://www.gnu.org/licenses/gpl-3.0.html>.
*/


class armyGroundForceCommand {

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

			'sectorID': undefined,
			'targetObj': undefined,
		};

		return missionDataTemplate;
	}

	#mcb(callback, ...args) {
		// This function is here so we can schedule execution of the callback function at some later point
		return callback(...args);	//...args is important otherwise all remaining args will be interpreted as a single array of parameters
	}

	#createRaidMission({targetObj, forceSize}) {
		// it returns either:
		// 	- missionData object (according to missionDataTemplate), if mission successfully created, OR
		//	- undefined, if mission was not able to be created	
		
		let generalReserve = state.g.enumGroup(DIVISION.GENERAL_RESERVE);
		const MIN_UNITS_IN_RESERVE = 10;

		// Not possible if no available land units
		if (generalReserve.length < forceSize + MIN_UNITS_IN_RESERVE) {
			return undefined;
		}

		// Not possible if target obj is no longer defined
		if (getObject(targetObj.type, targetObj.player, targetObj.id) === null) {		
			return undefined;
		}

		// Pick 3 units which are closest to the target
		generalReserve.sort((first, second) => distance(first, targetObj) - distance(second, targetObj));
		const taskForceUnits = generalReserve.slice(0, forceSize);

		let md = this.#createMissionOrders();

		// Create mission details
		const id = gameTime + "RAID";
		md.id = id;
		//md.missionType is set in the parent function (no duplication)
		md.missionStatus = MISSION_STATUS.NOT_STARTED;
		md.taskForceID = id;
		
		taskForceUnits.forEach(droid => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: DIVISION.GENERAL_RESERVE, droidID: droid.id});
		});

		// Assign orders for conducting & ceasing operations			
		md.orders = () => this.#mcb(raidTargetObject, targetObj, md.taskForceID);		// lambda is necessary otherwise md.orders is not interpreted as a function
		md.ceaseOrders = () => this.#mcb(this.#finaliseGroundMission, md.taskForceID);

		return md;
	}

	#finaliseGroundMission(taskForceID) {
		// Mission completed
		const taskForceUnits = state.g.enumGroup(taskForceID);
		if (taskForceUnits.length === 0) {
			return;
		} 
		
		taskForceUnits.forEach((droid) => {
			// TODO: sort back into different reserves based on unit type
			state.g.addDroidToGroup({groupID: DIVISION.INFANTRY_RESERVE, droidID: droid.id});			
			returnForRepair(droid);
		});	
		state.g.deleteGroup(taskForceID);
	}

	completedForceBuildup() {
		let allTanksCount = enumDroid(me, DROID_WEAPON).filter((droid) => droid.isVTOL !== true).length;		// todo: replace with other
		const fireSupportCount = state.g.enumGroup(DIVISION.FIRE_SUPPORT_RESERVE).length;
		const directAssaultTanksCount = allTanksCount - fireSupportCount;

		if (directAssaultTanksCount >= 4 && fireSupportCount >= 1)
			return true;
		else
			return false;
	}

	completedStagingForAttack() {
		let allTanksCount = enumDroid(me, DROID_WEAPON).filter((droid) => droid.isVTOL !== true).length;		// todo: replace with other
		const fireSupportCount = state.g.enumGroup(DIVISION.FIRE_SUPPORT_RESERVE).length;

		if (allTanksCount >= 10 && fireSupportCount >= 3)		
			return true;
		else
			return false;
	}

	getForceMedianLocation({droidArray}) {
		/*
			Goal: to find the 'median' droid's (x,y) coordinates
			1. Get x,y of all droids
			2. Iterate through (x,y) coordinate list, get the median, return as 'x' and 'y'
		*/

		// HACK, allLandUnits to be replaced by droidArray
		let generalReserve = state.g.enumGroup(DIVISION.GENERAL_RESERVE);
		let fireSupportReserve = state.g.enumGroup(DIVISION.FIRE_SUPPORT_RESERVE);
		let infantryReserve = state.g.enumGroup(DIVISION.INFANTRY_RESERVE);
		let allLandUnits = [...generalReserve, ...fireSupportReserve, ...infantryReserve];

		// Get all x,y coordinates
		let droidsInGroup = allLandUnits.filter((droid) => (gameTime - droid.born) > 30000);		// only take droids with lifetime > 30 seconds
		let droidX = [];
		let droidY = [];
		droidsInGroup.forEach((droid) => {
			droidX = droidX.concat([droid.x]);
			droidY = droidY.concat([droid.y]);
		});	

		// Find median
		let medianX = Math.floor(arrayMedian(droidX));
		let medianY = Math.floor(arrayMedian(droidY));

		return {"x": medianX, "y": medianY};
	}

}