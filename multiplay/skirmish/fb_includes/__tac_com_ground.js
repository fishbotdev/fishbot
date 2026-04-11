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
    TAC SOP: ATTACK SPECIFIED TARGETS
*/
function groundForceAttack({state, directFireTarget, fireSupportTarget, adaTarget}) {

	const forceLocation = state.forceLocation;

	const getUnitsIn = (groupID) => state.g.enumGroup(groupID);

	let ARMOUR_UNITS = [];
	let INFANTRY_UNITS = [];
	let SHORT_RANGE_FIRE_SUPPORT = [];
	let AA_UNITS = [];
	let SENSOR_UNITS = [];

	if (false) {
		ARMOUR_UNITS = [...getUnitsIn(DIVISION.HEAVY_CAV_RESERVE), ...getUnitsIn(DIVISION.LIGHT_CAV_RESERVE), ...getUnitsIn(DIVISION.GENERAL_RESERVE)];
		INFANTRY_UNITS = getUnitsIn(DIVISION.INFANTRY_RESERVE);
		SHORT_RANGE_FIRE_SUPPORT = getUnitsIn(DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE);		// TODO: add long range fire support
		AA_UNITS = getUnitsIn(DIVISION.AIR_DEFENCE_RESERVE);
		SENSOR_UNITS = getUnitsIn(DIVISION.SENSOR_RESERVE);		
	} else {
		// To support 'brigades' (subdivisions of army)
		const brigadeID = DIVISION.FIRST_BCT;

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

		if (false) {
			debug(`ARMOUR_UNITS: ${ARMOUR_UNITS.length}`);
			debug(`INFANTRY_UNITS: ${INFANTRY_UNITS.length}`);
			debug(`SHORT_RANGE_FIRE_SUPPORT: ${SHORT_RANGE_FIRE_SUPPORT.length}`);
			debug(`AA_UNITS: ${AA_UNITS.length}`);
		}

	}

	const rtb = () => retreatToBase(ARMOUR_UNITS, INFANTRY_UNITS, SHORT_RANGE_FIRE_SUPPORT, AA_UNITS, SENSOR_UNITS);

	if (ARMOUR_UNITS.length === 0) {
		// rtb();		
		return;
	}

	if (!defined(directFireTarget)) {
		// rtb();	
		return;
	}

	const currDirectFireTarget = getObject(directFireTarget.type, directFireTarget.player, directFireTarget.id);
	const closestDroidToTarget = findClosestDroidToTarget(ARMOUR_UNITS, currDirectFireTarget);

	if (!defined(closestDroidToTarget) || !defined(currDirectFireTarget)) {
		rtb();		
		return;
	}

	const _distSqToClosestDroid = (droid) => distSq(droid.x, closestDroidToTarget.x, droid.y, closestDroidToTarget.y);
		
	// MAIN ASSAULT UNITS
	for (let i=0; i<ARMOUR_UNITS.length; i++) {
		let droid = ARMOUR_UNITS[i];

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

		if (distSq(droid.x, forceLocation.x, droid.y, forceLocation.y) > 10 ** 2) {
			orderDroidLoc(droid, DORDER_MOVE, forceLocation.x, forceLocation.y);
			continue;
		}

		if (_distSqToClosestDroid(droid) < 6 ** 2) {
			attackTarget(droid, currDirectFireTarget);
		} else {
			orderDroidLoc(droid, DORDER_MOVE, closestDroidToTarget.x, closestDroidToTarget.y);
		}
	}

	// CYBORG (INFANTRY) UNITS
	for (let i=0; i<INFANTRY_UNITS.length; ++i) {
		let droid = INFANTRY_UNITS[i];
		if (_distSqToClosestDroid(droid) <= 6 ** 2) {
			attackTarget(droid, currDirectFireTarget);
		} else {
			orderDroidLoc(droid, DORDER_MOVE, closestDroidToTarget.x, closestDroidToTarget.y);
		}
	}

	// Hack: Sensor units
	SENSOR_UNITS.forEach((droid) => {
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

	AA_UNITS.forEach((droid) => {
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
	 
	SHORT_RANGE_FIRE_SUPPORT.forEach((droid) => {
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

	if (false) {
		hackMarkTiles();
		if (defined(currDirectFireTarget)) {
			addBeacon(currDirectFireTarget.x, currDirectFireTarget.y, 0);
		}
		if (defined(currFireSupportTarget)) {
			hackMarkTiles(currFireSupportTarget.x - 1, currFireSupportTarget.y - 1, currFireSupportTarget.x + 1, currFireSupportTarget.y + 1);
		}
	}
}