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
	Drivers for VTOL handling
*/

function vtolRearm(droid) {
	if (droid.order === DORDER_REARM) {
		return;
	}
	orderDroid(droid, DORDER_REARM);		
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
		if (distSq(droid.x, x, droid.y, y) < 8 ** 2) {
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
function doAirStrike(targetInfo, taskForceID) {

	const obj = getObject(targetInfo.type, targetInfo.player, targetInfo.id);
	if (obj === null) {								// target destroyed (mission succeeded)
		// debug(`succeeded ${taskForceID}`);
		return {status: MISSION_STATUS.SUCCEEDED};
	}

	const strikeUnits = state.g.enumGroup(taskForceID);
	if (strikeUnits.length === 0) {
		// debug(`failed ${taskForceID}, 0 group length`);
		return {status: MISSION_STATUS.FAILED};		// strike aircraft were killed
	}

	let numReady = 0;
	strikeUnits.forEach((droid) => {
		if (!vtolArmed(droid, 99)) {
			vtolRearm(droid);
		} else {
			numReady++;
		} 
	});
	
	if (numReady !== strikeUnits.length) {
		return {status: MISSION_STATUS.IN_PROGRESS};
	}
		
	// Else conduct strike
	strikeUnits.forEach((droid) => attackTarget(droid, obj));

	return {status: MISSION_STATUS.IN_PROGRESS};
}