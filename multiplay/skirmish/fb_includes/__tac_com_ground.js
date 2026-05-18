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
	Driver for using a repair facility at base
*/
function returnForRepair(taskForceID) {

	const unitsToRepair = state.g.enumGroup(taskForceID);
	
	const HAVE_REPAIR = state.playerInfo[me]["numRepairFacilities"] > 0;

	unitsToRepair.forEach(droid => {
		if (HAVE_REPAIR) {
			orderDroid(droid, DORDER_RTR);
		} else {
			orderDroid(droid, DORDER_RTB);		// assuming mobile repair units will be at base
		}
	});
	
	return {status: MISSION_STATUS.IN_PROGRESS};		// Note: this is a default behaviour; another function will remove these units from the group.
}

/*
	Driver for attacking
*/
function attackTarget(droid, target) {
	if (!defined(target) || !defined(droid)) {
		return;
	}

	// Switch based on type of target
	switch (target.type) {
		case DROID:
			if (droid.droidType === DROID_SENSOR)
				orderDroidObj(droid, DORDER_OBSERVE, target);
			else if (droid.canHitGround === true && !isVTOL(target)) {
					orderDroidObj(droid, DORDER_ATTACK, target);	
			} else if ((droid.canHitAir === true && droid.canHitGround === false) && isVTOL(target))
				// added 'canHitGround' === false so dedicated ground units do not attack VTOLs for now
				orderDroidObj(droid, DORDER_ATTACK, target);
			else
				orderDroidLoc(droid, DORDER_SCOUT, target.x, target.y);
			break;
		case FEATURE:
			orderDroidObj(droid, DORDER_RECOVER, target);
			break;
		case STRUCTURE:
			if (droid.droidType !== DROID_SENSOR)
				// orderDroidLoc(droid, DORDER_SCOUT, target.x, target.y);
				orderDroidObj(droid, DORDER_ATTACK, target);
			else
				orderDroidObj(droid, DORDER_OBSERVE, target);
			break;
		default:
			orderDroidObj(droid, DORDER_ATTACK, target);
			break;
	}
}

/*
    Helper for finding closest droid to target
*/
function findClosestDroidToTarget(unitGroup, currGroundTarget) {
	if (unitGroup.length === 0 || !defined(currGroundTarget)) {
		return undefined;
	}

	const LOWER_THRESHOLD = 6 ** 2;

	let closestDroidIdx = 0;
	let closestDroidSquaredDist = distSq(unitGroup[0].x, currGroundTarget.x, unitGroup[0].y, currGroundTarget.y);

	for (let i=1; i<unitGroup.length; i++) {

		const squaredDist = distSq(unitGroup[i].x, currGroundTarget.x, unitGroup[i].y, currGroundTarget.y);

		if (squaredDist < LOWER_THRESHOLD) {
			return unitGroup[i];
		}

		if (squaredDist < closestDroidSquaredDist) {
			closestDroidSquaredDist = squaredDist;
			closestDroidIdx = i;
		}
	}

	return unitGroup[closestDroidIdx];
}

/**
 * Orders a unit (droid) to return to base.
 * @param {DroidObject} droid 
 */
function returnUnitToBase(droid) {
	orderDroid(droid, DORDER_RTB);
}

/**
 * Returns all units (droids) in the specified `unitGroups` to base.
 * @param {DroidObject[][]} unitGroups 
 */
function returnUnitGroupsToBase(unitGroups) {
	unitGroups.forEach(unitGroup => unitGroup.forEach(returnUnitToBase));
}

/**
 * TAC SOP: MOVE A BRIGADE COMBAT TEAM (BCT) TO A LOCATION
 * @param {worldState} state 
 * @param {number} brigadeID 
 * @param {number} x 
 * @param {number} y 
 */
function moveBrigadeToLocation(state, brigadeID, x, y) {

	const brigadeUnits = state.g.enumGroup(brigadeID);

	brigadeUnits.forEach(droid => {
		orderDroidLoc(droid, DORDER_MOVE, x, y);	
	});
}

/**
 * TAC SOP: MOVE A BRIGADE COMBAT TEAM (BCT) TO ATTACK A TARGET
 * @param {worldState} state 
 * @param {number} brigadeID 
 * @param {BrigadeTargets} groundTargets 
 * @returns 
 */
function moveBrigadeToAttack(state, brigadeID, groundTargets) {

	// Note: object == `null` checks are not required because they have been integrated with the function which generates `groundTargets`.
	const directFireTargets = groundTargets["directFireTargets"];
	const fireSupportTargets = groundTargets["fireSupportTargets"];		
	const adaTargets = groundTargets["adaTargets"];

	const DIRECT_FIRE_TARGET = directFireTargets[0];
	const FIRE_SUPPORT_TARGET = fireSupportTargets[0];
	const ADA_TARGET = adaTargets[0];

	const DIRECT_FIRE_TARGET_AVAILABLE = DIRECT_FIRE_TARGET != undefined;
	const FIRE_SUPPORT_TARGET_AVAILABLE = FIRE_SUPPORT_TARGET != undefined;
	const ANTI_AIR_TARGET_AVAILABLE = ADA_TARGET != undefined;

	// Get up to date unit information
	const forceLocation = state.brigades[brigadeID].location;
	const LOCATION_X = forceLocation.x;
	const LOCATION_Y = forceLocation.y;
	const BASE_LOCATION_X = baseLocation.x;
	const BASE_LOCATION_Y = baseLocation.y

	const ARMOUR_UNITS = [];
	const INFANTRY_UNITS = [];
	const SHORT_RANGE_FIRE_SUPPORT = [];
	const AA_UNITS = [];
	const SENSOR_UNITS = [];

	const brigadeUnits = state.g.enumGroup(brigadeID);
	brigadeUnits.forEach(droid => {
		const category = getDroidFbGroupClassification(droid);
		switch(category) {
			case DIVISION.HEAVY_CAV_RESERVE:
			case DIVISION.LIGHT_CAV_RESERVE:
				ARMOUR_UNITS.push(droid);
				break;
			case DIVISION.INFANTRY_RESERVE:
				INFANTRY_UNITS.push(droid);
				break;
			case DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE:
				SHORT_RANGE_FIRE_SUPPORT.push(droid);
				break;
			case DIVISION.SENSOR_RESERVE:
				SENSOR_UNITS.push(droid);
				break;
			case DIVISION.AIR_DEFENCE_RESERVE:
				AA_UNITS.push(droid);
				break;
			default:
				debug(`tac_com_ground -> brigadeUnit classifier failed for ${droid.name} (${droid.id})`);
				break;
		}
	});

	const returnAllUnitsToBase = () => returnUnitGroupsToBase([ARMOUR_UNITS, INFANTRY_UNITS, SHORT_RANGE_FIRE_SUPPORT, AA_UNITS, SENSOR_UNITS]);

	if (ARMOUR_UNITS.length === 0) {
		returnAllUnitsToBase();		
		return;
	}

	if (DIRECT_FIRE_TARGET == undefined) {
		return;
	}

	const closestDroidToTarget = findClosestDroidToTarget(ARMOUR_UNITS, DIRECT_FIRE_TARGET);
	
	const isTooFarFromBrigade = (droid) => distSq(droid.x, LOCATION_X, droid.y, LOCATION_Y) > 10 ** 2;

	const _distSqToClosestDroid = (droid) => distSq(droid.x, closestDroidToTarget.x, droid.y, closestDroidToTarget.y);
	const isNearFrontLine = (droid) => _distSqToClosestDroid(droid) < 6 ** 2;

	const moveToClosestDroid = (droid) => orderDroidLoc(droid, DORDER_MOVE, closestDroidToTarget.x, closestDroidToTarget.y);
	
	const maintainPosition = (droid) => {
		if (!isNearFrontLine(droid)) {
			moveToClosestDroid(droid);
		} else {
			returnUnitToBase(droid);
		}
	};

	// MAIN ASSAULT UNITS
	ARMOUR_UNITS.forEach(droid => {
		if (isTooFarFromBrigade(droid)) {
			orderDroidLoc(droid, DORDER_MOVE, LOCATION_X, LOCATION_Y);
			return;
		}

		if (isNearFrontLine(droid) && DIRECT_FIRE_TARGET_AVAILABLE) {
			attackTarget(droid, DIRECT_FIRE_TARGET);
		} else {
			moveToClosestDroid(droid);
		}
	});

	INFANTRY_UNITS.forEach(droid => {
		if (isNearFrontLine(droid) && DIRECT_FIRE_TARGET_AVAILABLE) {
			attackTarget(droid, DIRECT_FIRE_TARGET);
		} else {
			moveToClosestDroid(droid);
		}		
	});

	// SENSOR UNITS
	SENSOR_UNITS.forEach(droid => maintainPosition(droid));

	// ADA UNITS
	AA_UNITS.forEach((droid) => {
		if (ANTI_AIR_TARGET_AVAILABLE) {
			attackTarget(droid, ADA_TARGET);		
		} else {
			maintainPosition(droid);
		}
	});

	// FIRE SUPPORT UNITS
	const FRONTLINE_DISTSQ_TO_BASE = _distSqToClosestDroid(baseLocation);

	let TARGET_DISTSQ_TO_BASE = 0;
	if (FIRE_SUPPORT_TARGET_AVAILABLE) {
		TARGET_DISTSQ_TO_BASE = distSq(FIRE_SUPPORT_TARGET.x, BASE_LOCATION_X, FIRE_SUPPORT_TARGET.y, BASE_LOCATION_Y);
	}

	SHORT_RANGE_FIRE_SUPPORT.forEach(droid => {
		if (isTooFarFromBrigade(droid)) {
			orderDroidLoc(droid, DORDER_MOVE, LOCATION_X, LOCATION_Y);
			return;
		}
		
		if (!FIRE_SUPPORT_TARGET_AVAILABLE) {
			moveToClosestDroid(droid);
			return;
		}

		// The intent of this code is to implement intelligent retreat.
		// Artillery is squishy so if an enemy has flanked around the back / side of the formation, artillery should keep firing rather than running the gauntlet.
		const DROID_DISTSQ_TO_BASE = distSq(droid.x, BASE_LOCATION_X, droid.y, BASE_LOCATION_Y);

		const MORTAR_CLOSEST_TO_BASE = DROID_DISTSQ_TO_BASE < FRONTLINE_DISTSQ_TO_BASE && DROID_DISTSQ_TO_BASE < TARGET_DISTSQ_TO_BASE;
		const ENEMY_CLOSEST_TO_BASE = TARGET_DISTSQ_TO_BASE < DROID_DISTSQ_TO_BASE && TARGET_DISTSQ_TO_BASE < FRONTLINE_DISTSQ_TO_BASE;

		if (MORTAR_CLOSEST_TO_BASE || ENEMY_CLOSEST_TO_BASE) {
			attackTarget(droid, FIRE_SUPPORT_TARGET);	
		} else {
			moveToClosestDroid(droid);
		}
	});


	// DEBUG
	if (false) {
		hackMarkTiles();
		if (defined(DIRECT_FIRE_TARGET)) {
			addBeacon(DIRECT_FIRE_TARGET.x, DIRECT_FIRE_TARGET.y, 0);
		}
		if (defined(FIRE_SUPPORT_TARGET)) {
			const RADIUS = 1;		// creates a bounding box with dimension [2*RADIUS + 1 by 2*RADIUS+1]
			hackMarkTiles(FIRE_SUPPORT_TARGET.x - RADIUS, FIRE_SUPPORT_TARGET.y - RADIUS, FIRE_SUPPORT_TARGET.x + RADIUS, FIRE_SUPPORT_TARGET.y + RADIUS);
		}
	}
}