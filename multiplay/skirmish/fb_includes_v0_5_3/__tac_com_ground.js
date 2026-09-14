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
		if (isSidestepping(state, droid)) {
			return;
		}
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
 * TAC SOP: HOLD THE RESERVE BEHIND A BRIGADE, READY TO REINFORCE IT
 *
 * The reserve is held on the same leash as the brigade it shadows: it is given the brigade's own regroup
 * radius, so it sits as close behind a heavy brigade as it does behind a mid-size one.
 * @param {worldState} state
 * @param {number[]} reserveGroupIDs 
 * @param {number} anchorBrigadeID the brigade which the reserve is held behind
 */
function moveReservesToShadow(state, reserveGroupIDs, anchorBrigadeID) {

	const anchorBrigade = state.brigades[anchorBrigadeID];
	const x = anchorBrigade.location.x;
	const y = anchorBrigade.location.y;

	const REGROUP_RADIUS_SQ = interpolateCohesionRadiusSq(COHESION_RADII.REGROUP, anchorBrigade.avgBodySize);

	const isTooFarAway = (droid) => distSq(droid.x, x, droid.y, y) > REGROUP_RADIUS_SQ;

	const maintainPositionBehind = (droid) => {
		if (isSidestepping(state, droid)) {
			return;
		}
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

const COHESION_RADII = {
	/** @type {CohesionRadius} */
	REGROUP:         {tight: 8, relaxed: 12},		// beyond this, a unit breaks off what it is doing and rejoins the group
	HOLD:            {tight: 5, relaxed: 9},		// beyond this, a unit which is ahead of the group waits for the group to catch up.  
	// Note: `HOLD` thresholds must stay below `REGROUP` thresholds at every body size (otherwise the behaviour gets eaten by "REGROUP").
	FIRE_SUPPORT:    {tight: 6, relaxed: 7.5},		// how far fire support may sit from the group center before it is recalled
	STATION_KEEPING: {tight: 4, relaxed: 5},		// how far a sensor / AA unit may sit from the unit nearest the target
	REPAIR:          {tight: 7, relaxed: 8.75},		// how far a repair unit may roam from the unit nearest the target
};

// The average body size a brigade's vehicles must reach for it to be given the `tight` and `relaxed` radii.
const COHESION_TIGHT_AT_BODY_SIZE = BODY_WEIGHT.LIGHT;
const COHESION_RELAXED_AT_BODY_SIZE = BODY_WEIGHT.MEDIUM;

/**
 * Returns the squared cohesion radius a brigade of the given average body size gets.
 * @param {CohesionRadius} cohesionRadius one of `COHESION_RADII`
 * @param {number} avgBodySize the brigade's average `BODY_WEIGHT`, over its vehicles
 * @returns {number}
 */
function interpolateCohesionRadiusSq(cohesionRadius, avgBodySize) {
	const relativeBodySize = (avgBodySize - COHESION_TIGHT_AT_BODY_SIZE) / (COHESION_RELAXED_AT_BODY_SIZE - COHESION_TIGHT_AT_BODY_SIZE);
	const linearScalingFactor = clampValue(relativeBodySize, 0, 1); 
	const interpolatedRadius = cohesionRadius.tight + ((cohesionRadius.relaxed - cohesionRadius.tight) * linearScalingFactor);
	return interpolatedRadius ** 2;
}

/**
 * Reports whether friendly armour is packed tightly enough around (x, y) to be getting in its own way. Also a function of body size.
 * @param {worldState} state 
 * @param {number} x 
 * @param {number} y 
 * @param {number} avgBodySize the brigade's average `BODY_WEIGHT`. Note: BODY_WEIGHT is a zero-indexed enum; this is why "1" is added.
 * @returns {boolean}
 */
function isLocationCongested(state, x, y, avgBodySize) {
	const CHECK_RADIUS = 5;
	const MAX_CONGESTION_SCORE_IN_CHECK_RADIUS = 5 * (BODY_WEIGHT.MEDIUM + 1);			// = 5 medium tanks in a 5 tile radius
	
	const nearby = state.grid.enumRangeLazy(x, y, CHECK_RADIUS, false, true);

	const TRACKED_VEHICLE_MASK = (OBJ_FLAGS.ARMOUR | OBJ_FLAGS.ADA | OBJ_FLAGS.INDIRECT_FIRE | OBJ_FLAGS.REPAIR);
	const CONGESTION_SCORE_PER_TRACKED_VEHICLE = avgBodySize + 1;

	let congestionScore = 0;
	for (let i=0; i<nearby['friendlyUnits'].length; i++) {
		const IS_TRACKED_VEHICLE = nearby['friendlyUnits'][i].flags & TRACKED_VEHICLE_MASK;
		if (IS_TRACKED_VEHICLE) {
			congestionScore += CONGESTION_SCORE_PER_TRACKED_VEHICLE;
			if (congestionScore > MAX_CONGESTION_SCORE_IN_CHECK_RADIUS) {
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
	const REGROUP_RADIUS_SQ = interpolateCohesionRadiusSq(COHESION_RADII.REGROUP, AVG_BODY_SIZE);
	const HOLD_RADIUS_SQ = interpolateCohesionRadiusSq(COHESION_RADII.HOLD, AVG_BODY_SIZE);

	const DISTSQ_CENTER_TO_TARGET = distSq(LOCATION_X, targetX, LOCATION_Y, targetY);
	const BRIGADE_CONGESTED = isLocationCongested(state, LOCATION_X, LOCATION_Y, AVG_BODY_SIZE);

	brigadeUnits.forEach(droid => {
		if (isSidestepping(state, droid)) {
			return;
		}

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
	const REGROUP_RADIUS_SQ = interpolateCohesionRadiusSq(COHESION_RADII.REGROUP, AVG_BODY_SIZE);
	const HOLD_RADIUS_SQ = interpolateCohesionRadiusSq(COHESION_RADII.HOLD, AVG_BODY_SIZE);
	const FIRE_SUPPORT_RADIUS_SQ = interpolateCohesionRadiusSq(COHESION_RADII.FIRE_SUPPORT, AVG_BODY_SIZE);
	const STATION_KEEPING_RADIUS_SQ = interpolateCohesionRadiusSq(COHESION_RADII.STATION_KEEPING, AVG_BODY_SIZE);
	const REPAIR_RADIUS_SQ = interpolateCohesionRadiusSq(COHESION_RADII.REPAIR, AVG_BODY_SIZE);

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
		if (isSidestepping(state, droid)) {
			return;
		}

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
/*
	HEAD-ON DEADLOCK RESOLUTION

	Two units meeting head-on in a narrow place can each hold a movement order forever without either giving way.
	The engine's own watchdog does not rescue them: `moveBlocked` needs BLOCK_TIME (6s) of uninterrupted bumping,
	but it clears that clock whenever the unit turns more than 90 degrees, which is exactly what the deadlock does.
*/

/** Movement orders FishBot issues which can leave a unit deadlocked against another. `DORDER_RTR` is how units bound for repair travel. */
const JAM_MOVEMENT_ORDERS = [DORDER_MOVE, DORDER_SCOUT, DORDER_RTR, DORDER_RTB];

const JAM_STUCK_MS = 3000;					// how long a unit must hold a movement order without moving before it counts as deadlocked
const JAM_PAIR_RADIUS = 2;					// how close another ground unit must be to count as blocking a deadlocked unit
const JAM_MIN_CHOKEPOINT_WIDTH = 2;			// a chokepoint this wide or narrower has no room to pass in, so no sidestep is attempted
const JAM_SIDESTEP_MS = 3000;				// how long a sidestep is protected from being overridden, if the unit has not moved by then

/**
 * Reports whether a unit is currently carrying out a sidestep issued by `resolveHeadOnJams`.
 * Callers which issue movement orders use this to leave that sidestep alone until it completes.
 * @param {worldState} state 
 * @param {DroidObject} droid 
 * @returns {boolean}
 */
function isSidestepping(state, droid) {
	const jamRecord = state.unitJamRecord.get(droid.id);
	return jamRecord != undefined && gameTime < jamRecord.sidestepUntil;
}

/**
 * Reports whether a unit has held a movement order without moving for `JAM_STUCK_MS`, on a chokepoint tile with
 * enough room beside it for a unit to pass.
 * @param {worldState} state 
 * @param {DroidObject} droid 
 * @returns {boolean}
 */
function isDeadlockedAtChokepoint(state, droid) {
	const HAS_MOVEMENT_ORDER = JAM_MOVEMENT_ORDERS.includes(droid.order);
	if (!HAS_MOVEMENT_ORDER) {
		return false;
	}

	const jamRecord = state.unitJamRecord.get(droid.id);
	if (jamRecord == undefined) {
		return false;
	}

	const STUCK_LONG_ENOUGH = gameTime - jamRecord.stuckSince >= JAM_STUCK_MS;
	const ON_CHOKEPOINT = state.mapData.isChokepoint[droid.x][droid.y];
	const ROOM_TO_PASS = state.mapData.chokepointWidth[droid.x][droid.y] > JAM_MIN_CHOKEPOINT_WIDTH;

	return STUCK_LONG_ENOUGH && ON_CHOKEPOINT && ROOM_TO_PASS;
}

/**
 * Returns the ground unit nearest to `droid` within `JAM_PAIR_RADIUS` which is standing in its way.
 * Any ground unit counts, whatever its type, order or group: a truck laying a structure, an idle sensor and a
 * deadlocked tank all obstruct the same way. A unit sharing `droid`'s tile is skipped, because the two give no
 * axis to step away from. VTOLs are skipped because they fly over ground traffic rather than blocking it.
 * @param {DroidObject} droid 
 * @returns {DroidObject | undefined}
 */
function findBlockingUnit(droid) {
	const nearbyObjects = enumRange(droid.x, droid.y, JAM_PAIR_RADIUS, ALLIES, false);

	let blocker = undefined;
	let blockerDistSq = JAM_PAIR_RADIUS ** 2;

	for (let i=0; i<nearbyObjects.length; i++) {
		const obj = nearbyObjects[i];

		const IS_GROUND_UNIT = obj.type === DROID && !isVTOL(obj);
		if (!IS_GROUND_UNIT || obj.id === droid.id) {
			continue;
		}

		const squaredDist = distSq(droid.x, obj.x, droid.y, obj.y);
		if (squaredDist > 0 && squaredDist <= blockerDistSq) {
			blocker = obj;
			blockerDistSq = squaredDist;
		}
	}

	return blocker;
}

/**
 * Returns the tile one step to `droid`'s right of the axis joining it to `opponent`, or `undefined` if that tile
 * cannot be driven onto. `opponent` derives the same axis reversed, so the two units always step apart.
 * @param {worldState} state 
 * @param {DroidObject} droid 
 * @param {DroidObject} opponent 
 * @returns {{x: number, y: number} | undefined}
 */
function findSidestepTile(state, droid, opponent) {
	const axisX = opponent.x - droid.x;
	const axisY = opponent.y - droid.y;

	const sidestepX = droid.x + Math.sign(axisY);
	const sidestepY = droid.y - Math.sign(axisX);

	const ON_MAP = sidestepX >= 0 && sidestepX < mapWidth && sidestepY >= 0 && sidestepY < mapHeight;
	if (!ON_MAP) {
		return undefined;
	}

	if (!state.mapData.isWalkable[sidestepX][sidestepY]) {
		return undefined;
	}

	// `isWalkable` is built from terrain alone, so structures and other units are checked here instead.
	const occupants = enumRange(sidestepX, sidestepY, 1, ALL_PLAYERS, false);
	const TILE_OCCUPIED = occupants.some(obj => obj.x === sidestepX && obj.y === sidestepY);
	if (TILE_OCCUPIED) {
		return undefined;
	}

	return {x: sidestepX, y: sidestepY};
}

/**
 * TAC SOP: BREAK A HEAD-ON DEADLOCK BY PASSING ON THE RIGHT
 *
 * A deadlocked unit steps to its own right of the axis joining it to whatever is blocking it. Where the blocker is
 * itself a deadlocked unit it derives the same axis reversed, so the pair always steps apart and the lane clears
 * without either having to yield; where the blocker is standing still, only the deadlocked unit moves around it.
 * A unit with nowhere to step is left on the order it already has.
 * @param {worldState} state 
 * @param {DroidObject[]} groundUnits 
 * @returns {void}
 */
function resolveHeadOnJams(state, groundUnits) {
	groundUnits.forEach(droid => {
		const NEEDS_HELP = isDeadlockedAtChokepoint(state, droid) && !isSidestepping(state, droid);
		if (!NEEDS_HELP) {
			return;
		}

		const blocker = findBlockingUnit(droid);
		if (blocker == undefined) {
			return;
		}

		const sidestep = findSidestepTile(state, droid, blocker);
		if (sidestep == undefined) {
			return;
		}

		state.unitJamRecord.get(droid.id).sidestepUntil = gameTime + JAM_SIDESTEP_MS;
		orderDroidLoc(droid, DORDER_MOVE, sidestep.x, sidestep.y);
	});
}
