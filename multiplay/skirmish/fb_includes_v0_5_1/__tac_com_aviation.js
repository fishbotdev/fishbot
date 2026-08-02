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

/**
 * Driver for rearming VTOLs.
 * @param {DroidObject} droid
 * @returns {void}
 */
function vtolRearm(droid) {
	if (droid.order === DORDER_REARM) {
		return;
	}
	orderDroid(droid, DORDER_REARM);		
}

/**
 * Returns if the `armed` parameter of a droid weapon is bigger than the given `percentage`.
 * @param {DroidObject} droid 
 * @param {number} percentage 
 * @returns {boolean}
 */
function vtolArmed(droid, percentage) {

	const weaponArmedPercentage = droid.weapons[0]?.armed;		// Note: `droid.armed` returns '0'.
	if (weaponArmedPercentage == null) {
		deb(`WARNING: vtolArmed() was called with a droid "${droid.name}" (id: ${droid.id}) that does not have "droid.weapons". Returned 'true'.`);
		return true;
	}
	
	const COMBAT_INEFFECTIVE = 25;
	if (weaponArmedPercentage <= COMBAT_INEFFECTIVE) 	{
		return false;		// this has the effect of cancelling attacking if it can't attack any more
	}

	if (droid.order === DORDER_ATTACK) 		{
		return true;		// otherwise does not interrupt attacking units
	}

	if (weaponArmedPercentage >= percentage) {
		return true;
	} else {
		return false;
	}
}

/**
 * TAC SOP: VTOL GROUP REARMING
 * @param {string | number} taskForceID 
 * @returns 
 */
function rearmVtolGroup(taskForceID) {
	const taskForceUnits = state.g.enumGroup(taskForceID);
	taskForceUnits.forEach(droid => {
		if (!vtolArmed(droid, 99)) {
			vtolRearm(droid);
		}
	});
	return {status: MISSION_STATUS.IN_PROGRESS};
}

/**
 * TAC SOP: AIR STRIKE
 * @param {DroidObject | StructureObject} targetObj 
 * @param {string | number} taskForceID 
 */
function doAirStrike(targetObj, taskForceID) {

	const obj = getObject(targetObj.type, targetObj.player, targetObj.id);
	if (obj === null) {								// target destroyed (mission succeeded)
		return {status: MISSION_STATUS.SUCCEEDED};
	}

	const strikeUnits = state.g.enumGroup(taskForceID);
	if (strikeUnits.length === 0) {
		return {status: MISSION_STATUS.FAILED};		// e.g. strike aircraft were killed
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
		
	strikeUnits.forEach((droid) => attackTarget(droid, obj));
	return {status: MISSION_STATUS.IN_PROGRESS};
}