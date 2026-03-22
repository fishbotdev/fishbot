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


function retreatToBase(generalReserve, infantryReserve, fireSupportReserve, airDefenceArtilleryReserve, sensorUnits) {
	generalReserve.forEach(d => orderDroid(d, DORDER_RTB));
	infantryReserve.forEach(d => orderDroid(d, DORDER_RTB));
	fireSupportReserve.forEach(d => orderDroid(d, DORDER_RTB));
	airDefenceArtilleryReserve.forEach(d => orderDroid(d, DORDER_RTB));
	sensorUnits.forEach(d => orderDroid(d, DORDER_RTB));
}

/*
    TAC SOP: ATTACKS A TARGET; REINFORCEMENTS ARRIVE AT CLOSEST DROID TO TARGET
*/

function groundForceAttack({state, directFireTarget, fireSupportTarget, adaTarget}) {
	const SHOW_TARGETS = false;

	let generalReserve = state.g.enumGroup(DIVISION.GENERAL_RESERVE);
	let infantryReserve = state.g.enumGroup(DIVISION.INFANTRY_RESERVE);
	let fireSupportReserve = state.g.enumGroup(DIVISION.FIRE_SUPPORT_RESERVE);
	let airDefenceArtilleryReserve = state.g.enumGroup(DIVISION.AIR_DEFENCE_RESERVE);
	const sensorUnits = enumDroid(me, DROID_SENSOR);		// these have not been added to the grouping system yet!

	const rtb = () => retreatToBase(generalReserve, infantryReserve, fireSupportReserve, airDefenceArtilleryReserve, sensorUnits);

	if (generalReserve.length === 0) {
		rtb();		
		return;
	}

	if (!defined(directFireTarget)) {
		rtb();	
		return;
	}

	const currDirectFireTarget = getObject(directFireTarget.type, directFireTarget.player, directFireTarget.id);
	const closestDroidToTarget = findClosestDroidToTarget(generalReserve, currDirectFireTarget);

	if (!defined(closestDroidToTarget) || !defined(currDirectFireTarget)) {
		rtb();		
		return;
	}

	const _distSqToClosestDroid = (droid) => distSq(droid.x, closestDroidToTarget.x, droid.y, closestDroidToTarget.y);
		
	// MAIN ASSAULT UNITS
	for (let i=0; i<generalReserve.length; i++) {
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

		if (_distSqToClosestDroid(droid) < 6 ** 2) {
			attackTarget(droid, currDirectFireTarget);
		} else {
			orderDroidLoc(droid, DORDER_MOVE, closestDroidToTarget.x, closestDroidToTarget.y);
		}
	}

	// CYBORG (INFANTRY) UNITS
	for (let i=0; i<infantryReserve.length; ++i) {
		let droid = infantryReserve[i];
		if (_distSqToClosestDroid(droid) <= 4 ** 2) {
			attackTarget(droid, currDirectFireTarget);
		} else {
			orderDroidLoc(droid, DORDER_MOVE, closestDroidToTarget.x, closestDroidToTarget.y);
		}
	}

	// Hack: Sensor units

	sensorUnits.forEach((droid) => {
		if (_distSqToClosestDroid(droid) > 5 ** 2) {
			orderDroidLoc(droid, DORDER_MOVE, closestDroidToTarget.x, closestDroidToTarget.y);
		} else {
			orderDroid(droid, DORDER_STOP);
		}
	});

	// ADA UNITS
	let currAdaTarget = undefined;
	if (defined(adaTarget)) {
		currAdaTarget = getObject(adaTarget.type, adaTarget.player, adaTarget.id);
	}	

	airDefenceArtilleryReserve.forEach((droid) => {
		if (defined(currAdaTarget)) {
			attackTarget(droid, currAdaTarget);		
		} else {
			if (_distSqToClosestDroid(droid) > 5 ** 2) {
				orderDroidLoc(droid, DORDER_MOVE, closestDroidToTarget.x, closestDroidToTarget.y);
			} else {
				orderDroidLoc(droid, DORDER_MOVE, baseLocation.x, baseLocation.y);
			}
		}
	});

	// FIRE SUPPORT UNITS
	let currFireSupportTarget = undefined;
	if (defined(fireSupportTarget)) {
		currFireSupportTarget = getObject(fireSupportTarget.type, fireSupportTarget.player, fireSupportTarget.id);
	}
	 
	fireSupportReserve.forEach((droid) => {
		const distSqToDirectFireTarget = distSq(droid.x, currDirectFireTarget.x, droid.y, currDirectFireTarget.y);
		
		if (distSqToDirectFireTarget <= 7 ** 2 || (_distSqToClosestDroid(currDirectFireTarget) > 12 ** 2 && distSqToDirectFireTarget < 12 ** 2)) {
			// Fire support units should fall back if they find themselves on the front line
			orderDroidLoc(droid, DORDER_MOVE, baseLocation.x, baseLocation.y);
		} else {
			if (_distSqToClosestDroid(droid) > 8 ** 2 || !defined(currFireSupportTarget)) {
				orderDroidLoc(droid, DORDER_MOVE, closestDroidToTarget.x, closestDroidToTarget.y);
			} else {
				attackTarget(droid, currFireSupportTarget);
			}			
		}
	});

	if (SHOW_TARGETS) {
		hackMarkTiles();
		if (defined(currDirectFireTarget)) {
			addBeacon(currDirectFireTarget.x, currDirectFireTarget.y, 0);
		}
		if (defined(currFireSupportTarget)) {
			hackMarkTiles(currFireSupportTarget.x - 1, currFireSupportTarget.y - 1, currFireSupportTarget.x + 1, currFireSupportTarget.y + 1);
		}
	}
}