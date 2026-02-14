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

/*
	Drivers for VTOL handling
*/

function vtolRearm(droid) {
	// Assumes that vtol rearming pads are built near base.
	if (droid.order !== DORDER_REARM) {
		if (distance(droid, baseLocation) < 30)
			orderDroid(droid, DORDER_REARM);
		else
			orderDroidLoc(droid, DORDER_SCOUT, baseLocation.x, baseLocation.y);
	}	
}

function vtolArmed(droid, percent) {

	if (!isVTOL(droid)) 	
		return true; 	// edge case

	const COMBAT_INEFFECTIVE = 25;

	// first, check if ammunition is critically low, return false
	for (let i = 0; i < droid.weapons.length; ++i)
		if (droid.weapons[i].armed <= COMBAT_INEFFECTIVE)
			return false;

	// else, do not interrupt attacking units
	if (droid.order === DORDER_ATTACK)		
		return true;

	// finally, do the actual check
	for (let i = 0; i < droid.weapons.length; ++i)
		if (droid.weapons[i].armed >= percent)
			return true;
	return false;
}

/*
	TAC SOP: VTOL GROUP REARMING
*/
function rearmVtolGroup(taskForceID) {
	// HACK: this will always return false so it will always be in progress
	
	const taskForceUnits = state.g.enumGroup(taskForceID);
	if (taskForceUnits.length === 0) {
		return {status: MISSION_STATUS.IN_PROGRESS};
	}

	// niceDebug("rearmVtolGroup; vtols detected in AIR_RESERVE");
	for (let i = 0; i < taskForceUnits.length; ++i) {
		let droid = taskForceUnits[i];
		if (!vtolArmed(droid,99)) {
			vtolRearm(droid);
		}
	}
	return {status: MISSION_STATUS.IN_PROGRESS};
}

/*
	TAC SOP: AIR RECONNAISSANCE
*/

function doAirRecon(x, y, weaponsHot=false, taskForceID) {
	// 24 Nov: modified to reconnoiter coordinates x, y

	// Standard return values for tactical functions
	//   - true if destination has been reached
	//   - false if destination has not been reached
	//	 - undefined if its not possible to complete the mission
	
	// niceDebug("tactics/doAirRecon: got x, y, holdFire, taskForceID", x, y, holdFire, taskForceID);

	const taskForceUnits = state.g.enumGroup(taskForceID);
	
	if (taskForceUnits.length === 0) {
		// niceDebug("tactics/doAirRecon: terminated - 0 group size");
		return {status: MISSION_STATUS.FAILED};		// scout aircraft were killed or reassigned
	}

	for (let i=0; i<taskForceUnits.length; i++) {
		let droid = taskForceUnits[i];
		// niceDebug("tactics/doAirRecon: inside do something")

		// If the VTOL is already at the target x, y, return {status: MISSION_STATUS.SUCCEEDED};
		if (distance(droid, x, y) < 8) {
			// if within 8 tiles, target coordinates have been reconnoitered, return true (mission success)
			return {status: MISSION_STATUS.SUCCEEDED};		
		}

		// Else, go to the location
		if (weaponsHot) {
			if (!vtolArmed(droid, 99)) {		
				vtolRearm(droid);
			} else {
				orderDroidLoc(droid, DORDER_SCOUT, x, y);
			}
		} else {
			orderDroidLoc(droid, DORDER_MOVE, x, y);
		}		
	}

	return {status: MISSION_STATUS.IN_PROGRESS};
}

/*
	TAC SOP: AIR STRIKE
*/
function doAirStrike(targetObj, taskForceID) {
	const updatedObject = getObject(targetObj.type, targetObj.player, targetObj.id);

	if (updatedObject === null) {		// target destroyed (mission succeeded)
		return {status: MISSION_STATUS.SUCCEEDED};
	}

	// niceDebug("tactics/doAirStrike: got name, x, y, taskForceID", targetObj.name, targetObj.x, targetObj.y, taskForceID);

	// Else, order strike
	const taskForceUnits = state.g.enumGroup(taskForceID);
	
	if (taskForceUnits.length === 0) {
		// debug("tactics/doAirStrike: terminated - 0 group size", taskForceID);
		return {status: MISSION_STATUS.FAILED};		// strike aircraft were killed or reassigned
	}

	// wait until all units are prepared before launching strike
	let numReady=0;
	for (let i=0; i<taskForceUnits.length; ++i) {
		let droid = taskForceUnits[i];

		if (!vtolArmed(droid, 99)) {
			vtolRearm(droid);
		} else {
			numReady++;
		}
	}

	if (numReady !== taskForceUnits.length) {
		return {status: MISSION_STATUS.IN_PROGRESS};
	}
		
	// Else conduct strike
	taskForceUnits.forEach((droid) => attackTarget(droid, updatedObject));

	return {status: MISSION_STATUS.IN_PROGRESS};
}