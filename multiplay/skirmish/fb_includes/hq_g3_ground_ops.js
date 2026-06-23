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

	#createMissionOrders() {
		return {
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
	}

	#mcb(callback, ...args) {
		// This function is here so we can schedule execution of the callback function at some later point
		return callback(...args);	//...args is important otherwise all remaining args will be interpreted as a single array of parameters
	}

	createReturnForRepairMission() {
		// this is the default behaviour of all RETURN_FOR_REPAIR vehicles.
		// Units are moved out of the 'repair' group by resupplyLogisitics; which will move the droid into its appropriate reserve group

		// it returns either:
		// 	- missionData object (according to missionDataTemplate), if mission successfully created, OR
		//	- undefined, if mission was not able to be created	

		let md = this.#createMissionOrders();

		// Create mission details
		md.id = "MISSION_TYPE.RETURN_FOR_REPAIR";
		md.taskForceID = DIVISION.RETURNING_FOR_REPAIR;			// breaks the normal pattern: id === reserveGroup for a default action

		// Assign orders for conducting & ceasing operations			
		md.orders = () => this.#mcb(returnForRepair, md.taskForceID);		
		md.ceaseOrders = () => {return;};	// doesn't do anything

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
		const getUnitsIn = (brigadeID) => state.g.enumGroup(brigadeID);

		const brigadeUnits = getUnitsIn(brigadeID);

		const baseX = baseLocation.x;
		const baseY = baseLocation.y;
		const baseZ = MapTiles[baseLocation.y][baseLocation.x].height;
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
		
		return {"x": medianX, "y": medianY, "z": MapTiles[medianY][medianX].height};
	}

}