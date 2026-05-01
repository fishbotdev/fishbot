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


function retreatToBase(generalReserve, infantryReserve, fireSupportReserve, airDefenceArtilleryReserve, sensorUnits) {
	generalReserve.forEach(d => orderDroid(d, DORDER_RTB));
	infantryReserve.forEach(d => orderDroid(d, DORDER_RTB));
	fireSupportReserve.forEach(d => orderDroid(d, DORDER_RTB));
	airDefenceArtilleryReserve.forEach(d => orderDroid(d, DORDER_RTB));
	sensorUnits.forEach(d => orderDroid(d, DORDER_RTB));
}

/*
    TAC SOP: MOVE A BRIGADE COMBAT TEAM (BCT) TO ATTACK A TARGET
*/
function moveBrigadeToAttack(state, brigadeID, brigadeLocation, directFireTarget, fireSupportTarget, adaTarget) {

	const forceLocation = brigadeLocation;

	const ARMOUR_UNITS = [];
	const INFANTRY_UNITS = [];
	const SHORT_RANGE_FIRE_SUPPORT = [];
	const AA_UNITS = [];
	const SENSOR_UNITS = [];

	const getUnitsIn = (groupID) => state.g.enumGroup(groupID);
	const brigadeUnits = getUnitsIn(brigadeID);		
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

	const rtb = () => retreatToBase(ARMOUR_UNITS, INFANTRY_UNITS, SHORT_RANGE_FIRE_SUPPORT, AA_UNITS, SENSOR_UNITS);
	const moveToClosestDroid = (droid) => orderDroidLoc(droid, DORDER_MOVE, closestDroidToTarget.x, closestDroidToTarget.y);

	if (ARMOUR_UNITS.length === 0) {
		rtb();		
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

		if (distSq(droid.x, forceLocation.x, droid.y, forceLocation.y) > 10 ** 2) {
			orderDroidLoc(droid, DORDER_MOVE, forceLocation.x, forceLocation.y);
			continue;
		}

		if (_distSqToClosestDroid(droid) < 6 ** 2) {
			attackTarget(droid, currDirectFireTarget);
		} else {
			moveToClosestDroid(droid);
		}
	}

	// CYBORG (INFANTRY) UNITS
	for (let i=0; i<INFANTRY_UNITS.length; ++i) {
		let droid = INFANTRY_UNITS[i];
		if (_distSqToClosestDroid(droid) <= 6 ** 2) {
			attackTarget(droid, currDirectFireTarget);
		} else {
			moveToClosestDroid(droid);
		}
	}

	// SENSOR UNITS
	SENSOR_UNITS.forEach((droid) => {
		if (_distSqToClosestDroid(droid) > 5 ** 2) {
			moveToClosestDroid(droid);
		} else {
			orderDroidLoc(droid, DORDER_MOVE, baseLocation.x, baseLocation.y);
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
				moveToClosestDroid(droid);
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

	if (!defined(currFireSupportTarget)) {			
		SHORT_RANGE_FIRE_SUPPORT.forEach(moveToClosestDroid);
	} else {

		const closestDroidDistSqToBase = _distSqToClosestDroid(baseLocation);
		const fsTargetDistSqToBase = distSq(currFireSupportTarget.x, baseLocation.x, currFireSupportTarget.y, baseLocation.y);

		SHORT_RANGE_FIRE_SUPPORT.forEach((droid) => {
			const droidDistSqToBase = distSq(droid.x, baseLocation.x, droid.y, baseLocation.y);

			const MORTAR_CLOSEST_TO_BASE = droidDistSqToBase < closestDroidDistSqToBase && droidDistSqToBase < fsTargetDistSqToBase;
			const ENEMY_CLOSEST_TO_BASE = fsTargetDistSqToBase < droidDistSqToBase && fsTargetDistSqToBase < closestDroidDistSqToBase;

			if (MORTAR_CLOSEST_TO_BASE || ENEMY_CLOSEST_TO_BASE) {
				attackTarget(droid, currFireSupportTarget);	
			} else {
				moveToClosestDroid(droid);
			}
		});
	}

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