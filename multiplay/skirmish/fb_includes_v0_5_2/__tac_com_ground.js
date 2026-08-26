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
 * Driver for using a repair facility.
 * @param {string | number} taskForceID 
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
 * 
 * @param {number[]} reserveGroupIDs 
 * @param {number} x 
 * @param {number} y 
 */
function moveReservesToShadow(reserveGroupIDs, x, y) {

	const isTooFarAway = (droid) => distSq(droid.x, x, droid.y, y) > 8 ** 2;

	const maintainPositionBehind = (droid) => {
		if (isTooFarAway(droid)) {
			orderDroidLoc(droid, DORDER_MOVE, x, y);
		} else {
			orderDroidLoc(droid, DORDER_SCOUT, droid.x, droid.y);
		}
	};

	reserveGroupIDs.forEach(id => {
		const reserveUnits = state.g.enumGroup(id);
		reserveUnits.forEach(maintainPositionBehind);		
	});

}

/**
 * Returns `true` if the straight-line path between `droid` and (`toX`, `toY`) crosses a chokepoint tile.
 * @param {worldState} state
 * @param {DroidObject} droid
 * @param {number} toX
 * @param {number} toY
 * @returns {boolean}
 */
function pathCrossesChokepoint(state, droid, toX, toY) {
	const isChokepoint = state.mapData.isChokepoint;

	const points = drawLine(droid.x, droid.y, toX, toY);
	for (let i=0; i<points.length; i++) {
		const p = points[i];
		if (isChokepoint[p[0]][p[1]]) {
			return true;
		}
	}
	return false;
}

/**
 * TAC SOP: MOVE A BRIGADE COMBAT TEAM (BCT) TO A LOCATION
 * @param {worldState} state
 * @param {number} brigadeID
 * @param {number} targetX
 * @param {number} targetY
 */
function moveBrigadeToLocation(state, brigadeID, targetX, targetY) {

	const isChokepoint = state.mapData.isChokepoint;

	const brigadeUnits = state.g.enumGroup(brigadeID);

	const LOCATION_X = state.brigades[brigadeID].location.x;
	const LOCATION_Y = state.brigades[brigadeID].location.y;

	const DISTSQ_CENTER_TO_TARGET = distSq(LOCATION_X, targetX, LOCATION_Y, targetY);

	brigadeUnits.forEach(droid => {
		const DISTSQ_TO_CENTER = distSq(LOCATION_X, droid.x, LOCATION_Y, droid.y);
		const DISTSQ_TO_TARGET = distSq(targetX, droid.x, targetY, droid.y);

		const TOO_FAR_AWAY_FROM_CENTER = DISTSQ_TO_CENTER > 8 ** 2;
		const FAR_AWAY_FROM_CENTER = DISTSQ_TO_CENTER > 5 ** 2;
		const AHEAD_OF_GROUP = DISTSQ_TO_TARGET < DISTSQ_CENTER_TO_TARGET;
		const UNIT_IN_CHOKEPOINT = isChokepoint[droid.x][droid.y];

		if (TOO_FAR_AWAY_FROM_CENTER) {
			orderDroidLoc(droid, DORDER_MOVE, LOCATION_X, LOCATION_Y);
		} else if (FAR_AWAY_FROM_CENTER) {
			if (AHEAD_OF_GROUP) {
				if (UNIT_IN_CHOKEPOINT) {
					orderDroidLoc(droid, DORDER_MOVE, targetX, targetY);
				} else {
					orderDroid(droid, DORDER_HOLD);
				}
			} else {
				orderDroidLoc(droid, DORDER_MOVE, LOCATION_X, LOCATION_Y);
			}
		} else {
			orderDroidLoc(droid, DORDER_MOVE, targetX, targetY);
		}
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

	const isChokepoint = state.mapData.isChokepoint;

	const ARMOUR_UNITS = [];
	const INFANTRY_UNITS = [];
	/** @type {DroidObject[]} */
	const SHORT_RANGE_FIRE_SUPPORT = [];
	const AA_UNITS = [];
	const SENSOR_UNITS = [];
	const REPAIR_UNITS = [];

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
			case DIVISION.MAINTENANCE_RESERVE:
				REPAIR_UNITS.push(droid);
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

	if (!DIRECT_FIRE_TARGET_AVAILABLE) {
		return;
	}

	const closestDroidToTarget = findClosestDroidToTarget(ARMOUR_UNITS, DIRECT_FIRE_TARGET);

	const _distSqToClosestDroid = (droid) => distSq(droid.x, closestDroidToTarget.x, droid.y, closestDroidToTarget.y);

	const moveToClosestDroid = (droid) => orderDroidLoc(droid, DORDER_MOVE, closestDroidToTarget.x, closestDroidToTarget.y);
	
	const attackDirectFireTarget = (droid, distSqGroupCenterToTarget) => {
		const UNIT_IN_CHOKEPOINT = isChokepoint[droid.x][droid.y];
		const DISTSQ_TO_CENTER = distSq(LOCATION_X, droid.x, LOCATION_Y, droid.y);
		
		const TOO_FAR_AWAY_FROM_CENTER = DISTSQ_TO_CENTER > 8 ** 2;
		const FAR_AWAY_FROM_CENTER = DISTSQ_TO_CENTER > 5 ** 2;
		
		const DISTSQ_TO_TARGET = distSq(targetX, droid.x, targetY, droid.y);
		const AHEAD_OF_GROUP = DISTSQ_TO_TARGET < distSqGroupCenterToTarget;
		
		if (TOO_FAR_AWAY_FROM_CENTER) {
			if (UNIT_IN_CHOKEPOINT) {
				attackTarget(droid, DIRECT_FIRE_TARGET);
			} else {
				orderDroidLoc(droid, DORDER_MOVE, LOCATION_X, LOCATION_Y);
			}
		} else if (FAR_AWAY_FROM_CENTER) {
			if (AHEAD_OF_GROUP || UNIT_IN_CHOKEPOINT) {
				attackTarget(droid, DIRECT_FIRE_TARGET);
			} else {
				orderDroidLoc(droid, DORDER_MOVE, LOCATION_X, LOCATION_Y);
			}
		} else {
			attackTarget(droid, DIRECT_FIRE_TARGET);
		}
	}

	const maintainPosition = (droid) => {
		if (_distSqToClosestDroid(droid) > 4 ** 2) {
			moveToClosestDroid(droid);
		} else {
			orderDroidLoc(droid, DORDER_MOVE, LOCATION_X, LOCATION_Y);
		}
	};

	const fixNearestDamaged = (droid) => {
		if (_distSqToClosestDroid(droid) >= 7 ** 2) {
			moveToClosestDroid(droid);
			return;
		} 
		if (droid.order === DROID_REPAIR) {			// do not interrupt a repair in progress
			return;	
		}
		const nearby = enumRange(droid.x, droid.y, 8, ALLIES);
		for (let i=0; i<nearby.length; i++) {
			const obj = nearby[i];
			if (obj.type !== DROID) {
				continue;
			}
			if (obj.health < 99) {
				orderDroidObj(droid, DORDER_REPAIR, obj);
				return;
			}
		}
	};

	let targetX, targetY, DISTSQ_CENTER_TO_TARGET;
	if (DIRECT_FIRE_TARGET_AVAILABLE) {
		targetX = DIRECT_FIRE_TARGET.x;
		targetY = DIRECT_FIRE_TARGET.y;
		DISTSQ_CENTER_TO_TARGET = distSq(LOCATION_X, targetX, LOCATION_Y, targetY);
	}

	ARMOUR_UNITS.forEach(droid => attackDirectFireTarget(droid, DISTSQ_CENTER_TO_TARGET));

	INFANTRY_UNITS.forEach(droid => attackDirectFireTarget(droid, DISTSQ_CENTER_TO_TARGET));

	SENSOR_UNITS.forEach(maintainPosition);

	AA_UNITS.forEach((droid) => {
		if (ANTI_AIR_TARGET_AVAILABLE) {
			attackTarget(droid, ADA_TARGET);		
		} else {
			maintainPosition(droid);
		}
	});

	const FIRE_SUPPORT_TARGETS_TO_SEARCH = Math.min(5, fireSupportTargets.length);
	const DIRECT_FIRE_TARGETS_TO_SEARCH = Math.min(5, directFireTargets.length);

	SHORT_RANGE_FIRE_SUPPORT.forEach(droid => {
		const UNIT_IN_CHOKEPOINT = isChokepoint[droid.x][droid.y];
		const DISTSQ_TO_CENTER = distSq(LOCATION_X, droid.x, LOCATION_Y, droid.y);
		
		const TOO_FAR_AWAY_FROM_CENTER = DISTSQ_TO_CENTER > 6 ** 2;
		
		const DISTSQ_TO_TARGET = distSq(targetX, droid.x, targetY, droid.y);
		const AHEAD_OF_GROUP = DISTSQ_TO_TARGET < DISTSQ_CENTER_TO_TARGET;		// this is the direct fire target
		
		if ((AHEAD_OF_GROUP || TOO_FAR_AWAY_FROM_CENTER) && !UNIT_IN_CHOKEPOINT) {
			orderDroidLoc(droid, DORDER_MOVE, LOCATION_X, LOCATION_Y);
		} else {
			const DROID_RANGE_SQ = (droid.range * WZ2100_TILERANGE_SCALING_FACTOR) ** 2;

			if (FIRE_SUPPORT_TARGET_AVAILABLE) {
				for (let i=0; i<FIRE_SUPPORT_TARGETS_TO_SEARCH; i++) {
					if (distSq(droid.x, fireSupportTargets[i].x, droid.y, fireSupportTargets[i].y) < DROID_RANGE_SQ) {
						attackTarget(droid, fireSupportTargets[i]);
						return;
					}
				}
			}
			for (let i=0; i<DIRECT_FIRE_TARGETS_TO_SEARCH; i++) {
				if (distSq(droid.x, directFireTargets[i].x, droid.y, directFireTargets[i].y) < DROID_RANGE_SQ) {
					attackTarget(droid, directFireTargets[i]);
					return;
				}
			}
			orderDroidLoc(droid, DORDER_MOVE, LOCATION_X, LOCATION_Y);
		}
	});

	REPAIR_UNITS.forEach(fixNearestDamaged);

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