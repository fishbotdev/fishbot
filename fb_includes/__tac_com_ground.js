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
	Driver for using a repair facility
*/

function returnForRepair(droid) {
	// const REPAIR_AT_PERCENT = 1;
	const weHaveRepair = (enumStruct(me, REPAIR_FACILITY).length > 0);
	if (weHaveRepair) {
		orderDroid(droid, DORDER_RTR);
	}
}

/*
	Driver for attacking
*/
function attackTarget(droid, target) {
	if (!defined(target))
		return;

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
	TAC SOP: RAID TARGET OBJECT @ LOCATION
*/
function raidTargetObject(targetObj, taskForceID) {

	const updatedObject = getObject(targetObj.type, targetObj.player, targetObj.id);
	if (updatedObject === null) {		
		return true;	// object is destroyed
	}

	const taskForceUnits = state.g.enumGroup(taskForceID);
	if (taskForceUnits.length === 0) {
		// debug("_tac_com_ground/raidTargetObject: terminated - 0 group size", taskForceID);
		return undefined;		// raid units were killed or reassigned
	}

	taskForceUnits.forEach((droid) => attackTarget(droid, updatedObject));

    return false;      
}

/*
    Helper for finding closest droid to target
*/
function findClosestDroidToTarget(unitGroup, currGroundTarget) {
	if (unitGroup.length === 0) {
		return undefined;
	}

	let distances = [];
	for (let i=0; i<unitGroup.length; i++) {
		let currDroid = unitGroup[i];
		const dist = distance(currDroid, currGroundTarget);
		distances = distances.concat([[dist, i]]);
	}
	distances.sort((first, second) => first[0] - second[0]);
	// distances.forEach((d) => debug('	', d));

	let smallestIndex = distances[0][1];
	// debug('smallest index', smallestIndex);
	return unitGroup[smallestIndex];
}


/*
    TAC SOP: ATTACKS A TARGET; REINFORCEMENTS ARRIVE AT CLOSEST DROID TO TARGET
*/

let currGroundAssaultTarget = undefined;           // eventually moved inside class (needs to remember this state)
let currFireSupportTarget = undefined;
let closestDroidToTarget = undefined;       // eventually moved inside class (needs to remember this state)

function groundForceAttack({groundTargets, fireSupportTargets}) {

	let generalReserve = state.g.enumGroup(DIVISION.GENERAL_RESERVE);
	let infantryReserve = state.g.enumGroup(DIVISION.INFANTRY_RESERVE);
	let fireSupportReserve = state.g.enumGroup(DIVISION.FIRE_SUPPORT_RESERVE);
	let airDefenceArtilleryReserve = state.g.enumGroup(DIVISION.AIR_DEFENCE_RESERVE);
	// debug('land unit lengths', generalReserve.length, infantryReserve.length, fireSupportReserve.length, groundTargets.length, fireSupportTargets.length);

	if (generalReserve.length === 0) {
		return;
	}

	if (groundTargets.length === 0) {
		return;
	}

	if (fireSupportTargets.length === 0) {
		return;
	}

	// todo make a more advanced way of checking the target list is empty

	currGroundAssaultTarget = groundTargets[0].obj;
	currFireSupportTarget = fireSupportTargets[0].obj;

	if (defined(currGroundAssaultTarget) && defined(currFireSupportTarget)) {
		// debug('both ground assault, fs targets defined', currGroundAssaultTarget.name, currFireSupportTarget.name);
		// allow all forces to coalesce before attacking
		closestDroidToTarget = findClosestDroidToTarget(generalReserve, currGroundAssaultTarget);

		if (DEBUG_MODE_ON) {
			hackMarkTiles();		// clear all marked tiles
			addBeacon(currGroundAssaultTarget.x, currGroundAssaultTarget.y, 0);
			hackMarkTiles(currFireSupportTarget.x, currFireSupportTarget.y);
		}
            
		let leader = generalReserve[0];
		attackTarget(leader, currGroundAssaultTarget);

		// MAIN ASSAULT UNITS
		for (let i=1; i<generalReserve.length; i++) {
			let droid = generalReserve[i];

			/*
			// basic implementation of repair facility, only for front line units
			if (droid.health < 45 && generalReserve.length > 12) {
				// debug(`${droid.name} RTR @ ${droid.health}`);
				returnForRepair(droid);
				continue;
			}

			if (droid.order === DORDER_RTR) {
				// debug(`skipped RTR ${droid.name} ${droid.health}`);
				continue;
			}
			*/

			if (distance(droid, closestDroidToTarget) < 6) {
				attackTarget(droid, currGroundAssaultTarget);
			} else {
				orderDroidLoc(droid, DORDER_MOVE, closestDroidToTarget.x, closestDroidToTarget.y);
			}
		}

		// CYBORG (INFANTRY) UNITS
		for (let i=0; i<infantryReserve.length; ++i) {
			let droid = infantryReserve[i];
			if (distance(droid, closestDroidToTarget) <= 4) {
				attackTarget(droid, currGroundAssaultTarget);
			} else {
				orderDroidLoc(droid, DORDER_MOVE, closestDroidToTarget.x, closestDroidToTarget.y);
			}
		}

		// ADA UNITS
		airDefenceArtilleryReserve.forEach((droid) => {
			if (distance(droid, closestDroidToTarget) > 7) {
				orderDroidLoc(droid, DORDER_MOVE, closestDroidToTarget.x, closestDroidToTarget.y);
			} else {
				const randomX = Math.floor(Math.random() * 3) - 1;
				orderDroidLoc(droid, DORDER_PATROL, droid.x + randomX, droid.y);
			}
		});
		
		// Hack: Sensor units
		const sensorUnits = enumDroid(me, DROID_SENSOR);		// these have not been added to the grouping system yet!
		sensorUnits.forEach((droid) => {
			if (distance(droid, closestDroidToTarget) > 5) {
				orderDroidLoc(droid, DORDER_MOVE, closestDroidToTarget.x, closestDroidToTarget.y);
			} else {
				const randomX = Math.floor(Math.random() * 3) - 1;
				orderDroidLoc(droid, DORDER_PATROL, droid.x + randomX, droid.y);
			}
		});

		// FIRE SUPPORT UNITS
		fireSupportReserve.forEach((droid) => {
			if (distance(droid, currGroundAssaultTarget) < distance(closestDroidToTarget, currGroundAssaultTarget) ||
				distance(droid, currGroundAssaultTarget) <= 7) {
				// Fire support units should fall back if they find themselves on the front line
				orderDroidLoc(droid, DORDER_MOVE, baseLocation.x, baseLocation.y);
			} else {
				const outOfMortarRange = (distance(droid, currFireSupportTarget) > droid.range * WZ2100_v461_DROID_RANGE_SCALING_FACTOR + 4);
				if (outOfMortarRange) {
					attackTarget(droid, currGroundAssaultTarget)
				} else {
					attackTarget(droid, currFireSupportTarget);
				}
			}
		});

	} else {
		// Check if the closestDroid is still alive, if so, coalesce forces there. Else, continue with current plan
		let cd = getObject(closestDroidToTarget.type, closestDroidToTarget.player, closestDroidToTarget.id);
		if (cd !== null) {
			generalReserve.forEach(droid => orderDroidLoc(droid, DORDER_MOVE, closestDroidToTarget.x, closestDroidToTarget.y));
		}		
	}
}