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
 * Baseline cohesion radii (in tiles), which are what a brigade of mid-size bodies needs to maneuver.
 * These are a floor, not a fixed value: `getCohesionRadiusScaling()` widens them for heavier brigades.
 */
const COHESION_RADII = {
	REGROUP: 8,				// beyond this, a unit breaks off what it is doing and rejoins the group
	HOLD: 5,				// beyond this, a unit which is ahead of the group waits for the group to catch up
	FIRE_SUPPORT: 6,		// how far fire support may sit from the group center before it is recalled
	STATION_KEEPING: 4,		// how far a sensor / AA unit may sit from the unit nearest the target
	REPAIR: 7,				// how far a repair unit may roam from the unit nearest the target
};
Object.freeze(COHESION_RADII);

// Every cohesion radius is widened by this fraction per body size class above medium, so an all-heavy brigade
// maneuvers with radii 25% wider than an all-medium one.
const COHESION_RADIUS_GROWTH_PER_BODY_SIZE = 0.25;

/**
 * Returns the multiplier to apply to `COHESION_RADII` for a brigade of the given average body size.
 * Heavy bodies are larger and slower to turn, so they need more room to maneuver than the same number of
 * mid-size bodies. Brigades of medium bodies or lighter keep the baseline radii: the radii are already tuned
 * for them, and tightening them further would only crowd the group.
 * @param {number} avgBodySize the brigade's average `BODY_WEIGHT`
 * @returns {number} a multiplier of 1.0 or greater
 */
function getCohesionRadiusScaling(avgBodySize) {
	const SIZE_ABOVE_MEDIUM = Math.max(0, avgBodySize - BODY_WEIGHT.MEDIUM);
	return 1 + (SIZE_ABOVE_MEDIUM * COHESION_RADIUS_GROWTH_PER_BODY_SIZE);
}

/**
 * Returns the squared cohesion radius a brigade of the given average body size gets, for a baseline radius in tiles.
 * Squared, because the callers compare against `distSq()`.
 * @param {number} baseRadius one of `COHESION_RADII`
 * @param {number} avgBodySize the brigade's average `BODY_WEIGHT`
 * @returns {number}
 */
function getCohesionRadiusSq(baseRadius, avgBodySize) {
	return (baseRadius * getCohesionRadiusScaling(avgBodySize)) ** 2;
}

/**
 * Returns how much room a single body of the given size takes up in a corridor, in 'light bodies' worth of space.
 * @param {number} bodySize a `BODY_WEIGHT` value (fractional values are permitted, e.g. a brigade average)
 * @returns {number}
 */
function getBodyCongestionWeight(bodySize) {
	return bodySize + 1;		// LIGHT -> 1, MEDIUM -> 2, HEAVY -> 3
}

/**
 * Reports whether friendly armour is packed tightly enough around (x, y) to be getting in its own way.
 *
 * What saturates a corridor is bulk, not headcount: five mid-size bodies fit where five heavy bodies do not.
 * Nearby units are therefore counted by how much room they take up, against an allowance of what five
 * mid-size bodies are worth. Nearby units are charged at the *brigade's* average body size, which is an
 * approximation when another brigade's units are also in the radius.
 * @param {worldState} state 
 * @param {number} x 
 * @param {number} y 
 * @param {number} avgBodySize the brigade's average `BODY_WEIGHT`
 * @returns {boolean}
 */
function isLocationCongested(state, x, y, avgBodySize) {
	const CHOKEPOINT_CONGESTION_RADIUS = 5;
	const CHOKEPOINT_CONGESTION_ALLOWANCE = 5 * getBodyCongestionWeight(BODY_WEIGHT.MEDIUM);		// what 5 mid-size bodies are worth

	const CONGESTION_PER_UNIT = getBodyCongestionWeight(avgBodySize);

	const nearby = state.grid.enumRangeLazy(x, y, CHOKEPOINT_CONGESTION_RADIUS, false, true);

	let congestion = 0;
	for (let i=0; i<nearby['friendlyUnits'].length; i++) {
		if (nearby['friendlyUnits'][i].flags & OBJ_FLAGS.ARMOUR) {
			congestion += CONGESTION_PER_UNIT;
			if (congestion > CHOKEPOINT_CONGESTION_ALLOWANCE) {
				return true;
			}
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

	const brigadeUnits = state.g.enumGroup(brigadeID);

	const LOCATION_X = state.brigades[brigadeID].location.x;
	const LOCATION_Y = state.brigades[brigadeID].location.y;

	// How much room this brigade gets to maneuver in, which is set by how big its units are.
	const AVG_BODY_SIZE = state.brigades[brigadeID].avgBodySize;
	const REGROUP_RADIUS_SQ = getCohesionRadiusSq(COHESION_RADII.REGROUP, AVG_BODY_SIZE);
	const HOLD_RADIUS_SQ = getCohesionRadiusSq(COHESION_RADII.HOLD, AVG_BODY_SIZE);

	const DISTSQ_CENTER_TO_TARGET = distSq(LOCATION_X, targetX, LOCATION_Y, targetY);
	const BRIGADE_CONGESTED = isLocationCongested(state, LOCATION_X, LOCATION_Y, AVG_BODY_SIZE);

	brigadeUnits.forEach(droid => {
		const DISTSQ_TO_CENTER = distSq(LOCATION_X, droid.x, LOCATION_Y, droid.y);
		const DISTSQ_TO_TARGET = distSq(targetX, droid.x, targetY, droid.y);

		const TOO_FAR_AWAY_FROM_CENTER = DISTSQ_TO_CENTER > REGROUP_RADIUS_SQ;
		const FAR_AWAY_FROM_CENTER = DISTSQ_TO_CENTER > HOLD_RADIUS_SQ;
		const AHEAD_OF_GROUP = DISTSQ_TO_TARGET < DISTSQ_CENTER_TO_TARGET;
		const UNIT_ROADBLOCKED = state.mapData.isChokepoint[droid.x][droid.y] && BRIGADE_CONGESTED;

		if (TOO_FAR_AWAY_FROM_CENTER) {
			orderDroidLoc(droid, DORDER_MOVE, LOCATION_X, LOCATION_Y);
		} else if (FAR_AWAY_FROM_CENTER) {
			if (AHEAD_OF_GROUP) {
				if (UNIT_ROADBLOCKED) {
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

	// How much room this brigade gets to maneuver in, which is set by how big its units are.
	const AVG_BODY_SIZE = state.brigades[brigadeID].avgBodySize;
	const REGROUP_RADIUS_SQ = getCohesionRadiusSq(COHESION_RADII.REGROUP, AVG_BODY_SIZE);
	const HOLD_RADIUS_SQ = getCohesionRadiusSq(COHESION_RADII.HOLD, AVG_BODY_SIZE);
	const FIRE_SUPPORT_RADIUS_SQ = getCohesionRadiusSq(COHESION_RADII.FIRE_SUPPORT, AVG_BODY_SIZE);
	const STATION_KEEPING_RADIUS_SQ = getCohesionRadiusSq(COHESION_RADII.STATION_KEEPING, AVG_BODY_SIZE);
	const REPAIR_RADIUS_SQ = getCohesionRadiusSq(COHESION_RADII.REPAIR, AVG_BODY_SIZE);

	const BRIGADE_CONGESTED = isLocationCongested(state, LOCATION_X, LOCATION_Y, AVG_BODY_SIZE);

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
		const UNIT_ROADBLOCKED = state.mapData.isChokepoint[droid.x][droid.y] && BRIGADE_CONGESTED;
		const DISTSQ_TO_CENTER = distSq(LOCATION_X, droid.x, LOCATION_Y, droid.y);

		const TOO_FAR_AWAY_FROM_CENTER = DISTSQ_TO_CENTER > REGROUP_RADIUS_SQ;
		const FAR_AWAY_FROM_CENTER = DISTSQ_TO_CENTER > HOLD_RADIUS_SQ;

		const DISTSQ_TO_TARGET = distSq(targetX, droid.x, targetY, droid.y);
		const AHEAD_OF_GROUP = DISTSQ_TO_TARGET < distSqGroupCenterToTarget;

		if (TOO_FAR_AWAY_FROM_CENTER) {
			if (UNIT_ROADBLOCKED) {
				attackTarget(droid, DIRECT_FIRE_TARGET);
			} else {
				orderDroidLoc(droid, DORDER_MOVE, LOCATION_X, LOCATION_Y);
			}
		} else if (FAR_AWAY_FROM_CENTER) {
			if (AHEAD_OF_GROUP || UNIT_ROADBLOCKED) {
				attackTarget(droid, DIRECT_FIRE_TARGET);
			} else {
				orderDroidLoc(droid, DORDER_MOVE, LOCATION_X, LOCATION_Y);
			}
		} else {
			attackTarget(droid, DIRECT_FIRE_TARGET);
		}
	}

	const maintainPosition = (droid) => {
		if (_distSqToClosestDroid(droid) > STATION_KEEPING_RADIUS_SQ) {
			moveToClosestDroid(droid);
		} else {
			orderDroidLoc(droid, DORDER_MOVE, LOCATION_X, LOCATION_Y);
		}
	};

	const fixNearestDamaged = (droid) => {
		if (_distSqToClosestDroid(droid) >= REPAIR_RADIUS_SQ) {
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
		const UNIT_ROADBLOCKED = state.mapData.isChokepoint[droid.x][droid.y] && BRIGADE_CONGESTED;
		const DISTSQ_TO_CENTER = distSq(LOCATION_X, droid.x, LOCATION_Y, droid.y);

		const TOO_FAR_AWAY_FROM_CENTER = DISTSQ_TO_CENTER > FIRE_SUPPORT_RADIUS_SQ;

		const DISTSQ_TO_TARGET = distSq(targetX, droid.x, targetY, droid.y);
		const AHEAD_OF_GROUP = DISTSQ_TO_TARGET < DISTSQ_CENTER_TO_TARGET;		// this is the direct fire target

		if ((AHEAD_OF_GROUP || TOO_FAR_AWAY_FROM_CENTER) && !UNIT_ROADBLOCKED) {
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
		if (defined(DIRECT_FIRE_TARGET)) {
			addBeacon(DIRECT_FIRE_TARGET.x, DIRECT_FIRE_TARGET.y, 0);
		}
		if (defined(FIRE_SUPPORT_TARGET)) {
			const RADIUS = 1;		// creates a bounding box with dimension [2*RADIUS + 1 by 2*RADIUS+1]
			highlightTiles(FIRE_SUPPORT_TARGET.x - RADIUS, FIRE_SUPPORT_TARGET.y - RADIUS, FIRE_SUPPORT_TARGET.x + RADIUS, FIRE_SUPPORT_TARGET.y + RADIUS);
		}
	}
}