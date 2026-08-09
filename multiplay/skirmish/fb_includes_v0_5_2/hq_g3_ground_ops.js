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


class armyGroundOperations {

	constructor() {
		
	}

	/**
	 * Factory function for `CombatMissionData`.
	 * @param {number} missionType
	 * @param {number | string} id
	 * @param {number | string} groupID
	 * @param {DroidObject | StructureObject | undefined} target
	 * @returns {CombatMissionData}
	 */
	#createMissionOrders(missionType, id, groupID, target) {
		return {
			'id': id, 
			'missionType': missionType, 
			'missionStatus': MISSION_STATUS.FAILED_CREATION, 
			'priority': MISSION_PRIORITY.LOW, 
			'taskForceID': groupID, 
			'orders': () => {}, 
			'ceaseOrders': () => {},
			'timeStarted': -2,
			'timeCompleted': -1,
			'target': target,
		};
	}

	/**
	 * Mission cleanup function (releases units back to the reserves).
	 * @param {CombatMissionData} md 
	 * @param {number | string} reserveID 
	 * @returns {void} Writes `timeCompleted` to missionData.
	 */
	#finaliseCombatMission(md, reserveID) {
		const taskForceUnits = state.g.enumGroup(md.taskForceID);
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: reserveID, droidID: droid.id});
		});	
		// if (taskForceUnits.length === 0)	debug(`Terminated mission: taskForceID ${md.taskForceID} are all dead.`);
		
		state.g.deleteGroup(md.taskForceID);
		md.timeCompleted = gameTime;
	}

	/**
	 * This is the default behaviour of all RETURN_FOR_REPAIR vehicles.
	 * Units are moved out of the 'repair' group by resupplyLogisitics. This will move the droid into its appropriate reserve group.
	 * @param {Object} missionConfig
	 * @param {number} missionConfig.missionType
	 * @returns {CombatMissionData}
	 */
	createReturnForRepairMission({missionType}) {
		const target = undefined;
		const md =  this.#createMissionOrders(missionType, "RETURN_FOR_REPAIR", DIVISION.RETURNING_FOR_REPAIR, target);

		md.orders = () => returnForRepair(md.taskForceID);	
		md.ceaseOrders = () => {};
		return md;
	}

	/**
	 * This is the default behaviour of all RETURN_FOR_REPAIR vehicles.
	 * Units are moved out of the 'repair' group by resupplyLogisitics. This will move the droid into its appropriate reserve group.
	 * @param {Object} missionConfig
	 * @param {number} missionConfig.missionType
	 * @param {Object} missionConfig.missionDetails
	 * @param {number} missionConfig.tickUID
	 * @returns {CombatMissionData}
	 */
	createGuardLocationMission({missionType, missionDetails, tickUID}) {
		/** @type {DerrickObject} */
		const target = missionDetails.target;
		/** @type {DroidObject} */
		const unit = missionDetails.unit;
		/** @type {number} */
		const currBrigade = missionDetails.currentBrigade;

		const taskForceUnits = [unit];

		// Create mission details
		const id = gameTime + "_GUARD_LOCATION_" + tickUID;
		
		const md =  this.#createMissionOrders(missionType, id, id, missionDetails.target);
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: currBrigade, droidID: droid.id});
		});		
		md.orders = () => guardLocation(target, md.taskForceID);		
		md.ceaseOrders = () => this.#finaliseCombatMission(md, DIVISION.RETURNING_FOR_REPAIR);

		return md;
	}

	/**
	 * Returns if FishBot is ready to send its initial units out of base.
	 * @param {worldState} state 
	 * @returns {boolean}
	 */
	isReadyToAttack(state) {

		const myPlayerInfo = state.playerInfo[me];
		if (myPlayerInfo['numArmourUnits'] >= 1) {
			return true;
		} else {
			return false;
		}

	}

	/**
	 * Finds the 'median' droid's (x,y) coordinates
	 * 1. Get x,y of all owned droids
	 * 2. Iterate through (x,y) coordinate list, get the median, return as 'x' and 'y'. 
	 * 
	 * Returns 'baseLocation' if no units are found.
	 * @param {number} brigadeID 
	 * @returns {PositionInfo} `medianLocation` (if units exist); else `baseLocation`.
	 */
	getForceMedianLocation(brigadeID) {
		const heightMap = state.mapData.heightMap;

		const getUnitsIn = (brigadeID) => state.g.enumGroup(brigadeID);
		
		const brigadeUnits = getUnitsIn(brigadeID);

		const baseX = baseLocation.x;
		const baseY = baseLocation.y;
		const baseZ = heightMap[baseX][baseY];
		const basePosition = {'x': baseX, 'y': baseY, 'z': baseZ};
		if (brigadeUnits.length === 0) {
			return basePosition;
		}

		const droidX = [], droidY = [];
		brigadeUnits.forEach((droid) => {
			if (droid.hasIndirect) return;	// Experimental: removing mortar units, does that make this estimate more accurate?
			droidX.push(droid.x);
			droidY.push(droid.y);
		});	
		if (droidX.length === 0 || droidY.length === 0) {
			// This is required because the `droid.hasIndirect` filtering may mean that droidX/droidY may be empty, in which case `arrayMedian` is invalid		
			return basePosition;
		}
		
		// Find median
		const medianX = Math.floor(arrayMedian(droidX));
		const medianY = Math.floor(arrayMedian(droidY));
		const medianZ = heightMap[medianX][medianY];
		
		return {"x": medianX, "y": medianY, "z": medianZ};
	}

}